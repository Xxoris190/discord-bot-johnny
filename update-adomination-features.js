require('dotenv').config();
const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
    console.error('❌ DISCORD_TOKEN is not defined in the environment!');
    process.exit(1);
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const API_BASE = 'https://discord.com/api/v10';

async function apiCall(method, endpoint, body = null) {
    const options = {
        method,
        headers: {
            'Authorization': `Bot ${TOKEN}`,
            'Content-Type': 'application/json',
        },
    };
    if (body) options.body = JSON.stringify(body);

    let response = await fetch(`${API_BASE}${endpoint}`, options);

    if (response.status === 429) {
        const data = await response.json();
        const wait = (data.retry_after || 3) * 1000 + 500;
        console.log(`   ⏳ Rate limit reached, waiting ${Math.ceil(wait / 1000)}s...`);
        await sleep(wait);
        response = await fetch(`${API_BASE}${endpoint}`, options);
    }

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`${method} ${endpoint} → ${response.status}: ${err}`);
    }

    if (response.status === 204) return null;
    return response.json();
}

// Permissions bits
const VIEW_CHANNEL = BigInt(1 << 10);
const SEND_MESSAGES = BigInt(1 << 11);
const READ_HISTORY = BigInt(1 << 16);

async function main() {
    const guildId = '1507001707622563890'; // AdominationGuild ID
    console.log(`🚀 Adding new features to AdominationGuild (ID: ${guildId})...\n`);

    const everyoneRoleId = guildId;

    // ═══════════════════════════════════════
    // 1. FETCH ROLES & CHANNELS
    // ═══════════════════════════════════════
    const roles = await apiCall('GET', `/guilds/${guildId}/roles`);
    const channels = await apiCall('GET', `/guilds/${guildId}/channels`);

    const empressRole = roles.find(r => r.name.includes('Empress'));
    const commanderRole = roles.find(r => r.name.includes('Commander'));
    const adominatedRole = roles.find(r => r.name.includes('Adominated'));

    if (!empressRole || !commanderRole || !adominatedRole) {
        console.error('❌ Critical roles (Empress, Commander, Adominated) not found. Run setup-adomination.js first!');
        process.exit(1);
    }

    // ═══════════════════════════════════════
    // 2. CREATE LEVEL ROLES
    // ═══════════════════════════════════════
    console.log(`🎭 Checking level roles...`);
    const levelRolesData = [
        { name: '🎵 Vocaloid (Lvl 5)', color: 0x1ABC9C },
        { name: '🌟 Rising Star (Lvl 10)', color: 0xF1C40F },
        { name: '👑 Ado Fanatic (Lvl 20)', color: 0xE67E22 },
        { name: '🔥 UTD Legend (Lvl 30)', color: 0xE74C3C }
    ];

    const createdLevelRoles = {};

    for (const rData of levelRolesData) {
        let existing = roles.find(r => r.name === rData.name);
        if (existing) {
            console.log(`   ✅ Role already exists: ${rData.name}`);
            createdLevelRoles[rData.name] = existing;
        } else {
            const role = await apiCall('POST', `/guilds/${guildId}/roles`, {
                name: rData.name,
                color: rData.color,
                permissions: '0',
                hoist: true,
                mentionable: false
            });
            console.log(`   ✅ Created role: ${rData.name}`);
            createdLevelRoles[rData.name] = role;
            await sleep(500);
        }
    }

    // ═══════════════════════════════════════
    // 3. CREATE GIVEAWAYS CHANNEL
    // ═══════════════════════════════════════
    console.log(`\n📁 Checking #🎉-giveaways...`);
    const catInfo = channels.find(c => c.name.includes('INFORMATION') && c.type === 4);
    if (!catInfo) {
        console.log('   ⚠️ INFORMATION category not found.');
    } else {
        let existingGiveawayCh = channels.find(c => c.name.includes('giveaways') && c.type === 0);
        if (existingGiveawayCh) {
            console.log(`   ✅ Channel #🎉-giveaways already exists.`);
        } else {
            await apiCall('POST', `/guilds/${guildId}/channels`, {
                name: '🎉-giveaways',
                type: 0,
                parent_id: catInfo.id,
                topic: '🎉 Participate in UTD towers and items giveaways here!',
                permission_overwrites: [
                    { id: everyoneRoleId, type: 0, allow: String(VIEW_CHANNEL | READ_HISTORY), deny: String(SEND_MESSAGES) },
                    { id: adominatedRole.id, type: 0, allow: String(VIEW_CHANNEL | READ_HISTORY), deny: String(SEND_MESSAGES) }
                ]
            });
            console.log(`   ✅ Channel #🎉-giveaways created.`);
            await sleep(500);
        }
    }

    // ═══════════════════════════════════════
    // 4. CREATE LEVEL-UPS CHANNEL
    // ═══════════════════════════════════════
    console.log(`\n📁 Checking #💬-level-ups...`);
    const catLounge = channels.find(c => c.name.includes('LOUNGE') && c.type === 4);
    if (!catLounge) {
        console.log('   ⚠️ LOUNGE category not found.');
    } else {
        let existingLevelCh = channels.find(c => c.name.includes('level-ups') && c.type === 0);
        if (existingLevelCh) {
            console.log(`   ✅ Channel #💬-level-ups already exists.`);
        } else {
            await apiCall('POST', `/guilds/${guildId}/channels`, {
                name: '💬-level-ups',
                type: 0,
                parent_id: catLounge.id,
                topic: '🏆 Celebrates members leveling up in the server!',
                permission_overwrites: [
                    { id: everyoneRoleId, type: 0, deny: String(VIEW_CHANNEL), allow: '0' },
                    { id: adominatedRole.id, type: 0, allow: String(VIEW_CHANNEL | READ_HISTORY), deny: String(SEND_MESSAGES) }
                ]
            });
            console.log(`   ✅ Channel #💬-level-ups created.`);
            await sleep(500);
        }
    }

    // ═══════════════════════════════════════
    // 5. CREATE STAFF ONLY CATEGORY & CHANNELS
    // ═══════════════════════════════════════
    console.log(`\n🔒 Checking 🔒 STAFF ONLY Category...`);
    let catStaff = channels.find(c => c.name.includes('STAFF ONLY') && c.type === 4);
    if (catStaff) {
        console.log(`   ✅ Category STAFF ONLY already exists.`);
    } else {
        catStaff = await apiCall('POST', `/guilds/${guildId}/channels`, {
            name: '🔒 STAFF ONLY',
            type: 4,
            position: 6,
            permission_overwrites: [
                { id: everyoneRoleId, type: 0, deny: String(VIEW_CHANNEL), allow: '0' },
                { id: empressRole.id, type: 0, allow: String(VIEW_CHANNEL | SEND_MESSAGES | READ_HISTORY), deny: '0' },
                { id: commanderRole.id, type: 0, allow: String(VIEW_CHANNEL | SEND_MESSAGES | READ_HISTORY), deny: '0' }
            ]
        });
        console.log(`   ✅ Created category: 🔒 STAFF ONLY`);
        await sleep(500);
    }

    console.log(`\n📁 Checking staff channels...`);
    const staffTextChannels = [
        { name: '💬-staff-chat', topic: '💬 Private chat for Empress and Commanders.' },
        { name: '⚙️-staff-bot-logs', topic: '⚙️ Internal bot logs and moderation actions.' },
        { 
            name: '👑-admin-only', 
            topic: '👑 Private chat room for Empress only.',
            overwrites: [
                { id: everyoneRoleId, type: 0, deny: String(VIEW_CHANNEL), allow: '0' },
                { id: commanderRole.id, type: 0, deny: String(VIEW_CHANNEL), allow: '0' },
                { id: empressRole.id, type: 0, allow: String(VIEW_CHANNEL | SEND_MESSAGES | READ_HISTORY), deny: '0' }
            ]
        }
    ];

    for (const chData of staffTextChannels) {
        let existing = channels.find(c => c.name === chData.name && c.type === 0);
        if (existing) {
            console.log(`   ✅ Channel #${chData.name} already exists.`);
        } else {
            const body = {
                name: chData.name,
                type: 0,
                parent_id: catStaff.id,
                topic: chData.topic
            };
            if (chData.overwrites) {
                body.permission_overwrites = chData.overwrites;
            }
            await apiCall('POST', `/guilds/${guildId}/channels`, body);
            console.log(`   ✅ Created channel: #${chData.name}`);
            await sleep(500);
        }
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎉 SERVER FEATURES ADDED SUCCESSFULLY!`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

main().catch(err => {
    console.error(`❌ ERROR:`, err.message);
    process.exit(1);
});
