const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    ChannelType,
    Collection,
    PermissionFlagsBits,
    PermissionsBitField,
} = require('discord.js');
const {
    buildAnimeEmbed,
    loadSettings,
    recoverStateFromDiscord,
    startAnimeNewsService,
} = require('../animeNews/service');
const { AnimeNewsState } = require('../animeNews/state');

function withAnimeEnv(values, callback) {
    const names = [
        'ANIME_NEWS_ENABLED',
        'ANIME_NEWS_GUILD_ID',
        'ANIME_NEWS_EXPECTED_GUILD_NAME',
    ];
    const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
    for (const name of names) delete process.env[name];
    Object.assign(process.env, values);

    try {
        return callback();
    } finally {
        for (const name of names) {
            if (previous[name] === undefined) delete process.env[name];
            else process.env[name] = previous[name];
        }
    }
}

async function withAnimeEnvAsync(values, callback) {
    const names = [
        'ANIME_NEWS_ENABLED',
        'ANIME_NEWS_GUILD_ID',
        'ANIME_NEWS_EXPECTED_GUILD_NAME',
        'ANIME_NEWS_STATE_PATH',
    ];
    const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
    for (const name of names) delete process.env[name];
    Object.assign(process.env, values);

    try {
        return await callback();
    } finally {
        for (const name of names) {
            if (previous[name] === undefined) delete process.env[name];
            else process.env[name] = previous[name];
        }
    }
}

test('refuse de démarrer sans ID de serveur explicite', () => {
    withAnimeEnv({ ANIME_NEWS_ENABLED: 'true' }, () => {
        assert.throws(() => loadSettings(), /ANIME_NEWS_GUILD_ID manque/);
    });
});

test('accepte un snowflake et permet une désactivation sans ID', () => {
    withAnimeEnv({
        ANIME_NEWS_ENABLED: 'true',
        ANIME_NEWS_GUILD_ID: '123456789012345678',
    }, () => {
        const settings = loadSettings();
        assert.equal(settings.guildId, '123456789012345678');
        assert.equal(settings.expectedGuildName, 'AdoGyaru');
    });

    withAnimeEnv({ ANIME_NEWS_ENABLED: 'false' }, () => {
        assert.equal(loadSettings().enabled, false);
    });
});

test('utilise la cible de serveur confirmée du fichier de configuration', () => {
    withAnimeEnv({ ANIME_NEWS_ENABLED: 'true' }, () => {
        const settings = loadSettings({
            id: '1507001707622563890',
            expectedName: 'AdoGyaru',
        });
        assert.equal(settings.guildId, '1507001707622563890');
        assert.equal(settings.expectedGuildName, 'AdoGyaru');
    });
});

test('construit un embed borné avec métadonnées de reprise', () => {
    const item = {
        id: 'a'.repeat(64),
        title: 'T'.repeat(400),
        url: 'https://example.com/announcement',
        summary: 'Résumé '.repeat(200),
        image: 'javascript:alert(1)',
        publishedAt: '2026-07-14T10:00:00.000Z',
        source: { id: 'fixture', name: 'Source fixture', trust: 'official' },
        mediaUrl: 'https://youtu.be/GixEiC7k9_4',
    };
    const classification = {
        primary: { key: 'trailer', label: 'Trailer / PV', emoji: '🎬', color: 0xE74C3C },
    };
    const embed = buildAnimeEmbed(item, classification).toJSON();

    assert.ok(embed.title.length <= 256);
    assert.ok(embed.description.length <= 650);
    assert.equal(embed.image, undefined);
    assert.match(embed.footer.text, /^Johnny Anime News • trailer • fixture • .* • youtube:GixEiC7k9_4$/);
});

test('attend la récupération Discord avant de lire les flux puis réessaie', async () => {
    const originalFetch = global.fetch;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'johnny-anime-recovery-gate-'));
    const guildId = '123456789012345678';
    const channelId = '223456789012345678';
    let historyAvailable = false;
    let feedFetches = 0;
    const publishPermissions = new PermissionsBitField([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory,
    ]);
    const channel = {
        id: channelId,
        guildId,
        name: 'anime-news',
        type: ChannelType.GuildText,
        permissionsFor: () => publishPermissions,
        messages: {
            fetch: async () => {
                if (!historyAvailable) throw new Error('Discord temporairement indisponible');
                return new Collection();
            },
        },
        send: async () => ({ id: 'message-id' }),
    };
    const channels = new Collection([[channelId, channel]]);
    const botMember = {
        id: '323456789012345678',
        permissions: new PermissionsBitField([PermissionFlagsBits.ManageChannels]),
    };
    const guild = {
        id: guildId,
        name: 'AdoGyaru',
        roles: { everyone: { id: guildId } },
        channels: {
            cache: channels,
            fetch: async id => id ? channels.get(id) : channels,
        },
        members: { me: botMember, fetchMe: async () => botMember },
    };
    const client = {
        user: { id: botMember.id },
        guilds: { cache: new Collection([[guildId, guild]]) },
    };
    const emptyRss = '<?xml version="1.0"?><rss version="2.0"><channel><title>Vide</title></channel></rss>';
    global.fetch = async () => {
        feedFetches++;
        return new Response(emptyRss, { status: 200 });
    };
    const sourcesConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'anime-news-sources.json'), 'utf8'));
    const enabledSourceCount = sourcesConfig.sources.filter(source => source.enabled !== false).length;

    try {
        await withAnimeEnvAsync({
            ANIME_NEWS_ENABLED: 'true',
            ANIME_NEWS_GUILD_ID: guildId,
            ANIME_NEWS_EXPECTED_GUILD_NAME: 'AdoGyaru',
            ANIME_NEWS_STATE_PATH: path.join(directory, 'state.json'),
        }, async () => {
            const controller = await startAnimeNewsService(client);
            try {
                assert.equal(controller.recoveryPending, true);
                assert.equal(feedFetches, 0);
                const savedState = JSON.parse(fs.readFileSync(path.join(directory, 'state.json'), 'utf8'));
                assert.equal(Object.keys(savedState.sourceStartedAt).length, enabledSourceCount);

                historyAvailable = true;
                await controller.runNow();
                assert.equal(controller.recoveryPending, false);
                assert.equal(feedFetches, enabledSourceCount);
            } finally {
                controller.stop();
            }
        });
    } finally {
        global.fetch = originalFetch;
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('restaure la clé vidéo depuis un embed Discord après perte d’état', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'johnny-anime-media-recovery-'));
    const state = AnimeNewsState.load(path.join(directory, 'state.json'));
    const publishedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const messageCreatedAt = new Date();
    const message = {
        author: { id: 'bot-id' },
        createdTimestamp: messageCreatedAt.getTime(),
        createdAt: messageCreatedAt,
        embeds: [{
            footer: {
                text: `Johnny Anime News • trailer • pony-canyon-news • ${'a'.repeat(64)} • youtube:GixEiC7k9_4`,
            },
            url: 'https://news.ponycanyon.example/article',
            title: 'TVアニメ「てつりょー！」第2弾PVを公開',
            timestamp: publishedAt,
        }],
    };
    const channel = {
        messages: { fetch: async () => new Collection([['message-id', message]]) },
    };

    try {
        const result = await recoverStateFromDiscord(channel, { user: { id: 'bot-id' } }, state);
        assert.equal(result.successful, true);
        assert.equal(result.recovered, 1);
        assert.equal(state.hasSeen({
            id: 'livechart-id',
            url: 'https://www.youtube.com/watch?v=GixEiC7k9_4',
            mediaUrl: 'https://www.youtube.com/watch?v=GixEiC7k9_4',
            title: 'TETSURYO! meet with Tetsudou Musume reveals new PV',
            publishedAt,
            dedupeKind: 'trailer',
        }), true);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
