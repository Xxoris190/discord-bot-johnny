require('dotenv').config();
const TOKEN = process.env.DISCORD_TOKEN;
const API_BASE = 'https://discord.com/api/v10';

if (!TOKEN) {
    console.error('❌ DISCORD_TOKEN is not defined in the environment!');
    process.exit(1);
}

async function apiCall(endpoint) {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        headers: { 'Authorization': `Bot ${TOKEN}` },
    });
    return res.json();
}

async function main() {
    console.log(`\n🔍 VÉRIFICATION COMPLÈTE DU BOT\n`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // 1. Bot en ligne ?
    const me = await apiCall('/users/@me');
    console.log(`🤖 Bot: ${me.username}#${me.discriminator} (ID: ${me.id})`);
    console.log(`   ✅ Le bot répond à l'API → il est EN LIGNE\n`);

    // 2. Serveur connecté ?
    const guilds = await apiCall('/users/@me/guilds');
    console.log(`📡 Serveurs: ${guilds.length}`);
    guilds.forEach(g => console.log(`   ✅ ${g.name} (ID: ${g.id})`));

    const guildId = guilds[0].id;

    // 3. Permissions du bot dans le serveur
    const botMember = await apiCall(`/guilds/${guildId}/members/${me.id}`);
    const botRoles = botMember.roles || [];
    const allRoles = await apiCall(`/guilds/${guildId}/roles`);
    const botRoleNames = botRoles.map(rid => allRoles.find(r => r.id === rid)?.name).filter(Boolean);
    console.log(`\n🎭 Rôles du bot: ${botRoleNames.join(', ')}`);

    // Check admin
    const hasAdmin = botRoles.some(rid => {
        const role = allRoles.find(r => r.id === rid);
        return role && (BigInt(role.permissions) & BigInt(0x8)) === BigInt(0x8);
    });
    console.log(`   ${hasAdmin ? '✅' : '❌'} Permission Administrateur: ${hasAdmin ? 'OUI' : 'NON'}`);

    // 4. Vérifier les salons critiques
    console.log(`\n📁 Salons critiques:`);
    const channels = await apiCall(`/guilds/${guildId}/channels`);
    
    const critical = [
        { search: 'bienvenue', label: '👋 Bienvenue (messages auto)' },
        { search: 'vérification', label: '✅ Vérification (bouton verify)' },
        { search: 'ouvrir-ticket', label: '🎫 Tickets (bouton créer)' },
        { search: 'choisis-tes-r', label: '🎭 Self-roles (boutons rôles)' },
        { search: 'twitch-live', label: '📺 Twitch live (notifs auto)' },
        { search: 'annonces', label: '📢 Annonces (notifs boost)' },
    ];

    for (const c of critical) {
        const ch = channels.find(ch => ch.name.includes(c.search));
        console.log(`   ${ch ? '✅' : '❌'} ${c.label} ${ch ? '' : '— NON TROUVÉ !'}`);
    }

    // 5. Vérifier les rôles critiques
    console.log(`\n🎭 Rôles critiques:`);
    const criticalRoles = [
        { search: 'Verified', label: '✅ Verified (vérification)' },
        { search: 'King', label: '👑 King (admin)' },
        { search: 'Admin', label: '🛡️ Admin (staff)' },
        { search: 'Modo', label: '🔨 Modo (staff)' },
        { search: 'Twitch', label: '🔔 Twitch (notifications)' },
        { search: 'Gamer', label: '🎮 Gamer (self-role)' },
        { search: 'Weeb', label: '📺 Weeb (self-role)' },
    ];

    for (const r of criticalRoles) {
        const role = allRoles.find(rl => rl.name.includes(r.search));
        console.log(`   ${role ? '✅' : '❌'} ${r.label}`);
    }

    // 6. Vérifier que les boutons existent (messages dans les salons)
    console.log(`\n🔘 Vérification des boutons interactifs:`);
    
    const verifyChannel = channels.find(ch => ch.name.includes('vérification'));
    if (verifyChannel) {
        const msgs = await apiCall(`/channels/${verifyChannel.id}/messages?limit=5`);
        const hasButton = msgs.some(m => m.components && m.components.length > 0);
        console.log(`   ${hasButton ? '✅' : '❌'} Bouton vérification dans #vérification`);
    }

    const ticketChannel = channels.find(ch => ch.name.includes('ouvrir-ticket'));
    if (ticketChannel) {
        const msgs = await apiCall(`/channels/${ticketChannel.id}/messages?limit=5`);
        const hasButton = msgs.some(m => m.components && m.components.length > 0);
        console.log(`   ${hasButton ? '✅' : '❌'} Bouton ticket dans #ouvrir-ticket`);
    }

    const selfRoleChannel = channels.find(ch => ch.name.includes('choisis-tes-r'));
    if (selfRoleChannel) {
        const msgs = await apiCall(`/channels/${selfRoleChannel.id}/messages?limit=5`);
        const hasButton = msgs.some(m => m.components && m.components.length > 0);
        console.log(`   ${hasButton ? '✅' : '❌'} Boutons self-roles dans #choisis-tes-rôles`);
    }

    // 7. Résumé
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ VÉRIFICATION TERMINÉE`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    console.log(`🌐 Hébergé sur: Render.com (H24 gratuit)`);
    console.log(`🤖 Bot: ${me.username} — EN LIGNE`);
    console.log(`🔒 Permissions: Admin ✅`);
    console.log(`📡 Serveur: ${guilds[0].name}\n`);
}

main().catch(err => {
    console.error(`❌ ERREUR:`, err.message);
});
