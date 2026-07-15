const fs = require('fs');
const path = require('path');
const { foldText } = require('./filter');

const TITLE_STOP_WORDS = new Set([
    'a', 'an', 'and', 'anime', 'annonce', 'announced', 'adaptation', 'adapte', 'avec',
    'beginning', 'cast', 'de', 'debut', 'des', 'devoile', 'du', 'en', 'et', 'for',
    'gets', 'inspires', 'la', 'le', 'les', 'main', 'manga', 'new', 'nouveau', 'nouvelle',
    'of', 'official', 'pour', 'promo', 'pv', 'receives', 'reveals', 'sera', 'staff',
    'studio', 'the', 'trailer', 'tv', 'un', 'une', 'unveils', 'with',
]);

function initialState() {
    return {
        version: 1,
        bootstrapStartedAt: new Date().toISOString(),
        initializedSources: {},
        sourceStartedAt: {},
        sourceHeaders: {},
        seen: [],
        outbox: [],
        published: [],
        pingRoleId: null,
        lastDeliveredAt: null,
    };
}

const MAX_PUBLISHED_RECORDS = 300;

function publishedRecord(item, classification, deliveredAt) {
    const primary = classification && classification.primary ? classification.primary : null;
    return {
        title: String(item.title || '').slice(0, 256),
        url: item.url || null,
        image: item.image || null,
        mediaUrl: item.mediaUrl || null,
        category: primary ? primary.key : (item.dedupeKind || null),
        categoryLabel: primary ? `${primary.emoji} ${primary.label}` : null,
        sourceName: item.source && item.source.name ? item.source.name : null,
        publishedAt: item.publishedAt || deliveredAt,
        deliveredAt,
    };
}

function extractAssetOrdinal(title) {
    const text = foldText(title);
    const words = {
        first: 1,
        premier: 1,
        premiere: 1,
        second: 2,
        deuxieme: 2,
        third: 3,
        troisieme: 3,
        fourth: 4,
        quatrieme: 4,
    };
    const leading = text.match(
        /\b(first|second|third|fourth|premier|premiere|deuxieme|troisieme|quatrieme|\d+(?:st|nd|rd|th)?)\s+(?:official\s+)?(?:trailer|promo(?:tional video)?|pv)\b/i
    );
    if (leading) {
        const raw = leading[1].toLowerCase();
        const prefix = text.slice(0, leading.index);
        const isSeasonNumber = /^\d/.test(raw) && /\b(?:season|saison)\s*$/.test(prefix);
        if (!isSeasonNumber) return words[raw] || Number.parseInt(raw, 10) || null;
    }

    const trailing = text.match(/\b(?:trailer|promo|pv)\s*(?:#|no\.?|part)?\s*(\d+)\b/i);
    if (trailing) return Number.parseInt(trailing[1], 10) || null;

    const japanese = text.match(/(?:第([一二三四五六七八九十\d]+)弾(?:pv)?|pv第([一二三四五六七八九十\d]+)弾)/i);
    if (japanese) {
        const japaneseNumbers = {
            一: 1, 二: 2, 三: 3, 四: 4, 五: 5,
            六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
        };
        const raw = japanese[1] || japanese[2];
        return japaneseNumbers[raw] || Number.parseInt(raw, 10) || null;
    }
    return null;
}

function normalizedTitle(title) {
    return foldText(title)
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function titleTokens(title) {
    return normalizedTitle(title)
        .split(' ')
        .filter(token => token.length > 1 && !TITLE_STOP_WORDS.has(token));
}

function titleSimilarity(left, right) {
    const a = new Set(Array.isArray(left) ? left : titleTokens(left));
    const b = new Set(Array.isArray(right) ? right : titleTokens(right));
    if (a.size === 0 || b.size === 0) return 0;

    let intersection = 0;
    for (const token of a) {
        if (b.has(token)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union > 0 ? intersection / union : 0;
}

function recordFromItem(item, seenAt = new Date().toISOString()) {
    return {
        id: item.id,
        url: item.url,
        mediaUrl: item.mediaUrl || null,
        titleKey: normalizedTitle(item.title),
        titleTokens: titleTokens(item.title),
        kind: item.dedupeKind || item.kind || null,
        assetOrdinal: extractAssetOrdinal(item.title),
        publishedAt: item.publishedAt || seenAt,
        seenAt,
    };
}

function hydrateState(raw) {
    const fallback = initialState();
    if (!raw || typeof raw !== 'object') return fallback;

    return {
        version: 1,
        bootstrapStartedAt: raw.bootstrapStartedAt || fallback.bootstrapStartedAt,
        initializedSources: raw.initializedSources && typeof raw.initializedSources === 'object'
            ? raw.initializedSources
            : {},
        sourceStartedAt: raw.sourceStartedAt && typeof raw.sourceStartedAt === 'object'
            ? raw.sourceStartedAt
            : {},
        sourceHeaders: raw.sourceHeaders && typeof raw.sourceHeaders === 'object'
            ? raw.sourceHeaders
            : {},
        seen: Array.isArray(raw.seen) ? raw.seen : [],
        outbox: Array.isArray(raw.outbox) ? raw.outbox : [],
        published: Array.isArray(raw.published) ? raw.published : [],
        pingRoleId: raw.pingRoleId || null,
        lastDeliveredAt: raw.lastDeliveredAt || null,
    };
}

class AnimeNewsState {
    constructor(filePath, data = initialState()) {
        this.filePath = filePath;
        this.data = hydrateState(data);
    }

    static load(filePath) {
        if (!fs.existsSync(filePath)) return new AnimeNewsState(filePath);

        try {
            const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            return new AnimeNewsState(filePath, raw);
        } catch (error) {
            const backup = `${filePath}.corrupt-${Date.now()}`;
            try {
                fs.renameSync(filePath, backup);
                console.error(`[AnimeNews] État illisible déplacé vers ${path.basename(backup)}.`);
            } catch (_) {}
            console.error(`[AnimeNews] Nouvel état créé: ${error.message}`);
            return new AnimeNewsState(filePath);
        }
    }

    save() {
        this.prune();
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        const temporaryPath = `${this.filePath}.tmp`;
        fs.writeFileSync(temporaryPath, JSON.stringify(this.data, null, 2), 'utf8');
        try {
            fs.renameSync(temporaryPath, this.filePath);
        } catch (error) {
            if (!['EEXIST', 'EPERM'].includes(error.code)) throw error;
            fs.rmSync(this.filePath, { force: true });
            fs.renameSync(temporaryPath, this.filePath);
        }
    }

    prune() {
        const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
        this.data.seen = this.data.seen
            .filter(record => Date.parse(record.seenAt) >= cutoff)
            .slice(-3000);
        this.data.published = this.data.published.slice(-MAX_PUBLISHED_RECORDS);
    }

    recordPublished(item, classification, deliveredAt = new Date().toISOString()) {
        const record = publishedRecord(item, classification, deliveredAt);
        if (record.url && this.data.published.some(entry => entry.url === record.url)) return;
        this.data.published.push(record);
        if (this.data.published.length > MAX_PUBLISHED_RECORDS) {
            this.data.published = this.data.published.slice(-MAX_PUBLISHED_RECORDS);
        }
    }

    recentPublished(limit = 5) {
        return [...this.data.published]
            .sort((left, right) => Date.parse(right.deliveredAt) - Date.parse(left.deliveredAt))
            .slice(0, Math.max(1, limit));
    }

    searchPublished(query, limit = 5) {
        const tokens = titleTokens(query);
        const queryKey = normalizedTitle(query);
        if (tokens.length === 0 && !queryKey) return [];

        return [...this.data.published]
            .map(record => {
                const recordKey = normalizedTitle(record.title);
                const containsQuery = queryKey && recordKey.includes(queryKey);
                const similarity = titleSimilarity(tokens, titleTokens(record.title));
                return { record, score: containsQuery ? 1 : similarity };
            })
            .filter(entry => entry.score >= 0.2)
            .sort((left, right) => right.score - left.score
                || Date.parse(right.record.deliveredAt) - Date.parse(left.record.deliveredAt))
            .slice(0, Math.max(1, limit))
            .map(entry => entry.record);
    }

    getPingRoleId() {
        return this.data.pingRoleId || null;
    }

    setPingRoleId(roleId) {
        this.data.pingRoleId = roleId || null;
    }

    isSourceInitialized(sourceId) {
        return this.data.initializedSources[sourceId] === true;
    }

    markSourceInitialized(sourceId) {
        this.data.initializedSources[sourceId] = true;
    }

    ensureSourceStarted(sourceId, startedAt = new Date().toISOString()) {
        if (!this.data.sourceStartedAt[sourceId]) {
            this.data.sourceStartedAt[sourceId] = startedAt;
        }
        return this.data.sourceStartedAt[sourceId];
    }

    getSourceStartedAt(sourceId) {
        return this.data.sourceStartedAt[sourceId] || this.data.bootstrapStartedAt;
    }

    getSourceHeaders(sourceId) {
        return this.data.sourceHeaders[sourceId] || {};
    }

    setSourceHeaders(sourceId, headers) {
        this.data.sourceHeaders[sourceId] = {
            etag: headers.etag || null,
            lastModified: headers.lastModified || null,
        };
    }

    allDuplicateRecords() {
        const pending = this.data.outbox.map(entry => recordFromItem(entry.item, entry.queuedAt));
        return [...this.data.seen, ...pending];
    }

    hasSeen(item, windowHours = 72) {
        const candidate = recordFromItem(item);
        const cutoff = Date.now() - windowHours * 60 * 60 * 1000;

        return this.allDuplicateRecords().some(record => {
            if (record.id && record.id === candidate.id) return true;
            if (record.url && candidate.url && record.url === candidate.url) return true;

            const ordinalMismatch = record.assetOrdinal !== candidate.assetOrdinal
                && ((record.assetOrdinal || 0) >= 2 || (candidate.assetOrdinal || 0) >= 2);
            const timestamp = Date.parse(record.seenAt || record.publishedAt);
            if (Number.isFinite(timestamp) && timestamp < cutoff) return false;
            const kindsCompatible = !record.kind || !candidate.kind || record.kind === candidate.kind;

            const publishedDistance = Math.abs(
                Date.parse(record.publishedAt || record.seenAt)
                - Date.parse(candidate.publishedAt || candidate.seenAt)
            );
            const bothOrdinalsKnownAndDifferent = Boolean(
                record.assetOrdinal
                && candidate.assetOrdinal
                && record.assetOrdinal !== candidate.assetOrdinal
            );
            const sameRecentMedia = record.mediaUrl
                && candidate.mediaUrl
                && record.mediaUrl === candidate.mediaUrl
                && kindsCompatible
                && !bothOrdinalsKnownAndDifferent
                && Number.isFinite(publishedDistance)
                && publishedDistance <= 24 * 60 * 60 * 1000;
            if (sameRecentMedia) return true;

            if (ordinalMismatch) return false;
            if (!kindsCompatible) return false;
            if (record.titleKey && record.titleKey === candidate.titleKey) return true;

            const similarity = titleSimilarity(record.titleTokens || [], candidate.titleTokens);
            const commonCount = (record.titleTokens || [])
                .filter(token => candidate.titleTokens.includes(token)).length;
            if (commonCount >= 3 && similarity >= 0.82) return true;

            const smallerTitleSize = Math.min(
                (record.titleTokens || []).length,
                candidate.titleTokens.length
            );
            const containment = smallerTitleSize > 0 ? commonCount / smallerTitleSize : 0;
            const veryRecent = Number.isFinite(timestamp)
                && timestamp >= Date.now() - 12 * 60 * 60 * 1000;
            return veryRecent && commonCount >= 3 && containment >= 0.9 && similarity >= 0.5;
        });
    }

    remember(item, seenAt = new Date().toISOString()) {
        if (!this.hasSeen(item)) {
            this.data.seen.push(recordFromItem(item, seenAt));
        }
    }

    recover(item, messageCreatedAt) {
        const seenAt = messageCreatedAt || new Date().toISOString();
        const pending = this.data.outbox.find(entry =>
            (item.id && entry.item.id === item.id)
            || (item.url && entry.item.url === item.url)
        );
        if (pending) {
            this.markDelivered(pending.id, seenAt);
        } else {
            this.remember(item, seenAt);
            this.recordPublished(item, null, seenAt);
        }
        if (!this.data.lastDeliveredAt || Date.parse(seenAt) > Date.parse(this.data.lastDeliveredAt)) {
            this.data.lastDeliveredAt = seenAt;
        }
    }

    enqueue(item, classification) {
        if (this.hasSeen(item)) return false;
        this.data.outbox.push({
            id: item.id,
            item,
            classification,
            queuedAt: new Date().toISOString(),
            attempts: 0,
            nextAttemptAt: null,
            lastError: null,
        });
        return true;
    }

    readyOutbox(limit = 8) {
        const now = Date.now();
        return this.data.outbox
            .filter(entry => !entry.nextAttemptAt || Date.parse(entry.nextAttemptAt) <= now)
            .slice(0, limit);
    }

    markDelivered(outboxId, deliveredAt = new Date().toISOString()) {
        const index = this.data.outbox.findIndex(entry => entry.id === outboxId);
        if (index === -1) return;

        const [entry] = this.data.outbox.splice(index, 1);
        this.data.seen.push(recordFromItem(entry.item, deliveredAt));
        this.recordPublished(entry.item, entry.classification, deliveredAt);
        this.data.lastDeliveredAt = deliveredAt;
    }

    markFailed(outboxId, error) {
        const entry = this.data.outbox.find(candidate => candidate.id === outboxId);
        if (!entry) return;

        entry.attempts += 1;
        entry.lastError = String(error && error.message || error).slice(0, 300);
        const delayMs = Math.min(60 * 60 * 1000, 30 * 1000 * (2 ** Math.min(entry.attempts, 7)));
        entry.nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
    }
}

module.exports = {
    AnimeNewsState,
    extractAssetOrdinal,
    initialState,
    normalizedTitle,
    titleSimilarity,
    titleTokens,
};
