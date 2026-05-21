try { require('dotenv').config(); } catch (e) {} // Charge .env en local
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits,
    ActivityType,
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
    console.error('❌ DISCORD_TOKEN non défini !');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// Anti-spam pour Twitch (éviter les notifs en double)
const currentlyStreaming = new Set();

// ═══════════════════════════════════════
// BOT PRÊT
// ═══════════════════════════════════════
client.once('ready', () => {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🤖 Bot en ligne: ${client.user.tag}`);
    console.log(`📡 Serveurs: ${client.guilds.cache.size}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n✅ Systèmes actifs:`);
    console.log(`   👋 Messages de bienvenue`);
    console.log(`   🚀 Détection des boosts`);
    console.log(`   🎫 Système de tickets`);
    console.log(`   ✅ Système de vérification`);
    console.log(`   🎭 Self-roles par boutons`);
    console.log(`   📺 Notifications Twitch live`);
    console.log(`\n📋 En attente d'événements...\n`);

    // Status du bot
    client.user.setActivity('le serveur 👀', { type: ActivityType.Watching });
});

// ═══════════════════════════════════════
// 👋 MESSAGE DE BIENVENUE
// ═══════════════════════════════════════
client.on('guildMemberAdd', async (member) => {
    console.log(`👋 Nouveau membre: ${member.user.username}`);

    const welcomeChannel = member.guild.channels.cache.find(
        c => (c.name.includes('bienvenue') || c.name.includes('welcome')) && c.type === ChannelType.GuildText
    );
    if (!welcomeChannel) return console.log('   ⚠️ Salon bienvenue/welcome non trouvé');

    const verifyChannel = member.guild.channels.cache.find(
        c => c.name.includes('vérification') || c.name.includes('verification') || c.name.includes('verify')
    );

    const isOriginalGuild = member.guild.id === '1492264434003873973';
    const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setAuthor({
            name: isOriginalGuild ? `${member.user.username} vient d'arriver !` : `${member.user.username} just joined!`,
            iconURL: member.user.displayAvatarURL({ dynamic: true }),
        })
        .setTitle(isOriginalGuild ? '👋 Bienvenue !' : '👋 Welcome!')
        .setDescription(
            isOriginalGuild 
                ? `Hey ${member}, bienvenue sur **${member.guild.name}** ! 🎉\n\nTu es notre **${member.guild.memberCount}ème** membre !\n\n` + (verifyChannel ? `✅ Vérifie-toi dans ${verifyChannel} pour accéder au serveur.` : '📜 Lis les règles pour commencer !')
                : `Hey ${member}, welcome to **${member.guild.name}**! 🎉\n\nYou are our **#${member.guild.memberCount}** member!\n\n` + (verifyChannel ? `✅ Verify yourself in ${verifyChannel} to access the server.` : '📜 Read the rules to get started!')
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 512 }))
        .setFooter({ text: isOriginalGuild ? `Membre #${member.guild.memberCount}` : `Member #${member.guild.memberCount}` })
        .setTimestamp();

    try {
        await welcomeChannel.send({ content: `${member}`, embeds: [embed] });
        console.log(`   ✅ Welcome message sent`);
    } catch (err) {
        console.log(`   ❌ Erreur bienvenue: ${err.message}`);
    }
});

// ═══════════════════════════════════════
// 🚀 DÉTECTION DES BOOSTS
// ═══════════════════════════════════════
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    // Vérifier si c'est un nouveau boost
    if (!oldMember.premiumSince && newMember.premiumSince) {
        console.log(`🚀 Nouveau boost de: ${newMember.user.username}`);

        const announceChannel = newMember.guild.channels.cache.find(
            c => (c.name.includes('annonces') || c.name.includes('announcements') || c.name.includes('général') || c.name.includes('general')) && c.type === ChannelType.GuildText
        );
        if (!announceChannel) return;

        const boostLevel = newMember.guild.premiumTier;
        const boostCount = newMember.guild.premiumSubscriptionCount || 0;
        const levelNames = ['Aucun', 'Niveau 1', 'Niveau 2', 'Niveau 3'];
        const levelNamesEN = ['None', 'Level 1', 'Level 2', 'Level 3'];

        const isOriginalGuild = newMember.guild.id === '1492264434003873973';
        const embed = new EmbedBuilder()
            .setColor('#F47FFF')
            .setTitle(isOriginalGuild ? '🚀 NOUVEAU BOOST !' : '🚀 NEW BOOST!')
            .setDescription(
                isOriginalGuild
                    ? `**${newMember.user.username}** vient de booster le serveur ! 💜✨\n\nMerci pour ton soutien, tu es incroyable ! 🎉\n\n📊 **Stats de boost:**\n> 💎 Boosts totaux: **${boostCount}**\n> 🏆 Niveau: **${levelNames[boostLevel] || boostLevel}**`
                    : `**${newMember.user.username}** just boosted the server! 💜✨\n\nThank you so much for your support, you are amazing! 🎉\n\n📊 **Boost Stats:**\n> 💎 Total Boosts: **${boostCount}**\n> 🏆 Level: **${levelNamesEN[boostLevel] || boostLevel}**`
            )
            .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setFooter({ text: isOriginalGuild ? '💜 Merci pour le boost !' : '💜 Thanks for the boost!' })
            .setTimestamp();

        try {
            await announceChannel.send({ content: '🎉 @everyone', embeds: [embed] });
            console.log(`   ✅ Notification de boost envoyée`);
        } catch (err) {
            console.log(`   ❌ Erreur boost: ${err.message}`);
        }
    }
});

// ═══════════════════════════════════════
// 🎭 MAPPING SELF-ROLES (bouton → nom du rôle)
// ═══════════════════════════════════════
const SELF_ROLE_MAP = {
    'role_gamer':       '🎮 Gamer',
    'role_weeb':        '📺 Weeb',
    'role_melomane':    '🎵 Mélomane',
    'role_streameur':   '🎬 Streameur',
    'role_artiste':     '🎨 Artiste',
    'role_twitch':      '🔔 Twitch',
    'role_clown':       '🤡 Clown',
    'role_toxic':       '🐍 Toxic',
    'role_afk':         '😴 AFK',
    'toggle_utd_ping':  '🔔 UTD Ping',
    'toggle_ado_ping':  '🔔 Ado Ping',
    'toggle_gamer':     '🎮 Gamer',
};

// ═══════════════════════════════════════
// 🎫 ✅ 🎭 GESTION DES BOUTONS (INTERACTIONS)
// ═══════════════════════════════════════
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const { customId } = interaction;

    // ──── 🎭 SELF-ROLES (toggle) ────
    if (customId.startsWith('role_') || customId.startsWith('toggle_')) {
        const roleName = SELF_ROLE_MAP[customId];
        if (!roleName) return;

        const role = interaction.guild.roles.cache.find(r => r.name === roleName);
        const isOriginalGuild = interaction.guild.id === '1492264434003873973';

        if (!role) {
            return interaction.reply({
                content: isOriginalGuild ? `❌ Rôle **${roleName}** non trouvé.` : `❌ Role **${roleName}** not found.`,
                ephemeral: true,
            });
        }

        try {
            if (interaction.member.roles.cache.has(role.id)) {
                // Retirer le rôle
                await interaction.member.roles.remove(role);
                await interaction.reply({
                    content: isOriginalGuild ? `❌ Rôle **${roleName}** retiré !` : `❌ Role **${roleName}** removed!`,
                    ephemeral: true,
                });
                console.log(`🎭 ${interaction.user.username} → -${roleName}`);
            } else {
                // Ajouter le rôle
                await interaction.member.roles.add(role);
                await interaction.reply({
                    content: isOriginalGuild ? `✅ Rôle **${roleName}** ajouté !` : `✅ Role **${roleName}** added!`,
                    ephemeral: true,
                });
                console.log(`🎭 ${interaction.user.username} → +${roleName}`);
            }
        } catch (err) {
            console.log(`   ❌ Erreur self-role: ${err.message}`);
            await interaction.reply({
                content: isOriginalGuild ? '❌ Erreur lors du changement de rôle.' : '❌ Error changing role.',
                ephemeral: true,
            });
        }
        return;
    }

    // ──── ✅ VÉRIFICATION ────
    if (customId === 'verify' || customId === 'verify_adomination') {
        console.log(`✅ Vérification de: ${interaction.user.username}`);
        const isOriginalGuild = interaction.guild.id === '1492264434003873973';

        const roleName = isOriginalGuild ? 'Verified' : '🎵 Adominated';
        const verifiedRole = interaction.guild.roles.cache.find(
            r => r.name.includes(roleName) || r.name.includes('Verified')
        );

        if (!verifiedRole) {
            return interaction.reply({
                content: isOriginalGuild ? '❌ Rôle Verified non trouvé. Contacte un admin.' : '❌ Verified role not found. Contact an admin.',
                ephemeral: true,
            });
        }

        // Vérifier si déjà vérifié
        if (interaction.member.roles.cache.has(verifiedRole.id)) {
            return interaction.reply({
                content: isOriginalGuild ? '✅ Tu es déjà vérifié !' : '✅ You are already verified!',
                ephemeral: true,
            });
        }

        try {
            await interaction.member.roles.add(verifiedRole);
            await interaction.reply({
                content: isOriginalGuild 
                    ? '✅ **Tu es maintenant vérifié !** Bienvenue sur le serveur ! 🎉\nTu as maintenant accès à tous les salons.'
                    : '✅ **You are now verified!** Welcome to the server! 🎉\nYou now have access to all channels.',
                ephemeral: true,
            });
            console.log(`   ✅ ${interaction.user.username} vérifié`);
        } catch (err) {
            console.log(`   ❌ Erreur vérification: ${err.message}`);
            await interaction.reply({
                content: isOriginalGuild ? '❌ Erreur lors de la vérification. Contacte un admin.' : '❌ Error during verification. Contact an admin.',
                ephemeral: true,
            });
        }
    }

    // ──── 🎫 OUVRIR UN TICKET ────
    if (customId === 'create_ticket' || customId === 'create_ticket_adomination') {
        console.log(`🎫 Ticket demandé par: ${interaction.user.username}`);
        const isOriginalGuild = interaction.guild.id === '1492264434003873973';

        const ticketCategory = interaction.guild.channels.cache.find(
            c => c.name.toLowerCase().includes('support') && c.type === ChannelType.GuildCategory
        );

        if (!ticketCategory) {
            return interaction.reply({
                content: isOriginalGuild ? '❌ Catégorie Support non trouvée. Contacte un admin.' : '❌ Support category not found. Contact an admin.',
                ephemeral: true,
            });
        }

        // Vérifier les tickets existants
        const existingTicket = interaction.guild.channels.cache.find(
            c => c.name === `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '-')}`
        );

        if (existingTicket) {
            return interaction.reply({
                content: isOriginalGuild 
                    ? `❌ Tu as déjà un ticket ouvert : ${existingTicket}\nFerme-le avant d'en ouvrir un nouveau.`
                    : `❌ You already have an open ticket: ${existingTicket}\nClose it before opening a new one.`,
                ephemeral: true,
            });
        }

        try {
            // Trouver les rôles staff
            const staffRoles = interaction.guild.roles.cache.filter(
                r => r.name.includes('King') || r.name.includes('Admin') || r.name.includes('Modo') || r.name.includes('Empress') || r.name.includes('Commander')
            );

            const permissionOverwrites = [
                // @everyone ne peut pas voir
                {
                    id: interaction.guild.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                // L'auteur du ticket peut voir et écrire
                {
                    id: interaction.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles,
                    ],
                },
            ];

            // Le staff peut aussi voir
            staffRoles.forEach(role => {
                permissionOverwrites.push({
                    id: role.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.ManageMessages,
                    ],
                });
            });

            const ticketChannel = await interaction.guild.channels.create({
                name: `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
                type: ChannelType.GuildText,
                parent: ticketCategory.id,
                topic: isOriginalGuild ? `🎫 Ticket de ${interaction.user.username}` : `🎫 Ticket of ${interaction.user.username}`,
                permissionOverwrites,
            });

            // Message dans le ticket
            const closeRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel(isOriginalGuild ? '🔒 Fermer le ticket' : '🔒 Close Ticket')
                    .setStyle(ButtonStyle.Danger)
            );

            const ticketEmbed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle(isOriginalGuild ? `🎫 Ticket de ${interaction.user.username}` : `🎫 Ticket of ${interaction.user.username}`)
                .setDescription(
                    isOriginalGuild
                        ? `Salut ${interaction.user} !\n\nUn membre du **staff** va te répondre sous peu.\n\n📝 **Décris ton problème** en détail pour qu'on puisse t'aider.\n\n🔒 Pour fermer ce ticket, clique sur le bouton ci-dessous.`
                        : `Hello ${interaction.user}!\n\nA member of the **Staff** will assist you shortly.\n\n📝 **Describe your issue** in detail so we can help you.\n\n🔒 To close this ticket, click the button below.`
                )
                .setFooter({ text: isOriginalGuild ? '🎫 Système de tickets' : '🎫 Ticket System' })
                .setTimestamp();

            await ticketChannel.send({
                content: `${interaction.user} | Staff: ${staffRoles.map(r => `${r}`).join(' ')}`,
                embeds: [ticketEmbed],
                components: [closeRow],
            });

            await interaction.reply({
                content: isOriginalGuild ? `✅ **Ticket créé !** → ${ticketChannel}` : `✅ **Ticket created!** → ${ticketChannel}`,
                ephemeral: true,
            });

            console.log(`   ✅ Ticket créé: ${ticketChannel.name}`);
        } catch (err) {
            console.log(`   ❌ Erreur ticket: ${err.message}`);
            await interaction.reply({
                content: isOriginalGuild ? '❌ Erreur lors de la création du ticket.' : '❌ Error creating support ticket.',
                ephemeral: true,
            });
        }
    }

    // ──── 🔒 FERMER UN TICKET ────
    if (customId === 'close_ticket') {
        if (!interaction.channel.name.startsWith('ticket-')) return;

        console.log(`🔒 Fermeture ticket: ${interaction.channel.name}`);
        const isOriginalGuild = interaction.guild.id === '1492264434003873973';

        const embed = new EmbedBuilder()
            .setColor('#E74C3C')
            .setTitle(isOriginalGuild ? '🔒 Ticket fermé' : '🔒 Ticket Closed')
            .setDescription(
                isOriginalGuild
                    ? `Ticket fermé par **${interaction.user.username}**.\n\nCe salon sera supprimé dans **5 secondes**...`
                    : `Ticket closed by **${interaction.user.username}**.\n\nThis channel will be deleted in **5 seconds**...`
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        setTimeout(async () => {
            try {
                await interaction.channel.delete();
                console.log(`   ✅ Ticket supprimé`);
            } catch (err) {
                console.log(`   ❌ Erreur suppression: ${err.message}`);
            }
        }, 5000);
    }
});

// ═══════════════════════════════════════
// 📺 DÉTECTION TWITCH LIVE (PRESENCE)
// ═══════════════════════════════════════
client.on('presenceUpdate', async (oldPresence, newPresence) => {
    if (!newPresence || !newPresence.activities) return;

    const member = newPresence.member;
    if (!member || member.user.bot) return;

    const isStreaming = newPresence.activities.some(
        a => a.type === ActivityType.Streaming
    );
    const wasStreaming = oldPresence?.activities?.some(
        a => a.type === ActivityType.Streaming
    ) || false;

    const userId = member.user.id;

    // Commence un stream
    if (isStreaming && !wasStreaming && !currentlyStreaming.has(userId)) {
        currentlyStreaming.add(userId);
        console.log(`📺 ${member.user.username} est en live !`);

        const streamActivity = newPresence.activities.find(
            a => a.type === ActivityType.Streaming
        );

        const twitchChannel = newPresence.guild.channels.cache.find(
            c => c.name.includes('twitch-live') && c.type === ChannelType.GuildText
        );
        const twitchRole = newPresence.guild.roles.cache.find(
            r => r.name.includes('Twitch')
        );

        if (!twitchChannel || !streamActivity) return;

        const embed = new EmbedBuilder()
            .setColor('#9146FF')
            .setAuthor({
                name: `${member.user.username} est en live !`,
                iconURL: member.user.displayAvatarURL({ dynamic: true }),
            })
            .setTitle(`🔴 ${streamActivity.details || 'Stream en cours !'}`)
            .setDescription(
                (streamActivity.state ? `🎮 **Jeu:** ${streamActivity.state}\n\n` : '') +
                (streamActivity.url ? `📺 **[Regarder le stream](${streamActivity.url})**` : '')
            )
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setFooter({ text: '📺 Twitch • En direct' })
            .setTimestamp();

        try {
            const ping = twitchRole ? `${twitchRole} ` : '';
            await twitchChannel.send({
                content: `${ping}🔴 **${member.user.username}** est en live !`,
                embeds: [embed],
            });
            console.log(`   ✅ Notification Twitch envoyée`);
        } catch (err) {
            console.log(`   ❌ Erreur Twitch: ${err.message}`);
        }
    }

    // Arrête le stream
    if (!isStreaming && wasStreaming) {
        currentlyStreaming.delete(userId);
        console.log(`📺 ${member.user.username} a arrêté le stream`);
    }
});

// ═══════════════════════════════════════
// GESTION DES ERREURS
// ═══════════════════════════════════════
client.on('error', (error) => {
    console.error('❌ Erreur client:', error.message);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ Erreur non gérée:', error.message);
});

// ═══════════════════════════════════════
// SERVEUR HTTP (keep-alive pour Render)
// ═══════════════════════════════════════
const http = require('http');
const https = require('https');
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'online',
        bot: client.user?.tag || 'starting...',
        uptime: Math.floor(process.uptime()),
        guilds: client.guilds?.cache?.size || 0,
    }));
}).listen(PORT, () => {
    console.log(`🌐 Health check: http://localhost:${PORT}`);
});

// ═══════════════════════════════════════
// 🔄 AUTO-PING (empêche Render de s'éteindre)
// ═══════════════════════════════════════
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
    setInterval(() => {
        https.get(RENDER_URL, (res) => {
            console.log(`🔄 Auto-ping: ${res.statusCode}`);
        }).on('error', () => {});
    }, 10 * 60 * 1000); // Toutes les 10 minutes
    console.log(`🔄 Auto-ping activé: ${RENDER_URL}`);
}

// ═══════════════════════════════════════
// CONNEXION
// ═══════════════════════════════════════
console.log(`\n🚀 Démarrage du bot...\n`);
client.login(TOKEN).catch((error) => {
    console.error(`❌ Connexion impossible: ${error.message}`);
    console.error(`💡 Vérifie que le token est correct.`);
    process.exit(1);
});

