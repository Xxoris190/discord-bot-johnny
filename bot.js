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
    REST,
    Routes,
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

const fs = require('fs');
const path = require('path');

// Storage files
const XP_FILE = path.join(__dirname, 'xp.json');
const GIVEAWAYS_FILE = path.join(__dirname, 'giveaways.json');
const WARNINGS_FILE = path.join(__dirname, 'warnings.json');

// Memory databases
let xpDb = {};
let giveawaysDb = {};
let warningsDb = {};

// Load Databases
function loadDbs() {
    try {
        if (fs.existsSync(XP_FILE)) {
            xpDb = JSON.parse(fs.readFileSync(XP_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading XP database:', e);
    }
    try {
        if (fs.existsSync(GIVEAWAYS_FILE)) {
            giveawaysDb = JSON.parse(fs.readFileSync(GIVEAWAYS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading Giveaways database:', e);
    }
    try {
        if (fs.existsSync(WARNINGS_FILE)) {
            warningsDb = JSON.parse(fs.readFileSync(WARNINGS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading Warnings database:', e);
    }
}

function saveXp() {
    try {
        fs.writeFileSync(XP_FILE, JSON.stringify(xpDb, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving XP database:', e);
    }
}

function saveGiveaways() {
    try {
        fs.writeFileSync(GIVEAWAYS_FILE, JSON.stringify(giveawaysDb, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving Giveaways database:', e);
    }
}

function saveWarnings() {
    try {
        fs.writeFileSync(WARNINGS_FILE, JSON.stringify(warningsDb, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving Warnings database:', e);
    }
}

loadDbs();

// ═══════════════════════════════════════
// BOT PRÊT
// ═══════════════════════════════════════
client.once('ready', async () => {
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
    console.log(`   Slash Commands (Commandes d'application)`);
    console.log(`\n📋 En attente d'événements...\n`);

    // Status du bot
    client.user.setActivity('le serveur 👀', { type: ActivityType.Watching });

    // Reprendre les giveaways actifs
    try {
        resumeActiveGiveaways();
    } catch (e) {
        console.error('Erreur lors de la reprise des giveaways:', e.message);
    }

    // Enregistrer les Slash Commands
    await registerSlashCommands();

    // Initial UTD updates and interval (every 6 hours)
    try {
        await runUTDUpdates();
    } catch (e) {
        console.error('Error during initial UTD update:', e.message);
    }
    setInterval(() => {
        runUTDUpdates().catch(e => console.error('Error in scheduled UTD update:', e.message));
    }, 6 * 60 * 60 * 1000);
});

async function registerSlashCommands() {
    try {
        const commands = [
            {
                name: 'rank',
                description: 'Affiche ton niveau/rank ou celui d\'un autre membre / Shows your level/rank or another member\'s',
                options: [
                    {
                        name: 'user',
                        type: 6, // USER type
                        description: 'Le membre à vérifier / The member to check',
                        required: false
                    }
                ]
            },
            {
                name: 'leaderboard',
                description: 'Affiche le classement des membres les plus actifs / Shows the server leaderboard'
            },
            {
                name: 'giveaway',
                description: 'Lance un concours (giveaway) sur le serveur / Starts a giveaway',
                options: [
                    {
                        name: 'duration',
                        type: 3, // STRING
                        description: 'Durée (ex: 10m, 1h, 1d) / Duration (e.g. 10m, 1h, 1d)',
                        required: true
                    },
                    {
                        name: 'winners',
                        type: 4, // INTEGER
                        description: 'Nombre de gagnants / Number of winners',
                        required: true
                    },
                    {
                        name: 'prize',
                        type: 3, // STRING
                        description: 'La récompense / The prize',
                        required: true
                    },
                    {
                        name: 'required_level',
                        type: 4, // INTEGER
                        description: 'Niveau minimum requis (optionnel) / Required level (optional)',
                        required: false
                    }
                ]
            },
            {
                name: 'reroll',
                description: 'Relance le tirage d\'un giveaway terminé / Draws a new winner for a completed giveaway',
                options: [
                    {
                        name: 'message_id',
                        type: 3, // STRING
                        description: 'ID du message du giveaway / The giveaway message ID',
                        required: true
                    }
                ]
            },
            {
                name: 'ban',
                description: 'Bannit un membre du serveur / Bans a member from the server',
                default_member_permissions: PermissionFlagsBits.BanMembers.toString(),
                options: [
                    {
                        name: 'user',
                        type: 6, // USER type
                        description: 'Le membre à bannir / The member to ban',
                        required: true
                    },
                    {
                        name: 'reason',
                        type: 3, // STRING type
                        description: 'Raison du bannissement / Reason for the ban',
                        required: false
                    }
                ]
            },
            {
                name: 'kick',
                description: 'Exclut un membre du serveur / Kicks a member from the server',
                default_member_permissions: PermissionFlagsBits.KickMembers.toString(),
                options: [
                    {
                        name: 'user',
                        type: 6, // USER type
                        description: 'Le membre à exclure / The member to kick',
                        required: true
                    },
                    {
                        name: 'reason',
                        type: 3, // STRING type
                        description: 'Raison de l\'exclusion / Reason for the kick',
                        required: false
                    }
                ]
            },
            {
                name: 'mute',
                description: 'Met en sourdine un membre (timeout natif) / Mutes a member (native timeout)',
                default_member_permissions: PermissionFlagsBits.ModerateMembers.toString(),
                options: [
                    {
                        name: 'user',
                        type: 6, // USER type
                        description: 'Le membre à rendre muet / The member to mute',
                        required: true
                    },
                    {
                        name: 'duration',
                        type: 3, // STRING type
                        description: 'Durée (ex: 10m, 1h, 1d) / Duration (e.g. 10m, 1h, 1d)',
                        required: true
                    },
                    {
                        name: 'reason',
                        type: 3, // STRING type
                        description: 'Raison de la sourdine / Reason for the mute',
                        required: false
                    }
                ]
            },
            {
                name: 'unmute',
                description: 'Retire la sourdine d\'un membre / Unmutes a member',
                default_member_permissions: PermissionFlagsBits.ModerateMembers.toString(),
                options: [
                    {
                        name: 'user',
                        type: 6, // USER type
                        description: 'Le membre à démute / The member to unmute',
                        required: true
                    },
                    {
                        name: 'reason',
                        type: 3, // STRING type
                        description: 'Raison du démute / Reason for the unmute',
                        required: false
                    }
                ]
            },
            {
                name: 'warn',
                description: 'Donne un avertissement à un membre / Warns a member',
                default_member_permissions: PermissionFlagsBits.ModerateMembers.toString(),
                options: [
                    {
                        name: 'user',
                        type: 6, // USER type
                        description: 'Le membre à avertir / The member to warn',
                        required: true
                    },
                    {
                        name: 'reason',
                        type: 3, // STRING type
                        description: 'Raison de l\'avertissement / Reason for the warning',
                        required: true
                    }
                ]
            },
            {
                name: 'warnings',
                description: 'Affiche les avertissements d\'un membre / Shows warnings of a member',
                default_member_permissions: PermissionFlagsBits.ModerateMembers.toString(),
                options: [
                    {
                        name: 'user',
                        type: 6, // USER type
                        description: 'Le membre à vérifier / The member to check',
                        required: true
                    }
                ]
            },
            {
                name: 'clearwarns',
                description: 'Efface les avertissements d\'un membre / Clears warnings of a member',
                default_member_permissions: PermissionFlagsBits.ModerateMembers.toString(),
                options: [
                    {
                        name: 'user',
                        type: 6, // USER type
                        description: 'Le membre à nettoyer / The member to clear',
                        required: true
                    }
                ]
            },
            {
                name: 'lock',
                description: 'Verrouille un salon textuel / Locks a text channel',
                default_member_permissions: PermissionFlagsBits.ManageChannels.toString(),
                options: [
                    {
                        name: 'channel',
                        type: 7, // CHANNEL type
                        description: 'Le salon à verrouiller (par défaut, celui-ci) / Channel to lock (default: current)',
                        required: false
                    },
                    {
                        name: 'reason',
                        type: 3, // STRING type
                        description: 'Raison du verrouillage / Reason for the lock',
                        required: false
                    }
                ]
            },
            {
                name: 'unlock',
                description: 'Déverrouille un salon textuel / Unlocks a text channel',
                default_member_permissions: PermissionFlagsBits.ManageChannels.toString(),
                options: [
                    {
                        name: 'channel',
                        type: 7, // CHANNEL type
                        description: 'Le salon à déverrouiller (par défaut, celui-ci) / Channel to unlock (default: current)',
                        required: false
                    },
                    {
                        name: 'reason',
                        type: 3, // STRING type
                        description: 'Raison du déverrouillage / Reason for the unlock',
                        required: false
                    }
                ]
            },
            {
                name: 'refresh-utd',
                description: 'Force a refresh of the UTD codes and tier list channels / Force une mise à jour des salons UTD'
            }
        ];

        console.log('🔄 Enregistrement des commandes d\'application (Slash Commands)...');
        const rest = new REST({ version: '10' }).setToken(TOKEN);
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('✅ Commandes d\'application (Slash Commands) enregistrées.');
    } catch (err) {
        console.error('❌ Erreur lors de l\'enregistrement des Slash Commands:', err.message);
    }
}

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
    'toggle_story_ping': '🔔 Story & Legend',
    'toggle_raids_ping': '🔔 Raids',
    'toggle_vr_ping':    '🔔 Virtual Realm',
};

function getModLogChannel(guild) {
    let ch = guild.channels.cache.find(
        c => (c.name === '📋-logs' || c.name === '⚙️-staff-bot-logs' || c.name === 'mod-logs' || c.name === 'moderation-logs') && c.type === ChannelType.GuildText
    );
    if (ch) return ch;

    ch = guild.channels.cache.find(
        c => (c.name.includes('staff-bot-logs') || c.name.includes('mod-log')) && c.type === ChannelType.GuildText
    );
    if (ch) return ch;

    ch = guild.channels.cache.find(
        c => c.name.includes('logs') && !c.name.includes('ticket') && c.type === ChannelType.GuildText
    );
    return ch || null;
}

async function sendModLog(guild, actionName, targetUser, moderator, reason, extraFields = [], color = '#3498DB') {
    const logChannel = getModLogChannel(guild);
    if (!logChannel) return console.log(`   ⚠️ Salon de mod-logs non trouvé sur le serveur ${guild.name}`);

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`🛡️ Action de Modération : ${actionName}`)
        .setDescription(`Une action de modération a été effectuée.`)
        .addFields(
            { name: '👤 Cible / Target', value: `${targetUser} (${targetUser.tag || targetUser.username})\nID: \`${targetUser.id}\``, inline: true },
            { name: '🛡️ Modérateur / Moderator', value: `${moderator} (${moderator.tag || moderator.username})\nID: \`${moderator.id}\``, inline: true },
            { name: '📝 Raison / Reason', value: reason || 'Aucune raison fournie / No reason provided' }
        )
        .setTimestamp();

    if (extraFields && extraFields.length > 0) {
        embed.addFields(extraFields);
    }

    try {
        await logChannel.send({ embeds: [embed] });
        console.log(`   ✅ Log de modération envoyé dans #${logChannel.name}`);
    } catch (err) {
        console.error(`   ❌ Impossible d'envoyer le log de modération:`, err.message);
    }
}

// ═══════════════════════════════════════
// 🎫 ✅ 🎭 GESTION DES BOUTONS (INTERACTIONS)
// ═══════════════════════════════════════
client.on('interactionCreate', async (interaction) => {
    // ──── COMMANDES D'APPLICATION (SLASH COMMANDS) ────
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        const guildId = interaction.guildId;
        const userId = interaction.user.id;
        const isOriginalGuild = guildId === '1492264434003873973';

        // 1. RANK COMMAND
        if (commandName === 'rank') {
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const targetId = targetUser.id;

            if (!xpDb[guildId] || !xpDb[guildId][targetId]) {
                xpDb[guildId] = xpDb[guildId] || {};
                xpDb[guildId][targetId] = { xp: 0, level: 0 };
            }

            const data = xpDb[guildId][targetId];
            const nextLevelXp = (data.level + 1) * 150;
            const progress = Math.min(100, Math.floor((data.xp / nextLevelXp) * 100));

            const embed = new EmbedBuilder()
                .setColor(isOriginalGuild ? '#3498DB' : '#00E5FF')
                .setAuthor({ name: targetUser.username, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
                .setTitle(isOriginalGuild ? '🏆 Ton Niveau / Rank' : '🏆 Your Level / Rank')
                .addFields(
                    { name: isOriginalGuild ? 'Niveau' : 'Level', value: `✨ **${data.level}**`, inline: true },
                    { name: 'XP', value: `📊 **${data.xp} / ${nextLevelXp}**`, inline: true },
                    { name: isOriginalGuild ? 'Progression' : 'Progress', value: `\`[${'■'.repeat(Math.floor(progress / 10))}${'░'.repeat(10 - Math.floor(progress / 10))}]\` **${progress}%**` }
                )
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        // 2. LEADERBOARD COMMAND
        if (commandName === 'leaderboard') {
            if (!xpDb[guildId] || Object.keys(xpDb[guildId]).length === 0) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Aucun membre enregistré pour le moment.' : '❌ No members recorded yet.',
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            const sorted = Object.entries(xpDb[guildId])
                .map(([uid, udata]) => ({ uid, ...udata }))
                .sort((a, b) => b.level - a.level || b.xp - a.xp)
                .slice(0, 10);

            const leaderboardList = [];
            for (let i = 0; i < sorted.length; i++) {
                const entry = sorted[i];
                let userTag = `<@${entry.uid}>`;
                try {
                    const member = await interaction.guild.members.fetch(entry.uid);
                    userTag = `**${member.user.username}**`;
                } catch (e) {}

                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
                leaderboardList.push(`${medal} | ${userTag} - Lvl **${entry.level}** (${entry.xp} XP)`);
            }

            const embed = new EmbedBuilder()
                .setColor(isOriginalGuild ? '#E67E22' : '#F1C40F')
                .setTitle(isOriginalGuild ? '🏆 Classement du Serveur' : '🏆 Server Leaderboard')
                .setDescription(leaderboardList.join('\n') || 'No members listed.')
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        const isStaff = interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
                        interaction.member.roles.cache.some(r => r.name.includes('King') || r.name.includes('Admin') || r.name.includes('Modo') || r.name.includes('Empress') || r.name.includes('Commander'));

        // 3. GIVEAWAY COMMAND
        if (commandName === 'giveaway') {
            if (!isStaff) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Tu n\'as pas la permission de lancer un giveaway.' : '❌ You don\'t have permission to start a giveaway.',
                    ephemeral: true
                });
            }

            const durationStr = interaction.options.getString('duration');
            const winnersCount = interaction.options.getInteger('winners');
            let prize = interaction.options.getString('prize');
            const requiredLevel = interaction.options.getInteger('required_level') || 0;

            if (winnersCount <= 0) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Nombre de gagnants invalide.' : '❌ Invalid number of winners.',
                    ephemeral: true
                });
            }

            const ms = parseDuration(durationStr);
            if (!ms || ms < 5000) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Durée invalide (minimum 5s).' : '❌ Invalid duration (minimum 5s).',
                    ephemeral: true
                });
            }

            const giveawayChannel = interaction.guild.channels.cache.find(
                c => (c.name.includes('giveaway') || c.name.includes('concours')) && c.type === ChannelType.GuildText
            ) || interaction.channel;

            const endTimestamp = Date.now() + ms;

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`giveaway_join`)
                    .setLabel(isOriginalGuild ? '🎉 Participer' : '🎉 Join')
                    .setStyle(ButtonStyle.Primary)
            );

            const embed = new EmbedBuilder()
                .setColor('#9B59B6')
                .setTitle(`🎉 GIVEAWAY: ${prize} 🎉`)
                .setDescription(
                    isOriginalGuild
                        ? `Clique sur le bouton ci-dessous pour participer !\n\n` +
                          (requiredLevel > 0 ? `🔒 **Niveau Requis :** ${requiredLevel}\n` : '') +
                          `🏆 **Gagnant(s) :** ${winnersCount}\n` +
                          `⏳ **Fin :** <t:${Math.floor(endTimestamp / 1000)}:R> (<t:${Math.floor(endTimestamp / 1000)}:F>)\n` +
                          `👥 **Participants :** 0`
                        : `Click the button below to join the giveaway!\n\n` +
                          (requiredLevel > 0 ? `🔒 **Required Level:** ${requiredLevel}\n` : '') +
                          `🏆 **Winner(s):** ${winnersCount}\n` +
                          `⏳ **Ends:** <t:${Math.floor(endTimestamp / 1000)}:R> (<t:${Math.floor(endTimestamp / 1000)}:F>)\n` +
                          `👥 **Participants:** 0`
                )
                .setFooter({ text: isOriginalGuild ? 'Bonne chance !' : 'Good luck!' })
                .setTimestamp();

            try {
                const giveawayMsg = await giveawayChannel.send({ embeds: [embed], components: [row] });
                const giveawayId = giveawayMsg.id;

                giveawaysDb[giveawayId] = {
                    guildId,
                    channelId: giveawayChannel.id,
                    messageId: giveawayId,
                    prize,
                    winnersCount,
                    endTimestamp,
                    participants: [],
                    status: 'active',
                    requiredLevel
                };
                saveGiveaways();

                startGiveawayTimer(giveawayId, ms);

                return interaction.reply({
                    content: isOriginalGuild 
                        ? `✅ Giveaway lancé avec succès dans ${giveawayChannel} !` 
                        : `✅ Giveaway successfully started in ${giveawayChannel}!`,
                    ephemeral: true
                });
            } catch (err) {
                console.error('Error starting giveaway:', err.message);
                return interaction.reply({
                    content: '❌ Error starting giveaway.',
                    ephemeral: true
                });
            }
        }

        // 4. REROLL COMMAND
        if (commandName === 'reroll') {
            if (!isStaff) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Permissions insuffisantes.' : '❌ Insufficient permissions.',
                    ephemeral: true
                });
            }

            const msgId = interaction.options.getString('message_id');
            const gw = giveawaysDb[msgId];
            if (!gw) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Concours introuvable.' : '❌ Giveaway not found.',
                    ephemeral: true
                });
            }

            await interaction.reply(isOriginalGuild ? '🔄 Tirage d\'un nouveau gagnant...' : '🔄 Drawing a new winner...');
            await endGiveaway(msgId, true);
            return;
        }

        // 5. BAN COMMAND
        if (commandName === 'ban') {
            if (!isStaff) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Permissions insuffisantes.' : '❌ Insufficient permissions.',
                    ephemeral: true
                });
            }

            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'Aucune raison fournie / No reason provided';

            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (member) {
                if (!member.bannable) {
                    return interaction.reply({
                        content: isOriginalGuild ? '❌ Impossible de bannir cet utilisateur (permissions du bot insuffisantes ou rôle trop élevé).' : '❌ Cannot ban this user (insufficient bot permissions or role too high).',
                        ephemeral: true
                    });
                }
            }

            try {
                await interaction.guild.members.ban(targetUser.id, { reason });
                
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#E74C3C')
                            .setTitle(isOriginalGuild ? '🔨 Membre banni' : '🔨 Member banned')
                            .setDescription(isOriginalGuild 
                                ? `**${targetUser.username}** a été banni.\n**Raison :** ${reason}`
                                : `**${targetUser.username}** has been banned.\n**Reason:** ${reason}`
                            )
                            .setTimestamp()
                    ]
                });

                await sendModLog(interaction.guild, 'BAN', targetUser, interaction.user, reason, [], '#E74C3C');
            } catch (err) {
                console.error(err);
                return interaction.reply({
                    content: `❌ Erreur : ${err.message}`,
                    ephemeral: true
                });
            }
            return;
        }

        // 6. KICK COMMAND
        if (commandName === 'kick') {
            if (!isStaff) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Permissions insuffisantes.' : '❌ Insufficient permissions.',
                    ephemeral: true
                });
            }

            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'Aucune raison fournie / No reason provided';

            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (!member) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Cet utilisateur n\'est pas sur le serveur.' : '❌ This user is not on the server.',
                    ephemeral: true
                });
            }

            if (!member.kickable) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Impossible d\'exclure cet utilisateur.' : '❌ Cannot kick this user.',
                    ephemeral: true
                });
            }

            try {
                await member.kick(reason);
                
                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#E74C3C')
                            .setTitle(isOriginalGuild ? '🚪 Membre exclu' : '🚪 Member kicked')
                            .setDescription(isOriginalGuild 
                                ? `**${targetUser.username}** a été exclu du serveur.\n**Raison :** ${reason}`
                                : `**${targetUser.username}** has been kicked from the server.\n**Reason:** ${reason}`
                            )
                            .setTimestamp()
                    ]
                });

                await sendModLog(interaction.guild, 'KICK', targetUser, interaction.user, reason, [], '#E74C3C');
            } catch (err) {
                console.error(err);
                return interaction.reply({
                    content: `❌ Erreur : ${err.message}`,
                    ephemeral: true
                });
            }
            return;
        }

        // 7. MUTE COMMAND
        if (commandName === 'mute') {
            if (!isStaff) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Permissions insuffisantes.' : '❌ Insufficient permissions.',
                    ephemeral: true
                });
            }

            const targetUser = interaction.options.getUser('user');
            const durationStr = interaction.options.getString('duration');
            const reason = interaction.options.getString('reason') || 'Aucune raison fournie / No reason provided';

            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (!member) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Cet utilisateur n\'est pas sur le serveur.' : '❌ This user is not on the server.',
                    ephemeral: true
                });
            }

            const ms = parseDuration(durationStr);
            if (!ms) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Durée invalide (ex: 10m, 1h, 1d).' : '❌ Invalid duration (e.g. 10m, 1h, 1d).',
                    ephemeral: true
                });
            }

            if (!member.moderatable) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Impossible de modérer cet utilisateur (permissions du bot insuffisantes).' : '❌ Cannot moderate this user (insufficient bot permissions).',
                    ephemeral: true
                });
            }

            try {
                await member.timeout(ms, reason);

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#E67E22')
                            .setTitle(isOriginalGuild ? '🔇 Membre mis en sourdine' : '🔇 Member muted (timeout)')
                            .setDescription(isOriginalGuild 
                                ? `**${targetUser.username}** a été mis en sourdine pour **${durationStr}**.\n**Raison :** ${reason}`
                                : `**${targetUser.username}** has been muted for **${durationStr}**.\n**Reason:** ${reason}`
                            )
                            .setTimestamp()
                    ]
                });

                await sendModLog(interaction.guild, 'MUTE (TIMEOUT)', targetUser, interaction.user, reason, [
                    { name: '⏳ Durée / Duration', value: durationStr, inline: true }
                ], '#E67E22');
            } catch (err) {
                console.error(err);
                return interaction.reply({
                    content: `❌ Erreur : ${err.message}`,
                    ephemeral: true
                });
            }
            return;
        }

        // 8. UNMUTE COMMAND
        if (commandName === 'unmute') {
            if (!isStaff) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Permissions insuffisantes.' : '❌ Insufficient permissions.',
                    ephemeral: true
                });
            }

            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'Aucune raison fournie / No reason provided';

            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
            if (!member) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Cet utilisateur n\'est pas sur le serveur.' : '❌ This user is not on the server.',
                    ephemeral: true
                });
            }

            if (!member.communicationDisabledUntilTimestamp || member.communicationDisabledUntilTimestamp < Date.now()) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Cet utilisateur n\'est pas en sourdine.' : '❌ This user is not muted.',
                    ephemeral: true
                });
            }

            try {
                await member.timeout(null, reason);

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#2ECC71')
                            .setTitle(isOriginalGuild ? '🔊 Sourdine retirée' : '🔊 Mute removed (untimeout)')
                            .setDescription(isOriginalGuild 
                                ? `La sourdine de **${targetUser.username}** a été retirée.\n**Raison :** ${reason}`
                                : `Mute removed for **${targetUser.username}**.\n**Reason:** ${reason}`
                            )
                            .setTimestamp()
                    ]
                });

                await sendModLog(interaction.guild, 'UNMUTE (UNTIMEOUT)', targetUser, interaction.user, reason, [], '#2ECC71');
            } catch (err) {
                console.error(err);
                return interaction.reply({
                    content: `❌ Erreur : ${err.message}`,
                    ephemeral: true
                });
            }
            return;
        }

        // 9. WARN COMMAND
        if (commandName === 'warn') {
            if (!isStaff) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Permissions insuffisantes.' : '❌ Insufficient permissions.',
                    ephemeral: true
                });
            }

            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason');

            if (targetUser.bot) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Tu ne peux pas avertir un bot.' : '❌ You cannot warn a bot.',
                    ephemeral: true
                });
            }

            if (!warningsDb[guildId]) warningsDb[guildId] = {};
            if (!warningsDb[guildId][targetUser.id]) warningsDb[guildId][targetUser.id] = [];

            const warnObj = {
                reason,
                warnerId: userId,
                timestamp: Date.now()
            };

            warningsDb[guildId][targetUser.id].push(warnObj);
            saveWarnings();

            const totalWarns = warningsDb[guildId][targetUser.id].length;

            // Essayer d'envoyer un MP
            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor('#F1C40F')
                    .setTitle(isOriginalGuild ? `⚠️ Avertissement reçu sur ${interaction.guild.name}` : `⚠️ Warning received on ${interaction.guild.name}`)
                    .setDescription(isOriginalGuild 
                        ? `Tu as reçu un avertissement.\n**Raison :** ${reason}\n\nNombre total d'avertissements : **${totalWarns}**`
                        : `You have received a warning.\n**Reason:** ${reason}\n\nTotal warnings count: **${totalWarns}**`
                    )
                    .setTimestamp();
                await targetUser.send({ embeds: [dmEmbed] });
            } catch (e) {
                console.log(`   ⚠️ Impossible d'envoyer un MP à ${targetUser.username}`);
            }

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#F1C40F')
                        .setTitle(isOriginalGuild ? '⚠️ Membre averti' : '⚠️ Member warned')
                        .setDescription(isOriginalGuild 
                            ? `**${targetUser.username}** a été averti.\n**Raison :** ${reason}\n**Total des warns :** ${totalWarns}`
                            : `**${targetUser.username}** has been warned.\n**Reason:** ${reason}\n**Total warnings:** ${totalWarns}`
                        )
                        .setTimestamp()
                ]
            });

            await sendModLog(interaction.guild, 'WARN', targetUser, interaction.user, reason, [
                { name: '📊 Total Warns', value: String(totalWarns), inline: true }
            ], '#F1C40F');
            return;
        }

        // 10. WARNINGS COMMAND
        if (commandName === 'warnings') {
            if (!isStaff) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Permissions insuffisantes.' : '❌ Insufficient permissions.',
                    ephemeral: true
                });
            }

            const targetUser = interaction.options.getUser('user');
            const targetId = targetUser.id;

            const userWarns = warningsDb[guildId]?.[targetId] || [];

            if (userWarns.length === 0) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#2ECC71')
                            .setTitle(isOriginalGuild ? `📋 Avertissements de ${targetUser.username}` : `📋 Warnings of ${targetUser.username}`)
                            .setDescription(isOriginalGuild ? '✅ Aucun avertissement trouvé pour cet utilisateur.' : '✅ No warnings found for this user.')
                            .setTimestamp()
                    ]
                });
            }

            const embed = new EmbedBuilder()
                .setColor('#F1C40F')
                .setTitle(isOriginalGuild ? `📋 Avertissements de ${targetUser.username} (${userWarns.length})` : `📋 Warnings of ${targetUser.username} (${userWarns.length})`)
                .setTimestamp();

            const fields = userWarns.map((w, idx) => {
                const dateStr = `<t:${Math.floor(w.timestamp / 1000)}:F>`;
                return {
                    name: `Warn #${idx + 1}`,
                    value: isOriginalGuild
                        ? `📅 **Date :** ${dateStr}\n🛡️ **Modérateur :** <@${w.warnerId}>\n📝 **Raison :** ${w.reason}`
                        : `📅 **Date:** ${dateStr}\n🛡️ **Moderator:** <@${w.warnerId}>\n📝 **Reason:** ${w.reason}`
                };
            });

            embed.addFields(fields);
            return interaction.reply({ embeds: [embed] });
        }

        // 11. CLEARWARNS COMMAND
        if (commandName === 'clearwarns') {
            if (!isStaff) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Permissions insuffisantes.' : '❌ Insufficient permissions.',
                    ephemeral: true
                });
            }

            const targetUser = interaction.options.getUser('user');
            const targetId = targetUser.id;

            const userWarns = warningsDb[guildId]?.[targetId] || [];
            if (userWarns.length === 0) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Cet utilisateur n\'a aucun avertissement.' : '❌ This user has no warnings.',
                    ephemeral: true
                });
            }

            delete warningsDb[guildId][targetId];
            saveWarnings();

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#2ECC71')
                        .setTitle(isOriginalGuild ? '🧹 Avertissements effacés' : '🧹 Warnings cleared')
                        .setDescription(isOriginalGuild 
                            ? `Tous les avertissements de **${targetUser.username}** ont été effacés.`
                            : `All warnings for **${targetUser.username}** have been cleared.`
                        )
                        .setTimestamp()
                ]
            });

            await sendModLog(interaction.guild, 'CLEAR WARNS', targetUser, interaction.user, 'Avertissements effacés par le modérateur / Warnings cleared by moderator', [
                { name: '🧹 Nombre de warns supprimés / Cleared count', value: String(userWarns.length), inline: true }
            ], '#2ECC71');
            return;
        }

        // 12. LOCK COMMAND
        if (commandName === 'lock') {
            if (!isStaff) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Permissions insuffisantes.' : '❌ Insufficient permissions.',
                    ephemeral: true
                });
            }

            const channel = interaction.options.getChannel('channel') || interaction.channel;
            const reason = interaction.options.getString('reason') || 'Aucune raison fournie / No reason provided';

            if (channel.type !== ChannelType.GuildText) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Tu ne peux verrouiller que des salons textuels.' : '❌ You can only lock text channels.',
                    ephemeral: true
                });
            }

            try {
                // Verrouiller pour @everyone
                await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                    SendMessages: false
                });

                // Verrouiller pour le rôle vérifié si présent
                const roleName = isOriginalGuild ? 'Verified' : '🎵 Adominated';
                const verifiedRole = interaction.guild.roles.cache.find(
                    r => r.name.includes(roleName) || r.name.includes('Verified')
                );
                if (verifiedRole) {
                    await channel.permissionOverwrites.edit(verifiedRole, {
                        SendMessages: false
                    });
                }

                await interaction.reply({
                    content: isOriginalGuild ? `✅ Salon ${channel} verrouillé avec succès.` : `✅ Channel ${channel} successfully locked.`,
                    ephemeral: true
                });

                const lockEmbed = new EmbedBuilder()
                    .setColor('#E74C3C')
                    .setTitle(isOriginalGuild ? '🔒 Salon verrouillé' : '🔒 Channel locked')
                    .setDescription(isOriginalGuild
                        ? `Ce salon a été verrouillé par un membre du staff.\n**Raison :** ${reason}`
                        : `This channel has been locked by a staff member.\n**Reason:** ${reason}`
                    )
                    .setTimestamp();
                
                await channel.send({ embeds: [lockEmbed] });

                await sendModLog(interaction.guild, 'LOCK', channel, interaction.user, reason, [], '#E74C3C');
            } catch (err) {
                console.error(err);
                return interaction.reply({
                    content: `❌ Erreur : ${err.message}`,
                    ephemeral: true
                });
            }
            return;
        }

        // 13. UNLOCK COMMAND
        if (commandName === 'unlock') {
            if (!isStaff) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Permissions insuffisantes.' : '❌ Insufficient permissions.',
                    ephemeral: true
                });
            }

            const channel = interaction.options.getChannel('channel') || interaction.channel;
            const reason = interaction.options.getString('reason') || 'Aucune raison fournie / No reason provided';

            if (channel.type !== ChannelType.GuildText) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Tu ne peux déverrouiller que des salons textuels.' : '❌ You can only unlock text channels.',
                    ephemeral: true
                });
            }

            try {
                // Déverrouiller pour @everyone (remettre à neutral/null pour hériter)
                await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                    SendMessages: null
                });

                // Déverrouiller pour le rôle vérifié si présent (remettre à neutral/null)
                const roleName = isOriginalGuild ? 'Verified' : '🎵 Adominated';
                const verifiedRole = interaction.guild.roles.cache.find(
                    r => r.name.includes(roleName) || r.name.includes('Verified')
                );
                if (verifiedRole) {
                    await channel.permissionOverwrites.edit(verifiedRole, {
                        SendMessages: null
                    });
                }

                await interaction.reply({
                    content: isOriginalGuild ? `✅ Salon ${channel} déverrouillé avec succès.` : `✅ Channel ${channel} successfully unlocked.`,
                    ephemeral: true
                });

                const unlockEmbed = new EmbedBuilder()
                    .setColor('#2ECC71')
                    .setTitle(isOriginalGuild ? '🔓 Salon déverrouillé' : '🔓 Channel unlocked')
                    .setDescription(isOriginalGuild
                        ? `Ce salon a été déverrouillé.\n**Raison :** ${reason}`
                        : `This channel has been unlocked.\n**Reason:** ${reason}`
                    )
                    .setTimestamp();
                
                await channel.send({ embeds: [unlockEmbed] });

                await sendModLog(interaction.guild, 'UNLOCK', channel, interaction.user, reason, [], '#2ECC71');
            } catch (err) {
                console.error(err);
                return interaction.reply({
                    content: `❌ Erreur : ${err.message}`,
                    ephemeral: true
                });
            }
            return;
        }

        // 14. REFRESH-UTD COMMAND
        if (commandName === 'refresh-utd') {
            if (!isStaff) {
                return interaction.reply({
                    content: isOriginalGuild ? '❌ Permissions insuffisantes.' : '❌ Insufficient permissions.',
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });
            try {
                await updateUTDData(interaction.guild);
                return interaction.editReply({
                    content: isOriginalGuild 
                        ? '✅ Les salons de codes et tier lists UTD ont été mis à jour avec succès !'
                        : '✅ UTD codes and tier list channels have been successfully updated!'
                });
            } catch (err) {
                console.error(err);
                return interaction.editReply({
                    content: `❌ Error: ${err.message}`
                });
            }
        }
    }

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

    // ──── 🎉 GIVEAWAY PARTICIPATION (button) ────
    if (customId === 'giveaway_join') {
        const giveawayId = interaction.message.id;
        const gw = giveawaysDb[giveawayId];
        const isOriginalGuild = interaction.guild.id === '1492264434003873973';

        if (!gw || gw.status !== 'active') {
            return interaction.reply({
                content: isOriginalGuild ? '❌ Ce concours est terminé.' : '❌ This giveaway has ended.',
                ephemeral: true
            });
        }

        const userId = interaction.user.id;
        const index = gw.participants.indexOf(userId);

        if (index > -1) {
            // Remove user
            gw.participants.splice(index, 1);
            saveGiveaways();

            await interaction.reply({
                content: isOriginalGuild ? '❌ Tu t\'es retiré du concours.' : '❌ You have left the giveaway.',
                ephemeral: true
            });
        } else {
            // Check level requirement
            const requiredLevel = gw.requiredLevel || 0;
            if (requiredLevel > 0) {
                const userXpData = xpDb[interaction.guild.id]?.[userId] || { level: 0 };
                if (userXpData.level < requiredLevel) {
                    return interaction.reply({
                        content: isOriginalGuild
                            ? `❌ Tu dois être au moins **Niveau ${requiredLevel}** pour participer ! (Ton niveau actuel : ${userXpData.level})`
                            : `❌ You must be at least **Level ${requiredLevel}** to join this giveaway! (Your current level: ${userXpData.level})`,
                        ephemeral: true
                    });
                }
            }

            // Add user
            gw.participants.push(userId);
            saveGiveaways();

            await interaction.reply({
                content: isOriginalGuild ? '🎉 Tu participes maintenant au concours ! Bonne chance !' : '🎉 You have successfully joined the giveaway! Good luck!',
                ephemeral: true
            });
        }

        // Edit original message to update participant count
        const endTimestamp = gw.endTimestamp;
        const reqLvl = gw.requiredLevel || 0;
        const embed = new EmbedBuilder(interaction.message.embeds[0].data);
        embed.setDescription(
            isOriginalGuild
                ? `Clique sur le bouton ci-dessous pour participer !\n\n` +
                  (reqLvl > 0 ? `🔒 **Niveau Requis :** ${reqLvl}\n` : '') +
                  `🏆 **Gagnant(s) :** ${gw.winnersCount}\n` +
                  `⏳ **Fin :** <t:${Math.floor(endTimestamp / 1000)}:R> (<t:${Math.floor(endTimestamp / 1000)}:F>)\n` +
                  `👥 **Participants :** ${gw.participants.length}`
                : `Click the button below to join the giveaway!\n\n` +
                  (reqLvl > 0 ? `🔒 **Required Level:** ${reqLvl}\n` : '') +
                  `🏆 **Winner(s):** ${gw.winnersCount}\n` +
                  `⏳ **Ends:** <t:${Math.floor(endTimestamp / 1000)}:R> (<t:${Math.floor(endTimestamp / 1000)}:F>)\n` +
                  `👥 **Participants:** ${gw.participants.length}`
        );

        await interaction.message.edit({ embeds: [embed] });
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
// 🏆 XP / LEVEL & 🎉 GIVEAWAY SYSTEMS
// ═══════════════════════════════════════
const xpCooldowns = new Map();

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const guildId = message.guild.id;
    const userId = message.author.id;
    const isOriginalGuild = guildId === '1492264434003873973';

    // ─── XP / LEVEL SYSTEM ───
    const chName = message.channel.name.toLowerCase();
    const isAllowedXpChannel = !chName.includes('rules') && 
                               !chName.includes('verify') && 
                               !chName.includes('ticket') && 
                               !chName.includes('roles') && 
                               !chName.includes('announces') && 
                               !chName.includes('announcements') &&
                               !chName.includes('bienvenue') &&
                               !chName.includes('welcome') &&
                               !chName.includes('staff-bot-logs');

    if (isAllowedXpChannel) {
        const now = Date.now();
        const userCooldown = xpCooldowns.get(userId) || 0;
        if (now - userCooldown >= 60000) { // 1 minute cooldown
            xpCooldowns.set(userId, now);

            if (!xpDb[guildId]) xpDb[guildId] = {};
            if (!xpDb[guildId][userId]) xpDb[guildId][userId] = { xp: 0, level: 0 };

            const xpToGained = Math.floor(Math.random() * 11) + 15; // 15-25 XP
            xpDb[guildId][userId].xp += xpToGained;

            const currentXp = xpDb[guildId][userId].xp;
            const currentLevel = xpDb[guildId][userId].level;

            const nextLevelXpNeeded = (currentLevel + 1) * 150;
            if (currentXp >= nextLevelXpNeeded) {
                xpDb[guildId][userId].level += 1;
                const newLevel = xpDb[guildId][userId].level;

                saveXp();

                const levelUpChannel = message.guild.channels.cache.find(
                    c => (c.name.includes('level-ups') || c.name.includes('general') || c.name.includes('général')) && c.type === ChannelType.GuildText
                );

                const mentionText = `${message.author}`;
                const congratMsg = isOriginalGuild 
                    ? `🎉 Félicitations ${mentionText} ! Tu viens de monter au **Niveau ${newLevel}** ! 🚀`
                    : `🎉 Congratulations ${mentionText}! You just leveled up to **Level ${newLevel}**! 🚀`;

                if (levelUpChannel) {
                    try {
                        await levelUpChannel.send(congratMsg);
                    } catch (e) {
                        console.error('Error sending level up message:', e.message);
                    }
                } else {
                    try {
                        await message.channel.send(congratMsg);
                    } catch (e) {}
                }

                // Auto roles assignment
                try {
                    if (!isOriginalGuild) {
                        const levelRolesMapping = [
                            { level: 5, name: '🎵 Vocaloid (Lvl 5)' },
                            { level: 10, name: '🌟 Rising Star (Lvl 10)' },
                            { level: 20, name: '👑 Ado Fanatic (Lvl 20)' },
                            { level: 30, name: '🔥 UTD Legend (Lvl 30)' }
                        ];

                        const roleToAssign = levelRolesMapping.find(r => r.level === newLevel);
                        if (roleToAssign) {
                            const role = message.guild.roles.cache.find(r => r.name.includes(roleToAssign.name));
                            if (role) {
                                await message.member.roles.add(role);
                                const roleMsg = `🏆 You unlocked the role **${role.name}**!`;
                                if (levelUpChannel) {
                                    await levelUpChannel.send(`${message.author} ${roleMsg}`);
                                } else {
                                    await message.channel.send(`${message.author} ${roleMsg}`);
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error('Error assigning level up role:', err.message);
                }
            } else {
                saveXp();
            }
        }
    }


});

// Helper Functions
function parseDuration(str) {
    const match = str.match(/^(\d+)([smdh])$/);
    if (!match) return null;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: return null;
    }
}

function startGiveawayTimer(giveawayId, ms) {
    setTimeout(async () => {
        await endGiveaway(giveawayId);
    }, ms);
}

async function endGiveaway(giveawayId, reroll = false) {
    const gw = giveawaysDb[giveawayId];
    if (!gw || (gw.status !== 'active' && !reroll)) return;

    try {
        const guild = client.guilds.cache.get(gw.guildId);
        if (!guild) return;

        const channel = guild.channels.cache.get(gw.channelId);
        if (!channel) return;

        let msg;
        try {
            msg = await channel.messages.fetch(gw.messageId);
        } catch (e) {
            console.log(`Giveaway message not found: ${gw.messageId}`);
            gw.status = 'deleted';
            saveGiveaways();
            return;
        }

        const isOriginalGuild = gw.guildId === '1492264434003873973';
        const participants = gw.participants || [];

        if (participants.length === 0) {
            gw.status = 'ended';
            saveGiveaways();

            const noParticipantsEmbed = new EmbedBuilder()
                .setColor('#E74C3C')
                .setTitle(`🎉 GIVEAWAY ENDED: ${gw.prize} 🎉`)
                .setDescription(
                    isOriginalGuild
                        ? `❌ Aucun participant n'a rejoint le concours.`
                        : `❌ No participants joined the giveaway.`
                )
                .setTimestamp();

            await msg.edit({ embeds: [noParticipantsEmbed], components: [] });
            return;
        }

        const winners = [];
        const pool = [...participants];
        const winnersCount = Math.min(gw.winnersCount, pool.length);

        for (let i = 0; i < winnersCount; i++) {
            const randIndex = Math.floor(Math.random() * pool.length);
            winners.push(pool.splice(randIndex, 1)[0]);
        }

        gw.status = 'ended';
        gw.winners = winners;
        saveGiveaways();

        const winnerMentions = winners.map(wid => `<@${wid}>`).join(', ');

        const endedEmbed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setTitle(`🎉 GIVEAWAY ENDED: ${gw.prize} 🎉`)
            .setDescription(
                isOriginalGuild
                    ? `🏆 **Gagnant(s) :** ${winnerMentions}\n` +
                      `👥 **Participants :** ${participants.length}`
                    : `🏆 **Winner(s):** ${winnerMentions}\n` +
                      `👥 **Participants:** ${participants.length}`
            )
            .setFooter({ text: isOriginalGuild ? 'Félicitations !' : 'Congratulations!' })
            .setTimestamp();

        await msg.edit({ embeds: [endedEmbed], components: [] });

        await channel.send({
            content: isOriginalGuild
                ? `🎉 Félicitations ${winnerMentions} ! Tu gagnes **${gw.prize}** ! 🎁`
                : `🎉 Congratulations ${winnerMentions}! You won **${gw.prize}**! 🎁`
        });
    } catch (err) {
        console.error('Error ending giveaway:', err.message);
    }
}

function resumeActiveGiveaways() {
    console.log('🔄 Checking active giveaways to resume...');
    let resumed = 0;
    const now = Date.now();
    for (const [gid, gw] of Object.entries(giveawaysDb)) {
        if (gw.status === 'active') {
            const timeLeft = gw.endTimestamp - now;
            if (timeLeft <= 0) {
                console.log(`   ⏳ Active giveaway ${gid} expired during downtime, ending now.`);
                endGiveaway(gid);
            } else {
                console.log(`   ⏳ Active giveaway ${gid} resuming, ends in ${Math.round(timeLeft / 1000)}s.`);
                startGiveawayTimer(gid, timeLeft);
            }
            resumed++;
        }
    }
    console.log(`✅ Giveaways resume check complete. Resumed: ${resumed}`);
}

// ═══════════════════════════════════════
// CONNEXION
// ═══════════════════════════════════════
// ═══════════════════════════════════════
// 🎮 UTD SCRAPING AND AUTO-PUBLISHING
// ═══════════════════════════════════════
const { scrapeAll } = require('./utdxScraper');

async function updateUTDData(guild) {
    console.log(`[UTD] Starting update for guild: ${guild.name} (${guild.id})`);
    
    // Fetch data
    const data = await scrapeAll();
    
    // 1. Update Codes channel
    const codesChannel = guild.channels.cache.get('1507038695201574973') || 
                         guild.channels.cache.find(c => c.name.includes('codes') && c.type === ChannelType.GuildText);
                         
    if (codesChannel) {
        console.log(`[UTD] Updating codes channel: #${codesChannel.name}`);
        try {
            const fetched = await codesChannel.messages.fetch({ limit: 100 });
            if (fetched.size > 0) {
                await codesChannel.bulkDelete(fetched).catch(async () => {
                    for (const msg of fetched.values()) {
                        await msg.delete().catch(() => {});
                    }
                });
            }
        } catch (e) {
            console.error('[UTD] Error clearing codes channel:', e.message);
        }
        
        const embed = new EmbedBuilder()
            .setColor('#F1C40F')
            .setTitle('🔑 Universal Tower Defense X - Active Codes')
            .setDescription(
                'Here are the current active codes for Universal Tower Defense X (UTDX). Use them in-game to claim rewards!\n\n' +
                '🎮 **How to Redeem:**\n' +
                '1. Open **Universal Tower Defense** on Roblox.\n' +
                '2. Click on the **Codes** button (usually on the side of the screen).\n' +
                '3. Copy and paste an active code from below and click redeem!\n\n' +
                '📜 **Active Codes:**\n' +
                (data.codes.length > 0 
                  ? data.codes.map(c => `• \`${c.code}\` - ${c.reward}`).join('\n')
                  : '*No active codes found at the moment!*')
            )
            .setFooter({ text: 'Auto-updated from Beebom • Universal Tower Defense X' })
            .setTimestamp();
            
        await codesChannel.send({ embeds: [embed] });
        console.log('[UTD] Codes channel updated successfully.');
    } else {
        console.log('[UTD] Codes channel not found.');
    }
    
    // 2. Update Tier Lists channel
    const tierChannel = guild.channels.cache.get('1507038692106178600') || 
                        guild.channels.cache.find(c => c.name.includes('tier-lists') && c.type === ChannelType.GuildText);
                        
    if (tierChannel) {
        console.log(`[UTD] Updating tier lists channel: #${tierChannel.name}`);
        try {
            const fetched = await tierChannel.messages.fetch({ limit: 100 });
            if (fetched.size > 0) {
                await tierChannel.bulkDelete(fetched).catch(async () => {
                    for (const msg of fetched.values()) {
                        await msg.delete().catch(() => {});
                    }
                });
            }
        } catch (e) {
            console.error('[UTD] Error clearing tier lists channel:', e.message);
        }
        
        const groups = [
            {
                title: '⚔️ UTDX Combat Tier List - Synchro & Air/Hybrid',
                color: '#E74C3C',
                sections: [
                    'Synchro Units - Massive DPS',
                    'S-Tier Air/Hybrid',
                    'A-Tier Air/Hybrid',
                    'B-Tier Air/Hybrid',
                    'C-Tier Air/Hybrid',
                    'D-Tier Air/Hybrid'
                ],
                description: 'These are the best units for combating air, boss, and hybrid threats. Synchro units represent the absolute pinnacle of DPS when combined.'
            },
            {
                title: '🪨 UTDX Combat Tier List - Ground',
                color: '#2ECC71',
                sections: [
                    'S-Tier Ground',
                    'A-Tier Ground',
                    'B-Tier Ground',
                    'C-Tier Ground',
                    'D-Tier Ground'
                ],
                description: 'These ground-based units are optimal for dealing massive damage, Bleed/DoT, and clearing lanes of ground enemies.'
            },
            {
                title: '🛡️ UTDX Support & Utility Tier List',
                color: '#9B59B6',
                sections: [
                    'S-Tier Debuff Support',
                    'S-Tier Buff Support',
                    'A-Tier Support',
                    'B-Tier Support'
                ],
                description: 'Support units that provide essential buffs (damage, range, speed) or apply critical debuffs (slow, stun, timestop, freeze) to help your team survive longer runs.'
            },
            {
                title: '💰 UTDX Farm Units Tier List',
                color: '#F1C40F',
                sections: [
                    'Farm Units'
                ],
                description: 'Units used to generate money/income during waves. Essential for upgrading your high-cost DPS units.'
            }
        ];
        
        for (const group of groups) {
            const embeds = [];
            let currentEmbed = new EmbedBuilder()
                .setTitle(group.title)
                .setDescription(group.description)
                .setColor(group.color);
                
            let embedCharCount = group.title.length + group.description.length;
            
            for (const sectionName of group.sections) {
                const units = data.tiers[sectionName] || [];
                if (units.length === 0) continue;
                
                const fieldBlocks = [];
                let currentFieldVal = '';
                for (const unit of units) {
                    let unitText = `• **${unit.name}**`;
                    if (unit.rarity) {
                        unitText += ` (*${unit.rarity}*)`;
                    }
                    if (unit.explanation) {
                        const expLines = unit.explanation.split('\n')
                            .map(line => line.trim())
                            .filter(line => line.length > 0)
                            .map(line => line.startsWith('•') ? `  ${line}` : `  • ${line}`)
                            .join('\n');
                        unitText += `\n${expLines}`;
                    }
                    unitText += '\n\n';
                    
                    if (currentFieldVal.length + unitText.length > 1000) {
                        fieldBlocks.push(currentFieldVal);
                        currentFieldVal = unitText;
                    } else {
                        currentFieldVal += unitText;
                    }
                }
                if (currentFieldVal) {
                    fieldBlocks.push(currentFieldVal);
                }
                
                for (let i = 0; i < fieldBlocks.length; i++) {
                    const fieldTitle = i === 0 ? sectionName : `${sectionName} (Part ${i + 1})`;
                    const fieldValue = fieldBlocks[i];
                    
                    const neededChars = fieldTitle.length + fieldValue.length;
                    if (embedCharCount + neededChars > 5500 || (currentEmbed.data.fields && currentEmbed.data.fields.length >= 20)) {
                        embeds.push(currentEmbed);
                        currentEmbed = new EmbedBuilder()
                            .setTitle(`${group.title} (Continued)`)
                            .setColor(group.color);
                        embedCharCount = group.title.length + 12;
                    }
                    
                    currentEmbed.addFields({ name: fieldTitle, value: fieldValue });
                    embedCharCount += neededChars;
                }
            }
            
            if (currentEmbed.data.fields && currentEmbed.data.fields.length > 0) {
                embeds.push(currentEmbed);
            }
            
            if (embeds.length > 0) {
                embeds.forEach((emb, index) => {
                    emb.setFooter({ text: `Auto-updated from Destructoid • Page ${index + 1}/${embeds.length}` })
                       .setTimestamp();
                });
                
                for (const emb of embeds) {
                    await tierChannel.send({ embeds: [emb] });
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        }
        console.log('[UTD] Tier lists channel updated successfully.');
    } else {
        console.log('[UTD] Tier lists channel not found.');
    }
}

// Trigger UTD update for all UTD guilds
async function runUTDUpdates() {
    console.log('[UTD] Triggering UTD updates check...');
    const targetGuildId = '1507001707622563890';
    const guild = client.guilds.cache.get(targetGuildId);
    if (guild) {
        try {
            await updateUTDData(guild);
        } catch (e) {
            console.error(`[UTD] Error during auto-update for guild ${guild.name}:`, e);
        }
    } else {
        console.log(`[UTD] Target guild ${targetGuildId} not found in client guilds cache.`);
    }
}

console.log(`\n🚀 Démarrage du bot...\n`);
client.login(TOKEN).catch((error) => {
    console.error(`❌ Connexion impossible: ${error.message}`);
    console.error(`💡 Vérifie que le token est correct.`);
    process.exit(1);
});

