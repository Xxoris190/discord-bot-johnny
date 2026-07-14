const test = require('node:test');
const assert = require('node:assert/strict');
const {
    canonicalizeUrl,
    fetchAnimeSource,
    parseFeedXml,
    readResponseTextLimited,
    stripHtml,
} = require('../animeNews/feeds');

test('nettoie les paramètres de suivi sans casser le lien', () => {
    assert.equal(
        canonicalizeUrl('https://example.com/news/story/?utm_source=rss&b=2&a=1#top'),
        'https://example.com/news/story?a=1&b=2'
    );
});

test('nettoie le HTML et les entités de base', () => {
    assert.equal(stripHtml('<p>Trailer &amp; teaser&nbsp;!</p>'), 'Trailer & teaser !');
});

test('normalise un item RSS et extrait son image', async () => {
    const source = { id: 'fixture', name: 'Fixture', trust: 'official', maxItems: 10 };
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
            <channel>
                <title>Fixture</title>
                <item>
                    <guid>story-1</guid>
                    <title><![CDATA[Anime X Season 2 Trailer]]></title>
                    <link>https://example.com/story/?utm_medium=rss</link>
                    <description><![CDATA[<p>Le nouveau trailer.</p><img src="https://example.com/image.jpg" />]]></description>
                    <pubDate>Tue, 14 Jul 2026 10:00:00 GMT</pubDate>
                </item>
            </channel>
        </rss>`;

    const [item] = await parseFeedXml(source, xml);
    assert.equal(item.title, 'Anime X Season 2 Trailer');
    assert.equal(item.url, 'https://example.com/story');
    assert.equal(item.summary, 'Le nouveau trailer.');
    assert.equal(item.image, 'https://example.com/image.jpg');
    assert.equal(item.publishedAt, '2026-07-14T10:00:00.000Z');
});

test('normalise un flux Atom YouTube et sa miniature', async () => {
    const source = { id: 'youtube-fixture', name: 'YouTube Fixture', trust: 'official' };
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
            <title>YouTube Fixture</title>
            <entry>
                <id>yt:video:abc123</id>
                <yt:videoId>abc123</yt:videoId>
                <title>作品 ティザーPV</title>
                <link rel="alternate" href="https://www.youtube.com/watch?v=abc123"/>
                <published>2026-07-14T09:00:00+00:00</published>
                <media:group>
                    <media:thumbnail url="https://i.ytimg.com/vi/abc123/hqdefault.jpg" width="480" height="360"/>
                    <media:description>Official teaser</media:description>
                </media:group>
            </entry>
        </feed>`;

    const [item] = await parseFeedXml(source, xml);
    assert.equal(item.url, 'https://www.youtube.com/watch?v=abc123');
    assert.equal(item.image, 'https://i.ytimg.com/vi/abc123/hqdefault.jpg');
    assert.equal(item.mediaUrl, 'https://www.youtube.com/watch?v=abc123');
});

test('retrouve la même vidéo YouTube dans un article officiel multilingue', async () => {
    const source = { id: 'article-fixture', name: 'Article Fixture', trust: 'official' };
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
            <channel>
                <title>Fixture</title>
                <item>
                    <guid>article-1</guid>
                    <title><![CDATA[TVアニメ「てつりょー！」第2弾PVを公開]]></title>
                    <link>https://official.example/article-1</link>
                    <description><![CDATA[<a href="https://youtu.be/GixEiC7k9_4?si=tracking">第2弾PV</a>]]></description>
                    <pubDate>Mon, 13 Jul 2026 13:00:00 GMT</pubDate>
                </item>
            </channel>
        </rss>`;

    const [item] = await parseFeedXml(source, xml);
    assert.equal(item.mediaUrl, 'https://www.youtube.com/watch?v=GixEiC7k9_4');
});

test('efface un ancien ETag lorsqu’un nouveau 200 ne le renvoie plus', async () => {
    const originalFetch = global.fetch;
    const source = { id: 'etag', name: 'ETag Fixture', url: 'https://example.com/rss' };
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title></channel></rss>`;
    let requestHeaders;
    global.fetch = async (_url, options) => {
        requestHeaders = options.headers;
        return new Response(xml, { status: 200 });
    };

    try {
        const result = await fetchAnimeSource(source, { etag: '"stale"', lastModified: 'yesterday' });
        assert.equal(requestHeaders['If-None-Match'], '"stale"');
        assert.equal(result.headers.etag, null);
        assert.equal(result.headers.lastModified, null);
    } finally {
        global.fetch = originalFetch;
    }
});

test('interrompt la lecture d’un flux trop volumineux', async () => {
    const response = new Response('x'.repeat(2048), { status: 200 });
    await assert.rejects(readResponseTextLimited(response, 1024), /flux trop volumineux/);
});
