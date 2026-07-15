const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { classifyAnimeAnnouncement } = require('../animeNews/filter');
const { cleanSummary, buildAnimeComponents } = require('../animeNews/service');
const { AnimeNewsState } = require('../animeNews/state');

function officialItem(title, overrides = {}) {
    return {
        title,
        summary: '',
        source: { id: 'official', name: 'Official', trust: 'official' },
        ...overrides,
    };
}

test('classe une saison finale dans la nouvelle catégorie final_season', () => {
    const result = classifyAnimeAnnouncement(officialItem('Attack on Titan Final Season Announced'));

    assert.equal(result.accepted, true);
    assert.equal(result.primary.key, 'final_season');
});

test('classe un report de diffusion dans schedule_change', () => {
    const result = classifyAnimeAnnouncement(officialItem('Uzumaki Anime Delayed to 2027'));

    assert.equal(result.accepted, true);
    assert.equal(result.primary.key, 'schedule_change');
});

test('reconnaît « 2nd Season » comme une nouvelle saison', () => {
    const result = classifyAnimeAnnouncement(officialItem('Frieren 2nd Season Announcement'));

    assert.equal(result.accepted, true);
    assert.equal(result.primary.key, 'new_season');
});

test('accepte une annonce OVA', () => {
    const result = classifyAnimeAnnouncement(officialItem('Haikyu!! New OVA Announced for 2026'));

    assert.equal(result.accepted, true);
    assert.equal(result.primary.key, 'ova_special');
});

test('refuse toujours le report d’un épisode précis', () => {
    const result = classifyAnimeAnnouncement(officialItem('One Piece Episode 1140 Delayed'));

    assert.equal(result.accepted, false);
});

test('nettoie les descriptions YouTube (liens, hashtags, séparateurs)', () => {
    const raw = 'TVアニメ第2期PV解禁！ https://example.com/watch #anime #PV ▼▼▼ 公式サイト https://example.jp';
    const cleaned = cleanSummary(raw, true);

    assert.ok(!cleaned.includes('http'));
    assert.ok(!cleaned.includes('#anime'));
    assert.ok(cleaned.includes('TVアニメ第2期PV解禁！'));
    assert.ok(cleaned.length <= 300);
});

test('ajoute un bouton vidéo quand l’annonce référence un trailer YouTube', () => {
    const rows = buildAnimeComponents({
        url: 'https://www.livechart.me/headlines/12345',
        mediaUrl: 'https://youtu.be/GixEiC7k9_4',
    });

    assert.equal(rows.length, 1);
    const buttons = rows[0].components.map(button => button.toJSON());
    assert.equal(buttons.length, 2);
    assert.equal(buttons[0].url, 'https://www.youtube.com/watch?v=GixEiC7k9_4');
    assert.equal(buttons[1].url, 'https://www.livechart.me/headlines/12345');
});

test('journalise les annonces publiées et permet latest + search', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'johnny-anime-published-'));
    const statePath = path.join(directory, 'state.json');
    const state = AnimeNewsState.load(statePath);
    const classification = {
        primary: { key: 'trailer', label: 'Trailer / PV', emoji: '🎬', color: 0xE74C3C },
    };

    state.enqueue({
        id: 'item-a',
        url: 'https://example.com/frieren-trailer',
        title: 'Frieren Season 2 Official Trailer',
        publishedAt: new Date().toISOString(),
        source: { id: 'official', name: 'Official', trust: 'official' },
        dedupeKind: 'trailer',
    }, classification);
    state.markDelivered('item-a');
    state.save();

    const reloaded = AnimeNewsState.load(statePath);
    const latest = reloaded.recentPublished(5);
    assert.equal(latest.length, 1);
    assert.equal(latest[0].title, 'Frieren Season 2 Official Trailer');
    assert.equal(latest[0].category, 'trailer');
    assert.equal(latest[0].categoryLabel, '🎬 Trailer / PV');

    const found = reloaded.searchPublished('frieren');
    assert.equal(found.length, 1);
    assert.equal(reloaded.searchPublished('naruto').length, 0);

    fs.rmSync(directory, { recursive: true, force: true });
});

test('borne le journal des annonces publiées', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'johnny-anime-published-cap-'));
    const state = AnimeNewsState.load(path.join(directory, 'state.json'));

    const baseTime = Date.now() - 350 * 1000;
    for (let index = 0; index < 350; index++) {
        const deliveredAt = new Date(baseTime + index * 1000).toISOString();
        state.recordPublished({
            id: `item-${index}`,
            url: `https://example.com/news-${index}`,
            title: `Annonce numéro ${index}`,
            publishedAt: deliveredAt,
            source: { id: 'official', name: 'Official' },
        }, null, deliveredAt);
    }

    assert.ok(state.data.published.length <= 300);
    const newest = state.recentPublished(1)[0];
    assert.equal(newest.title, 'Annonce numéro 349');

    fs.rmSync(directory, { recursive: true, force: true });
});

test('mémorise le rôle ping dans l’état persistant', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'johnny-anime-ping-role-'));
    const statePath = path.join(directory, 'state.json');
    const state = AnimeNewsState.load(statePath);

    assert.equal(state.getPingRoleId(), null);
    state.setPingRoleId('123456789012345678');
    state.save();

    const reloaded = AnimeNewsState.load(statePath);
    assert.equal(reloaded.getPingRoleId(), '123456789012345678');

    fs.rmSync(directory, { recursive: true, force: true });
});
