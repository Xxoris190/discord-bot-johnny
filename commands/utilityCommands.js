// Commandes utilitaires : /help, /ping, /serverinfo, /userinfo, /avatar.

const { EmbedBuilder } = require('discord.js');

const EMBED_COLOR = 0x5865F2;

const utilityCommandDefinitions = [
    { name: 'help', description: 'Liste toutes les commandes de Johnny / Lists all of Johnny’s commands' },
    { name: 'ping', description: 'Latence du bot / Bot latency' },
    { name: 'serverinfo', description: 'Infos sur le serveur / Server information' },
    {
        name: 'userinfo',
        description: 'Infos sur un membre / Member information',
        options: [{ type: 6, name: 'user', description: 'Le membre (défaut: toi) / The member', required: false }],
    },
    {
        name: 'avatar',
        description: 'Avatar d’un membre en grand / Full-size avatar',
        options: [{ type: 6, name: 'user', description: 'Le membre (défaut: toi) / The member', required: false }],
    },
];

const HELP_SECTIONS = [
    {
        name: '📰 Anime News',
        value: '`/animenews latest` · `/animenews search` · `/animenews status` · `/animenews sources` · `/animenews check` · `/animenews notify`',
    },
    {
        name: '📺 Anime & Manga',
        value: '`/anime search` · `/anime season` · `/anime top` · `/anime schedule` · `/anime random` · `/anime character` · `/anime next` · `/manga search` · `/manga top`',
    },
    {
        name: '🏆 Niveaux & Giveaways',
        value: '`/rank` · `/leaderboard` · `/giveaway` · `/reroll`',
    },
    {
        name: '🛡️ Modération (staff)',
        value: '`/ban` · `/kick` · `/mute` · `/unmute` · `/warn` · `/warnings` · `/clearwarns` · `/lock` · `/unlock`',
    },
    {
        name: '🔧 Utilitaires',
        value: '`/help` · `/ping` · `/serverinfo` · `/userinfo` · `/avatar`',
    },
];

async function runHelp(interaction) {
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle('🤖 Commandes de Johnny')
        .setDescription('Toutes les commandes disponibles, groupées par thème.')
        .addFields(HELP_SECTIONS)
        .setFooter({ text: 'Johnny • bot du serveur' })
        .setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function runPing(interaction) {
    const sent = await interaction.reply({ content: '🏓 Pong…', fetchReply: true, ephemeral: true });
    const roundTrip = sent.createdTimestamp - interaction.createdTimestamp;
    const websocket = Math.max(0, Math.round(interaction.client.ws.ping));
    return interaction.editReply(`🏓 **Pong !** Aller-retour : **${roundTrip}ms** · WebSocket : **${websocket}ms**`);
}

async function runServerInfo(interaction) {
    const guild = interaction.guild;
    const created = Math.floor(guild.createdTimestamp / 1000);
    const channels = guild.channels.cache;
    const textCount = channels.filter(channel => channel.isTextBased()).size;
    const voiceCount = channels.filter(channel => channel.isVoiceBased()).size;

    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(`🏠 ${guild.name}`)
        .addFields(
            { name: 'Membres', value: `👥 ${guild.memberCount}`, inline: true },
            { name: 'Boosts', value: `🚀 ${guild.premiumSubscriptionCount || 0} (niveau ${guild.premiumTier})`, inline: true },
            { name: 'Créé', value: `<t:${created}:D> (<t:${created}:R>)`, inline: true },
            { name: 'Salons', value: `💬 ${textCount} texte · 🔊 ${voiceCount} vocal`, inline: true },
            { name: 'Rôles', value: `🎭 ${guild.roles.cache.size}`, inline: true },
            { name: 'Émojis', value: `😀 ${guild.emojis.cache.size}`, inline: true },
        )
        .setTimestamp();
    if (guild.iconURL()) embed.setThumbnail(guild.iconURL({ size: 256 }));
    return interaction.reply({ embeds: [embed] });
}

async function runUserInfo(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const registered = Math.floor(user.createdTimestamp / 1000);

    const embed = new EmbedBuilder()
        .setColor(member && member.displayColor ? member.displayColor : EMBED_COLOR)
        .setTitle(`👤 ${user.username}`)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields({ name: 'Compte créé', value: `<t:${registered}:D> (<t:${registered}:R>)`, inline: true })
        .setFooter({ text: `ID: ${user.id}` })
        .setTimestamp();

    if (member) {
        const joined = Math.floor(member.joinedTimestamp / 1000);
        const roles = member.roles.cache
            .filter(role => role.id !== interaction.guild.id)
            .sort((left, right) => right.position - left.position)
            .map(role => `${role}`)
            .slice(0, 15);
        embed.addFields(
            { name: 'A rejoint', value: `<t:${joined}:D> (<t:${joined}:R>)`, inline: true },
            { name: `Rôles (${roles.length})`, value: roles.join(' ') || 'Aucun', inline: false },
        );
    }
    return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
}

async function runAvatar(interaction) {
    const user = interaction.options.getUser('user') || interaction.user;
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(`🖼️ Avatar de ${user.username}`)
        .setImage(user.displayAvatarURL({ size: 1024 }))
        .setTimestamp();
    return interaction.reply({ embeds: [embed] });
}

/**
 * Route les commandes utilitaires. À appeler depuis interactionCreate.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleUtilityCommand(interaction) {
    const { commandName } = interaction;
    try {
        if (commandName === 'help') return await runHelp(interaction);
        if (commandName === 'ping') return await runPing(interaction);
        if (commandName === 'serverinfo') return await runServerInfo(interaction);
        if (commandName === 'userinfo') return await runUserInfo(interaction);
        if (commandName === 'avatar') return await runAvatar(interaction);
    } catch (error) {
        console.error(`[Commands] /${commandName}: ${error.message}`);
        const content = '❌ Une erreur est survenue, réessaie plus tard.';
        if (interaction.deferred || interaction.replied) return interaction.editReply(content).catch(() => {});
        return interaction.reply({ content, ephemeral: true }).catch(() => {});
    }
}

const UTILITY_COMMAND_NAMES = utilityCommandDefinitions.map(definition => definition.name);

module.exports = {
    handleUtilityCommand,
    UTILITY_COMMAND_NAMES,
    utilityCommandDefinitions,
};
