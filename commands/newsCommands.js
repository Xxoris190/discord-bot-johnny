// Commandes /animenews : dernières annonces publiées, recherche, état du
// service, sources, vérification forcée et rôle de notification.

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { canPingRole, getAnimeNewsController } = require('../animeNews/service');

const EMBED_COLOR = 0xE91E63;
const PING_ROLE_NAME = '📰 Anime News';
const DEFAULT_LATEST_COUNT = 5;
const MAX_LATEST_COUNT = 10;

const newsCommandDefinitions = [
    {
        name: 'animenews',
        description: 'Le service Anime News de Johnny / Johnny’s anime news service',
        options: [
            {
                type: 1, name: 'latest', description: 'Les dernières annonces publiées / Latest published news',
                options: [{ type: 4, name: 'nombre', description: `Nombre d’annonces (max ${MAX_LATEST_COUNT})`, required: false, min_value: 1, max_value: MAX_LATEST_COUNT }],
            },
            {
                type: 1, name: 'search', description: 'Recherche dans les annonces publiées / Search published news',
                options: [{ type: 3, name: 'titre', description: 'Titre ou mots-clés / Title or keywords', required: true }],
            },
            { type: 1, name: 'status', description: 'État du service Anime News / Service health' },
            { type: 1, name: 'sources', description: 'Liste des sources surveillées / Monitored sources' },
            { type: 1, name: 'check', description: 'Force une vérification immédiate (staff) / Force a check now' },
            { type: 1, name: 'notify', description: 'Active/retire le rôle ping Anime News / Toggle the news ping role' },
        ],
    },
];

function requireController(interaction) {
    const controller = getAnimeNewsController();
    // Le service ne tourne que sur le serveur configuré : ne jamais exposer
    // son état ou ses annonces depuis un autre serveur où Johnny est présent.
    if (!controller || !controller.started || interaction.guildId !== controller.guildId) {
        interaction.reply({
            content: '❌ Le service Anime News n’est pas actif sur ce serveur.',
            ephemeral: true,
        });
        return null;
    }
    return controller;
}

function isNewsStaff(interaction) {
    return interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
}

function publishedLine(record) {
    const time = Number.isFinite(Date.parse(record.publishedAt))
        ? `<t:${Math.floor(Date.parse(record.publishedAt) / 1000)}:R>`
        : '';
    const label = record.categoryLabel || '📰 News';
    return `${label} — [${record.title}](${record.url}) ${time}`;
}

async function runLatest(interaction, controller) {
    const count = interaction.options.getInteger('nombre') || DEFAULT_LATEST_COUNT;
    const records = controller.state.recentPublished(count);
    if (records.length === 0) {
        return interaction.reply({ content: '📭 Aucune annonce publiée pour le moment.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(`📰 ${records.length} dernière(s) annonce(s)`)
        .setDescription(records.map(publishedLine).join('\n'))
        .setTimestamp();
    return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
}

async function runSearch(interaction, controller) {
    const query = interaction.options.getString('titre');
    const records = controller.state.searchPublished(query, DEFAULT_LATEST_COUNT);
    if (records.length === 0) {
        return interaction.reply({
            content: `🔍 Rien trouvé pour **${query.slice(0, 80)}** dans les annonces récentes.`,
            ephemeral: true,
        });
    }

    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(`🔍 Annonces correspondant à « ${query.slice(0, 60)} »`)
        .setDescription(records.map(publishedLine).join('\n'))
        .setTimestamp();
    return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
}

async function runStatus(interaction, controller) {
    const status = controller.getStatus();
    const failing = status.sources.filter(source => source.health && source.health.failCount > 0);
    const lastCycle = status.lastCycleAt
        ? `<t:${Math.floor(Date.parse(status.lastCycleAt) / 1000)}:R>`
        : 'pas encore';
    const stats = status.lastCycleStats
        ? `${status.lastCycleStats.accepted} retenues · ${status.lastCycleStats.queued} en file · ${status.lastCycleStats.delivered} publiées`
        : '—';

    const embed = new EmbedBuilder()
        .setColor(failing.length > 0 ? 0xF39C12 : 0x2ECC71)
        .setTitle('🩺 État du service Anime News')
        .addFields(
            { name: 'Salon', value: `<#${status.channelId}>`, inline: true },
            { name: 'Intervalle', value: `${Math.round(status.pollIntervalMs / 1000)}s`, inline: true },
            { name: 'Sources', value: `${status.sources.length} actives, ${failing.length} en erreur`, inline: true },
            { name: 'Dernier cycle', value: lastCycle, inline: true },
            { name: 'Résultat', value: stats, inline: true },
            { name: 'File d’attente', value: String(status.outboxSize), inline: true },
            {
                name: 'Rôle ping',
                value: status.pingRoleId ? `<@&${status.pingRoleId}>` : 'désactivé (`/animenews notify`)',
                inline: true,
            },
        )
        .setTimestamp();
    if (failing.length > 0) {
        embed.addFields({
            name: '⚠️ Sources en erreur',
            value: failing
                .map(source => `**${source.name}** — ${source.health.lastError || 'erreur inconnue'}`)
                .join('\n')
                .slice(0, 1024),
        });
    }
    return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
}

async function runSources(interaction, controller) {
    const status = controller.getStatus();
    const trustEmojis = { official: '✅', editorial: '📰', aggregator: '🌐' };
    const lines = status.sources.map(source => {
        const healthDot = !source.health || source.health.failCount === 0 ? '🟢' : '🔴';
        return `${healthDot} ${trustEmojis[source.trust] || '🌐'} **${source.name}** (${source.language})`;
    });

    const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle(`📡 ${status.sources.length} sources surveillées`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: '✅ officiel · 📰 éditorial · 🌐 agrégateur — 🟢 OK · 🔴 en erreur' })
        .setTimestamp();
    return interaction.reply({ embeds: [embed] });
}

async function runCheck(interaction, controller) {
    if (!isNewsStaff(interaction)) {
        return interaction.reply({ content: '❌ Réservé au staff (permission Gérer le serveur).', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    await controller.runNow();
    const status = controller.getStatus();
    const stats = status.lastCycleStats || { accepted: 0, queued: 0, delivered: 0, failedSources: 0 };
    return interaction.editReply(
        `✅ Vérification terminée : **${stats.accepted}** retenue(s), **${stats.queued}** en file, `
        + `**${stats.delivered}** publiée(s), **${stats.failedSources}** source(s) en erreur.`
    );
}

async function ensurePingRole(interaction, controller) {
    const storedRoleId = controller.state.getPingRoleId();
    if (storedRoleId) {
        const existing = interaction.guild.roles.cache.get(storedRoleId);
        if (existing) return existing;
    }

    const byName = interaction.guild.roles.cache.find(role => role.name === PING_ROLE_NAME);
    if (byName) {
        controller.state.setPingRoleId(byName.id);
        controller.state.save();
        return byName;
    }

    const botMember = interaction.guild.members.me;
    if (!botMember || !botMember.permissions.has(PermissionFlagsBits.ManageRoles)) return null;
    const created = await interaction.guild.roles.create({
        name: PING_ROLE_NAME,
        mentionable: false,
        reason: 'Rôle de notification Anime News (créé via /animenews notify)',
    });
    controller.state.setPingRoleId(created.id);
    controller.state.save();
    return created;
}

async function runNotify(interaction, controller) {
    let role;
    try {
        role = await ensurePingRole(interaction, controller);
    } catch (error) {
        console.error(`[AnimeNews] Création du rôle ping impossible: ${error.message}`);
        role = null;
    }
    if (!role) {
        return interaction.reply({
            content: '❌ Impossible de préparer le rôle de notification (permission Gérer les rôles manquante ?).',
            ephemeral: true,
        });
    }

    const member = interaction.member;
    const hasRole = member.roles.cache.has(role.id);
    try {
        if (hasRole) await member.roles.remove(role, 'Désinscription Anime News');
        else await member.roles.add(role, 'Inscription Anime News');
    } catch (error) {
        console.error(`[AnimeNews] Attribution du rôle ping impossible: ${error.message}`);
        return interaction.reply({
            content: '❌ Je n’arrive pas à modifier tes rôles (mon rôle est peut-être trop bas dans la liste).',
            ephemeral: true,
        });
    }

    let pingWarning = '';
    const newsChannel = interaction.guild.channels.cache.get(controller.channelId);
    if (!hasRole && newsChannel && !canPingRole(newsChannel, role.id)) {
        pingWarning = '\n⚠️ Il manque à Johnny la permission « Mentionner tous les rôles » '
            + `dans ${newsChannel} : le rôle est attribué mais les pings ne notifieront pas encore.`;
    }

    return interaction.reply({
        content: hasRole
            ? '🔕 Tu ne seras plus mentionné pour les news anime.'
            : `🔔 Tu recevras un ping ${role} à chaque annonce anime !${pingWarning}`,
        ephemeral: true,
        allowedMentions: { parse: [] },
    });
}

/**
 * Route les interactions /animenews. À appeler depuis interactionCreate.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleNewsCommand(interaction) {
    const controller = requireController(interaction);
    if (!controller) return;

    const sub = interaction.options.getSubcommand();
    try {
        if (sub === 'latest') return await runLatest(interaction, controller);
        if (sub === 'search') return await runSearch(interaction, controller);
        if (sub === 'status') return await runStatus(interaction, controller);
        if (sub === 'sources') return await runSources(interaction, controller);
        if (sub === 'check') return await runCheck(interaction, controller);
        if (sub === 'notify') return await runNotify(interaction, controller);
        return await interaction.reply({ content: '❌ Sous-commande inconnue.', ephemeral: true });
    } catch (error) {
        console.error(`[Commands] /animenews ${sub}: ${error.message}`);
        const payload = { content: '❌ Une erreur est survenue, réessaie plus tard.', ephemeral: true };
        if (interaction.deferred || interaction.replied) return interaction.editReply(payload.content);
        return interaction.reply(payload);
    }
}

module.exports = {
    handleNewsCommand,
    newsCommandDefinitions,
    PING_ROLE_NAME,
};
