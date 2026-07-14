const { loadAnimeNewsConfig } = require('./animeNews/service');
const { fetchAnimeSource } = require('./animeNews/feeds');
const { classifyAnimeAnnouncement } = require('./animeNews/filter');

async function main() {
    const config = loadAnimeNewsConfig();
    const verbose = process.argv.includes('--verbose');
    console.log(`🔎 Vérification de ${config.sources.length} sources Anime News...\n`);

    const results = await Promise.allSettled(config.sources.map(source => fetchAnimeSource(source)));
    let successful = 0;
    let failed = 0;
    let retained = 0;

    for (let index = 0; index < results.length; index++) {
        const source = config.sources[index];
        const result = results[index];
        if (result.status === 'rejected') {
            failed++;
            console.log(`❌ ${source.name}: ${result.reason.message}`);
            continue;
        }

        successful++;
        const matches = result.value.items
            .map(item => ({ item, classification: classifyAnimeAnnouncement(item, config.filter) }))
            .filter(candidate => candidate.classification.accepted);
        retained += matches.length;
        console.log(`✅ ${source.name}: ${result.value.items.length} lues, ${matches.length} retenues`);
        for (const match of matches.slice(0, verbose ? matches.length : 2)) {
            console.log(`   ${match.classification.primary.emoji} ${match.item.title}`);
        }
    }

    console.log(`\n📊 Résultat: ${successful} source(s) OK, ${failed} en erreur, ${retained} annonce(s) filtrée(s).`);
    if (successful === 0) process.exitCode = 1;
}

main().catch(error => {
    console.error(`❌ Vérification impossible: ${error.stack || error.message}`);
    process.exitCode = 1;
});
