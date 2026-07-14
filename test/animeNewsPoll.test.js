const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pollAnimeNews } = require('../animeNews/service');
const { AnimeNewsState } = require('../animeNews/state');

const filter = {
    threshold: 5,
    enabledCategories: [
        'trailer', 'teaser', 'new_season', 'movie', 'new_anime', 'release_date', 'key_visual',
    ],
};

function rss(items) {
    return `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
            <channel>
                <title>Fixture</title>
                ${items.map(item => `
                    <item>
                        <guid>${item.guid}</guid>
                        <title><![CDATA[${item.title}]]></title>
                        <link>https://example.com/${item.guid}</link>
                        <description><![CDATA[Official announcement.]]></description>
                        <pubDate>${item.date.toUTCString()}</pubDate>
                    </item>
                `).join('')}
            </channel>
        </rss>`;
}

test('amorce sans spam, publie une nouveauté puis la déduplique', async () => {
    const originalFetch = global.fetch;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'johnny-anime-poll-'));
    const state = AnimeNewsState.load(path.join(directory, 'state.json'));
    const source = {
        id: 'fixture',
        name: 'Fixture officielle',
        url: 'https://feed.example/rss',
        trust: 'official',
        enabled: true,
        maxItems: 20,
    };
    const config = { sources: [source], filter };
    const settings = { maxItemAgeHours: 36 };
    const sent = [];
    const channel = {
        send: async payload => {
            sent.push(payload);
            return { id: String(sent.length) };
        },
    };
    const firstItem = {
        guid: 'old-trailer',
        title: 'Anime X Season 2 Official Trailer',
        date: new Date(Date.now() - 30 * 60 * 1000),
    };
    let feedItems = [firstItem];

    global.fetch = async () => new Response(rss(feedItems), {
        status: 200,
        headers: { 'content-type': 'application/rss+xml' },
    });

    try {
        const bootstrap = await pollAnimeNews({ channel, config, settings, state });
        assert.equal(bootstrap.seeded, 1);
        assert.equal(bootstrap.delivered, 0);
        assert.equal(sent.length, 0);

        feedItems = [
            {
                guid: 'new-movie',
                title: 'Anime Y Anime Movie Announced',
                date: new Date(),
            },
            firstItem,
        ];
        const second = await pollAnimeNews({ channel, config, settings, state });
        assert.equal(second.delivered, 1);
        assert.equal(sent.length, 1);
        assert.deepEqual(sent[0].allowedMentions, { parse: [] });

        const third = await pollAnimeNews({ channel, config, settings, state });
        assert.equal(third.delivered, 0);
        assert.equal(sent.length, 1);
    } finally {
        global.fetch = originalFetch;
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('ne perd pas une news arrivée après un premier fetch en échec', async () => {
    const originalFetch = global.fetch;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'johnny-anime-first-failure-'));
    const state = AnimeNewsState.load(path.join(directory, 'state.json'));
    state.data.bootstrapStartedAt = new Date(Date.now() - 60 * 1000).toISOString();
    const source = {
        id: 'unstable',
        name: 'Source instable',
        url: 'https://unstable.example/rss',
        trust: 'official',
    };
    const config = { sources: [source], filter };
    const settings = { maxItemAgeHours: 36 };
    const sent = [];
    const channel = { send: async payload => sent.push(payload) };
    let shouldFail = true;
    global.fetch = async () => {
        if (shouldFail) throw new Error('temporary outage');
        return new Response(rss([{
            guid: 'arrived-during-outage',
            title: 'Anime Z Official Teaser',
            date: new Date(),
        }]), { status: 200 });
    };

    try {
        const failed = await pollAnimeNews({ channel, config, settings, state });
        assert.equal(failed.failedSources, 1);
        assert.equal(state.isSourceInitialized(source.id), false);

        shouldFail = false;
        const recovered = await pollAnimeNews({ channel, config, settings, state });
        assert.equal(recovered.delivered, 1);
        assert.equal(recovered.seeded, 0);
        assert.equal(sent.length, 1);
    } finally {
        global.fetch = originalFetch;
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('après perte d’état, envoie une entrée récente inconnue même si elle est antidatée', async () => {
    const originalFetch = global.fetch;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'johnny-anime-lookback-'));
    const state = AnimeNewsState.load(path.join(directory, 'state.json'));
    const existing = {
        id: 'already-on-discord',
        url: 'https://example.com/already-on-discord',
        title: 'Anime A Season 2 Official Trailer',
        publishedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        dedupeKind: 'trailer',
    };
    state.recover(existing, new Date().toISOString());

    const source = {
        id: 'recovered-source',
        name: 'Recovered Source',
        url: 'https://recovered.example/rss',
        trust: 'official',
    };
    const config = { sources: [source], filter };
    const settings = { maxItemAgeHours: 36 };
    const sent = [];
    const channel = { send: async payload => sent.push(payload) };
    global.fetch = async () => new Response(rss([
        {
            guid: 'missed-but-recent',
            title: 'Anime B Anime Movie Announced',
            date: new Date(Date.now() - 60 * 60 * 1000),
        },
        {
            guid: 'already-on-discord',
            title: existing.title,
            date: new Date(existing.publishedAt),
        },
    ]), { status: 200 });

    try {
        const result = await pollAnimeNews({ channel, config, settings, state });
        assert.equal(result.delivered, 1);
        assert.equal(sent.length, 1);
    } finally {
        global.fetch = originalFetch;
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('refetch sans ETag lorsqu’une source non initialisée répond 304', async () => {
    const originalFetch = global.fetch;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'johnny-anime-304-'));
    const state = AnimeNewsState.load(path.join(directory, 'state.json'));
    state.setSourceHeaders('partial-source', { etag: '"old"' });
    const source = {
        id: 'partial-source',
        name: 'Partial Source',
        url: 'https://partial.example/rss',
        trust: 'official',
    };
    const config = { sources: [source], filter };
    const settings = { maxItemAgeHours: 36 };
    const requestHeaders = [];
    let calls = 0;
    global.fetch = async (_url, options) => {
        requestHeaders.push(options.headers);
        calls++;
        if (calls === 1) return new Response(null, { status: 304, headers: { etag: '"old"' } });
        return new Response(rss([{
            guid: 'old-seed',
            title: 'Anime C Season 2 Official Trailer',
            date: new Date(Date.now() - 60 * 60 * 1000),
        }]), { status: 200 });
    };

    try {
        const result = await pollAnimeNews({
            channel: { send: async () => assert.fail('aucun backlog ne doit être envoyé') },
            config,
            settings,
            state,
        });
        assert.equal(calls, 2);
        assert.equal(requestHeaders[0]['If-None-Match'], '"old"');
        assert.equal(requestHeaders[1]['If-None-Match'], undefined);
        assert.equal(state.isSourceInitialized(source.id), true);
        assert.equal(result.seeded, 1);
    } finally {
        global.fetch = originalFetch;
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
