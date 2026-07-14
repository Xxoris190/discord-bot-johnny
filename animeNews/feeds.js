const crypto = require('crypto');
const Parser = require('rss-parser');

const parser = new Parser({
    customFields: {
        item: [
            ['media:group', 'mediaGroup'],
            ['media:content', 'mediaContent'],
            ['media:thumbnail', 'mediaThumbnail'],
        ],
    },
});

const TRACKING_PARAMS = new Set([
    'fbclid',
    'gclid',
    'mc_cid',
    'mc_eid',
    'ref',
    'source',
]);

function decodeBasicEntities(value) {
    return String(value || '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function stripHtml(value) {
    return decodeBasicEntities(String(value || '')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
}

function validHttpUrl(value) {
    try {
        const parsed = new URL(String(value));
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null;
    } catch (_) {
        return null;
    }
}

function canonicalizeYouTubeUrl(value) {
    const valid = validHttpUrl(value);
    if (!valid) return null;

    const parsed = new URL(valid);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    let videoId = null;
    if (hostname === 'youtu.be') {
        videoId = parsed.pathname.split('/').filter(Boolean)[0] || null;
    } else if (hostname === 'youtube.com' || hostname === 'm.youtube.com') {
        if (parsed.pathname === '/watch') {
            videoId = parsed.searchParams.get('v');
        } else {
            const match = parsed.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/i);
            videoId = match && match[1];
        }
    }

    if (!videoId || !/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return null;
    return `https://www.youtube.com/watch?v=${videoId}`;
}

function canonicalizeUrl(value) {
    const youtubeUrl = canonicalizeYouTubeUrl(value);
    if (youtubeUrl) return youtubeUrl;

    const valid = validHttpUrl(value);
    if (!valid) return '';

    const parsed = new URL(valid);
    parsed.hash = '';
    for (const key of [...parsed.searchParams.keys()]) {
        if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMS.has(key.toLowerCase())) {
            parsed.searchParams.delete(key);
        }
    }
    parsed.searchParams.sort();
    if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString();
}

function extractMediaUrl(item) {
    const searchable = decodeBasicEntities([
        item.link,
        item.guid,
        item.id,
        item.content,
        item['content:encoded'],
        item.description,
        item.summary,
    ].filter(Boolean).join('\n'));
    const urls = searchable.match(/https?:\/\/[^\s"'<>]+/gi) || [];
    for (const rawUrl of urls) {
        const mediaUrl = canonicalizeYouTubeUrl(rawUrl.replace(/[),.;]+$/g, ''));
        if (mediaUrl) return mediaUrl;
    }
    return null;
}

function firstMediaUrl(value, depth = 0) {
    if (!value || depth > 5) return null;
    if (Array.isArray(value)) {
        for (const entry of value) {
            const found = firstMediaUrl(entry, depth + 1);
            if (found) return found;
        }
        return null;
    }
    if (typeof value !== 'object') return null;

    const directCandidates = [
        value.url,
        value.href,
        value.$ && value.$.url,
        value.$ && value.$.href,
    ];
    for (const candidate of directCandidates) {
        const valid = validHttpUrl(candidate);
        if (valid) return valid;
    }

    const preferredKeys = [
        'media:thumbnail',
        'thumbnail',
        'mediaThumbnail',
        'media:content',
        'mediaContent',
        'media:group',
        'mediaGroup',
    ];
    for (const key of preferredKeys) {
        const found = firstMediaUrl(value[key], depth + 1);
        if (found) return found;
    }
    return null;
}

function extractImage(item) {
    const enclosureType = String(item.enclosure && item.enclosure.type || '');
    if (!enclosureType || enclosureType.startsWith('image/')) {
        const enclosure = validHttpUrl(item.enclosure && item.enclosure.url);
        if (enclosure) return enclosure;
    }

    const media = firstMediaUrl(item.mediaThumbnail)
        || firstMediaUrl(item.mediaGroup)
        || firstMediaUrl(item.mediaContent);
    if (media) return media;

    const html = String(item.content || item.description || item.summary || '');
    const imageMatch = html.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
    return validHttpUrl(imageMatch && imageMatch[1]);
}

function parsePublishedAt(item) {
    const candidates = [item.isoDate, item.pubDate, item.published, item.updated];
    for (const candidate of candidates) {
        const timestamp = Date.parse(candidate);
        if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
    }
    return new Date().toISOString();
}

function makeItemId(source, externalId, url, title) {
    return crypto
        .createHash('sha256')
        .update(`${source.id}\n${externalId || url || title}`)
        .digest('hex');
}

async function parseFeedXml(source, xml) {
    const feed = await parser.parseString(xml);
    const items = Array.isArray(feed.items) ? feed.items : [];

    return items.slice(0, source.maxItems || 50).flatMap(rawItem => {
        const title = stripHtml(rawItem.title);
        const url = canonicalizeUrl(rawItem.link || rawItem.guid || rawItem.id);
        if (!title || !url) return [];

        const externalId = String(rawItem.guid || rawItem.id || url);
        const summary = stripHtml(
            rawItem.contentSnippet
            || rawItem.summary
            || rawItem.content
            || rawItem.description
            || ''
        );

        return [{
            id: makeItemId(source, externalId, url, title),
            externalId,
            title,
            url,
            mediaUrl: extractMediaUrl(rawItem),
            summary,
            image: extractImage(rawItem),
            publishedAt: parsePublishedAt(rawItem),
            source: {
                id: source.id,
                name: source.name,
                trust: source.trust || 'aggregator',
                language: source.language || 'en',
            },
        }];
    });
}

async function readResponseTextLimited(response, maxBytes) {
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        throw new Error(`flux trop volumineux (${declaredLength} octets, limite ${maxBytes})`);
    }

    if (!response.body || typeof response.body.getReader !== 'function') {
        const text = await response.text();
        const bytes = Buffer.byteLength(text, 'utf8');
        if (bytes > maxBytes) {
            throw new Error(`flux trop volumineux (${bytes} octets, limite ${maxBytes})`);
        }
        return text;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            totalBytes += value.byteLength;
            if (totalBytes > maxBytes) {
                await reader.cancel().catch(() => {});
                throw new Error(`flux trop volumineux (limite ${maxBytes} octets)`);
            }
            chunks.push(Buffer.from(value));
        }
    } finally {
        reader.releaseLock();
    }
    return Buffer.concat(chunks, totalBytes).toString('utf8');
}

async function fetchAnimeSource(source, cacheHeaders = {}, options = {}) {
    const timeoutMs = options.timeoutMs || 15000;
    const maxBytes = source.maxBytes || options.maxBytes || 2 * 1024 * 1024;
    const headers = {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5',
        'User-Agent': 'JohnnyAnimeNewsBot/1.0 (+https://github.com/Xxoris190/discord-bot-johnny)',
    };
    if (cacheHeaders.etag) headers['If-None-Match'] = cacheHeaders.etag;
    if (cacheHeaders.lastModified) headers['If-Modified-Since'] = cacheHeaders.lastModified;

    const response = await fetch(source.url, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status === 304) {
        return {
            source,
            notModified: true,
            items: [],
            headers: {
                etag: response.headers.get('etag') || cacheHeaders.etag || null,
                lastModified: response.headers.get('last-modified') || cacheHeaders.lastModified || null,
            },
        };
    }
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const responseHeaders = {
        etag: response.headers.get('etag') || null,
        lastModified: response.headers.get('last-modified') || null,
    };
    const xml = await readResponseTextLimited(response, maxBytes);
    const items = await parseFeedXml(source, xml);
    return { source, notModified: false, items, headers: responseHeaders };
}

module.exports = {
    canonicalizeUrl,
    canonicalizeYouTubeUrl,
    extractMediaUrl,
    fetchAnimeSource,
    parseFeedXml,
    readResponseTextLimited,
    stripHtml,
    validHttpUrl,
};
