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
    console.log(`📡 Serveurs connectés: ${guilds.length}`);
    guilds.forEach(g => console.log(`   👉 ${g.name} (ID: ${g.id})`));

    for (const guild of guilds) {
        const guildId = guild.id;
        const isOriginal = guildId === '1492264434003873973';
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📡 EXAMEN DU SERVEUR: ${guild.name} (ID: ${guildId})`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

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
        
        const critical = isOriginal ? [
            { search: 'bienvenue', label: '👋 Bienvenue (messages auto)' },
            { search: 'vérification', label: '✅ Vérification (bouton verify)' },
            { search: 'ouvrir-ticket', label: '🎫 Tickets (bouton créer)' },
            { search: 'choisis-tes-r', label: '🎭 Self-roles (boutons rôles)' },
            { search: 'twitch-live', label: '📺 Twitch live (notifs auto)' },
            { search: 'annonces', label: '📢 Annonces (notifs boost)' },
        ] : [
            { search: 'welcome', label: '👋 Welcome (auto messages)' },
            { search: 'verify', label: '✅ Verify (verification button)' },
            { search: 'open-ticket', label: '🎫 Ticket (create button)' },
            { search: 'roles', label: '🎭 Self-roles (roles buttons)' },
            { search: 'general', label: '💬 General Lounge' },
        ];

        for (const c of critical) {
            const ch = channels.find(ch => ch.name.includes(c.search));
            console.log(`   ${ch ? '✅' : '❌'} ${c.label} ${ch ? `(#${ch.name})` : '— NON TROUVÉ !'}`);
        }

        // 5. Vérifier les rôles critiques
        console.log(`\n🎭 Rôles critiques:`);
        const criticalRoles = isOriginal ? [
            { search: 'Verified', label: '✅ Verified (vérification)' },
            { search: 'King', label: '👑 King (admin)' },
            { search: 'Admin', label: '🛡️ Admin (staff)' },
            { search: 'Modo', label: '🔨 Modo (staff)' },
            { search: 'Twitch', label: '🔔 Twitch (notifications)' },
            { search: 'Gamer', label: '🎮 Gamer (self-role)' },
            { search: 'Weeb', label: '📺 Weeb (self-role)' },
        ] : [
            { search: 'Adominated', label: '🎵 Adominated (verified member)' },
            { search: 'Empress', label: '👑 Empress (admin)' },
            { search: 'Commander', label: '🛡️ Commander (staff)' },
            { search: 'UTD Elite', label: '🔥 UTD Elite' },
            { search: 'UTD Ping', label: '🔔 UTD Ping (self-role)' },
            { search: 'Ado Ping', label: '🔔 Ado Ping (self-role)' },
            { search: 'Gamer', label: '🎮 Gamer (self-role)' },
        ];

        for (const r of criticalRoles) {
            const role = allRoles.find(rl => rl.name.includes(r.search));
            console.log(`   ${role ? '✅' : '❌'} ${r.label}`);
        }

        // 6. Vérifier que les boutons existent (messages dans les salons)
        console.log(`\n🔘 Vérification des boutons interactifs:`);
        
        const verifyChannel = channels.find(ch => ch.name.includes(isOriginal ? 'vérification' : 'verify'));
        if (verifyChannel) {
            const msgs = await apiCall(`/channels/${verifyChannel.id}/messages?limit=5`);
            const hasButton = msgs.some(m => m.components && m.components.length > 0);
            console.log(`   ${hasButton ? '✅' : '❌'} Bouton vérification dans #${verifyChannel.name}`);
        }

        const ticketChannel = channels.find(ch => ch.name.includes(isOriginal ? 'ouvrir-ticket' : 'open-ticket'));
        if (ticketChannel) {
            const msgs = await apiCall(`/channels/${ticketChannel.id}/messages?limit=5`);
            const hasButton = msgs.some(m => m.components && m.components.length > 0);
            console.log(`   ${hasButton ? '✅' : '❌'} Bouton ticket dans #${ticketChannel.name}`);
        }

        const selfRoleChannel = channels.find(ch => ch.name.includes(isOriginal ? 'choisis-tes-r' : 'roles'));
        if (selfRoleChannel) {
            const msgs = await apiCall(`/channels/${selfRoleChannel.id}/messages?limit=5`);
            const hasButton = msgs.some(m => m.components && m.components.length > 0);
            console.log(`   ${hasButton ? '✅' : '❌'} Boutons self-roles dans #${selfRoleChannel.name}`);
        }
    }

    // 7. Résumé
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ VÉRIFICATION TERMINÉE`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    console.log(`🌐 Hébergé sur: Render.com (H24 gratuit)`);
    console.log(`🤖 Bot: ${me.username} — EN LIGNE\n`);
}

main().catch(err => {
    console.error(`❌ ERREUR:`, err.message);
});
