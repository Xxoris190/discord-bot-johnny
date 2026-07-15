const fs = require('fs');
const path = require('path');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    EmbedBuilder,
    OverwriteType,
    PermissionFlagsBits,
    PermissionsBitField,
} = require('discord.js');
const { classifyAnimeAnnouncement, foldText } = require('./filter');
const { canonicalizeYouTubeUrl, fetchAnimeSource, validHttpUrl } = require('./feeds');
const { AnimeNewsState } = require('./state');

const EMBED_FOOTER_PREFIX = 'Johnny Anime News';
const DEFAULT_CHANNEL_NAME = 'anime-news';
const DEFAULT_EXPECTED_GUILD_NAME = 'AdoGyaru';
const DEFAULT_POLL_INTERVAL_MS = 90 * 1000;
const MIN_POLL_INTERVAL_MS = 60 * 1000;
const MAX_POSTS_PER_CYCLE = 8;

let activeController = null;

function envBoolean(name, fallback) {
    const raw = process.env[name];
    if (raw === undefined || raw === '') return fallback;
    return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

function envNumber(name, fallback, minimum, maximum) {
    const parsed = Number(process.env[name]);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(maximum, Math.max(minimum, parsed));
}

function validateSnowflake(value, variableName) {
    if (!/^\d{17,20}$/.test(String(value || ''))) {
        throw new Error(`${variableName} doit contenir l’identifiant numérique Discord (17 à 20 chiffres).`);
    }
    return String(value);
}

function loadAnimeNewsConfig() {
    const configPath = process.env.ANIME_NEWS_CONFIG_PATH
        ? path.resolve(__dirname, '..', process.env.ANIME_NEWS_CONFIG_PATH)
        : path.join(__dirname, '..', 'anime-news-sources.json');
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const sources = Array.isArray(parsed.sources)
        ? parsed.sources.filter(source => source.enabled !== false)
        : [];

    if (sources.length === 0) throw new Error('Aucune source Anime News activée.');
    const ids = new Set();
    for (const source of sources) {
        if (!source.id || !source.name || !validHttpUrl(source.url)) {
            throw new Error(`Source Anime News invalide: ${JSON.stringify(source && source.id)}`);
        }
        if (ids.has(source.id)) throw new Error(`Source Anime News dupliquée: ${source.id}`);
        ids.add(source.id);
    }

    return {
        sources,
        filter: parsed.filter || {},
        targetGuild: parsed.targetGuild || {},
        configPath,
    };
}

function loadSettings(targetGuild = {}) {
    const enabled = envBoolean('ANIME_NEWS_ENABLED', true);
    const guildId = process.env.ANIME_NEWS_GUILD_ID || targetGuild.id;
    if (enabled && !guildId) {
        throw new Error(
            'ANIME_NEWS_GUILD_ID manque. Copie l’identifiant du serveur AdoGyaru dans les variables Render.'
        );
    }

    return {
        enabled,
        guildId: enabled ? validateSnowflake(guildId, 'ANIME_NEWS_GUILD_ID') : null,
        expectedGuildName: process.env.ANIME_NEWS_EXPECTED_GUILD_NAME
            || targetGuild.expectedName
            || DEFAULT_EXPECTED_GUILD_NAME,
        channelId: process.env.ANIME_NEWS_CHANNEL_ID
            ? validateSnowflake(process.env.ANIME_NEWS_CHANNEL_ID, 'ANIME_NEWS_CHANNEL_ID')
            : null,
        channelName: process.env.ANIME_NEWS_CHANNEL_NAME || DEFAULT_CHANNEL_NAME,
        categoryId: process.env.ANIME_NEWS_CATEGORY_ID
            ? validateSnowflake(process.env.ANIME_NEWS_CATEGORY_ID, 'ANIME_NEWS_CATEGORY_ID')
            : null,
        pollIntervalMs: envNumber(
            'ANIME_NEWS_POLL_INTERVAL_MS',
            DEFAULT_POLL_INTERVAL_MS,
            MIN_POLL_INTERVAL_MS,
            30 * 60 * 1000
        ),
        maxItemAgeHours: envNumber('ANIME_NEWS_MAX_ITEM_AGE_HOURS', 36, 1, 168),
        statePath: process.env.ANIME_NEWS_STATE_PATH
            ? path.resolve(__dirname, '..', process.env.ANIME_NEWS_STATE_PATH)
            : path.join(__dirname, '..', '.data', 'anime-news-state.json'),
    };
}

function normalizeName(value) {
    return foldText(value)
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '');
}

async function resolveTargetGuild(client, settings) {
    const guild = client.guilds.cache.get(settings.guildId);
    if (!guild) {
        throw new Error(`Johnny n’est pas présent sur le serveur configuré (${settings.guildId}).`);
    }

    if (settings.expectedGuildName
        && normalizeName(guild.name) !== normalizeName(settings.expectedGuildName)) {
        throw new Error(
            `Sécurité: l’ID configuré correspond à « ${guild.name} », pas à « ${settings.expectedGuildName} ». Aucun salon créé.`
        );
    }
    return guild;
}

async function resolveCategory(guild, settings) {
    if (settings.categoryId) {
        const category = guild.channels.cache.get(settings.categoryId)
            || await guild.channels.fetch(settings.categoryId).catch(() => null);
        if (!category || category.guildId !== guild.id || category.type !== ChannelType.GuildCategory) {
            throw new Error('ANIME_NEWS_CATEGORY_ID ne correspond pas à une catégorie de ce serveur.');
        }
        return category;
    }

    const preferred = ['information', 'informations', 'annonces', 'news'];
    const categories = guild.channels.cache.filter(channel => channel.type === ChannelType.GuildCategory);
    for (const wanted of preferred) {
        const match = categories.find(category => normalizeName(category.name).includes(wanted));
        if (match) return match;
    }
    return null;
}

function assertPublishPermissions(channel, botMember) {
    const permissions = channel.permissionsFor(botMember);
    const required = [
        ['Voir le salon', PermissionFlagsBits.ViewChannel],
        ['Envoyer des messages', PermissionFlagsBits.SendMessages],
        ['Intégrer des liens', PermissionFlagsBits.EmbedLinks],
        ['Lire l’historique', PermissionFlagsBits.ReadMessageHistory],
    ];
    const missing = required.filter(([, flag]) => !permissions || !permissions.has(flag));
    if (missing.length > 0) {
        throw new Error(`Permissions manquantes dans #${channel.name}: ${missing.map(([name]) => name).join(', ')}.`);
    }
}

function buildChannelPermissionOverwrites(category, guild, botMember) {
    const overwrites = category && category.permissionOverwrites && category.permissionOverwrites.cache
        ? category.permissionOverwrites.cache.map(overwrite => ({
            id: overwrite.id,
            type: overwrite.type,
            allow: overwrite.allow.bitfield,
            deny: overwrite.deny.bitfield,
        }))
        : [];

    const upsert = (id, type, allowFlags, denyFlags) => {
        let overwrite = overwrites.find(entry => entry.id === id);
        if (!overwrite) {
            overwrite = { id, type, allow: 0n, deny: 0n };
            overwrites.push(overwrite);
        }

        const allow = new PermissionsBitField(overwrite.allow);
        const deny = new PermissionsBitField(overwrite.deny);
        if (denyFlags.length > 0) {
            allow.remove(denyFlags);
            deny.add(denyFlags);
        }
        if (allowFlags.length > 0) {
            deny.remove(allowFlags);
            allow.add(allowFlags);
        }
        overwrite.allow = allow.bitfield;
        overwrite.deny = deny.bitfield;
        overwrite.type = type;
    };

    const readOnlyFlags = [
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.CreatePublicThreads,
        PermissionFlagsBits.CreatePrivateThreads,
    ];
    // Conserve toute la visibilité héritée, mais retire le droit d'écrire à
    // chaque rôle/membre hérité. L'overwrite membre de Johnny est ajouté ensuite.
    for (const overwrite of [...overwrites]) {
        if (overwrite.id === botMember.id) continue;
        upsert(overwrite.id, overwrite.type, [], readOnlyFlags);
    }
    upsert(
        guild.roles.everyone.id,
        OverwriteType.Role,
        [],
        readOnlyFlags
    );
    upsert(
        botMember.id,
        OverwriteType.Member,
        [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ReadMessageHistory,
        ],
        []
    );
    return overwrites;
}

async function ensureAnimeNewsChannel(guild, settings) {
    await guild.channels.fetch();
    const botMember = guild.members.me || await guild.members.fetchMe();

    if (settings.channelId) {
        const configured = guild.channels.cache.get(settings.channelId)
            || await guild.channels.fetch(settings.channelId).catch(() => null);
        if (!configured || configured.guildId !== guild.id || configured.type !== ChannelType.GuildText) {
            throw new Error('ANIME_NEWS_CHANNEL_ID ne correspond pas à un salon texte de ce serveur.');
        }
        assertPublishPermissions(configured, botMember);
        return { channel: configured, created: false };
    }

    const acceptedNames = new Set([
        normalizeName(settings.channelName),
        normalizeName(DEFAULT_CHANNEL_NAME),
        'animes-news',
    ]);
    const matching = guild.channels.cache.filter(channel =>
        channel.type === ChannelType.GuildText && acceptedNames.has(normalizeName(channel.name))
    );

    if (matching.size > 1) {
        throw new Error('Plusieurs salons anime-news existent. Configure ANIME_NEWS_CHANNEL_ID pour choisir sans risque.');
    }
    if (matching.size === 1) {
        const existing = matching.first();
        assertPublishPermissions(existing, botMember);
        return { channel: existing, created: false };
    }

    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        throw new Error('Johnny a besoin de la permission Gérer les salons pour créer #anime-news.');
    }

    const category = await resolveCategory(guild, settings);
    const channel = await guild.channels.create({
        name: settings.channelName,
        type: ChannelType.GuildText,
        parent: category ? category.id : undefined,
        topic: '📺 Trailers, teasers, nouvelles saisons, films et annonces officielles d’anime.',
        reason: 'Activation du service Anime News de Johnny',
        permissionOverwrites: buildChannelPermissionOverwrites(category, guild, botMember),
    });

    assertPublishPermissions(channel, botMember);
    return { channel, created: true };
}

function truncate(value, limit) {
    const text = String(value || '');
    if (text.length <= limit) return text;

    let shortened = text.slice(0, Math.max(0, limit - 1));
    // Ne coupe pas une paire UTF-16 au milieu d'un emoji.
    if (/[\uD800-\uDBFF]$/.test(shortened)) shortened = shortened.slice(0, -1);
    return `${shortened}…`;
}

// Les descriptions YouTube accumulent liens, hashtags et blocs promo :
// on ne garde que les premières phrases utiles pour l'embed.
function cleanSummary(rawSummary, isVideo) {
    const withoutNoise = String(rawSummary || '')
        .replace(/https?:\/\/\S+/gi, ' ')
        .replace(/[#＃][^\s#＃]+/g, ' ')
        .replace(/[▼■▶►☆★＿_]{2,}/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return truncate(withoutNoise, isVideo ? 300 : 650);
}

function buildAnimeComponents(item) {
    const buttons = [];
    const canonicalMediaUrl = canonicalizeYouTubeUrl(item.mediaUrl);
    if (canonicalMediaUrl && canonicalMediaUrl !== item.url) {
        buttons.push(new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel('▶ Regarder la vidéo')
            .setURL(canonicalMediaUrl));
    }
    if (validHttpUrl(item.url)) {
        const isVideo = Boolean(canonicalizeYouTubeUrl(item.url));
        buttons.push(new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setLabel(isVideo ? '▶ Voir sur YouTube' : '📰 Lire l’annonce')
            .setURL(item.url));
    }
    if (buttons.length === 0) return [];
    return [new ActionRowBuilder().addComponents(...buttons)];
}

function buildAnimeEmbed(item, classification) {
    const timestamp = Date.parse(item.publishedAt);
    const relativeTime = Number.isFinite(timestamp)
        ? `<t:${Math.floor(timestamp / 1000)}:R>`
        : 'date inconnue';
    const isVideo = Boolean(canonicalizeYouTubeUrl(item.url) || canonicalizeYouTubeUrl(item.mediaUrl));
    const summary = cleanSummary(item.summary, isVideo)
        || 'Une nouvelle annonce importante vient d’être détectée.';

    const footerParts = [
        EMBED_FOOTER_PREFIX,
        classification.primary.key,
        item.source.id,
        item.id,
    ];
    const canonicalMediaUrl = canonicalizeYouTubeUrl(item.mediaUrl);
    if (canonicalMediaUrl) {
        footerParts.push(`youtube:${new URL(canonicalMediaUrl).searchParams.get('v')}`);
    }

    const embed = new EmbedBuilder()
        .setColor(classification.primary.color)
        .setAuthor({
            name: `${classification.primary.emoji} ${classification.primary.label}`,
        })
        .setTitle(truncate(item.title, 256))
        .setURL(item.url)
        .setDescription(summary)
        .addFields(
            {
                name: 'Source',
                value: `[${truncate(item.source.name, 80)}](${item.url})`,
                inline: true,
            },
            {
                name: 'Publication',
                value: relativeTime,
                inline: true,
            }
        )
        .setFooter({
            text: footerParts.join(' • '),
        });

    if (Number.isFinite(timestamp)) embed.setTimestamp(timestamp);
    if (item.image && validHttpUrl(item.image)) embed.setImage(item.image);
    return embed;
}

async function sendWelcomeMessage(channel, pollIntervalMs) {
    const minutes = Math.max(1, Math.round(pollIntervalMs / 60000));
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📺 Anime News est activé')
        .setDescription(
            'Johnny surveille maintenant les sources officielles et les principaux médias anime.\n\n' +
            '**Ici seulement :** trailers, teasers, nouvelles saisons, nouveaux anime, films, dates de sortie et key visuals.\n' +
            '**Ignoré :** critiques, récaps, produits dérivés, classements, simples previews d’épisodes et rumeurs.'
        )
        .setFooter({ text: `Vérification environ toutes les ${minutes} min • les anciennes news ne seront pas republiées` })
        .setTimestamp();

    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
}

async function recoverStateFromDiscord(channel, client, state) {
    let recovered = 0;
    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        const ordered = [...messages.values()].sort((left, right) => left.createdTimestamp - right.createdTimestamp);

        for (const message of ordered) {
            if (message.author.id !== client.user.id) continue;
            for (const embed of message.embeds) {
                const footer = embed.footer && embed.footer.text;
                if (!footer || !footer.startsWith(`${EMBED_FOOTER_PREFIX} • `)) continue;
                if (!embed.url || !embed.title) continue;

                const parts = footer.split(' • ');
                const mediaPart = parts[parts.length - 1].startsWith('youtube:')
                    ? parts[parts.length - 1]
                    : null;
                const itemId = parts[mediaPart ? parts.length - 2 : parts.length - 1];
                const dedupeKind = parts.length >= 4 ? parts[1] : null;
                const mediaUrl = mediaPart
                    ? canonicalizeYouTubeUrl(`https://www.youtube.com/watch?v=${mediaPart.slice('youtube:'.length)}`)
                    : null;
                state.recover({
                    id: itemId,
                    url: embed.url,
                    mediaUrl,
                    title: embed.title,
                    dedupeKind,
                    publishedAt: embed.timestamp || message.createdAt.toISOString(),
                }, message.createdAt.toISOString());
                recovered++;
            }
        }
        if (recovered > 0) state.save();
        return { successful: true, recovered };
    } catch (error) {
        console.error(`[AnimeNews] Récupération de l’historique impossible: ${error.message}`);
        return { successful: false, recovered: 0, error };
    }
}

function recentEnough(item, maxAgeHours) {
    const timestamp = Date.parse(item.publishedAt);
    if (!Number.isFinite(timestamp)) return false;
    const oldest = Date.now() - maxAgeHours * 60 * 60 * 1000;
    const futureTolerance = Date.now() + 10 * 60 * 1000;
    return timestamp >= oldest && timestamp <= futureTolerance;
}

function canPingRole(channel, roleId) {
    if (!roleId) return false;
    const role = channel.guild.roles.cache.get(roleId);
    if (!role) return false;
    if (role.mentionable) return true;
    // Sans « Mentionner tous les rôles », la mention s'affiche mais ne
    // notifie personne : autant ne pas l'envoyer du tout.
    const botMember = channel.guild.members.me;
    const permissions = botMember && channel.permissionsFor(botMember);
    return Boolean(permissions && permissions.has(PermissionFlagsBits.MentionEveryone));
}

async function deliverOutbox(channel, state) {
    let delivered = 0;
    const pingRoleId = state.getPingRoleId();
    const roleStillExists = canPingRole(channel, pingRoleId);

    for (const entry of state.readyOutbox(MAX_POSTS_PER_CYCLE)) {
        try {
            const embed = buildAnimeEmbed(entry.item, entry.classification);
            const components = buildAnimeComponents(entry.item);
            const payload = {
                embeds: [embed],
                components,
                allowedMentions: { parse: [] },
            };
            if (roleStillExists) {
                payload.content = `<@&${pingRoleId}>`;
                payload.allowedMentions = { parse: [], roles: [pingRoleId] };
            }
            await channel.send(payload);
            state.markDelivered(entry.id);
            state.save();
            delivered++;
            await new Promise(resolve => setTimeout(resolve, 750));
        } catch (error) {
            state.markFailed(entry.id, error);
            state.save();
            console.error(`[AnimeNews] Publication différée après erreur: ${error.message}`);
            break;
        }
    }
    return delivered;
}

function noteSourceHealth(health, source, error) {
    if (!health) return;
    const entry = health.get(source.id) || {
        id: source.id,
        name: source.name,
        failCount: 0,
        lastError: null,
        lastSuccessAt: null,
    };
    if (error) {
        entry.failCount += 1;
        entry.lastError = String(error.message || error).slice(0, 200);
    } else {
        entry.failCount = 0;
        entry.lastError = null;
        entry.lastSuccessAt = new Date().toISOString();
    }
    health.set(source.id, entry);
}

async function pollAnimeNews({ channel, config, settings, state, health }) {
    for (const source of config.sources) {
        if (!state.isSourceInitialized(source.id)) state.ensureSourceStarted(source.id);
    }
    // Persiste la frontière avant les appels réseau : si le premier appel échoue,
    // une annonce arrivée pendant la panne sera reconnue au prochain succès.
    state.save();
    const results = await Promise.allSettled(config.sources.map(source =>
        fetchAnimeSource(source, state.getSourceHeaders(source.id), { timeoutMs: 15000 })
    ));

    const candidatesToQueue = [];
    let accepted = 0;
    let seeded = 0;
    let failedSources = 0;
    const lastDeliveredAt = Date.parse(state.data.lastDeliveredAt);

    for (let index = 0; index < results.length; index++) {
        const result = results[index];
        const source = config.sources[index];
        if (result.status === 'rejected') {
            failedSources++;
            noteSourceHealth(health, source, result.reason);
            console.error(`[AnimeNews] Source ${source.name}: ${result.reason.message}`);
            continue;
        }
        noteSourceHealth(health, source, null);

        let feed = result.value;
        if (feed.notModified && !state.isSourceInitialized(source.id)) {
            try {
                // État partiel/migré : un 304 ne contient rien à amorcer.
                // Rejoue une fois sans validators pour récupérer le flux complet.
                feed = await fetchAnimeSource(source, {}, { timeoutMs: 15000 });
            } catch (error) {
                failedSources++;
                noteSourceHealth(health, source, error);
                console.error(`[AnimeNews] Réamorçage ${source.name}: ${error.message}`);
                continue;
            }
        }
        state.setSourceHeaders(source.id, feed.headers);
        if (feed.notModified) continue;

        const sourceCandidates = feed.items
            .filter(item => recentEnough(item, settings.maxItemAgeHours))
            .map(item => {
                const classification = classifyAnimeAnnouncement(item, config.filter);
                return {
                    item: {
                        ...item,
                        dedupeKind: classification.primary ? classification.primary.key : null,
                    },
                    classification,
                };
            })
            .filter(candidate => candidate.classification.accepted)
            .sort((left, right) => Date.parse(left.item.publishedAt) - Date.parse(right.item.publishedAt));
        accepted += sourceCandidates.length;

        if (!state.isSourceInitialized(source.id)) {
            const bootstrapStartedAt = Date.parse(state.getSourceStartedAt(source.id));
            const recoveryBoundary = Number.isFinite(lastDeliveredAt)
                ? Math.min(lastDeliveredAt - 2 * 60 * 1000, Date.now() - 6 * 60 * 60 * 1000)
                : bootstrapStartedAt - 2 * 1000;
            for (const candidate of sourceCandidates) {
                const publishedAt = Date.parse(candidate.item.publishedAt);
                const publishedAfterBootstrap = Number.isFinite(recoveryBoundary)
                    && publishedAt > recoveryBoundary;
                if (publishedAfterBootstrap) {
                    candidatesToQueue.push(candidate);
                } else {
                    state.remember(candidate.item);
                    seeded++;
                }
            }
            state.markSourceInitialized(source.id);
            continue;
        }

        candidatesToQueue.push(...sourceCandidates);
    }

    candidatesToQueue.sort((left, right) =>
        Date.parse(left.item.publishedAt) - Date.parse(right.item.publishedAt)
    );
    let queued = 0;
    for (const candidate of candidatesToQueue) {
        if (state.enqueue(candidate.item, candidate.classification)) queued++;
    }
    state.save();

    const delivered = await deliverOutbox(channel, state);
    console.log(
        `[AnimeNews] Cycle terminé: ${accepted} retenue(s), ${seeded} initialisée(s), ` +
        `${queued} en file, ${delivered} publiée(s), ${failedSources} source(s) en erreur.`
    );
    return { accepted, seeded, queued, delivered, failedSources };
}

async function startAnimeNewsService(client) {
    if (activeController) return activeController;

    const config = loadAnimeNewsConfig();
    const settings = loadSettings(config.targetGuild);
    if (!settings.enabled) {
        console.log('[AnimeNews] Service désactivé avec ANIME_NEWS_ENABLED=false.');
        return { started: false, reason: 'disabled' };
    }

    const guild = await resolveTargetGuild(client, settings);
    const { channel, created } = await ensureAnimeNewsChannel(guild, settings);
    const state = AnimeNewsState.load(settings.statePath);
    for (const source of config.sources) {
        if (!state.isSourceInitialized(source.id)) state.ensureSourceStarted(source.id);
    }
    // Cette frontière doit exister avant la récupération Discord : une news
    // publiée pendant un retry d'historique restera ainsi postable ensuite.
    state.save();

    let pollInProgress = false;
    let recoveryComplete = false;
    let welcomeSent = !created;
    let activationLogged = false;
    const sourceHealth = new Map();
    let lastCycleAt = null;
    let lastCycleStats = null;
    const runSafely = async () => {
        if (pollInProgress) {
            console.log('[AnimeNews] Cycle précédent encore actif, vérification ignorée.');
            return;
        }
        pollInProgress = true;
        try {
            if (!recoveryComplete) {
                const recovery = await recoverStateFromDiscord(channel, client, state);
                if (!recovery.successful) {
                    console.error('[AnimeNews] Vérification différée : nouvel essai au prochain cycle avant toute lecture des flux.');
                    return;
                }
                recoveryComplete = true;
                if (!activationLogged) {
                    console.log(
                        `[AnimeNews] Actif sur ${guild.name} > #${channel.name} ` +
                        `(${config.sources.length} sources, intervalle ${Math.round(settings.pollIntervalMs / 1000)}s, ` +
                        `${recovery.recovered} annonce(s) récupérée(s) de Discord).`
                    );
                    activationLogged = true;
                }
            }
            if (!welcomeSent) {
                await sendWelcomeMessage(channel, settings.pollIntervalMs);
                welcomeSent = true;
            }
            lastCycleStats = await pollAnimeNews({ channel, config, settings, state, health: sourceHealth });
            lastCycleAt = new Date().toISOString();
        } catch (error) {
            console.error(`[AnimeNews] Cycle interrompu: ${error.stack || error.message}`);
        } finally {
            pollInProgress = false;
        }
    };

    await runSafely();
    const timer = setInterval(runSafely, settings.pollIntervalMs);

    const controller = {
        started: true,
        guildId: guild.id,
        channelId: channel.id,
        state,
        get recoveryPending() {
            return !recoveryComplete;
        },
        runNow: runSafely,
        getStatus: () => ({
            guildId: guild.id,
            channelId: channel.id,
            channelName: channel.name,
            pollIntervalMs: settings.pollIntervalMs,
            lastCycleAt,
            lastCycleStats,
            recoveryPending: !recoveryComplete,
            outboxSize: state.data.outbox.length,
            publishedCount: state.data.published.length,
            pingRoleId: state.getPingRoleId(),
            sources: config.sources.map(source => ({
                id: source.id,
                name: source.name,
                trust: source.trust || 'aggregator',
                language: source.language || 'en',
                health: sourceHealth.get(source.id) || null,
            })),
        }),
        stop: () => {
            clearInterval(timer);
            if (activeController === controller) activeController = null;
        },
    };
    activeController = controller;
    return activeController;
}

function getAnimeNewsController() {
    return activeController;
}

module.exports = {
    buildAnimeComponents,
    buildAnimeEmbed,
    buildChannelPermissionOverwrites,
    canPingRole,
    cleanSummary,
    ensureAnimeNewsChannel,
    getAnimeNewsController,
    loadAnimeNewsConfig,
    loadSettings,
    pollAnimeNews,
    recoverStateFromDiscord,
    startAnimeNewsService,
};
