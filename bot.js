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
        c => c.name.includes('bienvenue') && c.type === ChannelType.GuildText
    );
    if (!welcomeChannel) return console.log('   ⚠️ Salon bienvenue non trouvé');

    const verifyChannel = member.guild.channels.cache.find(
        c => c.name.includes('vérification') || c.name.includes('verification')
    );

    const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setAuthor({
            name: `${member.user.username} vient d'arriver !`,
            iconURL: member.user.displayAvatarURL({ dynamic: true }),
        })
        .setTitle('👋 Bienvenue !')
        .setDescription(
            `Hey ${member}, bienvenue sur **${member.guild.name}** ! 🎉\n\n` +
            `Tu es notre **${member.guild.memberCount}ème** membre !\n\n` +
            (verifyChannel ? `✅ Vérifie-toi dans ${verifyChannel} pour accéder au serveur.` : '📜 Lis les règles pour commencer !')
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 512 }))
        .setFooter({ text: `Membre #${member.guild.memberCount}` })
        .setTimestamp();

    try {
        await welcomeChannel.send({ content: `${member}`, embeds: [embed] });
        console.log(`   ✅ Message de bienvenue envoyé`);
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
            c => (c.name.includes('annonces') || c.name.includes('général')) && c.type === ChannelType.GuildText
        );
        if (!announceChannel) return;

        const boostLevel = newMember.guild.premiumTier;
        const boostCount = newMember.guild.premiumSubscriptionCount || 0;
        const levelNames = ['Aucun', 'Niveau 1', 'Niveau 2', 'Niveau 3'];

        const embed = new EmbedBuilder()
            .setColor('#F47FFF')
            .setTitle('🚀 NOUVEAU BOOST !')
            .setDescription(
                `**${newMember.user.username}** vient de booster le serveur ! 💜✨\n\n` +
                `Merci pour ton soutien, tu es incroyable ! 🎉\n\n` +
                `📊 **Stats de boost:**\n` +
                `> 💎 Boosts totaux: **${boostCount}**\n` +
                `> 🏆 Niveau: **${levelNames[boostLevel] || boostLevel}**`
            )
            .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setFooter({ text: '💜 Merci pour le boost !' })
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
    'role_gamer':     '🎮 Gamer',
    'role_weeb':      '📺 Weeb',
    'role_melomane':  '🎵 Mélomane',
    'role_streameur': '🎬 Streameur',
    'role_artiste':   '🎨 Artiste',
    'role_twitch':    '🔔 Twitch',
    'role_clown':     '🤡 Clown',
    'role_toxic':     '🐍 Toxic',
    'role_afk':       '😴 AFK',
};

// ═══════════════════════════════════════
// 🎫 ✅ 🎭 GESTION DES BOUTONS (INTERACTIONS)
// ═══════════════════════════════════════
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const { customId } = interaction;

    // ──── 🎭 SELF-ROLES (toggle) ────
    if (customId.startsWith('role_')) {
        const roleName = SELF_ROLE_MAP[customId];
        if (!roleName) return;

        const role = interaction.guild.roles.cache.find(r => r.name === roleName);
        if (!role) {
            return interaction.reply({
                content: `❌ Rôle **${roleName}** non trouvé.`,
                ephemeral: true,
            });
        }

        try {
            if (interaction.member.roles.cache.has(role.id)) {
                // Retirer le rôle
                await interaction.member.roles.remove(role);
                await interaction.reply({
                    content: `❌ Rôle **${roleName}** retiré !`,
                    ephemeral: true,
                });
                console.log(`🎭 ${interaction.user.username} → -${roleName}`);
            } else {
                // Ajouter le rôle
                await interaction.member.roles.add(role);
                await interaction.reply({
                    content: `✅ Rôle **${roleName}** ajouté !`,
                    ephemeral: true,
                });
                console.log(`🎭 ${interaction.user.username} → +${roleName}`);
            }
        } catch (err) {
            console.log(`   ❌ Erreur self-role: ${err.message}`);
            await interaction.reply({
                content: '❌ Erreur lors du changement de rôle.',
                ephemeral: true,
            });
        }
        return;
    }

    // ──── ✅ VÉRIFICATION ────
    if (customId === 'verify') {
        console.log(`✅ Vérification de: ${interaction.user.username}`);

        const verifiedRole = interaction.guild.roles.cache.find(
            r => r.name.includes('Verified')
        );

        if (!verifiedRole) {
            return interaction.reply({
                content: '❌ Rôle Verified non trouvé. Contacte un admin.',
                ephemeral: true,
            });
        }

        // Vérifier si déjà vérifié
        if (interaction.member.roles.cache.has(verifiedRole.id)) {
            return interaction.reply({
                content: '✅ Tu es déjà vérifié !',
                ephemeral: true,
            });
        }

        try {
            await interaction.member.roles.add(verifiedRole);
            await interaction.reply({
                content: '✅ **Tu es maintenant vérifié !** Bienvenue sur le serveur ! 🎉\nTu as maintenant accès à tous les salons.',
                ephemeral: true,
            });
            console.log(`   ✅ ${interaction.user.username} vérifié`);
        } catch (err) {
            console.log(`   ❌ Erreur vérification: ${err.message}`);
            await interaction.reply({
                content: '❌ Erreur lors de la vérification. Contacte un admin.',
                ephemeral: true,
            });
        }
    }

    // ──── 🎫 OUVRIR UN TICKET ────
    if (customId === 'create_ticket') {
        console.log(`🎫 Ticket demandé par: ${interaction.user.username}`);

        const ticketCategory = interaction.guild.channels.cache.find(
            c => c.name.toLowerCase().includes('support') && c.type === ChannelType.GuildCategory
        );

        if (!ticketCategory) {
            return interaction.reply({
                content: '❌ Catégorie Support non trouvée. Contacte un admin.',
                ephemeral: true,
            });
        }

        // Vérifier les tickets existants
        const existingTicket = interaction.guild.channels.cache.find(
            c => c.name === `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '-')}`
        );

        if (existingTicket) {
            return interaction.reply({
                content: `❌ Tu as déjà un ticket ouvert : ${existingTicket}\nFerme-le avant d'en ouvrir un nouveau.`,
                ephemeral: true,
            });
        }

        try {
            // Trouver les rôles staff
            const staffRoles = interaction.guild.roles.cache.filter(
                r => r.name.includes('King') || r.name.includes('Admin') || r.name.includes('Modo')
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
                topic: `🎫 Ticket de ${interaction.user.username}`,
                permissionOverwrites,
            });

            // Message dans le ticket
            const closeRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('close_ticket')
                    .setLabel('🔒 Fermer le ticket')
                    .setStyle(ButtonStyle.Danger)
            );

            const ticketEmbed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle(`🎫 Ticket de ${interaction.user.username}`)
                .setDescription(
                    `Salut ${interaction.user} !\n\n` +
                    `Un membre du **staff** va te répondre sous peu.\n\n` +
                    `📝 **Décris ton problème** en détail pour qu'on puisse t'aider.\n\n` +
                    `🔒 Pour fermer ce ticket, clique sur le bouton ci-dessous.`
                )
                .setFooter({ text: '🎫 Système de tickets' })
                .setTimestamp();

            await ticketChannel.send({
                content: `${interaction.user} | Staff: ${staffRoles.map(r => `${r}`).join(' ')}`,
                embeds: [ticketEmbed],
                components: [closeRow],
            });

            await interaction.reply({
                content: `✅ **Ticket créé !** → ${ticketChannel}`,
                ephemeral: true,
            });

            console.log(`   ✅ Ticket créé: ${ticketChannel.name}`);
        } catch (err) {
            console.log(`   ❌ Erreur ticket: ${err.message}`);
            await interaction.reply({
                content: '❌ Erreur lors de la création du ticket.',
                ephemeral: true,
            });
        }
    }

    // ──── 🔒 FERMER UN TICKET ────
    if (customId === 'close_ticket') {
        if (!interaction.channel.name.startsWith('ticket-')) return;

        console.log(`🔒 Fermeture ticket: ${interaction.channel.name}`);

        const embed = new EmbedBuilder()
            .setColor('#E74C3C')
            .setTitle('🔒 Ticket fermé')
            .setDescription(
                `Ticket fermé par **${interaction.user.username}**.\n\n` +
                `Ce salon sera supprimé dans **5 secondes**...`
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

