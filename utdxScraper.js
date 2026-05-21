const cheerio = require('cheerio');

// Custom fetch with user-agent headers
async function fetchHtml(url) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9'
        }
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: Status ${response.status}`);
    }
    return await response.text();
}

function scrapeCodes(html) {
    const $ = cheerio.load(html);
    const codes = [];
    
    let heading = null;
    $('h2, h3, h4').each((i, el) => {
        const text = $(el).text().toLowerCase();
        if (text.includes('all new universal tower') || 
            text.includes('active universal tower') || 
            (text.includes('universal tower defense') && text.includes('codes') && !text.includes('expired'))) {
            heading = $(el);
            return false; // break
        }
    });
    
    if (!heading) {
        heading = $('#h-all-new-universal-tower-defense-x-codes');
    }
    
    if (heading && heading.length) {
        let nextList = heading.next();
        while (nextList.length && nextList.prop('tagName').toLowerCase() !== 'ul') {
            nextList = nextList.next();
        }
        
        if (nextList.length) {
            nextList.find('li').each((i, li) => {
                const strong = $(li).find('strong').first();
                if (strong.length) {
                    const code = strong.text().trim().replace(/:$/, '');
                    let reward = $(li).text().replace(strong.text(), '').trim();
                    if (reward.startsWith(':')) {
                        reward = reward.substring(1).trim();
                    }
                    if (code) {
                        codes.push({ code, reward });
                    }
                } else {
                    const text = $(li).text().trim();
                    const parts = text.split(':');
                    if (parts.length >= 2) {
                        const code = parts[0].trim();
                        const reward = parts.slice(1).join(':').trim();
                        codes.push({ code, reward });
                    }
                }
            });
        }
    }
    
    return codes;
}

function scrapeTierList(html) {
    const $ = cheerio.load(html);
    const result = {};
    
    const sections = [
        { name: 'Synchro Units - Massive DPS', keywords: ['synchro', 'drive', 'massive dps'] },
        { name: 'S-Tier Air/Hybrid', keywords: ['s-tier air', 's tier air'] },
        { name: 'A-Tier Air/Hybrid', keywords: ['a-tier air', 'a tier air'] },
        { name: 'B-Tier Air/Hybrid', keywords: ['b-tier air', 'b tier air'] },
        { name: 'C-Tier Air/Hybrid', keywords: ['c-tier air', 'c tier air'] },
        { name: 'D-Tier Air/Hybrid', keywords: ['d-tier air', 'd tier air'] },
        { name: 'S-Tier Ground', keywords: ['s-tier ground', 's tier ground'] },
        { name: 'A-Tier Ground', keywords: ['a-tier ground', 'a tier ground'] },
        { name: 'B-Tier Ground', keywords: ['b-tier ground', 'b tier ground'] },
        { name: 'C-Tier Ground', keywords: ['c-tier ground', 'c tier ground'] },
        { name: 'D-Tier Ground', keywords: ['d-tier ground', 'd tier ground'] },
        { name: 'S-Tier Debuff Support', keywords: ['debuff support'] },
        { name: 'S-Tier Buff Support', keywords: ['buff support'] },
        { name: 'A-Tier Support', keywords: ['a-tier support', 'a tier support'] },
        { name: 'B-Tier Support', keywords: ['b-tier support', 'b tier support'] },
        { name: 'Farm Units', keywords: ['farm'] }
    ];
    
    sections.forEach(sec => {
        let heading = null;
        
        $('h3, h2, h4').each((i, el) => {
            const text = $(el).text().toLowerCase();
            const matches = sec.keywords.some(kw => text.includes(kw));
            if (matches) {
                heading = $(el);
                return false; 
            }
        });
        
        if (!heading) return;
        
        let nextElem = heading.next();
        let table = null;
        let limit = 5; 
        while (nextElem.length && limit > 0) {
            if (nextElem.prop('tagName').toLowerCase() === 'table') {
                table = nextElem;
                break;
            }
            const foundTable = nextElem.find('table');
            if (foundTable.length) {
                table = foundTable.first();
                break;
            }
            nextElem = nextElem.next();
            limit--;
        }
        
        if (!table || !table.length) return;
        
        const units = [];
        table.find('tbody tr').each((i, tr) => {
            const tds = $(tr).find('td');
            if (tds.length < 2) return;
            
            const td1 = $(tds[0]);
            const td2 = $(tds[1]);
            
            const nameStrong = td1.find('strong').first();
            let name = nameStrong.text().trim();
            if (!name) {
                name = td1.text().trim().split('\n')[0].trim();
            }
            
            const rarityEm = td1.find('em').first();
            const rarity = rarityEm.length ? rarityEm.text().trim() : '';
            
            let explanation = td2.html() || '';
            explanation = explanation
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<[^>]+>/g, '') 
                .replace(/&nbsp;/g, ' ')
                .replace(/\n\s*\n/g, '\n') 
                .trim();
                
            if (name) {
                units.push({
                    name,
                    rarity,
                    explanation
                });
            }
        });
        
        if (units.length) {
            result[sec.name] = units;
        }
    });
    
    return result;
}

async function scrapeAll() {
    console.log('🌐 Fetching active codes from Beebom...');
    const codesHtml = await fetchHtml('https://beebom.com/universal-tower-defense-codes/');
    const codes = scrapeCodes(codesHtml);
    console.log(`✅ Scraped ${codes.length} active codes.`);

    console.log('🌐 Fetching tier list from Destructoid...');
    const tierHtml = await fetchHtml('https://www.destructoid.com/universal-tower-defense-tier-list/');
    const tiers = scrapeTierList(tierHtml);
    console.log(`✅ Scraped ${Object.keys(tiers).length} tier sections.`);

    return { codes, tiers };
}

module.exports = {
    fetchHtml,
    scrapeCodes,
    scrapeTierList,
    scrapeAll
};
