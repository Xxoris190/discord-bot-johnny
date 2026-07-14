const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyAnimeAnnouncement } = require('../animeNews/filter');

const filter = {
    threshold: 5,
    enabledCategories: [
        'trailer',
        'teaser',
        'new_season',
        'movie',
        'new_anime',
        'release_date',
        'key_visual',
    ],
};

function classify(title, summary = '', trust = 'editorial') {
    return classifyAnimeAnnouncement({
        title,
        summary,
        source: { trust },
    }, filter);
}

test('accepte un trailer de nouvelle saison en anglais', () => {
    const result = classify('Jujutsu Kaisen Season 3 Reveals Official Trailer');
    assert.equal(result.accepted, true);
    assert.ok(result.categories.includes('trailer'));
    assert.ok(result.categories.includes('new_season'));
});

test('accepte une adaptation anime en français', () => {
    const result = classify('Noa-senpai wa Tomodachi. sera adapté en anime');
    assert.equal(result.accepted, true);
    assert.ok(result.categories.includes('new_anime'));
});

test('accepte une suite et un teaser japonais officiels', () => {
    const result = classify('TVアニメ「作品」第2期制作決定！ティザーPV公開', '', 'official');
    assert.equal(result.accepted, true);
    assert.ok(result.categories.includes('teaser'));
    assert.ok(result.categories.includes('new_season'));
});

test('accepte un film et une date de diffusion', () => {
    assert.equal(classify('劇場版「作品」2027年公開日決定').accepted, true);
    assert.equal(classify('New anime premiere date revealed').accepted, true);
});

test('ne rejette pas une annonce parce que le résumé cite un épisode ou un Blu-ray', () => {
    const result = classify(
        'Anime X Season 2 Official Trailer',
        'Episode 1 arrives in October. The Blu-ray will follow later.'
    );
    assert.equal(result.accepted, true);
});

test('utilise quand même le résumé pour reconnaître un jeu vidéo', () => {
    const result = classify(
        'Solo Leveling KARMA Official Trailer',
        'A new RPG launching on Nintendo Switch and PC.'
    );
    assert.equal(result.accepted, false);
});

test('garde un vrai PV qui révèle un ending mais rejette une sortie musicale seule', () => {
    assert.equal(classify(
        'Anime X 2nd Promo Video Reveals Ending Theme Song'
    ).accepted, true);
    assert.equal(classify(
        'Anime X Season 2 Ending Theme Song MV 配信開始'
    ).accepted, false);
});

test('rejette critiques, merchandising, jeux et previews d’épisodes', () => {
    const rejected = [
        'Season 2 Trailer Review and Breakdown',
        'New Anime Figure Revealed With Teaser Visual',
        'Official Trailer for the New Nintendo Switch Game',
        'Episode 7 Preview Trailer Released',
        '第2期 第2話より名場面 #shorts',
        'DVD「The Anime Show LIVE」PV',
        'Radio Show for the Anime Movie 2027',
        'Game Project Infinity for 2027 Release on Switch 2',
        'Solo Leveling: KARMA - Trailer for the new RPG',
        'Anime X Season 2 Listed With 12 Episodes',
        'Character Introduction PV for Anime X',
        'Anime X Season 3 is Now Airing',
        'Anime Characters Ranked From Best to Worst',
    ];
    for (const title of rejected) {
        assert.equal(classify(title).accepted, false, title);
    }
});

test('rejette une actualité manga ordinaire', () => {
    assert.equal(classify('Blue Summer Haze Manga Ends in 5th Volume').accepted, false);
});
