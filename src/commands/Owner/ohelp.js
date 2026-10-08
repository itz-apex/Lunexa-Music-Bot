const fs = require('fs');
const path = require('path');
const {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ComponentType,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MessageFlags,
    AttachmentBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const axios = require('axios');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { parseEmoji } = require('../../utils/emojiParser.js');
const {
    createLoadingPayload,
    sendLoadingResponse,
    updateImageResponse
} = require('../../utils/discordImageResponse');

const ownerCommandsPath = __dirname;

const isBotOwner = (client, userId) =>
    Array.isArray(client.owners) && client.owners.includes(userId);

const getOwnerCommands = () => {
    const commands = [];

    for (const file of fs.readdirSync(ownerCommandsPath).filter(file => file.endsWith('.js'))) {
        try {
            const command = require(path.join(ownerCommandsPath, file));
            if (!command.name || !command.owner) continue;

            commands.push({
                name: command.name,
                description: command.description || 'Owner command',
                aliases: Array.isArray(command.aliases) ? command.aliases : [],
                usage: command.usage || ''
            });
        } catch (error) {
            console.error(`[Owner Help] Failed to load ${file}:`, error);
        }
    }

    return commands.sort((a, b) => a.name.localeCompare(b.name));
};

const roundedRect = (ctx, x, y, width, height, radius) => {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
};

const drawFittedText = (ctx, text, x, y, maxWidth, font, color) => {
    ctx.font = font;
    const fontSize = Number(font.match(/(\d+(?:\.\d+)?)px/)?.[1] || 16);
    if (ctx.measureText(text).width > maxWidth) {
        const fittedSize = Math.max(13, Math.floor(
            fontSize * maxWidth / ctx.measureText(text).width
        ));
        ctx.font = font.replace(`${fontSize}px`, `${fittedSize}px`);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
};

const drawAvatar = async (ctx, client, x, y, radius) => {
    try {
        const avatarUrl = client.user.displayAvatarURL({ extension: 'png', size: 256 });
        const response = await axios.get(avatarUrl, {
            responseType: 'arraybuffer',
            timeout: 3000
        });
        const avatar = await loadImage(Buffer.from(response.data));

        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(avatar, x - radius, y - radius, radius * 2, radius * 2);
        ctx.restore();
    } catch {
        const fallback = ctx.createRadialGradient(x, y - 24, 16, x, y, radius);
        fallback.addColorStop(0, '#d7a6ff');
        fallback.addColorStop(1, '#7250a4');
        ctx.fillStyle = fallback;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fffaff';
        ctx.font = `700 ${Math.floor(radius * 0.7)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('S', x, y + 2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    }
};

const createOwnerBanner = async (client, commandCount) => {
    const width = 1200;
    const height = 390;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const accent = '#9e65d2';

    ctx.fillStyle = '#f2effc';
    ctx.fillRect(0, 0, width, height);

    const lavenderGlow = ctx.createRadialGradient(150, 150, 0, 150, 150, 440);
    lavenderGlow.addColorStop(0, 'rgba(211, 174, 255, 0.48)');
    lavenderGlow.addColorStop(0.7, 'rgba(220, 204, 249, 0.16)');
    lavenderGlow.addColorStop(1, 'rgba(242, 239, 252, 0)');
    ctx.fillStyle = lavenderGlow;
    ctx.fillRect(0, 0, width, height);

    const pinkGlow = ctx.createRadialGradient(1080, 36, 0, 1080, 36, 220);
    pinkGlow.addColorStop(0, 'rgba(220, 186, 249, 0.64)');
    pinkGlow.addColorStop(1, 'rgba(220, 186, 249, 0)');
    ctx.fillStyle = pinkGlow;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(122, 95, 166, 0.1)';
    ctx.lineWidth = 1;
    for (let coordinate = 0; coordinate <= width; coordinate += 28) {
        ctx.beginPath();
        ctx.moveTo(coordinate, 0);
        ctx.lineTo(coordinate, height);
        ctx.stroke();
    }
    for (let coordinate = 0; coordinate <= height; coordinate += 28) {
        ctx.beginPath();
        ctx.moveTo(0, coordinate);
        ctx.lineTo(width, coordinate);
        ctx.stroke();
    }

    ctx.fillStyle = 'rgba(205, 174, 243, 0.44)';
    ctx.beginPath();
    ctx.arc(1080, 32, 104, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.84;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(32, 28);
    ctx.lineTo(1168, 28);
    ctx.stroke();
    ctx.strokeStyle = '#8d98ca';
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(32, 348);
    ctx.lineTo(1168, 348);
    ctx.stroke();
    ctx.globalAlpha = 1;

    roundedRect(ctx, 20, 40, 1160, 290, 22);
    ctx.strokeStyle = 'rgba(133, 112, 176, 0.54)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.save();
    ctx.shadowColor = 'rgba(116, 92, 156, 0.16)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 5;
    roundedRect(ctx, 300, 58, 840, 230, 20);
    ctx.fillStyle = 'rgba(255, 254, 255, 0.9)';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(176, 150, 211, 0.42)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    await drawAvatar(ctx, client, 153, 174, 86);
    ctx.strokeStyle = '#b36ce2';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(153, 174, 92, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#29233b';
    ctx.font = '700 17px sans-serif';
    ctx.fillText('LUNEXA OWNER', 344, 96);
    ctx.fillStyle = '#8e70ae';
    ctx.font = '600 12px sans-serif';
    ctx.fillText('PRIVATE COMMAND COLLECTION', 344, 116);

    roundedRect(ctx, 970, 78, 126, 34, 18);
    ctx.fillStyle = 'rgba(231, 216, 249, 0.78)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(166, 126, 206, 0.44)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#8c60bd';
    ctx.font = '700 12px sans-serif';
    ctx.fillText('OWNER ONLY', 992, 100);

    drawFittedText(ctx, 'OWNER HELP', 344, 176, 580, '700 64px sans-serif', '#242033');
    drawFittedText(
        ctx,
        'TOOLS FOR MANAGING LUNEXA',
        344,
        207,
        620,
        '600 16px sans-serif',
        '#6f617f'
    );

    ctx.strokeStyle = 'rgba(164, 105, 211, 0.68)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(344, 230);
    ctx.lineTo(702, 230);
    ctx.stroke();

    ctx.fillStyle = '#8757b7';
    ctx.font = '700 18px sans-serif';
    ctx.fillText(`${commandCount} COMMANDS`, 344, 268);
    ctx.fillStyle = '#74677e';
    ctx.font = '600 12px sans-serif';
    ctx.fillText('SELECT A COMMAND BELOW', 624, 268);

    for (let index = 0; index < 8; index++) {
        const barHeight = 25 + ((index * 19) % 58);
        ctx.fillStyle = index % 3 === 0 ? accent : 'rgba(145, 102, 203, 0.62)';
        roundedRect(ctx, 982 + index * 18, 274 - barHeight, 9, barHeight, 4);
        ctx.fill();
    }

    ctx.fillStyle = '#675879';
    ctx.font = '700 14px sans-serif';
    ctx.fillText('LUNEXA OWNER CENTER', 78, 302);

    return canvas.encode('png');
};

const formatDescription = (description) =>
    (description || 'Owner command')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 150);

const formatCommandOverview = (commands) => commands.map(command =>
    `**\`${command.name}\`** — ${formatDescription(command.description)}`
).join('\n');

const formatCommandDetails = (command, prefix) => {
    const usage = `${prefix}${command.name}${command.usage ? ` ${command.usage}` : ''}`;
    const aliases = command.aliases.length > 0
        ? command.aliases.map(alias => `\`${alias}\``).join(' , ')
        : 'None';

    return (
        `**\`${usage}\`**\n\n` +
        `${formatDescription(command.description)}\n\n` +
        `**Aliases:** ${aliases}\n` +
        `**Access:** Configured bot owners only`
    );
};

const createSelectRow = (commands) => {
    const options = [
        {
            label: 'Owner Home',
            value: 'home',
            description: 'Return to the owner command overview'
        },
        ...commands.map(command => ({
            label: command.name,
            value: command.name,
            description: formatDescription(command.description).slice(0, 100),
            emoji: parseEmoji('<:owner:1490275497735753819>')
        }))
    ];

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('owner_help_menu')
            .setPlaceholder('Select an owner command...')
            .addOptions(options)
    );
};

const createSupportRow = (client) => {
    const supportUrl = client.config?.links?.support?.trim();
    if (!supportUrl) return null;

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('Support')
            .setStyle(ButtonStyle.Link)
            .setURL(supportUrl)
    );
};

const createHomeContainer = (client, commands, bannerName, prefix) => {
    const ownerEmoji = client.emoji?.owner || client.emoji?.check || '';
    const supportRow = createSupportRow(client);
    const overview = new TextDisplayBuilder()
        .setContent(
            `### ${ownerEmoji} Lunexa Owner Center\n` +
            `-# Private controls for configured bot owners`
        );
    const intro = new TextDisplayBuilder()
        .setContent(
            `Manage Lunexa's runtime, servers, and owner tools from one place.\n` +
            `Choose a command below to see its usage and access details.`
        );
    const commandList = new TextDisplayBuilder()
        .setContent(
            `**Available owner commands**\n` +
            formatCommandOverview(commands)
        );
    const prompt = new TextDisplayBuilder()
        .setContent(`-# Use \`${prefix}ohelp\` anytime to reopen this private menu.`);
    const banner = new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(`attachment://${bannerName}`)
    );
    const container = new ContainerBuilder()
        .addTextDisplayComponents(overview)
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(intro)
        .addMediaGalleryComponents(banner)
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(commandList)
        .addTextDisplayComponents(prompt)
        .addActionRowComponents(createSelectRow(commands));

    if (supportRow) container.addActionRowComponents(supportRow);
    return container;
};

const createCommandContainer = (client, command, commands, prefix) => {
    const ownerEmoji = client.emoji?.owner || client.emoji?.check || '';
    const header = new TextDisplayBuilder()
        .setContent(
            `### ${ownerEmoji} ${command.name} Command\n` +
            `-# Owner-only command details`
        );
    const details = new TextDisplayBuilder()
        .setContent(formatCommandDetails(command, prefix));
    const footer = new TextDisplayBuilder()
        .setContent(`-# Return to the owner home page or choose another command below.`);

    return new ContainerBuilder()
        .addTextDisplayComponents(header)
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(details)
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(footer)
        .addActionRowComponents(createSelectRow(commands));
};

const getMessageFromResponse = async (context, response) => {
    if (response.message) return response.message;
    if (response.type === 'interaction' && response.interaction?.fetchReply) {
        return response.interaction.fetchReply();
    }
    if (response.messageId && context.channel?.messages?.fetch) {
        return context.channel.messages.fetch(response.messageId);
    }
    throw new Error('Owner help message could not be fetched after upload');
};

const sendOwnerHelpMenu = async (context, container, attachment) => {
    const loadingResponse = await sendLoadingResponse(
        context,
        createLoadingPayload('OWNER HELP', 'Loading owner commands and artwork...'),
        'Owner Help'
    );

    await updateImageResponse(context, loadingResponse, {
        files: [attachment],
        components: [container],
        flags: MessageFlags.IsComponentsV2
    }, 'Owner Help');

    return getMessageFromResponse(context, loadingResponse);
};

const acknowledge = async interaction => {
    if (interaction.deferred || interaction.replied) return true;
    try {
        await interaction.deferUpdate();
        return true;
    } catch {
        return false;
    }
};

const updateOwnerMenu = async (interaction, payload) => {
    try {
        if (!await acknowledge(interaction)) return false;

        if (payload.files?.length) {
            await updateImageResponse(
                { __imageInteraction: interaction, client: interaction.client },
                { type: 'interaction', interaction, native: true },
                payload,
                'Owner Help'
            );
        } else {
            await interaction.editReply(payload);
        }
        return true;
    } catch (error) {
        console.error('[Owner Help] Interaction update failed:', error);
        return false;
    }
};

module.exports = {
    name: 'ohelp',
    aliases: ['ownerhelp', 'oh'],
    description: 'Shows the owner-only command menu',
    category: 'Owner',
    owner: true,
    slashOptions: [],

    async slashExecute(interaction, client) {
        if (!isBotOwner(client, interaction.user.id)) return;

        const commands = getOwnerCommands();
        const prefix = '/';
        const banner = await createOwnerBanner(client, commands.length);
        const bannerName = 'owner-help.png';
        const attachment = new AttachmentBuilder(banner, { name: bannerName });
        const container = createHomeContainer(client, commands, bannerName, prefix);
        const context = { __imageInteraction: interaction, client };
        const sentMessage = await sendOwnerHelpMenu(context, container, attachment);
        let lastContainer = container;
        let lastFiles = [attachment];

        const collector = sentMessage.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 300000
        });

        collector.on('collect', async component => {
            if (!isBotOwner(client, component.user.id)) {
                return component.reply({
                    components: [
                        new ContainerBuilder().addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `**${client.emoji?.cross || ''} This owner menu is restricted.**`
                            )
                        )
                    ],
                    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
                }).catch(() => { });
            }

            const selected = component.values[0];
            if (selected === 'home') {
                lastContainer = container;
                lastFiles = [attachment];
                return updateOwnerMenu(component, {
                    files: lastFiles,
                    components: [container],
                    flags: MessageFlags.IsComponentsV2
                });
            }

            const command = commands.find(item => item.name === selected);
            if (!command) return;

            lastContainer = createCommandContainer(client, command, commands, prefix);
            lastFiles = [];
            return updateOwnerMenu(component, {
                components: [lastContainer],
                flags: MessageFlags.IsComponentsV2
            });
        });

        collector.on('end', () => {
            sentMessage.edit({
                files: lastFiles,
                components: [lastContainer]
            }).catch(() => { });
        });
    },

    async execute(message, args, client, prefix) {
        if (!isBotOwner(client, message.author.id)) return;

        const commands = getOwnerCommands();
        const commandPrefix = prefix || client.prefix || client.config?.prefix || '.';
        const banner = await createOwnerBanner(client, commands.length);
        const bannerName = 'owner-help.png';
        const attachment = new AttachmentBuilder(banner, { name: bannerName });
        const container = createHomeContainer(client, commands, bannerName, commandPrefix);
        const sentMessage = await sendOwnerHelpMenu(message, container, attachment);
        let lastContainer = container;
        let lastFiles = [attachment];

        const collector = sentMessage.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 300000
        });

        collector.on('collect', async component => {
            if (!isBotOwner(client, component.user.id)) {
                return component.reply({
                    components: [
                        new ContainerBuilder().addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `**${client.emoji?.cross || ''} This owner menu is restricted.**`
                            )
                        )
                    ],
                    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
                }).catch(() => { });
            }

            const selected = component.values[0];
            if (selected === 'home') {
                lastContainer = container;
                lastFiles = [attachment];
                return updateOwnerMenu(component, {
                    files: lastFiles,
                    components: [container],
                    flags: MessageFlags.IsComponentsV2
                });
            }

            const command = commands.find(item => item.name === selected);
            if (!command) return;

            lastContainer = createCommandContainer(client, command, commands, commandPrefix);
            lastFiles = [];
            return updateOwnerMenu(component, {
                components: [lastContainer],
                flags: MessageFlags.IsComponentsV2
            });
        });

        collector.on('end', () => {
            sentMessage.edit({
                files: lastFiles,
                components: [lastContainer]
            }).catch(() => { });
        });
    }
};