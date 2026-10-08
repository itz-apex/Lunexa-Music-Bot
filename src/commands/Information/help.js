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
const config = require('../../config.js');
const fs = require('fs');
const path = require('path');
const emoji = require("../../emojis");
const { parseEmoji } = require('../../utils/emojiParser.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const axios = require('axios');
const {
    createLoadingPayload,
    sendLoadingResponse,
    updateImageResponse
} = require('../../utils/discordImageResponse');

const categoryInfo = {
    'Information': {
        emoji: emoji.helpMenu.information,
        description: 'Shows information commands'
    },
    'Music': {
        emoji: emoji.helpMenu.music,
        description: 'Shows music commands'
    },
    'Favourite': {
        emoji: emoji.helpMenu.favourite,
        description: 'Shows favourite commands'
    },
    'Config': {
         emoji: emoji.helpMenu.config,
        description: 'Shows configuration commands'
    },
    'Filters': {
        emoji: emoji.helpMenu.filters,
        description: 'Shows filter commands'
    }
};

const categoryOrder = ['Information', 'Music', 'Favourite', 'Config', 'Filters'];

const sortCategories = (categories) => [...categories].sort((a, b) => {
    const indexA = categoryOrder.indexOf(a);
    const indexB = categoryOrder.indexOf(b);
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
});

const isExpiredInteractionError = (error) =>
    error?.code === 10062 || error?.status === 404;

const logInteractionError = (error) => {
    if (!isExpiredInteractionError(error)) {
        console.error('[Help Menu] Interaction error:', error);
    }
};

const acknowledgeComponent = async (interaction) => {
    if (interaction.deferred || interaction.replied) return true;

    try {
        await interaction.deferUpdate();
        return true;
    } catch (error) {
        logInteractionError(error);
        return false;
    }
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

const drawFittedText = (ctx, text, x, y, maxWidth, font, fillStyle) => {
    ctx.font = font;
    let currentFont = font;
    const fontMatch = font.match(/(\d+(?:\.\d+)?)px/);
    const baseSize = fontMatch ? Number(fontMatch[1]) : 16;

    if (ctx.measureText(text).width > maxWidth) {
        const scale = maxWidth / ctx.measureText(text).width;
        const fittedSize = Math.max(13, Math.floor(baseSize * scale));
        currentFont = font.replace(`${baseSize}px`, `${fittedSize}px`);
        ctx.font = currentFont;
    }

    ctx.fillStyle = fillStyle;
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
    } catch (error) {
        const avatarBackground = ctx.createRadialGradient(x, y - 20, 20, x, y, radius);
        avatarBackground.addColorStop(0, '#e0b7ff');
        avatarBackground.addColorStop(1, '#50357d');
        ctx.fillStyle = avatarBackground;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = `700 ${Math.floor(radius * 0.72)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((client.user.username || 'G').charAt(0).toUpperCase(), x, y + 2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    }
};

const categoryBannerStyles = {
    Information: {
        accent: '#d6b3ff',
        accentSoft: 'rgba(214, 179, 255, 0.22)',
        subtitle: 'Everything you need to know about Lunexa'
    },
    Music: {
        accent: '#c79cff',
        accentSoft: 'rgba(199, 156, 255, 0.22)',
        subtitle: 'Play, control, and enjoy your music'
    },
    Favourite: {
        accent: '#f0b5e8',
        accentSoft: 'rgba(240, 181, 232, 0.22)',
        subtitle: 'Keep your favourite tracks close'
    },
    Config: {
        accent: '#b6c8ff',
        accentSoft: 'rgba(182, 200, 255, 0.22)',
        subtitle: 'Shape the experience for your server'
    },
    Filters: {
        accent: '#b8e1ff',
        accentSoft: 'rgba(184, 225, 255, 0.22)',
        subtitle: 'Add a softer touch to every session'
    }
};

const drawSoftBannerBackdrop = (ctx, accent = '#9f66d9') => {
    const width = 1200;
    const height = 390;

    ctx.fillStyle = '#f2effc';
    ctx.fillRect(0, 0, width, height);

    const lavenderGlow = ctx.createRadialGradient(155, 150, 0, 155, 150, 430);
    lavenderGlow.addColorStop(0, 'rgba(211, 174, 255, 0.45)');
    lavenderGlow.addColorStop(0.72, 'rgba(220, 204, 249, 0.16)');
    lavenderGlow.addColorStop(1, 'rgba(242, 239, 252, 0)');
    ctx.fillStyle = lavenderGlow;
    ctx.fillRect(0, 0, width, height);

    const pinkGlow = ctx.createRadialGradient(1080, 38, 0, 1080, 38, 210);
    pinkGlow.addColorStop(0, 'rgba(220, 186, 249, 0.62)');
    pinkGlow.addColorStop(1, 'rgba(220, 186, 249, 0)');
    ctx.fillStyle = pinkGlow;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(122, 95, 166, 0.1)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x += 28) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    for (let y = 0; y <= height; y += 28) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
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
};

const drawSoftBannerPanel = (ctx) => {
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
};

const drawBannerWaveform = (ctx, accent) => {
    for (let index = 0; index < 8; index++) {
        const barHeight = 25 + ((index * 19) % 58);
        ctx.fillStyle = index % 3 === 0 ? accent : 'rgba(145, 102, 203, 0.62)';
        roundedRect(ctx, 982 + index * 18, 274 - barHeight, 9, barHeight, 4);
        ctx.fill();
    }
};

const createHelpBanner = async (client, commandCount = 0) => {
    const width = 1200;
    const height = 390;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const accent = '#9e65d2';

    drawSoftBannerBackdrop(ctx, accent);
    drawSoftBannerPanel(ctx);

    await drawAvatar(ctx, client, 153, 174, 86);
    ctx.strokeStyle = '#b36ce2';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(153, 174, 92, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#29233b';
    ctx.font = '700 17px sans-serif';
    ctx.fillText('LUNEXA MUSIC', 344, 96);
    ctx.fillStyle = '#8e70ae';
    ctx.font = '600 12px sans-serif';
    ctx.fillText('HELP COLLECTION', 344, 116);

    roundedRect(ctx, 970, 78, 126, 34, 18);
    ctx.fillStyle = 'rgba(231, 216, 249, 0.78)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(166, 126, 206, 0.44)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#8c60bd';
    ctx.font = '700 12px sans-serif';
    ctx.fillText('LIVE GUIDE', 995, 100);

    drawFittedText(ctx, 'HELP MENU', 344, 176, 580, '700 64px sans-serif', '#242033');
    drawFittedText(
        ctx,
        'A FRIENDLY GUIDE TO EVERY COMMAND',
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
    ctx.fillText('CHOOSE A CATEGORY BELOW', 624, 268);
    drawBannerWaveform(ctx, accent);

    ctx.fillStyle = '#675879';
    ctx.font = '700 14px sans-serif';
    ctx.fillText('LUNEXA MUSIC BOT', 92, 302);

    return canvas.encode('png');
};

const createCategoryBanner = async (client, category, commandCount) => {
    const width = 1200;
    const height = 390;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const style = categoryBannerStyles[category] || {
        accent: '#d6b3ff',
        accentSoft: 'rgba(214, 179, 255, 0.22)',
        subtitle: 'Explore the commands available in this section'
    };

    drawSoftBannerBackdrop(ctx, style.accent);
    drawSoftBannerPanel(ctx);

    await drawAvatar(ctx, client, 153, 174, 86);
    ctx.strokeStyle = style.accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(153, 174, 92, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#675879';
    ctx.font = '700 14px sans-serif';
    ctx.fillText('LUNEXA MUSIC BOT', 92, 302);

    ctx.fillStyle = style.accent;
    ctx.font = '700 15px sans-serif';
    ctx.fillText('LUNEXA  /  COMMAND GUIDE', 344, 96);
    ctx.fillStyle = '#8e70ae';
    ctx.font = '600 12px sans-serif';
    ctx.fillText('CATEGORY COLLECTION', 344, 116);

    drawFittedText(ctx, category.toUpperCase(), 344, 176, 610, '700 64px sans-serif', '#242033');
    drawFittedText(ctx, style.subtitle.toUpperCase(), 344, 207, 620, '600 16px sans-serif', '#6f617f');

    ctx.strokeStyle = style.accent;
    ctx.globalAlpha = 0.68;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(344, 230);
    ctx.lineTo(702, 230);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#8757b7';
    ctx.font = '700 18px sans-serif';
    ctx.fillText(`${commandCount} COMMANDS`, 344, 268);
    ctx.fillStyle = '#74677e';
    ctx.font = '600 12px sans-serif';
    ctx.fillText('SELECT A COMMAND BELOW', 624, 268);
    drawBannerWaveform(ctx, style.accent);

    return canvas.encode('png');
};

const createHomeLinkRow = (client) => {
    const inviteUrl = client.config?.links?.invite ||
        `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`;
    const supportUrl = client.config?.links?.support;
    const buttons = [
        new ButtonBuilder()
            .setLabel('Invite')
            .setStyle(ButtonStyle.Link)
            .setURL(inviteUrl)
    ];

    if (supportUrl) {
        buttons.push(
            new ButtonBuilder()
                .setLabel('Support')
                .setStyle(ButtonStyle.Link)
                .setURL(supportUrl.trim())
        );
    }

    return new ActionRowBuilder().addComponents(buttons);
};

const getHelpMessageFromResponse = async (context, response) => {
    if (response.message) return response.message;

    if (response.type === 'interaction' && response.interaction?.fetchReply) {
        return response.interaction.fetchReply();
    }

    if (response.messageId && context.channel?.messages?.fetch) {
        return context.channel.messages.fetch(response.messageId);
    }

    throw new Error('Help menu message could not be fetched after upload');
};

const sendHelpMenu = async (context, helpContainer, bannerAttachment, label = 'Help') => {
    const loadingResponse = await sendLoadingResponse(
        context,
        createLoadingPayload('HELP MENU', 'Loading categories and artwork...'),
        label
    );

    await updateImageResponse(context, loadingResponse, {
        files: [bannerAttachment],
        components: [helpContainer],
        flags: MessageFlags.IsComponentsV2
    }, label);

    return getHelpMessageFromResponse(context, loadingResponse);
};

const safelyUpdateComponent = async (interaction, payload) => {
    try {
        if (!await acknowledgeComponent(interaction)) return false;

        if (payload.files?.length) {
            await updateImageResponse(
                { __imageInteraction: interaction, client: interaction.client },
                { type: 'interaction', interaction, native: true },
                payload,
                'Help category'
            );
            return true;
        }

        await interaction.editReply(payload);
        return true;
    } catch (error) {
        logInteractionError(error);
        return false;
    }
};

const safelyReplyToComponent = async (interaction, payload) => {
    try {
        await interaction.reply(payload);
    } catch (error) {
        logInteractionError(error);
    }
};

const formatCommandList = (commandsList) => {
    if (commandsList.length === 0) return 'No commands found';

    return commandsList.map(command => {
        const description = (command.description || 'Open this command to see more details')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 150);
        return `**\`${command.name}\`**\n-# ${description}`;
    }).join('\n\n');
};

module.exports = {
    name: 'help',
    category: 'Information',
    aliases: ['h'],
    description: 'Shows all commands with categories',
    slashOptions: [
        {
            name: 'command',
            description: 'Shows about a specific command',
            type: 3,
            required: false,
            autocomplete: true
        }
    ],

    autocomplete: async (interaction, client) => {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const commandsPath = path.join(__dirname, '..', '..', 'commands');

        const allCommands = [];
        const categories = fs.readdirSync(commandsPath)
            .filter(file => fs.statSync(path.join(commandsPath, file)).isDirectory())
            .filter(folder => folder.toLowerCase() !== 'owner');

        for (const category of categories) {
            const categoryPath = path.join(commandsPath, category);
            const commandFiles = fs.readdirSync(categoryPath).filter(file => file.endsWith('.js'));

            for (const file of commandFiles) {
                const filePath = path.join(categoryPath, file);
                try {
                    const command = require(filePath);
                    if (command.name) {
                        allCommands.push({
                            name: command.name,
                            category: category
                        });
                    }
                } catch (error) {
                    console.error(`Error loading command at ${filePath}:`, error);
                }
            }
        }

        const filtered = allCommands
            .filter(cmd => cmd.name.toLowerCase().includes(focusedValue))
            .slice(0, 25)
            .map(cmd => ({
                name: `${cmd.name}`,
                value: cmd.name
            }));

        await interaction.respond(filtered).catch(() => { });
    },

    async slashExecute(interaction, client) {
        const commandName = interaction.options.getString('command');
        const commandsPath = path.join(__dirname, '..', '..', 'commands');


        if (commandName) {
            const allCategories = fs.readdirSync(commandsPath)
                .filter(file => fs.statSync(path.join(commandsPath, file)).isDirectory())
                .filter(folder => folder.toLowerCase() !== 'owner');

            let foundCommand = null;
            let commandCategory = null;

            for (const category of allCategories) {
                const categoryPath = path.join(commandsPath, category);
                const commandFiles = fs.readdirSync(categoryPath).filter(file => file.endsWith('.js'));

                for (const file of commandFiles) {
                    const filePath = path.join(categoryPath, file);
                    try {
                        const command = require(filePath);
                        const search = commandName.trim().toLowerCase().split(/\s+/)[0];
                        if (command.name && (command.name.toLowerCase() === search || (command.aliases && command.aliases.includes(search)))) {
                            foundCommand = command;
                            commandCategory = category;
                            break;
                        }
                    } catch (error) {
                        console.error(`Error loading command at ${filePath}:`, error);
                    }
                }
                if (foundCommand) break;
            }

            if (!foundCommand) {
                const errorDisplay = new TextDisplayBuilder()
                    .setContent(`**${emoji.cross} Command \`${commandName}\` not found.**`);

                const errorContainer = new ContainerBuilder()
                    .addTextDisplayComponents(errorDisplay);

                return interaction.reply({
                    components: [errorContainer],
                    flags: MessageFlags.IsComponentsV2
                });
            }

            const parts = commandName.trim().split(/\s+/);
            const subSearch = parts[1]?.toLowerCase();

            if (foundCommand.name === 'bio' && foundCommand.execute) {
                return foundCommand.execute(interaction, parts.slice(1), client, '/');
            }

            let displayDescription = foundCommand.description || 'No description available';
            let displayName = foundCommand.name;
            let displayUsage = foundCommand.usage;
            let displayExample = foundCommand.example;
            let displayAliases = foundCommand.aliases;

            if (subSearch && foundCommand.slashOptions) {
                const sub = foundCommand.slashOptions.find(opt =>
                    opt.type === 1 &&
                    (opt.name.toLowerCase() === subSearch || (opt.aliases && opt.aliases.includes(subSearch)))
                );
                if (sub) {
                    displayName = `${foundCommand.name} ${sub.name}`;
                    displayDescription = sub.description;
                    displayAliases = sub.aliases || [];

                    displayUsage = `${foundCommand.name} ${sub.name}`;
                    if (sub.options) {
                        sub.options.forEach(o => {
                            displayUsage += o.required ? ` <${o.name}>` : ` [${o.name}]`;
                        });
                    }

                    displayExample = `${foundCommand.name} ${sub.name}`;
                    if (sub.options && sub.options.length > 0) {
                        const o = sub.options[0];
                        if (o.type === 8) displayExample += " @Role";
                        else if (o.type === 6) displayExample += " @User";
                        else if (['song', 'query'].includes(o.name)) displayExample += " imagine dragons believer";
                        else displayExample += ` ${o.name}`;
                    }
                }
            }

            const container = new ContainerBuilder();
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`\`\`\` <> : Required | [] : Optional\`\`\``));
            container.addSeparatorComponents(new SeparatorBuilder());

            let usageStr = `/${displayName}`;
            if (displayUsage) {
                usageStr = `/${displayUsage}`;
            } else if (foundCommand.slashOptions && foundCommand.slashOptions.length > 0 && !subSearch) {
                foundCommand.slashOptions.forEach(opt => {
                    usageStr += opt.required ? ` <${opt.name}>` : ` [${opt.name}]`;
                });
            }

            let exampleStr = `/${displayName}`;
            if (displayExample) {
                exampleStr = `/${displayExample}`;
            } else if (foundCommand.slashOptions && foundCommand.slashOptions.length > 0 && !subSearch) {
                const opt = foundCommand.slashOptions[0];
                if (['song', 'query'].includes(opt.name)) exampleStr += ' imagine dragons believer';
                else if (opt.name === 'user') exampleStr += ' @user';
                else exampleStr += ` ${opt.name}`;
            }

            const aliases = (displayAliases && displayAliases.length > 0) ? displayAliases.map(a => `\`${a}\``).join(' , ') : 'None';

            const content = `> **\`${usageStr}\`**\n\n` +
                `${client.emoji.arrowright} ${displayDescription}\n` +
                `${client.emoji.arrowright} **Category :** ${commandCategory}\n` +
                (aliases !== 'None' ? `${client.emoji.arrowright} **Aliases :** ${aliases}\n` : '') +
                `${client.emoji.arrowright} **Example :** \`${exampleStr}\``;

            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
            container.addSeparatorComponents(new SeparatorBuilder());

            return interaction.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });
        }


        const categories = fs.readdirSync(commandsPath)
            .filter(file => fs.statSync(path.join(commandsPath, file)).isDirectory())
            .filter(folder => folder.toLowerCase() !== 'owner');

        const categoryData = {};
        for (const category of categories) {
            const categoryPath = path.join(commandsPath, category);
            const commandFiles = fs.readdirSync(categoryPath).filter(file => file.endsWith('.js'));

            categoryData[category] = [];
            for (const file of commandFiles) {
                const filePath = path.join(categoryPath, file);
                try {
                    const command = require(filePath);
                    if (command.name && command.description) {
                        categoryData[category].push({
                            name: command.name,
                            description: command.description,
                            emoji: command.emoji
                        });

                        if (command.subCommands && Array.isArray(command.subCommands)) {
                            command.subCommands.forEach(sub => {
                                categoryData[category].push({
                                    name: `${command.name} ${sub}`,
                                    isSub: true
                                });
                            });
                        }
                    }
                } catch (error) {
                    console.error(`Error loading command at ${filePath}:`, error);
                }
            }
        }

        const totalCommandCount = Object.values(categoryData)
            .reduce((total, commands) => total + commands.length, 0);
        const sortedCategories = sortCategories(categories);
        const botName = client.user.username;
        const serverPrefix = config.prefix || client.prefix || '.';
        const headerDisplay = new TextDisplayBuilder()
            .setContent(
                `### ${client.emoji.check} ${botName} Help Center\n` +
                `-# Music, utility, and server commands`
            );

        const separator = new SeparatorBuilder();

        const descriptionText =
            `Welcome to ${botName}.\n` +
            `Find music, utility, and server commands in a few clicks.`;

        const descriptionDisplay = new TextDisplayBuilder()
            .setContent(descriptionText);

        const separator2 = new SeparatorBuilder();

        const quickStartDisplay = new TextDisplayBuilder()
            .setContent(
                `${emoji.helpMenu.music} **Quick start**\n` +
                `Join a voice channel, then use \`${serverPrefix}play <song or URL>\`.\n` +
                `Run \`${serverPrefix}help <command>\` for full details.`
            );

        const categoryListDisplay = new TextDisplayBuilder()
            .setContent(
                `**Available categories**\n` +
                sortedCategories.map(category => {
                    const info = categoryInfo[category] || { emoji: emoji.helpMenu.information };
                    return `${info.emoji} ${category}`;
                }).join('\n')
            );

        const separator3 = new SeparatorBuilder();
        const categoryPromptDisplay = new TextDisplayBuilder()
            .setContent(`${emoji.helpMenu.home} **Pick a category below to explore Lunexa.**`);

        const banner = await createHelpBanner(client, totalCommandCount);
        const bannerAttachment = new AttachmentBuilder(banner, { name: 'help-menu.png' });
        const bannerDisplay = new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL('attachment://help-menu.png')
        );
        const linkRow = createHomeLinkRow(client);


        const categoryOptions = sortedCategories.map(cat => {
            const info = categoryInfo[cat] || { emoji: emoji.helpMenu.information, description: `${cat.toLowerCase()} commands` };
            return {
                label: cat,
                value: cat,
                description: info.description,
                emoji: parseEmoji(info.emoji)
            };
        });

        categoryOptions.unshift({
            label: 'Home',
            value: 'home',
            description: 'Go back to homepage',
            emoji: parseEmoji(emoji.helpMenu.home)
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_menu')
            .setPlaceholder('Select a category...')
            .addOptions(categoryOptions);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const helpContainer = new ContainerBuilder()
            .addTextDisplayComponents(headerDisplay)
            .addSeparatorComponents(separator)
            .addTextDisplayComponents(descriptionDisplay)
            .addSeparatorComponents(separator2)
            .addTextDisplayComponents(quickStartDisplay)
            .addTextDisplayComponents(categoryListDisplay)
            .addSeparatorComponents(separator3)
            .addTextDisplayComponents(categoryPromptDisplay)
            .addMediaGalleryComponents(bannerDisplay)
            .addActionRowComponents(row)
            .addActionRowComponents(linkRow);

        const interactionContext = {
            __imageInteraction: interaction,
            client
        };
        const sentMessage = await sendHelpMenu(
            interactionContext,
            helpContainer,
            bannerAttachment,
            'Help'
        );

        let lastActiveContainer = helpContainer;
        let lastActiveFiles = [bannerAttachment];

        const collector = sentMessage.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 120000 });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                const errorDisplay = new TextDisplayBuilder()
                    .setContent(`**${emoji.cross} You can't use this menu.**`);

                const errorContainer = new ContainerBuilder()
                    .addTextDisplayComponents(errorDisplay);

                return safelyReplyToComponent(i, {
                    components: [errorContainer],
                    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
                });
            }

            if (!await acknowledgeComponent(i)) return;

            const selectedValue = i.values[0];

            if (selectedValue === 'home') {
                lastActiveContainer = helpContainer;
                lastActiveFiles = [bannerAttachment];
                await safelyUpdateComponent(i, {
                    files: lastActiveFiles,
                    components: [helpContainer],
                    flags: MessageFlags.IsComponentsV2
                });
                return;
            }

            const selectedCategory = selectedValue;
            const commandsList = categoryData[selectedCategory];

            const categoryHeader = new TextDisplayBuilder()
                .setContent(`### ${client.emoji.check} ${selectedCategory} Commands [${commandsList.length}]\n-# Requested by ${interaction.user.displayName} • <t:${Math.floor(Date.now() / 1000)}:t>`);

            const catSeparator = new SeparatorBuilder();

            const commandsText = formatCommandList(commandsList);

            const commandsDisplay = new TextDisplayBuilder()
                .setContent(commandsText);

            const catSeparator2 = new SeparatorBuilder();

            let serverPrefix = config.prefix || '.';
            try {
                const prefixData = client.mongoDb.prefixes.get(interaction.guild.id);
                if (prefixData && prefixData.prefix) {
                    serverPrefix = prefixData.prefix;
                }
            } catch (err) {
            }

            const tipText = `-# use \`${serverPrefix}help <cmd name>\` to get more details`;
            const tipDisplay = new TextDisplayBuilder()
                .setContent(tipText);

            const categoryBanner = await createCategoryBanner(client, selectedCategory, commandsList.length);
            const categoryAttachment = new AttachmentBuilder(categoryBanner, { name: 'help-category.png' });
            const categoryBannerDisplay = new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL('attachment://help-category.png')
            );

            const categoryContainer = new ContainerBuilder()
                .addTextDisplayComponents(categoryHeader)
                .addSeparatorComponents(catSeparator)
                .addTextDisplayComponents(commandsDisplay)
                .addSeparatorComponents(catSeparator2)
                .addTextDisplayComponents(tipDisplay)
                .addMediaGalleryComponents(categoryBannerDisplay)
                .addActionRowComponents(row);

            lastActiveContainer = categoryContainer;
            lastActiveFiles = [categoryAttachment];
            await safelyUpdateComponent(i, {
                files: lastActiveFiles,
                components: [categoryContainer],
                flags: MessageFlags.IsComponentsV2
            });
        });

        collector.on('end', () => {
            selectMenu.setDisabled(true);
            selectMenu.setPlaceholder('Help Menu timed out');
            sentMessage.edit({
                files: lastActiveFiles,
                components: [lastActiveContainer]
            }).catch(() => { });
        });
    },

    async execute(message, args) {
        const client = message.client;
        const commandName = args[0];
        const commandsPath = path.join(__dirname, '..', '..', 'commands');

        if (commandName) {
            const allCategories = fs.readdirSync(commandsPath)
                .filter(file => fs.statSync(path.join(commandsPath, file)).isDirectory())
                .filter(folder => folder.toLowerCase() !== 'owner');

            let foundCommand = null;
            let commandCategory = null;

            for (const category of allCategories) {
                const categoryPath = path.join(commandsPath, category);
                const commandFiles = fs.readdirSync(categoryPath).filter(file => file.endsWith('.js'));

                for (const file of commandFiles) {
                    const filePath = path.join(categoryPath, file);
                    try {
                        const command = require(filePath);
                        const search = commandName.trim().toLowerCase().split(/\s+/)[0];
                        if (command.name && (command.name.toLowerCase() === search || (command.aliases && command.aliases.includes(search)))) {
                            foundCommand = command;
                            commandCategory = category;
                            break;
                        }
                    } catch (error) {
                        console.error(`Error loading command at ${filePath}:`, error);
                    }
                }
                if (foundCommand) break;
            }

            if (!foundCommand) {
                const errorDisplay = new TextDisplayBuilder()
                    .setContent(`**${emoji.cross} Command \`${commandName}\` not found.**`);

                const errorContainer = new ContainerBuilder()
                    .addTextDisplayComponents(errorDisplay);

                return message.channel.send({
                    components: [errorContainer],
                    flags: MessageFlags.IsComponentsV2
                });
            }

            let serverPrefix = '.';
            try {
                const prefixData = client.mongoDb.prefixes.get(message.guild.id);
                if (prefixData && prefixData.prefix) {
                    serverPrefix = prefixData.prefix;
                }
            } catch (err) {
            }

            const subSearch = args[1]?.toLowerCase();

            if (foundCommand.name === 'bio' && foundCommand.execute) {
                return foundCommand.execute(message, args.slice(1), message.client, serverPrefix);
            }

            let displayDescription = foundCommand.description || 'No description available';
            let displayName = foundCommand.name;
            let displayUsage = foundCommand.usage;
            let displayExample = foundCommand.example;
            let displayAliases = foundCommand.aliases;

            if (subSearch && foundCommand.slashOptions) {
                const sub = foundCommand.slashOptions.find(opt =>
                    opt.type === 1 &&
                    (opt.name.toLowerCase() === subSearch || (opt.aliases && opt.aliases.includes(subSearch)))
                );
                if (sub) {
                    displayName = `${foundCommand.name} ${sub.name}`;
                    displayDescription = sub.description;
                    displayAliases = sub.aliases || [];

                    displayUsage = `${foundCommand.name} ${sub.name}`;
                    if (sub.options) {
                        sub.options.forEach(o => {
                            displayUsage += o.required ? ` <${o.name}>` : ` [${o.name}]`;
                        });
                    }

                    displayExample = `${foundCommand.name} ${sub.name}`;
                    if (sub.options && sub.options.length > 0) {
                        const o = sub.options[0];
                        if (o.type === 8) displayExample += " @Role";
                        else if (o.type === 6) displayExample += " @User";
                        else if (['song', 'query'].includes(o.name)) displayExample += " imagine dragons believer";
                        else displayExample += ` ${o.name}`;
                    }
                }
            }

            const container = new ContainerBuilder();
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`\`\`\` <> : Required | [] : Optional\`\`\``));
            container.addSeparatorComponents(new SeparatorBuilder());

            let usageStr = `${serverPrefix}${displayName}`;
            if (displayUsage) {
                usageStr = `${serverPrefix}${displayUsage}`;
            } else if (foundCommand.slashOptions && foundCommand.slashOptions.length > 0 && !subSearch) {
                foundCommand.slashOptions.forEach(opt => {
                    usageStr += opt.required ? ` <${opt.name}>` : ` [${opt.name}]`;
                });
            }

            let exampleStr = `${serverPrefix}${displayName}`;
            if (displayExample) {
                exampleStr = `${serverPrefix}${displayExample}`;
            } else if (foundCommand.slashOptions && foundCommand.slashOptions.length > 0 && !subSearch) {
                const opt = foundCommand.slashOptions[0];
                if (['song', 'query'].includes(opt.name)) exampleStr += ' imagine dragons believer';
                else if (opt.name === 'user') exampleStr += ' @user';
                else exampleStr += ` ${opt.name}`;
            }

            const aliases = (displayAliases && displayAliases.length > 0) ? displayAliases.map(a => `\`${a}\``).join(' , ') : 'None';

            const content = `> **\`${usageStr}\`**\n\n` +
                `${emoji.arrowright} ${displayDescription}\n` +
                `${emoji.arrowright} **Category :** ${commandCategory}\n` +
                (aliases !== 'None' ? `${emoji.arrowright} **Aliases :** ${aliases}\n` : '') +
                `${emoji.arrowright} **Example :** \`${exampleStr}\``;

            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
            container.addSeparatorComponents(new SeparatorBuilder());

            return message.channel.send({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });
        }

        const categories = fs.readdirSync(commandsPath)
            .filter(file => fs.statSync(path.join(commandsPath, file)).isDirectory())
            .filter(folder => folder.toLowerCase() !== 'owner');

        const categoryData = {};
        for (const category of categories) {
            const categoryPath = path.join(commandsPath, category);
            const commandFiles = fs.readdirSync(categoryPath).filter(file => file.endsWith('.js'));

            categoryData[category] = [];
            for (const file of commandFiles) {
                const filePath = path.join(categoryPath, file);
                try {
                    const command = require(filePath);
                    if (command.name && command.description) {
                        categoryData[category].push({
                            name: command.name,
                            description: command.description,
                            emoji: command.emoji
                        });

                        if (command.subCommands && Array.isArray(command.subCommands)) {
                            command.subCommands.forEach(sub => {
                                categoryData[category].push({
                                    name: `${command.name} ${sub}`,
                                    isSub: true
                                });
                            });
                        }
                    }
                } catch (error) {
                    console.error(`Error loading command at ${filePath}:`, error);
                }
            }
        }

        const totalCommandCount = Object.values(categoryData)
            .reduce((total, commands) => total + commands.length, 0);
        const sortedCategories = sortCategories(categories);
        const botName = message.client.user.username;
        const homePrefix = config.prefix || client.prefix || '.';
        const headerDisplay = new TextDisplayBuilder()
            .setContent(
                `### ${emoji.helpMenu.home} ${botName} Help Center\n` +
                `-# Music, utility, and server commands`
            );

        const separator = new SeparatorBuilder();

        const descriptionText =
            `Welcome to ${botName}.\n` +
            `Find music, utility, and server commands in a few clicks.`;

        const descriptionDisplay = new TextDisplayBuilder()
            .setContent(descriptionText);

        const separator2 = new SeparatorBuilder();

        const quickStartDisplay = new TextDisplayBuilder()
            .setContent(
                `${emoji.helpMenu.music} **Quick start**\n` +
                `Join a voice channel, then use \`${homePrefix}play <song or URL>\`.\n` +
                `Run \`${homePrefix}help <command>\` for full details.`
            );

        const categoryListDisplay = new TextDisplayBuilder()
            .setContent(
                `**Available categories**\n` +
                sortedCategories.map(category => {
                    const info = categoryInfo[category] || { emoji: emoji.helpMenu.information };
                    return `${info.emoji} ${category}`;
                }).join('\n')
            );

        const separator3 = new SeparatorBuilder();
        const categoryPromptDisplay = new TextDisplayBuilder()
            .setContent(`${emoji.check} **Pick a category below to explore Lunexa.**`);
        const banner = await createHelpBanner(client, totalCommandCount);
        const bannerAttachment = new AttachmentBuilder(banner, { name: 'help-menu.png' });
        const bannerDisplay = new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL('attachment://help-menu.png')
        );
        const linkRow = createHomeLinkRow(client);


        const categoryOptions = sortedCategories.map(cat => {
            const info = categoryInfo[cat] || { emoji: emoji.helpMenu.information, description: `${cat.toLowerCase()} commands` };
            return {
                label: cat,
                value: cat,
                description: info.description,
                emoji: parseEmoji(info.emoji)
            };
        });

        categoryOptions.unshift({
            label: 'Home',
            value: 'home',
            description: 'Go back to homepage',
            emoji: parseEmoji(emoji.helpMenu.home)
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_menu')
            .setPlaceholder('Select a category...')
            .addOptions(categoryOptions);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const helpContainer = new ContainerBuilder()
            .addTextDisplayComponents(headerDisplay)
            .addSeparatorComponents(separator)
            .addTextDisplayComponents(descriptionDisplay)
            .addSeparatorComponents(separator2)
            .addTextDisplayComponents(quickStartDisplay)
            .addTextDisplayComponents(categoryListDisplay)
            .addSeparatorComponents(separator3)
            .addTextDisplayComponents(categoryPromptDisplay)
            .addMediaGalleryComponents(bannerDisplay)
            .addActionRowComponents(row)
            .addActionRowComponents(linkRow);

        const sentMessage = await sendHelpMenu(
            message,
            helpContainer,
            bannerAttachment,
            'Help'
        );

        let lastActiveContainer = helpContainer;
        let lastActiveFiles = [bannerAttachment];

        const collector = sentMessage.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 120000 });

        collector.on('collect', async interaction => {
            if (interaction.user.id !== message.author.id) {
                const errorDisplay = new TextDisplayBuilder()
                    .setContent(`**${emoji.cross} You can't use this menu.**`);

                const errorContainer = new ContainerBuilder()
                    .addTextDisplayComponents(errorDisplay);

                return safelyReplyToComponent(interaction, {
                    components: [errorContainer],
                    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
                });
            }

            if (!await acknowledgeComponent(interaction)) return;

            const selectedValue = interaction.values[0];

            if (selectedValue === 'home') {
                lastActiveContainer = helpContainer;
                lastActiveFiles = [bannerAttachment];
                await safelyUpdateComponent(interaction, {
                    files: lastActiveFiles,
                    components: [helpContainer],
                    flags: MessageFlags.IsComponentsV2
                });
                return;
            }

            const selectedCategory = selectedValue;
            const commandsList = categoryData[selectedCategory];

            const categoryHeader = new TextDisplayBuilder()
                .setContent(`### ${emoji.check} ${selectedCategory} Commands [${commandsList.length}]\n-# Requested by ${message.author.displayName} • <t:${Math.floor(Date.now() / 1000)}:t>`);

            const catSeparator = new SeparatorBuilder();

            const commandsText = formatCommandList(commandsList);

            const commandsDisplay = new TextDisplayBuilder()
                .setContent(commandsText);

            const catSeparator2 = new SeparatorBuilder();

            let serverPrefix = config.prefix || '.';
            try {
                const prefixData = client.mongoDb.prefixes.get(message.guild.id);
                if (prefixData && prefixData.prefix) {
                    serverPrefix = prefixData.prefix;
                }
            } catch (err) {
            }
            const tipText = `-# use \`${serverPrefix}help <cmd name>\` to get more details`;
            const tipDisplay = new TextDisplayBuilder()
                .setContent(tipText);

            const categoryBanner = await createCategoryBanner(client, selectedCategory, commandsList.length);
            const categoryAttachment = new AttachmentBuilder(categoryBanner, { name: 'help-category.png' });
            const categoryBannerDisplay = new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL('attachment://help-category.png')
            );

            const categoryContainer = new ContainerBuilder()
                .addTextDisplayComponents(categoryHeader)
                .addSeparatorComponents(catSeparator)
                .addTextDisplayComponents(commandsDisplay)
                .addSeparatorComponents(catSeparator2)
                .addTextDisplayComponents(tipDisplay)
                .addMediaGalleryComponents(categoryBannerDisplay)
                .addActionRowComponents(row);

            lastActiveContainer = categoryContainer;
            lastActiveFiles = [categoryAttachment];
            await safelyUpdateComponent(interaction, {
                files: lastActiveFiles,
                components: [categoryContainer],
                flags: MessageFlags.IsComponentsV2
            });
        });

        collector.on('end', () => {
            selectMenu.setDisabled(true);
            selectMenu.setPlaceholder('Help Menu timed out');
            sentMessage.edit({
                files: lastActiveFiles,
                components: [lastActiveContainer]
            }).catch(() => { });
        });
    }
};
