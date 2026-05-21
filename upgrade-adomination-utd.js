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
    console.log(`🚀 Starting UTDX server layout optimization for AdominationGuild (ID: ${guildId})...\n`);

    const everyoneRoleId = guildId;

    // ═══════════════════════════════════════
    // 1. ROLES MANAGEMENT
    // ═══════════════════════════════════════
    console.log(`🎭 Fetching roles...`);
    const roles = await apiCall('GET', `/guilds/${guildId}/roles`);
    const adominatedRole = roles.find(r => r.name.includes('Adominated'));
    
    if (!adominatedRole) {
        console.error('❌ Adominated role not found!');
        process.exit(1);
    }
    const adominatedRoleId = adominatedRole.id;

    const newRolesData = [
        { name: '🔔 Story & Legend', color: 0x1ABC9C },
        { name: '🔔 Raids', color: 0x3498DB },
        { name: '🔔 Virtual Realm', color: 0x9B59B6 }
    ];

    const rolesMap = {};
    for (const rData of newRolesData) {
        let existing = roles.find(r => r.name === rData.name);
        if (existing) {
            console.log(`   ✅ Role already exists: ${rData.name}`);
            rolesMap[rData.name] = existing;
        } else {
            const role = await apiCall('POST', `/guilds/${guildId}/roles`, {
                name: rData.name,
                color: rData.color,
                permissions: '0',
                hoist: false,
                mentionable: true
            });
            console.log(`   ✅ Created role: ${rData.name}`);
            rolesMap[rData.name] = role;
            await sleep(500);
        }
    }

    // ═══════════════════════════════════════
    // 2. CHANNELS MANAGEMENT
    // ═══════════════════════════════════════
    console.log(`\n📁 Fetching channels...`);
    const channels = await apiCall('GET', `/guilds/${guildId}/channels`);

    // Find ⚔️ UTD ROBLOX category
    const catUtd = channels.find(c => c.name.includes('UTD ROBLOX') && c.type === 4);
    if (!catUtd) {
        console.error('❌ ⚔️ UTD ROBLOX category not found!');
        process.exit(1);
    }
    console.log(`   ✅ Category UTD ROBLOX found (ID: ${catUtd.id})`);

    // Helper functions
    async function createText(name, parentId, topic = '', permissionOverwrites = []) {
        const ch = await apiCall('POST', `/guilds/${guildId}/channels`, {
            name, type: 0, parent_id: parentId, topic, permission_overwrites: permissionOverwrites
        });
        await sleep(500);
        return ch;
    }

    async function updateChannel(channelId, name, topic, permissionOverwrites = null) {
        const body = { name, topic };
        if (permissionOverwrites !== null) {
            body.permission_overwrites = permissionOverwrites;
        }
        await apiCall('PATCH', `/channels/${channelId}`, body);
        await sleep(500);
    }

    const readOnlyOverwrites = [
        { id: everyoneRoleId, type: 0, allow: '0', deny: String(SEND_MESSAGES) },
        { id: adominatedRoleId, type: 0, allow: String(VIEW_CHANNEL | READ_HISTORY), deny: String(SEND_MESSAGES) }
    ];

    // Check existing channels under UTD category
    const utdChannels = channels.filter(c => c.parent_id === catUtd.id);

    // 1. #🎮-utd-general
    const utdGeneralCh = utdChannels.find(c => c.name.includes('utd-general'));
    if (utdGeneralCh) {
        console.log(`   ⚙️ Updating #🎮-utd-general...`);
        await updateChannel(utdGeneralCh.id, '🎮-utd-general', '🎮 General discussions, strategies, and unit synergies for Universal Tower Defense X (UTDX).');
    } else {
        console.log(`   🆕 Creating #🎮-utd-general...`);
        await createText('🎮-utd-general', catUtd.id, '🎮 General discussions, strategies, and unit synergies for Universal Tower Defense X (UTDX).');
    }

    // 2. #🍀-flex-n-rolls (Rename from trading if exists, or create new)
    const tradingCh = utdChannels.find(c => c.name.includes('trading'));
    const flexCh = utdChannels.find(c => c.name.includes('flex-n-rolls'));
    if (flexCh) {
        console.log(`   ⚙️ Updating #🍀-flex-n-rolls...`);
        await updateChannel(flexCh.id, '🍀-flex-n-rolls', '🍀 Show off your lucky summons, Ruler/Astral traits, and perfect 5-substat Relic drops!');
    } else if (tradingCh) {
        console.log(`   🔄 Renaming #🤝-trading to #🍀-flex-n-rolls...`);
        await updateChannel(tradingCh.id, '🍀-flex-n-rolls', '🍀 Show off your lucky summons, Ruler/Astral traits, and perfect 5-substat Relic drops!');
    } else {
        console.log(`   🆕 Creating #🍀-flex-n-rolls...`);
        await createText('🍀-flex-n-rolls', catUtd.id, '🍀 Show off your lucky summons, Ruler/Astral traits, and perfect 5-substat Relic drops!');
    }

    // 3. #🏰-runs-n-raids (Rename from raids-n-runs if exists, or create new)
    const oldRaidsCh = utdChannels.find(c => c.name.includes('raids-n-runs'));
    const newRaidsCh = utdChannels.find(c => c.name.includes('runs-n-raids'));
    if (newRaidsCh) {
        console.log(`   ⚙️ Updating #🏰-runs-n-raids...`);
        await updateChannel(newRaidsCh.id, '🏰-runs-n-raids', '🏰 Find teammates for Story Mode (Nightmare), Legend stages, Raids, and Virtual Realm runs.');
    } else if (oldRaidsCh) {
        console.log(`   🔄 Renaming #🏰-raids-n-runs to #🏰-runs-n-raids...`);
        await updateChannel(oldRaidsCh.id, '🏰-runs-n-raids', '🏰 Find teammates for Story Mode (Nightmare), Legend stages, Raids, and Virtual Realm runs.');
    } else {
        console.log(`   🆕 Creating #🏰-runs-n-raids...`);
        await createText('🏰-runs-n-raids', catUtd.id, '🏰 Find teammates for Story Mode (Nightmare), Legend stages, Raids, and Virtual Realm runs.');
    }

    // 4. #🏆-contributions
    const contribCh = utdChannels.find(c => c.name.includes('contributions'));
    if (contribCh) {
        console.log(`   ⚙️ Updating #🏆-contributions...`);
        await updateChannel(contribCh.id, '🏆-contributions', '🏆 Log your guild points and contributions here.');
    } else {
        console.log(`   🆕 Creating #🏆-contributions...`);
        await createText('🏆-contributions', catUtd.id, '🏆 Log your guild points and contributions here.');
    }

    // 5. #⚙️-builds-n-guides (New)
    const buildsCh = utdChannels.find(c => c.name.includes('builds-n-guides') || c.name.includes('builds'));
    if (buildsCh) {
        console.log(`   ⚙️ Updating #⚙️-builds-n-guides...`);
        await updateChannel(buildsCh.id, '⚙️-builds-n-guides', '⚙️ Share the best Unit builds, Trait configurations (Ruler, Astral, Eternal), and Relic sets (Reaper, Sun God).');
    } else {
        console.log(`   🆕 Creating #⚙️-builds-n-guides...`);
        await createText('⚙️-builds-n-guides', catUtd.id, '⚙️ Share the best Unit builds, Trait configurations (Ruler, Astral, Eternal), and Relic sets (Reaper, Sun God).');
    }

    // 6. #📊-tier-lists (New, Read-only)
    const tierCh = utdChannels.find(c => c.name.includes('tier-lists'));
    if (tierCh) {
        console.log(`   ⚙️ Updating #📊-tier-lists...`);
        await updateChannel(tierCh.id, '📊-tier-lists', '📊 Community tier lists for Units, Traits, and Relic sets.', readOnlyOverwrites);
    } else {
        console.log(`   🆕 Creating #📊-tier-lists...`);
        await createText('📊-tier-lists', catUtd.id, '📊 Community tier lists for Units, Traits, and Relic sets.', readOnlyOverwrites);
    }

    // 7. #🔑-codes (New, Read-only)
    const codesCh = utdChannels.find(c => c.name.includes('codes'));
    if (codesCh) {
        console.log(`   ⚙️ Updating #🔑-codes...`);
        await updateChannel(codesCh.id, '🔑-codes', '🔑 Active codes for free Gems, Trait Rerolls, Stat Locks, and other rewards.', readOnlyOverwrites);
    } else {
        console.log(`   🆕 Creating #🔑-codes...`);
        await createText('🔑-codes', catUtd.id, '🔑 Active codes for free Gems, Trait Rerolls, Stat Locks, and other rewards.', readOnlyOverwrites);
    }

    // ═══════════════════════════════════════
    // 3. OUT-OF-CATEGORY ADJUSTMENTS
    // ═══════════════════════════════════════
    console.log(`\n⚙️ Checking #🎉-giveaways...`);
    const giveawaysCh = channels.find(c => c.name.includes('giveaways') && c.type === 0);
    if (giveawaysCh) {
        await updateChannel(giveawaysCh.id, '🎉-giveaways', '🎉 Participate in guild giveaways for UTDX Units, Gems, and items here!');
        console.log(`   ✅ Updated #🎉-giveaways topic.`);
    }

    // ═══════════════════════════════════════
    // 4. ROLES INTERFACE UPDATE (#🎭-roles)
    // ═══════════════════════════════════════
    console.log(`\n🎭 Recreating roles selector in #🎭-roles...`);
    const rolesCh = channels.find(c => c.name.includes('roles') && c.type === 0);
    if (!rolesCh) {
        console.error('❌ #🎭-roles channel not found!');
        process.exit(1);
    }

    // Delete existing messages in #🎭-roles
    console.log(`   🗑️ Cleaning old messages in #🎭-roles...`);
    const messages = await apiCall('GET', `/channels/${rolesCh.id}/messages?limit=50`);
    for (const msg of messages) {
        try {
            await apiCall('DELETE', `/channels/${rolesCh.id}/messages/${msg.id}`);
            await sleep(300);
        } catch (err) {
            console.log(`      ⚠️ Failed to delete message ${msg.id}`);
        }
    }

    // Send updated embed in English
    await apiCall('POST', `/channels/${rolesCh.id}/messages`, {
        embeds: [{
            title: '🎭 Role Selection',
            description: 'Choose your roles below to receive specific notifications and access:\n\n'
                + '🌐 **General Notifications:**\n'
                + '🔔 **UTD Ping** - General announcements and runs.\n'
                + '🔔 **Ado Ping** - Ado music news, releases, and events.\n'
                + '🎮 **Gamer** - General co-op gaming runs.\n\n'
                + '⚔️ **UTDX Specific Pings:**\n'
                + '🔔 **Story & Legend** - Pinged for Story (Nightmare) & Legend runs.\n'
                + '🔔 **Raids** - Pinged for Raid lobbies and runs.\n'
                + '🔔 **Virtual Realm** - Pinged for Virtual Realm relic farming.\n\n'
                + '─────────────────────────\n'
                + '*Click the buttons to toggle roles! Click again to remove.*',
            color: 0x5865F2,
            footer: { text: 'Adomination Guild • Self Roles' },
            timestamp: new Date().toISOString()
        }],
        components: [
            {
                type: 1,
                components: [
                    { type: 2, style: 1, label: '🔔 UTD Ping', custom_id: 'toggle_utd_ping' },
                    { type: 2, style: 2, label: '🔔 Ado Ping', custom_id: 'toggle_ado_ping' },
                    { type: 2, style: 2, label: '🎮 Gamer', custom_id: 'toggle_gamer' }
                ]
            },
            {
                type: 1,
                components: [
                    { type: 2, style: 3, label: 'Story & Legend', custom_id: 'toggle_story_ping' },
                    { type: 2, style: 3, label: 'Raids', custom_id: 'toggle_raids_ping' },
                    { type: 2, style: 3, label: 'Virtual Realm', custom_id: 'toggle_vr_ping' }
                ]
            }
        ]
    });
    console.log(`   ✅ Sent new roles selection embed in #🎭-roles.`);

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎉 SERVER UPGRADE COMPLETED SUCCESSFULLY!`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

main().catch(err => {
    console.error(`\n❌ ERROR:`, err.message);
    process.exit(1);
});
