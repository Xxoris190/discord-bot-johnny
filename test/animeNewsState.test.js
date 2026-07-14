const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AnimeNewsState, extractAssetOrdinal, titleSimilarity } = require('../animeNews/state');

function item(overrides = {}) {
    return {
        id: 'item-1',
        url: 'https://official.example/anime-x-trailer',
        title: 'Jujutsu Kaisen Season 3 Official Trailer',
        summary: '',
        image: null,
        publishedAt: new Date().toISOString(),
        source: { id: 'official', name: 'Official', trust: 'official' },
        dedupeKind: 'trailer',
        ...overrides,
    };
}

test('reconnaît deux formulations proches de la même annonce', () => {
    assert.ok(titleSimilarity(
        'Jujutsu Kaisen Season 3 Official Trailer',
        'Official Trailer for Jujutsu Kaisen Season 3'
    ) >= 0.82);
});

test('persiste la déduplication, les sources et la file de sortie', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'johnny-anime-news-'));
    const statePath = path.join(directory, 'state.json');
    const state = AnimeNewsState.load(statePath);

    state.markSourceInitialized('official');
    state.remember(item());
    assert.equal(state.hasSeen(item({ id: 'item-2', url: 'https://other.example/story' })), true);

    const distinct = item({
        id: 'item-3',
        url: 'https://official.example/different-movie',
        title: 'Chainsaw Man Anime Movie Announced',
    });
    assert.equal(state.enqueue(distinct, {
        primary: { key: 'movie', label: 'Film anime', emoji: '🍿', color: 0x3498DB },
    }), true);
    state.save();

    const reloaded = AnimeNewsState.load(statePath);
    assert.equal(reloaded.isSourceInitialized('official'), true);
    assert.equal(reloaded.readyOutbox().length, 1);
    reloaded.markDelivered('item-3');
    assert.equal(reloaded.readyOutbox().length, 0);
    assert.equal(reloaded.hasSeen(distinct), true);

    fs.rmSync(directory, { recursive: true, force: true });
});

test('déduplique les mêmes adaptations mais garde une annonce de type différent', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'johnny-anime-kinds-'));
    const state = AnimeNewsState.load(path.join(directory, 'state.json'));
    state.remember(item({
        id: 'adaptation-fr',
        url: 'https://example.com/fr',
        title: 'Noa-senpai wa Tomodachi sera adapté en anime',
        dedupeKind: 'new_anime',
    }));

    assert.equal(state.hasSeen(item({
        id: 'adaptation-en',
        url: 'https://example.com/en',
        title: 'Manga Noa-senpai wa Tomodachi Receives TV Anime Adaptation',
        dedupeKind: 'new_anime',
    })), true);
    assert.equal(state.hasSeen(item({
        id: 'trailer-later',
        url: 'https://example.com/trailer',
        title: 'Noa-senpai wa Tomodachi Official Trailer',
        dedupeKind: 'trailer',
    })), false);

    fs.rmSync(directory, { recursive: true, force: true });
});

test('réconcilie une outbox déjà visible dans Discord après un crash', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'johnny-anime-recover-'));
    const state = AnimeNewsState.load(path.join(directory, 'state.json'));
    const pending = item({ id: 'pending-after-send' });
    state.enqueue(pending, {
        primary: { key: 'trailer', label: 'Trailer / PV', emoji: '🎬', color: 0xE74C3C },
    });
    assert.equal(state.data.outbox.length, 1);

    state.recover(pending, new Date().toISOString());
    assert.equal(state.data.outbox.length, 0);
    assert.equal(state.hasSeen(pending), true);

    fs.rmSync(directory, { recursive: true, force: true });
});

test('ne confond pas un Trailer 2 avec le trailer précédent', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'johnny-anime-ordinal-'));
    const state = AnimeNewsState.load(path.join(directory, 'state.json'));
    state.remember(item({ title: 'Jujutsu Kaisen Season 3 Official Trailer' }));

    assert.equal(state.hasSeen(item({
        id: 'trailer-2',
        url: 'https://official.example/jjk-trailer-2',
        title: 'Jujutsu Kaisen Season 3 Trailer 2',
    })), false);
    assert.equal(extractAssetOrdinal('第2弾PVを公開'), 2);

    fs.rmSync(directory, { recursive: true, force: true });
});

test('déduplique une annonce japonaise et anglaise qui partagent la même vidéo', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'johnny-anime-media-dedupe-'));
    const state = AnimeNewsState.load(path.join(directory, 'state.json'));
    const classification = {
        primary: { key: 'trailer', label: 'Trailer / PV', emoji: '🎬', color: 0xE74C3C },
    };
    const mediaUrl = 'https://www.youtube.com/watch?v=GixEiC7k9_4';

    assert.equal(state.enqueue(item({
        id: 'pony-japanese',
        url: 'https://news.ponycanyon.example/article',
        mediaUrl,
        title: 'TVアニメ「てつりょー！meet with 鉄道むすめ」第2弾PVを公開',
    }), classification), true);
    assert.equal(state.enqueue(item({
        id: 'livechart-english',
        url: mediaUrl,
        mediaUrl,
        title: 'TETSURYO! meet with Tetsudou Musume reveals new PV',
    }), classification), false);

    fs.rmSync(directory, { recursive: true, force: true });
});

test('ne fusionne pas deux annonces distinctes qui réutilisent une vidéo', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'johnny-anime-reused-media-'));
    const state = AnimeNewsState.load(path.join(directory, 'state.json'));
    const mediaUrl = 'https://www.youtube.com/watch?v=sameVideo1';
    state.remember(item({
        id: 'old-teaser',
        url: 'https://example.com/teaser',
        mediaUrl,
        title: 'Anime X Official Teaser',
        dedupeKind: 'teaser',
        publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    }));

    assert.equal(state.hasSeen(item({
        id: 'release-date',
        url: 'https://example.com/release-date',
        mediaUrl,
        title: 'Anime X Premiere Date Announced',
        dedupeKind: 'release_date',
    })), false);
    const numberedMediaUrl = 'https://www.youtube.com/watch?v=numbered01';
    state.remember(item({
        id: 'trailer-1',
        url: 'https://example.com/trailer-1',
        mediaUrl: numberedMediaUrl,
        title: 'Anime Y Official Trailer 1',
        dedupeKind: 'trailer',
    }));
    assert.equal(state.hasSeen(item({
        id: 'trailer-2',
        url: 'https://example.com/trailer-2',
        mediaUrl: numberedMediaUrl,
        title: 'Anime Y Official Trailer 2',
        dedupeKind: 'trailer',
    })), false);

    fs.rmSync(directory, { recursive: true, force: true });
});

test('ne tronque jamais silencieusement une grande outbox', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'johnny-anime-outbox-'));
    const statePath = path.join(directory, 'state.json');
    const state = AnimeNewsState.load(statePath);
    const classification = {
        primary: { key: 'movie', label: 'Film anime', emoji: '🍿', color: 0x3498DB },
    };
    for (let index = 0; index < 120; index++) {
        state.enqueue(item({
            id: `movie-${index}`,
            url: `https://example.com/movie-${index}`,
            title: `Franchise${index} Anime Movie Announced`,
            dedupeKind: 'movie',
        }), classification);
    }
    state.save();

    assert.equal(AnimeNewsState.load(statePath).data.outbox.length, 120);
    fs.rmSync(directory, { recursive: true, force: true });
});
