const test = require('node:test');
const assert = require('node:assert/strict');
const {
    ChannelType,
    Collection,
    OverwriteType,
    PermissionFlagsBits,
    PermissionsBitField,
} = require('discord.js');
const { ensureAnimeNewsChannel } = require('../animeNews/service');

const GUILD_ID = '123456789012345678';
const BOT_ID = '223456789012345678';
const CATEGORY_ID = '323456789012345678';

function publishPermissions() {
    return new PermissionsBitField([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory,
    ]);
}

function textChannel(id, name) {
    return {
        id,
        name,
        guildId: GUILD_ID,
        type: ChannelType.GuildText,
        permissionsFor: () => publishPermissions(),
    };
}

function mockGuild(initialChannels = []) {
    const cache = new Collection(initialChannels.map(channel => [channel.id, channel]));
    const botMember = {
        id: BOT_ID,
        permissions: new PermissionsBitField([PermissionFlagsBits.ManageChannels]),
    };
    let createdOptions = null;

    const guild = {
        id: GUILD_ID,
        roles: { everyone: { id: GUILD_ID } },
        members: {
            me: botMember,
            fetchMe: async () => botMember,
        },
        channels: {
            cache,
            fetch: async id => id ? cache.get(id) || null : cache,
            create: async options => {
                createdOptions = options;
                const created = textChannel('423456789012345678', options.name);
                cache.set(created.id, created);
                return created;
            },
        },
    };

    return { guild, getCreatedOptions: () => createdOptions };
}

function settings(overrides = {}) {
    return {
        channelId: null,
        channelName: 'anime-news',
        categoryId: null,
        ...overrides,
    };
}

test('réutilise l’unique salon existant sans en créer un autre', async () => {
    const existing = textChannel('523456789012345678', '📰-anime-news');
    const fixture = mockGuild([existing]);

    const result = await ensureAnimeNewsChannel(fixture.guild, settings());
    assert.equal(result.channel.id, existing.id);
    assert.equal(result.created, false);
    assert.equal(fixture.getCreatedOptions(), null);
});

test('échoue fermement si plusieurs salons correspondent', async () => {
    const fixture = mockGuild([
        textChannel('523456789012345678', 'anime-news'),
        textChannel('623456789012345678', 'animes-news'),
    ]);

    await assert.rejects(
        ensureAnimeNewsChannel(fixture.guild, settings()),
        /Plusieurs salons anime-news existent/
    );
    assert.equal(fixture.getCreatedOptions(), null);
});

test('crée un salon en lecture seule sous la catégorie information', async () => {
    const category = {
        id: CATEGORY_ID,
        name: '📢 INFORMATION',
        guildId: GUILD_ID,
        type: ChannelType.GuildCategory,
    };
    const fixture = mockGuild([category]);

    const result = await ensureAnimeNewsChannel(fixture.guild, settings());
    const options = fixture.getCreatedOptions();
    assert.equal(result.created, true);
    assert.equal(options.name, 'anime-news');
    assert.equal(options.parent, CATEGORY_ID);
    assert.equal(options.type, ChannelType.GuildText);

    const everyoneOverwrite = options.permissionOverwrites.find(entry => entry.id === GUILD_ID);
    const botOverwrite = options.permissionOverwrites.find(entry => entry.id === BOT_ID);
    assert.ok(new PermissionsBitField(everyoneOverwrite.deny).has(PermissionFlagsBits.SendMessages));
    assert.ok(new PermissionsBitField(botOverwrite.allow).has(PermissionFlagsBits.SendMessages));
    assert.ok(new PermissionsBitField(botOverwrite.allow).has(PermissionFlagsBits.EmbedLinks));
});

test('préserve la confidentialité héritée d’une catégorie privée', async () => {
    const verifiedRoleId = '823456789012345678';
    const category = {
        id: CATEGORY_ID,
        name: '📢 INFORMATION',
        guildId: GUILD_ID,
        type: ChannelType.GuildCategory,
        permissionOverwrites: {
            cache: new Collection([
                [GUILD_ID, {
                    id: GUILD_ID,
                    type: OverwriteType.Role,
                    allow: new PermissionsBitField(),
                    deny: new PermissionsBitField([PermissionFlagsBits.ViewChannel]),
                }],
                [verifiedRoleId, {
                    id: verifiedRoleId,
                    type: OverwriteType.Role,
                    allow: new PermissionsBitField([PermissionFlagsBits.ViewChannel]),
                    deny: new PermissionsBitField(),
                }],
            ]),
        },
    };
    const fixture = mockGuild([category]);

    await ensureAnimeNewsChannel(fixture.guild, settings());
    const overwrites = fixture.getCreatedOptions().permissionOverwrites;
    const everyone = overwrites.find(entry => entry.id === GUILD_ID);
    const verified = overwrites.find(entry => entry.id === verifiedRoleId);

    assert.ok(new PermissionsBitField(everyone.deny).has(PermissionFlagsBits.ViewChannel));
    assert.ok(new PermissionsBitField(everyone.deny).has(PermissionFlagsBits.SendMessages));
    assert.ok(new PermissionsBitField(verified.allow).has(PermissionFlagsBits.ViewChannel));
    assert.ok(new PermissionsBitField(verified.deny).has(PermissionFlagsBits.SendMessages));
});

test('ne crée rien sans la permission Gérer les salons', async () => {
    const fixture = mockGuild();
    fixture.guild.members.me.permissions = new PermissionsBitField();

    await assert.rejects(
        ensureAnimeNewsChannel(fixture.guild, settings()),
        /permission Gérer les salons/
    );
    assert.equal(fixture.getCreatedOptions(), null);
});

test('refuse un identifiant de salon qui ne cible pas ce serveur', async () => {
    const fixture = mockGuild();
    await assert.rejects(
        ensureAnimeNewsChannel(fixture.guild, settings({ channelId: '723456789012345678' })),
        /ne correspond pas à un salon texte de ce serveur/
    );
    assert.equal(fixture.getCreatedOptions(), null);
});
