// Commandes /anime et /manga : recherche, saison, top, planning, random,
// personnages et compte à rebours du prochain épisode (Jikan + AniList).

const { EmbedBuilder } = require('discord.js');
const {
    anilistAiringSchedule,
    anilistList,
    anilistNextEpisode,
    anilistSearchCharacter,
    anilistSearchMedia,
    jikanGet,
} = require('../lib/animeApi');

const EMBED_COLOR = 0x00A8FC;
const SYNOPSIS_LIMIT = 450;
const LIST_SIZE = 10;
const USER_COOLDOWN_MS = 3000;

const SEASON_CHOICES = [
    { name: 'Hiver / Winter', value: 'winter' },
    { name: 'Printemps / Spring', value: 'spring' },
    { name: 'Été / Summer', value: 'summer' },
    { name: 'Automne / Fall', value: 'fall' },
];
const TOP_ANIME_CHOICES = [
    { name: 'En diffusion / Airing', value: 'airing' },
    { name: 'À venir / Upcoming', value: 'upcoming' },
    { name: 'Populaires / By popularity', value: 'bypopularity' },
    { name: 'Favoris / Favorites', value: 'favorite' },
];
const DAY_CHOICES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    .map(day => ({ name: day, value: day }));

const cooldowns = new Map();

const animeCommandDefinitions = [
    {
        name: 'anime',
        description: 'Infos anime : recherche, saison, top, planning… / Anime lookup commands',
        options: [
            {
                type: 1, name: 'search', description: 'Recherche un anime (MyAnimeList) / Search an anime',
                options: [{ type: 3, name: 'titre', description: 'Titre de l’anime / Anime title', required: true }],
            },
            {
                type: 1, name: 'season', description: 'Les anime d’une saison / Seasonal anime list',
                options: [
                    { type: 3, name: 'saison', description: 'Saison (défaut: en cours) / Season', required: false, choices: SEASON_CHOICES },
                    { type: 4, name: 'annee', description: 'Année (ex: 2026) / Year', required: false, min_value: 1970, max_value: 2030 },
                ],
            },
            {
                type: 1, name: 'top', description: 'Top anime MyAnimeList / Top ranked anime',
                options: [{ type: 3, name: 'categorie', description: 'Catégorie / Category', required: false, choices: TOP_ANIME_CHOICES }],
            },
            {
                type: 1, name: 'schedule', description: 'Planning de diffusion du jour / Airing schedule',
                options: [{ type: 3, name: 'jour', description: 'Jour (défaut: aujourd’hui) / Day', required: false, choices: DAY_CHOICES }],
            },
            { type: 1, name: 'random', description: 'Un anime au hasard / Random anime' },
            {
                type: 1, name: 'character', description: 'Recherche un personnage / Search a character',
                options: [{ type: 3, name: 'nom', description: 'Nom du personnage / Character name', required: true }],
            },
            {
                type: 1, name: 'next', description: 'Prochain épisode d’un anime en cours / Next episode countdown',
                options: [{ type: 3, name: 'titre', description: 'Titre de l’anime / Anime title', required: true }],
            },
        ],
    },
    {
        name: 'manga',
        description: 'Infos manga : recherche et top / Manga lookup commands',
        options: [
            {
                type: 1, name: 'search', description: 'Recherche un manga / Search a manga',
                options: [{ type: 3, name: 'titre', description: 'Titre du manga / Manga title', required: true }],
            },
            {
                type: 1, name: 'top', description: 'Top manga MyAnimeList / Top ranked manga',
                options: [{
                    type: 3, name: 'categorie', description: 'Catégorie / Category', required: false,
                    choices: [
                        { name: 'En publication / Publishing', value: 'publishing' },
                        { name: 'À venir / Upcoming', value: 'upcoming' },
                        { name: 'Populaires / By popularity', value: 'bypopularity' },
                        { name: 'Favoris / Favorites', value: 'favorite' },
                    ],
                }],
            },
        ],
    },
];

function truncate(value, limit) {
    const text = String(value || '').trim();
    if (text.length <= limit) return text;
    return `${text.slice(0, limit - 1)}…`;
}

function formatCount(value) {
    if (!Number.isFinite(value)) return '—';
    return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : String(value);
}

function mediaCardEmbed(media, headerLabel) {
    const image = media.images && media.images.jpg
        ? (media.images.jpg.large_image_url || media.images.jpg.image_url)
        : null;
    const genres = (media.genres || []).map(genre => genre.name).slice(0, 5).join(', ');
    const studios = (media.studios || []).map(studio => studio.name).join(', ');

    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setAuthor({ name: headerLabel })
        .setTitle(truncate(media.title || media.title_english || 'Sans titre', 256))
        .setURL(media.url || null)
        .setDescription(truncate(media.synopsis || 'Pas de synopsis disponible.', SYNOPSIS_LIMIT))
        .addFields(
            { name: 'Score', value: media.score ? `⭐ **${media.score}** (${formatCount(media.scored_by)} votes)` : '—', inline: true },
            { name: 'Rang', value: media.rank ? `#${media.rank}` : '—', inline: true },
            { name: 'Type', value: media.type || '—', inline: true },
        );

    if (media.episodes !== undefined) {
        const airing = media.status || '—';
        embed.addFields(
            { name: 'Épisodes', value: media.episodes ? String(media.episodes) : '?', inline: true },
            { name: 'Statut', value: airing, inline: true },
            { name: 'Saison', value: media.season ? `${media.season} ${media.year || ''}` : '—', inline: true },
        );
        if (studios) embed.addFields({ name: 'Studio', value: truncate(studios, 100), inline: true });
    } else {
        embed.addFields(
            { name: 'Volumes', value: media.volumes ? String(media.volumes) : '?', inline: true },
            { name: 'Statut', value: media.status || '—', inline: true },
        );
    }
    if (genres) embed.addFields({ name: 'Genres', value: truncate(genres, 100), inline: true });
    if (media.trailer && media.trailer.url) {
        embed.addFields({ name: 'Trailer', value: `[▶ Regarder](${media.trailer.url})`, inline: true });
    }
    if (image) embed.setThumbnail(image);
    embed.setFooter({ text: 'Source : MyAnimeList (Jikan)' });
    return embed;
}

function rankedListEmbed(title, entries, sourceLabel = 'MyAnimeList (Jikan)') {
    const lines = entries.slice(0, LIST_SIZE).map((entry, index) => {
        const score = entry.score ? ` — ⭐ ${entry.score}` : '';
        const episodes = entry.episodes ? ` · ${entry.episodes} ép.` : '';
        const airing = entry.airingAt ? ` · ép. ${entry.episode} à <t:${entry.airingAt}:t>` : '';
        return `**${index + 1}.** [${truncate(entry.title, 60)}](${entry.url})${score}${episodes}${airing}`;
    });
    return new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(title)
        .setDescription(lines.join('\n') || 'Aucun résultat.')
        .setFooter({ text: `Source : ${sourceLabel}` })
        .setTimestamp();
}

const ANILIST_TOP_VARIABLES = {
    airing: { status: 'RELEASING', sort: ['SCORE_DESC'] },
    upcoming: { status: 'NOT_YET_RELEASED', sort: ['POPULARITY_DESC'] },
    publishing: { status: 'RELEASING', sort: ['SCORE_DESC'] },
    bypopularity: { sort: ['POPULARITY_DESC'] },
    favorite: { sort: ['FAVOURITES_DESC'] },
    default: { sort: ['SCORE_DESC'] },
};

function currentAnimeSeason() {
    const month = new Date().getUTCMonth() + 1;
    if (month <= 3) return 'winter';
    if (month <= 6) return 'spring';
    if (month <= 9) return 'summer';
    return 'fall';
}

function onCooldown(userId) {
    const availableAt = cooldowns.get(userId) || 0;
    if (Date.now() < availableAt) return true;
    cooldowns.set(userId, Date.now() + USER_COOLDOWN_MS);
    if (cooldowns.size > 500) {
        for (const [key, expiry] of cooldowns) {
            if (Date.now() > expiry) cooldowns.delete(key);
        }
    }
    return false;
}

// Jikan tombe régulièrement en panne (MAL le bloque par vagues) :
// on bascule alors sur AniList pour que la recherche reste disponible.
async function searchWithFallback(title, type) {
    try {
        const apiPath = type === 'ANIME' ? '/anime' : '/manga';
        const payload = await jikanGet(apiPath, { q: title, limit: 5, sfw: true, order_by: 'members', sort: 'desc' });
        const results = payload.data || [];
        if (results.length > 0) return { media: results[0], source: 'MyAnimeList (Jikan)' };
        return { media: null, source: 'MyAnimeList (Jikan)' };
    } catch (error) {
        console.error(`[Commands] Jikan indisponible (${error.message}), bascule sur AniList.`);
        const media = await anilistSearchMedia(title, type);
        return { media, source: 'AniList (secours)' };
    }
}

async function runAnimeSearch(interaction) {
    const title = interaction.options.getString('titre');
    const { media, source } = await searchWithFallback(title, 'ANIME');
    if (!media) {
        return interaction.editReply(`❌ Aucun anime trouvé pour **${truncate(title, 80)}**.`);
    }
    const embed = mediaCardEmbed(media, '📺 Anime').setFooter({ text: `Source : ${source}` });
    return interaction.editReply({ embeds: [embed] });
}

async function runSeason(interaction) {
    const season = interaction.options.getString('saison') || currentAnimeSeason();
    const year = interaction.options.getInteger('annee') || new Date().getUTCFullYear();
    const label = `${season} ${year}`;

    let entries;
    let source = 'MyAnimeList (Jikan)';
    try {
        const payload = await jikanGet(`/seasons/${year}/${season}`, { sfw: true, limit: LIST_SIZE });
        entries = payload.data || [];
    } catch (error) {
        console.error(`[Commands] Jikan indisponible (${error.message}), bascule sur AniList.`);
        entries = await anilistList({
            type: 'ANIME',
            season: season.toUpperCase(),
            seasonYear: year,
            sort: ['POPULARITY_DESC'],
        });
        source = 'AniList (secours)';
    }
    return interaction.editReply({ embeds: [rankedListEmbed(`🗓️ Anime — ${label}`, entries, source)] });
}

async function runTop(interaction, type) {
    const filter = interaction.options.getString('categorie');
    const suffix = filter ? ` (${filter})` : '';
    const emoji = type === 'anime' ? '🏆' : '📚';

    let entries;
    let source = 'MyAnimeList (Jikan)';
    try {
        const payload = await jikanGet(`/top/${type}`, { filter: filter || undefined, limit: LIST_SIZE, sfw: true });
        entries = payload.data || [];
    } catch (error) {
        console.error(`[Commands] Jikan indisponible (${error.message}), bascule sur AniList.`);
        const variables = ANILIST_TOP_VARIABLES[filter] || ANILIST_TOP_VARIABLES.default;
        entries = await anilistList({ ...variables, type: type.toUpperCase() });
        source = 'AniList (secours)';
    }
    return interaction.editReply({ embeds: [rankedListEmbed(`${emoji} Top ${type}${suffix}`, entries, source)] });
}

async function runSchedule(interaction) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const day = interaction.options.getString('jour') || days[new Date().getUTCDay()];

    let entries;
    let source = 'MyAnimeList (Jikan)';
    try {
        const payload = await jikanGet('/schedules', { filter: day, sfw: true, limit: LIST_SIZE });
        entries = payload.data || [];
    } catch (error) {
        console.error(`[Commands] Jikan indisponible (${error.message}), bascule sur AniList.`);
        entries = await anilistAiringSchedule(day);
        source = 'AniList (secours)';
    }
    return interaction.editReply({ embeds: [rankedListEmbed(`📅 Diffusions — ${day}`, entries, source)] });
}

async function runRandom(interaction) {
    try {
        const payload = await jikanGet(`/random/anime?sfw=true&nocache=${Math.floor(Date.now() / 1000)}`);
        if (payload.data) {
            return interaction.editReply({ embeds: [mediaCardEmbed(payload.data, '🎲 Anime au hasard')] });
        }
    } catch (error) {
        console.error(`[Commands] Jikan indisponible (${error.message}), bascule sur AniList.`);
    }

    // Secours : une page au hasard parmi les 1000 anime les plus populaires AniList.
    const page = 1 + Math.floor(Math.random() * 200);
    const entries = await anilistList({ type: 'ANIME', sort: ['POPULARITY_DESC'], page, perPage: 5 });
    const pick = entries[Math.floor(Math.random() * entries.length)];
    if (!pick) return interaction.editReply('❌ Impossible de tirer un anime au hasard, réessaie.');
    const media = await anilistSearchMedia(pick.title, 'ANIME');
    if (!media) return interaction.editReply('❌ Impossible de tirer un anime au hasard, réessaie.');
    const embed = mediaCardEmbed(media, '🎲 Anime au hasard').setFooter({ text: 'Source : AniList (secours)' });
    return interaction.editReply({ embeds: [embed] });
}

async function runCharacter(interaction) {
    const name = interaction.options.getString('nom');
    let character;
    let source = 'MyAnimeList (Jikan)';
    try {
        const payload = await jikanGet('/characters', { q: name, limit: 3, order_by: 'favorites', sort: 'desc' });
        character = (payload.data || [])[0];
    } catch (error) {
        console.error(`[Commands] Jikan indisponible (${error.message}), bascule sur AniList.`);
        character = await anilistSearchCharacter(name);
        source = 'AniList (secours)';
    }
    if (!character) {
        return interaction.editReply(`❌ Aucun personnage trouvé pour **${truncate(name, 80)}**.`);
    }

    const image = character.images && character.images.jpg ? character.images.jpg.image_url : null;
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setAuthor({ name: '👤 Personnage' })
        .setTitle(truncate(character.name, 256))
        .setURL(character.url)
        .setDescription(truncate(character.about || 'Pas de biographie disponible.', SYNOPSIS_LIMIT))
        .addFields({ name: 'Favoris', value: `❤️ ${formatCount(character.favorites)}`, inline: true })
        .setFooter({ text: `Source : ${source}` });
    if (character.name_kanji) embed.addFields({ name: 'Kanji', value: character.name_kanji, inline: true });
    if (image) embed.setThumbnail(image);
    return interaction.editReply({ embeds: [embed] });
}

async function runNextEpisode(interaction) {
    const title = interaction.options.getString('titre');
    const media = await anilistNextEpisode(title);
    if (!media) {
        return interaction.editReply(`❌ Aucun anime trouvé pour **${truncate(title, 80)}** sur AniList.`);
    }

    const displayTitle = media.title.romaji || media.title.english || title;
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setAuthor({ name: '⏰ Prochain épisode' })
        .setTitle(truncate(displayTitle, 256))
        .setURL(media.siteUrl)
        .setFooter({ text: 'Source : AniList' });
    if (media.coverImage && media.coverImage.large) embed.setThumbnail(media.coverImage.large);

    if (media.nextAiringEpisode) {
        const { airingAt, episode } = media.nextAiringEpisode;
        embed.setDescription(
            `L’épisode **${episode}** sort <t:${airingAt}:R>\n📆 <t:${airingAt}:F>`
            + (media.episodes ? `\n\nÉpisodes prévus : **${media.episodes}**` : '')
        );
    } else {
        const statusLabels = {
            FINISHED: 'Terminé — plus d’épisodes à venir.',
            NOT_YET_RELEASED: 'Pas encore diffusé — aucune date d’épisode annoncée.',
            CANCELLED: 'Annulé.',
            HIATUS: 'En pause (hiatus).',
        };
        embed.setDescription(statusLabels[media.status] || 'Aucun épisode programmé pour le moment.');
    }
    return interaction.editReply({ embeds: [embed] });
}

async function runMangaSearch(interaction) {
    const title = interaction.options.getString('titre');
    const { media, source } = await searchWithFallback(title, 'MANGA');
    if (!media) {
        return interaction.editReply(`❌ Aucun manga trouvé pour **${truncate(title, 80)}**.`);
    }
    const embed = mediaCardEmbed(media, '📚 Manga').setFooter({ text: `Source : ${source}` });
    return interaction.editReply({ embeds: [embed] });
}

/**
 * Route les interactions /anime et /manga. À appeler depuis interactionCreate.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleAnimeCommand(interaction) {
    if (onCooldown(interaction.user.id)) {
        return interaction.reply({ content: '⏳ Doucement ! Réessaie dans quelques secondes.', ephemeral: true });
    }

    const group = interaction.commandName;
    const sub = interaction.options.getSubcommand();
    await interaction.deferReply();

    try {
        if (group === 'anime') {
            if (sub === 'search') return await runAnimeSearch(interaction);
            if (sub === 'season') return await runSeason(interaction);
            if (sub === 'top') return await runTop(interaction, 'anime');
            if (sub === 'schedule') return await runSchedule(interaction);
            if (sub === 'random') return await runRandom(interaction);
            if (sub === 'character') return await runCharacter(interaction);
            if (sub === 'next') return await runNextEpisode(interaction);
        }
        if (group === 'manga') {
            if (sub === 'search') return await runMangaSearch(interaction);
            if (sub === 'top') return await runTop(interaction, 'manga');
        }
        return await interaction.editReply('❌ Sous-commande inconnue.');
    } catch (error) {
        console.error(`[Commands] /${group} ${sub}: ${error.message}`);
        const message = error.status === 429
            ? '⏳ L’API est saturée, réessaie dans quelques secondes.'
            : '❌ Le service d’infos anime ne répond pas, réessaie plus tard.';
        return interaction.editReply(message);
    }
}

module.exports = {
    animeCommandDefinitions,
    handleAnimeCommand,
};
