// Clients HTTP pour les commandes anime/manga :
// - Jikan v4 (API MyAnimeList non officielle, gratuite, sans clé)
// - AniList GraphQL (compte à rebours du prochain épisode)
// Cache en mémoire + délai entre requêtes pour respecter les limites publiques.

const dns = require('node:dns');

// Certains réseaux routent mal l'IPv6 vers api.jikan.moe (504/timeout alors
// que l'IPv4 répond). On privilégie l'IPv4, l'IPv6 reste en secours.
dns.setDefaultResultOrder('ipv4first');

const JIKAN_BASE_URL = 'https://api.jikan.moe/v4';
const ANILIST_GRAPHQL_URL = 'https://graphql.anilist.co';
const REQUEST_TIMEOUT_MS = 10 * 1000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const JIKAN_MIN_DELAY_MS = 450;
const RETRY_AFTER_429_MS = 1500;

const cache = new Map();
let lastJikanRequestAt = 0;
let jikanChain = Promise.resolve();

function cacheGet(key) {
    const entry = cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
        cache.delete(key);
        return undefined;
    }
    return entry.value;
}

function cacheSet(key, value) {
    if (cache.size >= CACHE_MAX_ENTRIES) {
        const oldestKey = cache.keys().next().value;
        cache.delete(oldestKey);
    }
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
            Accept: 'application/json',
            'User-Agent': 'JohnnyDiscordBot/1.0 (+https://github.com/Xxoris190/discord-bot-johnny)',
            ...(options.headers || {}),
        },
    });
    if (!response.ok) {
        const error = new Error(`HTTP ${response.status} ${response.statusText}`);
        error.status = response.status;
        throw error;
    }
    return response.json();
}

async function delayForJikan() {
    const elapsed = Date.now() - lastJikanRequestAt;
    if (elapsed < JIKAN_MIN_DELAY_MS) {
        await new Promise(resolve => setTimeout(resolve, JIKAN_MIN_DELAY_MS - elapsed));
    }
    lastJikanRequestAt = Date.now();
}

/**
 * Appelle l'API Jikan v4 avec cache, sérialisation des requêtes et un
 * nouvel essai unique en cas de HTTP 429.
 * @param {string} apiPath ex: '/anime' ou '/seasons/now'
 * @param {Record<string, string|number|boolean>} params query string
 * @returns {Promise<any>} le JSON complet renvoyé par Jikan
 */
function jikanGet(apiPath, params = {}) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    }
    const url = `${JIKAN_BASE_URL}${apiPath}${query.size > 0 ? `?${query}` : ''}`;

    const cached = cacheGet(url);
    if (cached !== undefined) return Promise.resolve(cached);

    // Sérialise les appels Jikan pour rester sous la limite publique (3 req/s).
    const request = jikanChain.then(async () => {
        const cachedAfterWait = cacheGet(url);
        if (cachedAfterWait !== undefined) return cachedAfterWait;

        await delayForJikan();
        let payload;
        try {
            payload = await fetchJson(url);
        } catch (error) {
            // L'API publique Jikan renvoie parfois 429 (limite) ou 5xx passagers.
            const retryable = error.status === 429 || (error.status >= 500 && error.status <= 599);
            if (!retryable) throw error;
            await new Promise(resolve => setTimeout(resolve, RETRY_AFTER_429_MS));
            payload = await fetchJson(url);
        }
        cacheSet(url, payload);
        return payload;
    });
    jikanChain = request.catch(() => {});
    return request;
}

const NEXT_EPISODE_QUERY = `
query ($search: String) {
  Media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
    id
    siteUrl
    status
    episodes
    title { romaji english }
    coverImage { large }
    nextAiringEpisode { airingAt episode timeUntilAiring }
  }
}`;

const MEDIA_SEARCH_QUERY = `
query ($search: String, $type: MediaType) {
  Media(search: $search, type: $type, sort: SEARCH_MATCH) {
    id
    siteUrl
    format
    status
    episodes
    chapters
    volumes
    season
    seasonYear
    averageScore
    genres
    description(asHtml: false)
    title { romaji english }
    coverImage { large extraLarge }
    studios(isMain: true) { nodes { name } }
    trailer { id site }
  }
}`;

/**
 * Recherche AniList utilisée en secours quand Jikan est indisponible.
 * Renvoie un objet au format Jikan pour réutiliser les mêmes embeds.
 * @param {string} search titre recherché
 * @param {'ANIME'|'MANGA'} type type de média
 * @returns {Promise<object|null>}
 */
async function anilistSearchMedia(search, type) {
    const cacheKey = `anilist:${type}:${search.toLowerCase()}`;
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return cached;

    let payload;
    try {
        payload = await fetchJson(ANILIST_GRAPHQL_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: MEDIA_SEARCH_QUERY, variables: { search, type } }),
        });
    } catch (error) {
        if (error.status === 404) {
            cacheSet(cacheKey, null);
            return null;
        }
        throw error;
    }

    const media = payload && payload.data ? payload.data.Media : null;
    const mapped = media ? mapAnilistToJikanShape(media, type) : null;
    cacheSet(cacheKey, mapped);
    return mapped;
}

const ANILIST_STATUS_LABELS = {
    FINISHED: 'Finished',
    RELEASING: 'Releasing',
    NOT_YET_RELEASED: 'Not yet released',
    CANCELLED: 'Cancelled',
    HIATUS: 'On hiatus',
};

function mapAnilistToJikanShape(media, type) {
    const trailerUrl = media.trailer && media.trailer.site === 'youtube' && media.trailer.id
        ? `https://www.youtube.com/watch?v=${media.trailer.id}`
        : null;
    return {
        title: media.title.romaji || media.title.english,
        title_english: media.title.english,
        url: media.siteUrl,
        synopsis: String(media.description || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''),
        score: Number.isFinite(media.averageScore) ? Math.round(media.averageScore) / 10 : null,
        scored_by: null,
        rank: null,
        type: media.format || null,
        episodes: type === 'ANIME' ? media.episodes : undefined,
        chapters: media.chapters,
        volumes: media.volumes,
        status: ANILIST_STATUS_LABELS[media.status] || media.status,
        season: media.season ? media.season.toLowerCase() : null,
        year: media.seasonYear || null,
        studios: (media.studios && media.studios.nodes || []).map(node => ({ name: node.name })),
        genres: (media.genres || []).map(name => ({ name })),
        images: { jpg: { large_image_url: media.coverImage.extraLarge || media.coverImage.large } },
        trailer: trailerUrl ? { url: trailerUrl } : null,
    };
}

/**
 * Recherche un anime sur AniList et renvoie les infos du prochain épisode.
 * @param {string} search titre recherché
 * @returns {Promise<object|null>} Media AniList ou null si introuvable
 */
async function anilistNextEpisode(search) {
    const cacheKey = `anilist:next:${search.toLowerCase()}`;
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return cached;

    let payload;
    try {
        payload = await fetchJson(ANILIST_GRAPHQL_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: NEXT_EPISODE_QUERY, variables: { search } }),
        });
    } catch (error) {
        // AniList renvoie 404 quand aucun média ne correspond à la recherche.
        if (error.status === 404) {
            cacheSet(cacheKey, null);
            return null;
        }
        throw error;
    }

    const media = payload && payload.data ? payload.data.Media : null;
    cacheSet(cacheKey, media);
    return media;
}

const LIST_QUERY = `
query ($page: Int, $perPage: Int, $sort: [MediaSort], $type: MediaType, $status: MediaStatus, $season: MediaSeason, $seasonYear: Int) {
  Page(page: $page, perPage: $perPage) {
    media(sort: $sort, type: $type, status: $status, season: $season, seasonYear: $seasonYear) {
      siteUrl
      episodes
      averageScore
      title { romaji english }
    }
  }
}`;

function mapAnilistListEntry(media) {
    return {
        title: media.title.romaji || media.title.english,
        url: media.siteUrl,
        score: Number.isFinite(media.averageScore) ? Math.round(media.averageScore) / 10 : null,
        episodes: media.episodes || null,
    };
}

/**
 * Liste AniList (top, saison…) au format des listes Jikan.
 * @param {{sort?: string[], type?: string, status?: string, season?: string, seasonYear?: number, perPage?: number}} variables
 * @returns {Promise<object[]>}
 */
async function anilistList(variables) {
    const cacheKey = `anilist:list:${JSON.stringify(variables)}`;
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return cached;

    const payload = await fetchJson(ANILIST_GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: LIST_QUERY, variables: { perPage: 10, ...variables } }),
    });
    const entries = (payload.data && payload.data.Page && payload.data.Page.media || [])
        .map(mapAnilistListEntry);
    cacheSet(cacheKey, entries);
    return entries;
}

const AIRING_QUERY = `
query ($start: Int, $end: Int) {
  Page(perPage: 15) {
    airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
      airingAt
      episode
      media { siteUrl averageScore isAdult title { romaji english } }
    }
  }
}`;

/**
 * Épisodes diffusés pendant le jour UTC demandé (occurrence la plus proche).
 * @param {string} weekday 'monday'…'sunday'
 * @returns {Promise<object[]>}
 */
async function anilistAiringSchedule(weekday) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const wanted = days.indexOf(weekday);
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    start.setUTCDate(start.getUTCDate() + ((wanted - start.getUTCDay() + 7) % 7));
    const startSeconds = Math.floor(start.getTime() / 1000);

    const cacheKey = `anilist:airing:${weekday}:${startSeconds}`;
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return cached;

    const payload = await fetchJson(ANILIST_GRAPHQL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query: AIRING_QUERY,
            variables: { start: startSeconds, end: startSeconds + 24 * 60 * 60 },
        }),
    });
    const schedules = (payload.data && payload.data.Page && payload.data.Page.airingSchedules || [])
        .filter(entry => entry.media && !entry.media.isAdult)
        .map(entry => ({
            ...mapAnilistListEntry(entry.media),
            episodes: null,
            airingAt: entry.airingAt,
            episode: entry.episode,
        }));
    cacheSet(cacheKey, schedules);
    return schedules;
}

const CHARACTER_QUERY = `
query ($search: String) {
  Character(search: $search, sort: FAVOURITES_DESC) {
    siteUrl
    favourites
    description(asHtml: false)
    name { full native }
    image { large }
  }
}`;

/**
 * Recherche un personnage sur AniList, au format des personnages Jikan.
 * @param {string} search nom du personnage
 * @returns {Promise<object|null>}
 */
async function anilistSearchCharacter(search) {
    const cacheKey = `anilist:character:${search.toLowerCase()}`;
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) return cached;

    let payload;
    try {
        payload = await fetchJson(ANILIST_GRAPHQL_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: CHARACTER_QUERY, variables: { search } }),
        });
    } catch (error) {
        if (error.status === 404) {
            cacheSet(cacheKey, null);
            return null;
        }
        throw error;
    }

    const character = payload.data && payload.data.Character;
    const mapped = character
        ? {
            name: character.name.full,
            name_kanji: character.name.native || null,
            url: character.siteUrl,
            about: String(character.description || '').replace(/<[^>]+>/g, ''),
            favorites: character.favourites || 0,
            images: { jpg: { image_url: character.image && character.image.large } },
        }
        : null;
    cacheSet(cacheKey, mapped);
    return mapped;
}

module.exports = {
    anilistAiringSchedule,
    anilistList,
    anilistNextEpisode,
    anilistSearchCharacter,
    anilistSearchMedia,
    jikanGet,
};
