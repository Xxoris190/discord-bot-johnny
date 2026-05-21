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
const CONNECT = BigInt(1 << 20);
const SPEAK = BigInt(1 << 21);

const VERIFIED_PERMS = String(VIEW_CHANNEL | SEND_MESSAGES | READ_HISTORY | CONNECT | SPEAK | BigInt(1 << 15) | BigInt(1 << 14) | BigInt(1 << 18));

async function main() {
    console.log(`🚀 Starting setup for UTD Roblox Guild: Adomination (Ado themed)...\n`);

    const botUser = await apiCall('GET', '/users/@me');
    console.log(`🤖 Bot User: ${botUser.username}#${botUser.discriminator}`);

    const guilds = await apiCall('GET', '/users/@me/guilds');
    if (guilds.length === 0) {
        console.error('❌ The bot is not in any server. Invite the bot first!');
        process.exit(1);
    }

    // We look for a guild that is NOT Johnny's original server, or we target the new one
    // Johnny's server ID is '1492264434003873973'
    const originalGuildId = '1492264434003873973';
    const targetGuilds = guilds.filter(g => g.id !== originalGuildId);

    if (targetGuilds.length === 0) {
        console.log(`\n⚠️ The bot is only in the original server.`);
        console.log(`👉 Please invite the bot to your new server using this link:`);
        console.log(`🔗 https://discord.com/api/oauth2/authorize?client_id=${botUser.id}&permissions=8&scope=bot`);
        console.log(`\nOnce the bot is invited, run this script again.`);
        process.exit(0);
    }

    // If there is a target guild, let's take the first one or prompt/list them
    const targetGuild = targetGuilds[0];
    const guildId = targetGuild.id;
    console.log(`📡 Target Server Found: ${targetGuild.name} (ID: ${guildId})`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    const everyoneRoleId = guildId;

    // ═══════════════════════════════════════
    // 1. DELETE EXISTING CHANNELS
    // ═══════════════════════════════════════
    console.log(`🗑️ Cleaning existing channels...`);
    const existingChannels = await apiCall('GET', `/guilds/${guildId}/channels`);
    for (const ch of existingChannels) {
        try {
            await apiCall('DELETE', `/channels/${ch.id}`);
            await sleep(500);
        } catch (e) {
            console.log(`   ⚠️ Failed to delete: ${ch.name}`);
        }
    }
    console.log(`✅ Channels cleaned.`);
    await sleep(1000);

    // ═══════════════════════════════════════
    // 2. DELETE EXISTING CUSTOM ROLES
    // ═══════════════════════════════════════
    console.log(`\n🗑️ Cleaning existing custom roles...`);
    const existingRoles = await apiCall('GET', `/guilds/${guildId}/roles`);
    for (const role of existingRoles) {
        if (role.name === '@everyone' || role.managed) continue;
        try {
            await apiCall('DELETE', `/guilds/${guildId}/roles/${role.id}`);
            await sleep(500);
        } catch (e) {
            console.log(`   ⚠️ Failed to delete role: ${role.name}`);
        }
    }
    console.log(`✅ Roles cleaned.`);
    await sleep(1000);

    // ═══════════════════════════════════════
    // 3. CREATE ROLES
    // ═══════════════════════════════════════
    console.log(`\n🎭 Creating new themed roles...\n`);

    // 👑 Empress (Gojo/Ado theme color: Platinum Gold/Light Cyan)
    const empressRole = await apiCall('POST', `/guilds/${guildId}/roles`, {
        name: '👑 Empress',
        color: 0x00E5FF, // Cyan / Electric Blue
        permissions: String(0x8), // Administrator
        hoist: true,
        mentionable: true,
    });
    console.log(`   ✅ Created role: 👑 Empress (Admin)`);
    await sleep(500);

    // 🛡️ Commander (Staff)
    const ADMIN_PERMS = BigInt(0x20) | BigInt(0x10) | BigInt(0x10000000) | BigInt(0x2000) | BigInt(0x2) | BigInt(0x4) | BigInt(0x8000000) | BigInt(0x80) | BigInt(0x400) | BigInt(0x800) | BigInt(0x4000) | BigInt(0x8000) | BigInt(0x10000) | BigInt(0x40000) | BigInt(0x100000) | BigInt(0x200000) | BigInt(0x1000000) | BigInt(0x400000) | BigInt(0x800000) | BigInt(0x200000000) | BigInt(0x10000000000);
    const commanderRole = await apiCall('POST', `/guilds/${guildId}/roles`, {
        name: '🛡️ Commander',
        color: 0xE91E63, // Deep Pink
        permissions: String(ADMIN_PERMS),
        hoist: true,
        mentionable: true,
    });
    console.log(`   ✅ Created role: 🛡️ Commander (Staff)`);
    await sleep(500);

    // 🔥 UTD Elite
    const eliteRole = await apiCall('POST', `/guilds/${guildId}/roles`, {
        name: '🔥 UTD Elite',
        color: 0xFF9800, // Orange
        permissions: '0',
        hoist: true,
        mentionable: true,
    });
    console.log(`   ✅ Created role: 🔥 UTD Elite`);
    await sleep(500);

    // 🎵 Adominated (Verified Member)
    const adominatedRole = await apiCall('POST', `/guilds/${guildId}/roles`, {
        name: '🎵 Adominated',
        color: 0x9B59B6, // Purple
        permissions: VERIFIED_PERMS,
        hoist: true,
        mentionable: false,
    });
    console.log(`   ✅ Created role: 🎵 Adominated (Member)`);
    await sleep(500);

    // Self Roles (No special permissions, just for pinging/flair)
    const utdPingRole = await apiCall('POST', `/guilds/${guildId}/roles`, {
        name: '🔔 UTD Ping',
        color: 0x1ABC9C, // Teal
        permissions: '0',
        hoist: false,
        mentionable: true,
    });
    console.log(`   ✅ Created role: 🔔 UTD Ping`);
    await sleep(500);

    const adoPingRole = await apiCall('POST', `/guilds/${guildId}/roles`, {
        name: '🔔 Ado Ping',
        color: 0xF39C12, // Sun Yellow
        permissions: '0',
        hoist: false,
        mentionable: true,
    });
    console.log(`   ✅ Created role: 🔔 Ado Ping`);
    await sleep(500);

    const gamerRole = await apiCall('POST', `/guilds/${guildId}/roles`, {
        name: '🎮 Gamer',
        color: 0x34495E, // Dark Blue/Grey
        permissions: '0',
        hoist: false,
        mentionable: false,
    });
    console.log(`   ✅ Created role: 🎮 Gamer`);
    await sleep(1000);

    // ═══════════════════════════════════════
    // 4. CREATE CATEGORIES & CHANNELS
    // ═══════════════════════════════════════
    console.log(`\n📁 Creating categories and channels...\n`);

    async function createCategory(name, position, permissionOverwrites = []) {
        const cat = await apiCall('POST', `/guilds/${guildId}/channels`, {
            name, type: 4, position, permission_overwrites: permissionOverwrites
        });
        await sleep(500);
        return cat;
    }

    async function createText(name, parentId, topic = '', permissionOverwrites = []) {
        const ch = await apiCall('POST', `/guilds/${guildId}/channels`, {
            name, type: 0, parent_id: parentId, topic, permission_overwrites: permissionOverwrites
        });
        await sleep(500);
        return ch;
    }

    async function createVoice(name, parentId) {
        const ch = await apiCall('POST', `/guilds/${guildId}/channels`, {
            name, type: 2, parent_id: parentId,
        });
        await sleep(500);
        return ch;
    }

    // Category overrides
    const lockedCategoryOverrides = [
        { id: everyoneRoleId, type: 0, deny: String(VIEW_CHANNEL), allow: '0' },
        { id: adominatedRole.id, type: 0, allow: String(VIEW_CHANNEL | SEND_MESSAGES | READ_HISTORY | CONNECT | SPEAK), deny: '0' }
    ];

    // ──── 📢 INFORMATION ────
    // Everyone should be able to see this category, but only staff writes
    const catInfo = await createCategory('📢 INFORMATION', 0);
    const rulesCh = await createText('📜-rules', catInfo.id, '📜 Server rules and guidelines. Please respect them.', [
        { id: everyoneRoleId, type: 0, allow: String(VIEW_CHANNEL | READ_HISTORY), deny: String(SEND_MESSAGES) },
        { id: adominatedRole.id, type: 0, allow: String(VIEW_CHANNEL | READ_HISTORY), deny: String(SEND_MESSAGES) }
    ]);
    const announceCh = await createText('📢-announcements', catInfo.id, '📢 Important guild and game updates.', [
        { id: everyoneRoleId, type: 0, allow: String(VIEW_CHANNEL | READ_HISTORY), deny: String(SEND_MESSAGES) },
        { id: adominatedRole.id, type: 0, allow: String(VIEW_CHANNEL | READ_HISTORY), deny: String(SEND_MESSAGES) }
    ]);
    const welcomeCh = await createText('👋-welcome', catInfo.id, '👋 Welcomes all new members to the family!', [
        { id: everyoneRoleId, type: 0, allow: String(VIEW_CHANNEL | READ_HISTORY), deny: String(SEND_MESSAGES) },
        { id: adominatedRole.id, type: 0, allow: String(VIEW_CHANNEL | READ_HISTORY), deny: String(SEND_MESSAGES) }
    ]);
    const verifyCh = await createText('✅-verify', catInfo.id, '✅ Verify your account to get access to the server.', [
        { id: everyoneRoleId, type: 0, allow: String(VIEW_CHANNEL | READ_HISTORY), deny: String(SEND_MESSAGES) },
        { id: adominatedRole.id, type: 0, allow: String(VIEW_CHANNEL | READ_HISTORY), deny: String(SEND_MESSAGES) }
    ]);
    const rolesCh = await createText('🎭-roles', catInfo.id, '🎭 Assign yourself notifications and gaming roles.', [
        { id: everyoneRoleId, type: 0, deny: String(VIEW_CHANNEL), allow: '0' },
        { id: adominatedRole.id, type: 0, allow: String(VIEW_CHANNEL | READ_HISTORY), deny: String(SEND_MESSAGES) }
    ]);
    console.log(`   ✅ 📢 INFORMATION Category & 5 channels created.`);

    // ──── 💬 LOUNGE ────
    const catLounge = await createCategory('💬 LOUNGE', 1, lockedCategoryOverrides);
    const generalCh = await createText('💬-general', catLounge.id, '💬 Main English chat for the guild.');
    await createText('📸-media', catLounge.id, '📸 Share your memes, art, clips, and photos.');
    await createText('🤖-commands', catLounge.id, '🤖 Execute bot commands here.');
    console.log(`   ✅ 💬 LOUNGE Category & 3 channels created.`);

    // ──── ⚔️ UTD ROBLOX ────
    const catUtd = await createCategory('⚔️ UTD ROBLOX', 2, lockedCategoryOverrides);
    await createText('🎮-utd-general', catUtd.id, '🎮 UTD strategy, updates, and general talk.');
    await createText('🤝-trading', catUtd.id, '🤝 Trade towers, ask for values and make deals.');
    await createText('🏰-raids-n-runs', catUtd.id, '🏰 Find teammates for raids, infinite runs, and challenges.');
    const contribCh = await createText('🏆-contributions', catUtd.id, '🏆 Log your guild points and contributions here.');
    console.log(`   ✅ ⚔️ UTD ROBLOX Category & 4 channels created.`);

    // ──── 🎤 ADO NATION ────
    const catAdo = await createCategory('🎤 ADO NATION', 3, lockedCategoryOverrides);
    await createText('🎶-ado-discussion', catAdo.id, '🎶 Discuss Ado\'s music, concerts, and awesome covers.');
    await createText('🎵-music-rec', catAdo.id, '🎵 Share your favorite music, playlists, and songs.');
    console.log(`   ✅ 🎤 ADO NATION Category & 2 channels created.`);

    // ──── 🎫 SUPPORT ────
    const catSupport = await createCategory('🎫 SUPPORT', 4, lockedCategoryOverrides);
    const ticketCh = await createText('🎫-open-ticket', catSupport.id, '🎫 Open a support ticket to get help from the staff.', [
        { id: everyoneRoleId, type: 0, deny: String(SEND_MESSAGES), allow: String(VIEW_CHANNEL | READ_HISTORY) },
        { id: adominatedRole.id, type: 0, deny: String(SEND_MESSAGES), allow: String(VIEW_CHANNEL | READ_HISTORY) }
    ]);
    console.log(`   ✅ 🎫 SUPPORT Category & 1 channel created.`);

    // ──── 🔊 VOICE ────
    const catVoice = await createCategory('🔊 VOICE CHANNELS', 5, lockedCategoryOverrides);
    await createVoice('🔊 General Lounge', catVoice.id);
    await createVoice('🎮 UTD Team 1', catVoice.id);
    await createVoice('🎮 UTD Team 2', catVoice.id);
    await createVoice('🎵 Music Room', catVoice.id);
    console.log(`   ✅ 🔊 VOICE Category & 4 channels created.`);

    // ═══════════════════════════════════════
    // 5. SEND EMBEDS & INTERACTIVE BUTTONS
    // ═══════════════════════════════════════
    console.log(`\n📨 Sending embeds and setting up buttons...\n`);

    // rules
    await apiCall('POST', `/channels/${rulesCh.id}/messages`, {
        embeds: [{
            title: '📜 Adomination Guild Rules',
            description: 'Welcome to **Adomination** (Ado & UTD Roblox Guild)!\nHere are the rules to maintain a friendly community:\n\n'
                + '**1️⃣ Respect & Kindness**\n'
                + '> Treat everyone with respect. No insults, discrimination, toxicity, or harassment.\n\n'
                + '**2️⃣ English Only**\n'
                + '> This is an English-speaking server. Please use English in all public channels.\n\n'
                + '**3️⃣ Roblox & UTD Fair Play**\n'
                + '> No hacking, exploiting, or scamming. Keep trading fair and honest.\n\n'
                + '**4️⃣ No Spam or Advertising**\n'
                + '> Do not spam messages, emojis, or send unsolicited invite links.\n\n'
                + '**5️⃣ Appropriate Content**\n'
                + '> Absolutely no NSFW, gore, or illegal content. Keep it PG-13.\n\n'
                + '─────────────────────────\n'
                + '⚠️ *Failure to comply with these rules will result in a warn, kick, or ban.*',
            color: 0x00E5FF,
            footer: { text: 'Adomination Guild • Rules subject to change' },
            timestamp: new Date().toISOString()
        }]
    });
    console.log(`   ✅ Sent rules embed.`);
    await sleep(600);

    // verification embed
    await apiCall('POST', `/channels/${verifyCh.id}/messages`, {
        embeds: [{
            title: '✅ Guild Verification',
            description: '**Welcome to Adomination!**\n\n'
                + 'To access the server channels, chats, and features, you need to verify your account.\n\n'
                + 'By clicking the button below, you agree to follow our **📜-rules**.\n\n'
                + '👇 **Click below to get verified:**',
            color: 0x9B59B6,
            thumbnail: { url: 'https://cdn.discordapp.com/emojis/1054783810665689128.webp' },
            footer: { text: 'Adomination Verification System' },
        }],
        components: [{
            type: 1,
            components: [{
                type: 2,
                style: 3, // Success
                label: 'Verify Me',
                custom_id: 'verify_adomination',
                emoji: { name: '✅' }
            }]
        }]
    });
    console.log(`   ✅ Sent verification embed.`);
    await sleep(600);

    // roles selection embed
    await apiCall('POST', `/channels/${rolesCh.id}/messages`, {
        embeds: [{
            title: '🎭 Role Selection',
            description: 'Choose your roles below to receive specific notifications and access:\n\n'
                + '🔔 **UTD Ping** - Get pinged for guild raids, events, and UTD runs.\n'
                + '🔔 **Ado Ping** - Get notified of Ado music updates, covers, and news.\n'
                + '🎮 **Gamer** - Let others know you are looking for co-op gaming.',
            color: 0x34495E,
            footer: { text: 'Click the buttons to toggle roles!' }
        }],
        components: [{
            type: 1,
            components: [
                { type: 2, style: 1, label: '🔔 UTD Ping', custom_id: 'toggle_utd_ping' },
                { type: 2, style: 2, label: '🔔 Ado Ping', custom_id: 'toggle_ado_ping' },
                { type: 2, style: 2, label: '🎮 Gamer', custom_id: 'toggle_gamer' }
            ]
        }]
    });
    console.log(`   ✅ Sent roles selection embed.`);
    await sleep(600);

    // tickets embed
    await apiCall('POST', `/channels/${ticketCh.id}/messages`, {
        embeds: [{
            title: '🎫 Support Ticket',
            description: '**Need assistance or want to contact the Staff?**\n\n'
                + 'If you have questions about contributions, issues in the guild, or general complaints, open a support ticket.\n\n'
                + '📌 **Instructions:**\n'
                + '> 1️⃣ Click the button below\n'
                + '> 2️⃣ A private text channel will be created for you\n'
                + '> 3️⃣ Explain your issue and wait for staff response\n\n'
                + '⚠️ *Please do not abuse the ticket system.*',
            color: 0xE91E63,
            footer: { text: 'Adomination Ticket System' }
        }],
        components: [{
            type: 1,
            components: [{
                type: 2,
                style: 1,
                label: '📩 Open Ticket',
                custom_id: 'create_ticket_adomination'
            }]
        }]
    });
    console.log(`   ✅ Sent ticket embed.`);
    await sleep(600);

    // ═══════════════════════════════════════
    // 6. CREATE PERMANENT INVITE LINK
    // ═══════════════════════════════════════
    const invite = await apiCall('POST', `/channels/${generalCh.id}/invites`, {
        max_age: 0,
        max_uses: 0,
    });

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🎉 SERVER CONFIGURATION COMPLETE!`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📛 Guild Name:  ${targetGuild.name}`);
    console.log(`🎭 Roles:       👑 Empress | 🛡️ Commander | 🔥 UTD Elite | 🎵 Adominated`);
    console.log(`📁 Categories:  6`);
    console.log(`📝 Channels:    15 text + 4 voice`);
    console.log(`🔗 Permanent Invite: https://discord.gg/${invite.code}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

main().catch(err => {
    console.error(`\n❌ ERROR:`, err.message);
    process.exit(1);
});
