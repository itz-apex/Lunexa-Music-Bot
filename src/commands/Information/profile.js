const {
    AttachmentBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags
} = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const moment = require('moment');
const axios = require('axios');
const https = require('https');
const path = require('path');
const emoji = require('../../emojis');
const {
    createLoadingPayload,
    sendLoadingResponse,
    updateImageResponse
} = require('../../utils/discordImageResponse');

module.exports = {
    name: 'profile',
    aliases: ['pr'],
    description: "Displays your custom bot profile image.",
    category: 'Information',
    slashOptions: [
        {
            name: 'user',
            description: 'The user whose profile you want to see',
            type: 6,
            required: false
        }
    ],

    async slashExecute(interaction, client) {
        const user = interaction.options.getUser('user') || interaction.user;

        const messageMock = {
            guild: interaction.guild,
            channel: interaction.channel,
            author: interaction.user,
            member: interaction.member,
            client,
            __imageInteraction: interaction,
            __profileInteraction: interaction,
            mentions: {
                users: new Map([[user.id, user]])
            },
            reply: async (options) => {
                return deliverInteractionProfile(interaction, options);
            }
        };
        return this.execute(messageMock, [user.id], client);
    },

    async execute(message, args, client) {
        const loadingResponse = await sendLoadingResponse(
            message,
            createLoadingPayload('PROFILE CARD', 'Preparing your profile...'),
            'Profile'
        );
        let user;
        try {
            user = message.mentions?.users?.first()
                || (args[0] && await client.users.fetch(args[0]).catch(() => null))
                || message.author;
        } catch { user = message.author; }

        const member = await message.guild.members.fetch(user.id).catch(() => null);
        const presence = member?.presence;
        const status = presence?.status || 'offline';
        const isStreaming = presence?.activities?.some(a => a.type === 1) || false;

        const statusColors = {
            online: '#3ba55d',
            idle: '#faa61a',
            dnd: '#ed4245',
            offline: '#747f8d',
            streaming: '#593695'
        };
        const activeStatus = isStreaming ? 'streaming' : status;
        const statusColor = statusColors[activeStatus] || statusColors.offline;

        const profileData = client.mongoDb.profiles.get(user.id);
        const likedData = client.mongoDb.liked.get(user.id);
        const npData = client.mongoDb.noprefix.getGlobal(user.id);
        const musicPreference = client.mongoDb.userpreferences.get(user.id);

        const dbRank = profileData?.rank ?? "User";
        const rank = dbRank;

        const bio = profileData?.bio ?? "No bio is set.";
        const hasNp = !!npData && (!npData.expiresAt || new Date(npData.expiresAt).getTime() > Date.now());
        const favoriteCount = Array.isArray(likedData) ? likedData.length : 0;
        const sourceName = getMusicSourceName(musicPreference?.musicSource);
        const listening = getActiveListeningTime(client, user.id);

        let avatarImg;
        try {
            const res = await axios.get(user.displayAvatarURL({ extension: 'png', size: 512 }), { responseType: 'arraybuffer', timeout: 5000 });
            avatarImg = await loadImage(Buffer.from(res.data));
        } catch {
            const fallback = createCanvas(200, 200);
            const c = fallback.getContext('2d');
            c.fillStyle = '#111'; c.fillRect(0, 0, 200, 200);
            avatarImg = await loadImage(fallback.toBuffer('image/png'));
        }

        const redesignedBuffer = await renderRedesignedProfile({
            user,
            avatarImg,
            activeStatus,
            statusColor,
            profileData,
            rank,
            bio,
            hasNp,
            favoriteCount,
            sourceName,
            listening
        });
        const redesignedAttachment = new AttachmentBuilder(redesignedBuffer, { name: 'profile.png' });
        const redesignedContainer = new ContainerBuilder()
            .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL("attachment://profile.png")
            ));

        await updateImageResponse(message, loadingResponse, {
            files: [redesignedAttachment],
            components: [redesignedContainer],
            flags: MessageFlags.IsComponentsV2
        }, 'Profile');
        return;

        /* Legacy renderer kept inside an unreachable block for a safe migration.
        const width = 1000;
        const height = 562;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = "#030303";
        ctx.fillRect(0, 0, width, height);

        const glow = ctx.createRadialGradient(500, 281, 0, 500, 281, 600);
        glow.addColorStop(0, "rgba(0, 255, 106, 0.08)");
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
        ctx.lineWidth = 1;
        for (let i = 0; i < width; i += 50) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke();
        }
        for (let j = 0; j < height; j += 50) {
            ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(width, j); ctx.stroke();
        }

        const leftX = 60;
        const topY = 60;

        ctx.save();
        drawRoundedRect(ctx, leftX, topY, 140, 140, 70);
        ctx.clip();
        ctx.drawImage(avatarImg, leftX, topY, 140, 140);
        ctx.restore();

        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 4;
        drawRoundedRect(ctx, leftX, topY, 140, 140, 70);
        ctx.stroke();

        const sx = leftX + 120;
        const sy = topY + 120;
        const outerRadius = 18;
        const innerRadius = 12;

        ctx.fillStyle = "#333333";
        ctx.beginPath(); ctx.arc(sx, sy, outerRadius, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = statusColor;

        if (activeStatus === 'dnd') {
            ctx.beginPath(); ctx.arc(sx, sy, innerRadius, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#333333";
            ctx.fillRect(sx - 8, sy - 2, 16, 4);
        } else if (activeStatus === 'idle') {
            ctx.beginPath(); ctx.arc(sx, sy, innerRadius, 0, Math.PI * 2); ctx.fill();
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath(); ctx.arc(sx - 5, sy - 5, innerRadius, 0, Math.PI * 2); ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
        } else if (activeStatus === 'offline') {
            ctx.beginPath(); ctx.arc(sx, sy, innerRadius, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#333333";
            ctx.beginPath(); ctx.arc(sx, sy, innerRadius - 4, 0, Math.PI * 2); ctx.fill();
        } else if (activeStatus === 'streaming') {
            ctx.beginPath(); ctx.arc(sx, sy, innerRadius, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#333333";
            ctx.beginPath();
            ctx.moveTo(sx - 3, sy - 5);
            ctx.lineTo(sx + 5, sy);
            ctx.lineTo(sx - 3, sy + 5);
            ctx.closePath();
            ctx.fill();
        } else {
            ctx.beginPath(); ctx.arc(sx, sy, innerRadius, 0, Math.PI * 2); ctx.fill();
        }

        ctx.fillStyle = "#FFFFFF";
        let fontSize = 42;
        ctx.font = `bold ${fontSize}px sans-serif`;
        const maxNameWidth = 280;

        while (ctx.measureText(user.username).width > maxNameWidth && fontSize > 20) {
            fontSize -= 2;
            ctx.font = `bold ${fontSize}px sans-serif`;
        }
        ctx.fillText(user.username, leftX + 165, topY + 45);

        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.font = "400 18px sans-serif";
        ctx.fillText(`ID: ${user.id}`, leftX + 165, topY + 75);

        const tokens = bio.split(/(<a?:\w+:\d{17,20}>)/g).filter(t => t !== '');
        const loadedEmojis = new Map();

        const uniqueEmojiIds = [...new Set(bio.match(/\d{17,20}/g) || [])];
        for (const eid of uniqueEmojiIds.slice(0, 5)) {
            try {
                const url = `https://cdn.discordapp.com/emojis/${eid}.png`;
                const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 2000 });
                const img = await loadImage(Buffer.from(res.data));
                loadedEmojis.set(eid, img);
            } catch (e) {
                console.error(`Bio Emoji Fail: ${eid}`, e.message);
            }
        }

        const emojiSize = 24;
        const maxWidth = 380;
        const lines = [];
        let currentLine = [];
        let currentWidth = 0;

        for (const token of tokens) {
            const match = /<a?:\w+:(\d{17,20})>/.exec(token);
            if (match && loadedEmojis.has(match[1])) {
                const eid = match[1];
                if (currentWidth + emojiSize > maxWidth && currentLine.length > 0) {
                    lines.push({ tokens: currentLine, width: currentWidth });
                    currentLine = []; currentWidth = 0;
                }
                currentLine.push({ type: 'emoji', id: eid });
                currentWidth += emojiSize + 4;
            } else {
                const words = token.split(/(\s+)/);
                for (const word of words) {
                    if (!word) continue;
                    ctx.font = "20px sans-serif";
                    let wordWidth = ctx.measureText(word).width;

                    if (currentWidth + wordWidth > maxWidth) {
                        if (wordWidth > maxWidth) {
                            for (let i = 0; i < word.length; i++) {
                                const char = word[i];
                                const charWidth = ctx.measureText(char).width;
                                if (currentWidth + charWidth > maxWidth) {
                                    lines.push({ tokens: currentLine, width: currentWidth });
                                    currentLine = []; currentWidth = 0;
                                }
                                currentLine.push({ type: 'text', content: char });
                                currentWidth += charWidth;
                            }
                        } else {
                            if (currentLine.length > 0) {
                                lines.push({ tokens: currentLine, width: currentWidth });
                            }
                            currentLine = [{ type: 'text', content: word }];
                            currentWidth = wordWidth;
                        }
                    } else {
                        currentLine.push({ type: 'text', content: word });
                        currentWidth += wordWidth;
                    }
                }
            }
        }
        if (currentLine.length > 0) lines.push({ tokens: currentLine, width: currentWidth });

        const bioRect = { x: leftX, y: topY + 170, w: 420, h: 270 };
        const lineHeight = 30;
        const paddingTop = 30;
        const paddingLeft = 25;

        ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
        drawRoundedRect(ctx, bioRect.x, bioRect.y, bioRect.w, bioRect.h, 25);
        ctx.fill();

        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.textAlign = "start";
        let startY = bioRect.y + paddingTop + 15;

        lines.slice(0, 10).forEach(line => {
            let startX = bioRect.x + paddingLeft;
            line.tokens.forEach(tok => {
                if (tok.type === 'text') {
                    ctx.fillText(tok.content, startX, startY);
                    startX += ctx.measureText(tok.content).width;
                } else {
                    const img = loadedEmojis.get(tok.id);
                    if (img) {
                        ctx.drawImage(img, startX, startY - 18, emojiSize, emojiSize);
                        startX += emojiSize + 4;
                    }
                }
            });
            startY += lineHeight;
        });
        ctx.textAlign = "start";

        const rightX = 520;

        ctx.fillStyle = "#FFFFFF";
        ctx.font = "32px sans-serif";
        ctx.fillText("Badges", rightX, topY + 12);

        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(rightX, topY + 28);
        ctx.lineTo(width - 60, topY + 28);
        ctx.stroke();

        let bx = rightX;
        let by = topY + 65;

        const badgePriority = {
            'owner': 0,
            'developer': 1,
            'dev': 1,
            'manager': 2,
            'admin': 3,
            'staff': 4,
            'vip': 5,
            'user': 6,
            'no prefix': 7,
            'no prefix access': 7
        };

        const seenHashes = new Set();
        const finalUniqueBadges = [];

        const addToFinal = (rawName, type) => {
            if (!rawName) return;

            let name = rawName;
            if (rawName.includes(':')) {
                const parts = rawName.split(':');
                if (parts.length >= 2) name = parts[1];
            }

            const hash = name.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (hash === "user" || !hash) return;

            if (!seenHashes.has(hash)) {
                seenHashes.add(hash);
                finalUniqueBadges.push({ name: name, type: type, original: rawName });
            }
        };

        if (rank && rank.toLowerCase().trim() !== "user") {
            addToFinal(rank, 'rank');
        }
        if (hasNp) {
            addToFinal('No Prefix', 'special');
        }
        if (profileData?.badges && Array.isArray(profileData.badges)) {
            profileData.badges.forEach(b => {
                addToFinal(b, 'custom');
            });
        }

        const allBadges = finalUniqueBadges.sort((a, b) => {
            const getPrio = (name) => {
                const low = name.toLowerCase().trim();
                if (badgePriority[low] !== undefined) return badgePriority[low];
                if (low.includes('dev')) return 1;
                if (low.includes('prefix')) return 7;
                if (low.includes('owner')) return 0;
                return 99;
            };
            return getPrio(a.name) - getPrio(b.name);
        });

        const rankColors = {
            'Owner': '#f1c40f',
            'Developer': '#3e8aff',
            'Manager': '#ffcc00',
            'Admin': '#00ff66',
            'Staff': '#9147ff',
            'VIP': '#ff3eff',
            'User': '#ababab',
            'No prefix': '#ff0077'
        };

        for (let i = 0; i < allBadges.length; i++) {
            const b = allBadges[i];

            let cleanName = b.name.charAt(0).toUpperCase() + b.name.slice(1).toLowerCase().trim();
            const bColor = rankColors[cleanName] || "#00FF66";

            const cx = bx + 22.5;
            const cy = by;
            const checkName = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');

            const emojiStr = emoji[checkName] || emoji[cleanName.toLowerCase()];
            let emojiImg = null;

            if (emojiStr) {
                const emojiId = emojiStr.match(/\d{17,20}/)?.[0];
                if (emojiId) {
                    try {
                        const emojiUrl = `https://cdn.discordapp.com/emojis/${emojiId}.png`;
                        const res = await axios.get(emojiUrl, { responseType: 'arraybuffer', timeout: 3000 });
                        emojiImg = await loadImage(Buffer.from(res.data));
                    } catch (e) {
                        console.error(`Failed to load emoji for ${checkName}:`, e.message);
                    }
                }
            }

            if (emojiImg) {
                ctx.drawImage(emojiImg, bx + 5, by - 17, 35, 35);
            } else {
                ctx.fillStyle = bColor;
                if (checkName === 'owner') {
                    drawRoundedRect(ctx, cx - 12, cy + 8, 24, 6, 3); ctx.fill();
                    ctx.beginPath();
                    ctx.moveTo(cx - 15, cy + 5); ctx.lineTo(cx - 18, cy - 8); ctx.lineTo(cx - 8, cy + 1);
                    ctx.lineTo(cx, cy - 12); ctx.lineTo(cx + 8, cy + 1); ctx.lineTo(cx + 18, cy - 8);
                    ctx.lineTo(cx + 15, cy + 5); ctx.closePath(); ctx.fill();
                } else if (checkName === 'developer') {
                    drawRoundedRect(ctx, cx - 18, cy - 18, 36, 36, 8); ctx.fill();
                    ctx.fillStyle = "#FFFFFF";
                    ctx.font = "bold 16px monospace"; ctx.textAlign = "center";
                    ctx.fillText("</>", cx, cy + 6);
                } else if (checkName === 'vip') {
                    ctx.beginPath();
                    ctx.moveTo(cx, cy - 18); ctx.lineTo(cx + 18, cy); ctx.lineTo(cx, cy + 18); ctx.lineTo(cx - 18, cy);
                    ctx.closePath(); ctx.fill();
                } else if (checkName === 'noprefix') {
                    drawRoundedRect(ctx, cx - 18, cy - 18, 36, 36, 8); ctx.fill();
                    ctx.strokeStyle = "#FFFFFF";
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(cx - 8, cy + 8);
                    ctx.lineTo(cx + 8, cy - 8);
                    ctx.stroke();
                } else {
                    ctx.beginPath(); ctx.arc(cx + 4, cy - 6, 7, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.ellipse(cx + 4, cy + 10, 11, 8, 0, Math.PI, 0); ctx.fill();
                    ctx.fillStyle = bColor + "AA";
                    ctx.beginPath(); ctx.arc(cx - 8, cy - 4, 5, 0, Math.PI * 2); ctx.fill();
                    ctx.beginPath(); ctx.ellipse(cx - 8, cy + 8, 8, 5, 0, Math.PI, 0); ctx.fill();
                }
            }

            ctx.fillStyle = "#FFFFFF";
            ctx.font = "22px sans-serif";
            ctx.textAlign = "left";
            ctx.fillText(cleanName, bx + 60, by + 8);

            by += 65;
        }
        ctx.textAlign = "left";

        try {
            const buffer = await canvas.encode('png');
            // Keep the generated image in memory. Passing a file path makes
            // discord.js open a second stream while the REST request is being
            // retried, which can race with cleanup and produce partial uploads.
            const attachment = new AttachmentBuilder(buffer, { name: 'profile.png' });
            const container = new ContainerBuilder()
                .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL("attachment://profile.png")
                ))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `**${user.username}'s Profile**\n` +
                    `**Status:** ${activeStatus}  •  **Rank:** ${rank}\n` +
                    `**Badges:** ${allBadges.length ? allBadges.map(b => b.name).join(', ') : 'None'}\n` +
                    `**Liked songs:** ${Array.isArray(likedData) ? likedData.length : 0}\n` +
                    `**Bio:** ${String(bio).slice(0, 300)}`
                ));

            await deliverProfileResponse(message, {
                files: [attachment],
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });
        } catch (error) {
            console.error('[Profile] UI update failed:', formatError(error));
            throw error;
        }
        */
    }
};

async function renderRedesignedProfile({
    user,
    avatarImg,
    activeStatus,
    statusColor,
    profileData,
    rank,
    bio,
    hasNp,
    favoriteCount,
    sourceName,
    listening
}) {
    const width = 1200;
    const height = 760;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const badges = buildBadges(profileData, rank, hasNp);

    let backdrop = null;
    try {
        backdrop = await loadImage(
            path.join(process.cwd(), 'attached_assets', 'image_1789144441840.png')
        );
    } catch {
        // Keep the profile card usable if the optional artwork is unavailable.
    }

    ctx.fillStyle = '#1b0b18';
    ctx.fillRect(0, 0, width, height);

    if (backdrop) {
        drawImageCover(ctx, backdrop, 0, 0, width, height);
    }

    const pinkShade = ctx.createLinearGradient(0, 0, width, 0);
    pinkShade.addColorStop(0, 'rgba(15, 6, 14, 0.78)');
    pinkShade.addColorStop(0.48, 'rgba(20, 8, 18, 0.52)');
    pinkShade.addColorStop(1, 'rgba(20, 8, 18, 0.18)');
    ctx.fillStyle = pinkShade;
    ctx.fillRect(0, 0, width, height);

    const pinkGlow = ctx.createRadialGradient(900, 600, 0, 900, 600, 520);
    pinkGlow.addColorStop(0, 'rgba(255, 105, 178, 0.18)');
    pinkGlow.addColorStop(1, 'rgba(255, 105, 178, 0)');
    ctx.fillStyle = pinkGlow;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255, 205, 230, 0.06)';
    ctx.lineWidth = 1;
    for (let i = -height; i < width; i += 42) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + height, height);
        ctx.stroke();
    }

    const drawPanel = (x, y, w, h, fill = 'rgba(24, 8, 20, 0.58)') => {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 8;
        drawRoundedRect(ctx, x, y, w, h, 24);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = 'rgba(255, 165, 208, 0.28)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
    };

    const header = { x: 34, y: 30, w: 1132, h: 130 };
    drawPanel(header.x, header.y, header.w, header.h, 'rgba(28, 9, 23, 0.52)');

    const avatarX = 58;
    const avatarY = 53;
    const avatarSize = 84;
    ctx.save();
    drawRoundedRect(ctx, avatarX, avatarY, avatarSize, avatarSize, avatarSize / 2);
    ctx.clip();
    ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();

    ctx.strokeStyle = '#ff9fc9';
    ctx.lineWidth = 4;
    drawRoundedRect(ctx, avatarX, avatarY, avatarSize, avatarSize, avatarSize / 2);
    ctx.stroke();
    drawStatusDot(ctx, avatarX + avatarSize - 4, avatarY + avatarSize - 4, statusColor, 13);

    const displayName = user.globalName || user.username || 'Unknown user';
    drawFittedText(ctx, displayName, 166, 91, 490, 'bold', 34, '#fff5fb');
    ctx.font = '500 17px sans-serif';
    ctx.fillStyle = 'rgba(255, 220, 237, 0.72)';
    ctx.fillText(`@${user.username}`, 166, 119);
    drawPill(ctx, 166, 146, getStatusLabel(activeStatus), statusColor);

    ctx.fillStyle = '#ffb1d2';
    ctx.font = '700 13px sans-serif';
    ctx.fillText('PERSONAL PROFILE', 966, 76);
    ctx.fillStyle = '#fff5fb';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('Lunexa', 966, 111);
    ctx.fillStyle = 'rgba(255, 220, 237, 0.58)';
    ctx.font = '500 14px sans-serif';
    ctx.fillText('music • community • you', 966, 134);

    const info = { x: 34, y: 182, w: 560, h: 214 };
    const about = { x: 34, y: 418, w: 560, h: 308 };
    const activity = { x: 618, y: 182, w: 548, h: 544 };
    drawPanel(info.x, info.y, info.w, info.h);
    drawPanel(about.x, about.y, about.w, about.h);
    drawPanel(activity.x, activity.y, activity.w, activity.h);

    drawSectionTitle(ctx, info.x + 24, info.y + 34, 'PROFILE INFO', 'Your Discord identity');
    drawInfoItem(ctx, 'NAME', displayName, info.x + 24, info.y + 79, 228);
    drawInfoItem(ctx, 'USER ID', user.id, info.x + 300, info.y + 79, 228);
    drawInfoItem(ctx, 'STATUS', getStatusLabel(activeStatus), info.x + 24, info.y + 143, 228, statusColor);
    drawInfoItem(ctx, 'ACCOUNT CREATED', moment(user.createdAt).format('DD MMM YYYY'), info.x + 300, info.y + 143, 228);

    drawSectionTitle(ctx, about.x + 24, about.y + 34, 'ABOUT ME', 'A little bit about this user');
    drawRoundedRect(ctx, about.x + 22, about.y + 58, about.w - 44, 105, 16);
    ctx.fillStyle = 'rgba(12, 5, 11, 0.44)';
    ctx.fill();
    drawWrappedText(
        ctx,
        cleanCanvasText(bio),
        about.x + 40,
        about.y + 91,
        about.w - 80,
        25,
        3,
        '500 18px sans-serif',
        '#fff5fb'
    );

    drawSectionTitle(ctx, about.x + 24, about.y + 204, 'BADGES', `${badges.length} earned`);
    drawBadges(ctx, badges, about.x + 24, about.y + 235, about.w - 48);

    drawSectionTitle(ctx, activity.x + 24, activity.y + 34, 'ACTIVITY', 'Music preferences & live listening');
    drawActivityRow(ctx, '♫', 'FAVOURITE MUSIC', `${favoriteCount} saved track${favoriteCount === 1 ? '' : 's'}`, activity.x + 24, activity.y + 90, '#ff9fc9', activity.w - 48);
    drawActivityRow(ctx, '♪', 'MUSIC SOURCE', sourceName, activity.x + 24, activity.y + 158, '#ffb1d2', activity.w - 48);
    drawActivityRow(ctx, '✓', 'NO PREFIX', hasNp ? 'Active' : 'Inactive', activity.x + 24, activity.y + 226, hasNp ? '#87e6b0' : '#a8a0b4', activity.w - 48);
    drawActivityRow(ctx, '◷', 'ACTIVE LISTENING TIME', listening.label, activity.x + 24, activity.y + 294, '#ffcae1', activity.w - 48);

    ctx.strokeStyle = 'rgba(255, 165, 208, 0.2)';
    ctx.beginPath();
    ctx.moveTo(activity.x + 24, activity.y + 364);
    ctx.lineTo(activity.x + activity.w - 24, activity.y + 364);
    ctx.stroke();

    drawSectionTitle(
        ctx,
        activity.x + 24,
        activity.y + 406,
        'NOW PLAYING',
        listening.track ? 'Requested by this user' : 'No active session'
    );
    drawRoundedRect(ctx, activity.x + 24, activity.y + 430, activity.w - 48, 82, 16);
    ctx.fillStyle = 'rgba(255, 143, 188, 0.16)';
    ctx.fill();
    ctx.fillStyle = '#ffb1d2';
    ctx.font = '700 12px sans-serif';
    ctx.fillText(listening.track ? 'LISTENING NOW' : 'READY WHEN YOU ARE', activity.x + 44, activity.y + 458);
    drawFittedText(
        ctx,
        listening.track ? cleanCanvasText(listening.track) : 'Play a song with Lunexa to see it here',
        activity.x + 44,
        activity.y + 489,
        activity.w - 88,
        '600',
        18,
        '#fff5fb'
    );

    ctx.fillStyle = 'rgba(255, 220, 237, 0.58)';
    ctx.font = '500 13px sans-serif';
    ctx.fillText('Lunexa  •  your music, your profile', 42, 750);
    ctx.textAlign = 'right';
    ctx.fillText(`PROFILE • ${moment().format('YYYY')}`, width - 42, 750);
    ctx.textAlign = 'left';

    return canvas.encode('png');
}

function drawImageCover(ctx, image, x, y, width, height) {
    const scale = Math.max(width / image.width, height / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const offsetX = x + (width - drawWidth) / 2;
    const offsetY = y + (height - drawHeight) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
    ctx.restore();
}

function buildBadges(profileData, rank, hasNp) {
    const values = [];
    if (rank && rank.toLowerCase().trim() !== 'user') values.push(rank);
    if (hasNp) values.push('No Prefix');
    if (Array.isArray(profileData?.badges)) values.push(...profileData.badges);

    const seen = new Set();
    return values
        .map((value) => {
            const raw = String(value || '');
            const parts = raw.split(':');
            return (parts.length > 1 ? parts[1] : raw).trim();
        })
        .filter((name) => {
            const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!key || key === 'user' || seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => badgePriority(a) - badgePriority(b));
}

function badgePriority(name) {
    const value = name.toLowerCase();
    if (value.includes('owner')) return 0;
    if (value.includes('dev')) return 1;
    if (value.includes('manager')) return 2;
    if (value.includes('admin')) return 3;
    if (value.includes('staff')) return 4;
    if (value.includes('vip')) return 5;
    if (value.includes('prefix')) return 6;
    return 99;
}

function getMusicSourceName(source) {
    const names = {
        ytsearch: 'YouTube',
        ytmsearch: 'YouTube Music',
        spsearch: 'Spotify',
        dzsearch: 'Deezer',
        amsearch: 'Apple Music',
        scsearch: 'SoundCloud',
        jssearch: 'JioSaavn'
    };
    return names[source] || source || 'YouTube Music';
}

function getStatusLabel(status) {
    return {
        online: 'Online',
        idle: 'Idle',
        dnd: 'Do not disturb',
        offline: 'Offline',
        streaming: 'Streaming'
    }[status] || 'Offline';
}

function getActiveListeningTime(client, userId) {
    const players = client.manager?.players ? Array.from(client.manager.players.values()) : [];
    let elapsed = 0;
    let currentTrack = null;

    for (const player of players) {
        const track = player.queue?.current;
        const requesterId = track?.requester?.id || track?.requester;
        if (!track || requesterId !== userId || !player.playing) continue;

        elapsed += Math.max(0, Number(player.position) || 0);
        if (!currentTrack) currentTrack = track.title || 'Untitled track';
    }

    if (!currentTrack) return { label: 'Not listening', track: null };
    if (elapsed < 60_000) return { label: '<1 min active', track: currentTrack };
    return {
        label: `${Math.floor(elapsed / 60_000)} min active`,
        track: currentTrack
    };
}

function cleanCanvasText(value) {
    return String(value || 'No bio is set.')
        .replace(/<a?:\w+:\d{17,20}>/g, '•')
        .replace(/\s+/g, ' ')
        .trim() || 'No bio is set.';
}

function drawSectionTitle(ctx, x, y, title, subtitle) {
    ctx.fillStyle = '#f8efff';
    ctx.font = '800 15px sans-serif';
    ctx.fillText(title, x, y);
    ctx.fillStyle = 'rgba(226, 204, 255, 0.58)';
    ctx.font = '500 12px sans-serif';
    ctx.fillText(subtitle, x, y + 20);
}

function drawInfoItem(ctx, label, value, x, y, maxWidth, color = '#f8efff') {
    ctx.fillStyle = 'rgba(226, 204, 255, 0.54)';
    ctx.font = '700 11px sans-serif';
    ctx.fillText(label, x, y);
    if (label === 'STATUS') drawStatusDot(ctx, x + 7, y + 23, color, 6);
    drawFittedText(ctx, value, x + (label === 'STATUS' ? 19 : 0), y + 29, maxWidth - (label === 'STATUS' ? 19 : 0), '600', 17, color);
}

function drawActivityRow(ctx, icon, label, value, x, y, color, width) {
    ctx.fillStyle = 'rgba(191, 139, 255, 0.15)';
    ctx.beginPath();
    ctx.arc(x + 20, y + 20, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = '700 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(icon, x + 20, y + 27);
    ctx.textAlign = 'left';

    ctx.fillStyle = 'rgba(226, 204, 255, 0.56)';
    ctx.font = '700 11px sans-serif';
    ctx.fillText(label, x + 58, y + 12);
    drawFittedTextRight(ctx, value, x + width, y + 30, 250, '700', 17, '#fff7ff');
}

function drawBadges(ctx, badges, x, y, width) {
    if (!badges.length) {
        ctx.fillStyle = 'rgba(226, 204, 255, 0.58)';
        ctx.font = '500 15px sans-serif';
        ctx.fillText('No badges yet', x, y + 18);
        return;
    }

    let currentX = x;
    let currentY = y;
    for (const [index, rawName] of badges.slice(0, 8).entries()) {
        const name = rawName.charAt(0).toUpperCase() + rawName.slice(1).toLowerCase();
        ctx.font = '600 13px sans-serif';
        const chipWidth = ctx.measureText(name).width + 30;
        if (currentX + chipWidth > x + width) {
            currentX = x;
            currentY += 31;
        }
        if (currentY > y + 46) {
            const remaining = badges.length - index;
            ctx.fillStyle = 'rgba(226, 204, 255, 0.66)';
            ctx.font = '600 13px sans-serif';
            ctx.fillText(`+${remaining} more`, currentX, currentY + 18);
            break;
        }
        const color = badgeColor(name);
        drawRoundedRect(ctx, currentX, currentY, chipWidth, 26, 13);
        ctx.fillStyle = `${color}2e`;
        ctx.fill();
        ctx.strokeStyle = `${color}8c`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(currentX + 11, currentY + 13, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f8efff';
        ctx.fillText(name, currentX + 19, currentY + 18);
        currentX += chipWidth + 8;
    }
}

function badgeColor(name) {
    const value = name.toLowerCase();
    if (value.includes('owner')) return '#ffd166';
    if (value.includes('dev')) return '#8bb8ff';
    if (value.includes('vip')) return '#f2a7ff';
    if (value.includes('prefix')) return '#8fe6c0';
    return '#cda6ff';
}

function drawPill(ctx, x, y, label, color) {
    ctx.font = '700 12px sans-serif';
    const width = ctx.measureText(label).width + 28;
    drawRoundedRect(ctx, x, y - 17, width, 24, 12);
    ctx.fillStyle = `${color}2e`;
    ctx.fill();
    ctx.strokeStyle = `${color}99`;
    ctx.lineWidth = 1;
    ctx.stroke();
    drawStatusDot(ctx, x + 11, y - 5, color, 4);
    ctx.fillStyle = '#f8efff';
    ctx.fillText(label, x + 21, y - 1);
}

function drawStatusDot(ctx, x, y, color, radius) {
    ctx.fillStyle = 'rgba(12, 7, 22, 0.95)';
    ctx.beginPath();
    ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
}

function drawFittedText(ctx, value, x, y, maxWidth, weight, size, color) {
    const text = String(value ?? '');
    let fontSize = size;
    ctx.textAlign = 'left';
    while (fontSize > 11) {
        ctx.font = `${weight} ${fontSize}px sans-serif`;
        if (ctx.measureText(text).width <= maxWidth) break;
        fontSize -= 1;
    }
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
}

function drawFittedTextRight(ctx, value, rightX, y, maxWidth, weight, size, color) {
    const text = String(value ?? '');
    let fontSize = size;
    ctx.textAlign = 'right';
    while (fontSize > 11) {
        ctx.font = `${weight} ${fontSize}px sans-serif`;
        if (ctx.measureText(text).width <= maxWidth) break;
        fontSize -= 1;
    }
    ctx.fillStyle = color;
    ctx.fillText(text, rightX, y);
    ctx.textAlign = 'left';
}

function drawWrappedText(ctx, value, x, y, maxWidth, lineHeight, maxLines, font, color) {
    ctx.font = font;
    ctx.fillStyle = color;
    const words = String(value).split(' ');
    const lines = [];
    let line = '';

    for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (ctx.measureText(candidate).width <= maxWidth) {
            line = candidate;
        } else if (line) {
            lines.push(line);
            line = word;
        } else {
            lines.push(word);
            line = '';
        }
    }
    if (line) lines.push(line);

    const visibleLines = lines.slice(0, maxLines);
    if (lines.length > maxLines && visibleLines.length) {
        let last = visibleLines[visibleLines.length - 1];
        while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) last = last.slice(0, -1);
        visibleLines[visibleLines.length - 1] = `${last}…`;
    }
    visibleLines.forEach((lineText, index) => ctx.fillText(lineText, x, y + index * lineHeight));
}

function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

const TRANSIENT_DISCORD_ERRORS = new Set([
    'UND_ERR_SOCKET',
    'UND_ERR_ABORTED',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_BODY_TIMEOUT',
    'ECONNRESET',
    'ETIMEDOUT',
    'EPIPE'
]);

function formatError(error) {
    if (!error) return 'unknown error';
    const cause = error.cause;
    const code = error.code || cause?.code;
    return `${error.name || 'Error'}${code ? ` [${code}]` : ''}: ${error.message || String(error)}`;
}

function isTransientDiscordError(error) {
    const code = error?.code || error?.cause?.code;
    if (code && TRANSIENT_DISCORD_ERRORS.has(code)) return true;
    const message = `${error?.message || ''} ${error?.cause?.message || ''}`.toLowerCase();
    return message.includes('other side closed')
        || message.includes('socket')
        || message.includes('fetch failed')
        || message.includes('aborted');
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendWithRetry(send, label) {
    let lastError;

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            return await send();
        } catch (error) {
            lastError = error;
            if (!isTransientDiscordError(error) || attempt === 3) throw error;
            console.warn(`[Profile] ${label} upload attempt ${attempt} failed (${formatError(error)}); retrying.`);
            await wait(attempt * 750);
        }
    }

    throw lastError;
}

async function deliverProfileResponse(message, payload) {
    if (message.__profileInteraction) {
        return deliverInteractionProfile(message.__profileInteraction, payload);
    }

    if (message.channel?.id && message.client?.token) {
        try {
            return await sendNativeProfileUpload(
                message.client,
                `/api/v10/channels/${message.channel.id}/messages`,
                'POST',
                payload,
                'native channel'
            );
        } catch (error) {
            console.warn(`[Profile] Native channel upload failed (${formatError(error)}); trying Discord.js transport.`);
        }
    }

    let channelError;
    if (message.channel?.send) {
        try {
            return await sendWithRetry(() => message.channel.send(payload), 'channel');
        } catch (error) {
            channelError = error;
            console.warn(`[Profile] Channel upload failed (${formatError(error)}); trying reply fallback.`);
        }
    }

    if (typeof message.reply === 'function') {
        try {
            return await sendWithRetry(() => message.reply(payload), 'reply');
        } catch (error) {
            if (channelError) error.channelError = channelError;
            throw error;
        }
    }

    throw channelError || new Error('No message delivery method is available');
}

async function deliverInteractionProfile(interaction, payload) {
    const client = interaction.client;

    // Use a new native HTTPS connection for the multipart upload. This avoids
    // the stale/closed Undici TLS socket that affects both channel sends and
    // interaction webhook uploads in this environment.
    if (interaction.channel?.id && client?.token) {
        try {
            const sent = await sendNativeProfileUpload(
                client,
                `/api/v10/channels/${interaction.channel.id}/messages`,
                'POST',
                payload,
                'native slash channel'
            );
            await interaction.deleteReply().catch(error => {
                console.warn(`[Profile] Could not remove deferred response: ${formatError(error)}`);
            });
            return sent;
        } catch (error) {
            console.warn(`[Profile] Native slash channel upload failed (${formatError(error)}); trying Discord.js transport.`);
        }
    }

    // Keep the Discord.js channel route as a compatibility fallback for
    // clients where the native request is unavailable or rejected.
    if (interaction.channel?.send) {
        try {
            const sent = await sendWithRetry(() => interaction.channel.send(payload), 'slash channel');
            await interaction.deleteReply().catch(error => {
                console.warn(`[Profile] Could not remove deferred response: ${formatError(error)}`);
            });
            return sent;
        } catch (error) {
            console.warn(`[Profile] Slash channel upload failed (${formatError(error)}); trying interaction webhook.`);
        }
    }

    if (client?.token && interaction.applicationId && interaction.token && interaction.deferred) {
        try {
            return await sendNativeProfileUpload(
                client,
                `/api/v10/webhooks/${interaction.applicationId}/${interaction.token}/messages/@original`,
                'PATCH',
                payload,
                'native interaction webhook'
            );
        } catch (error) {
            console.warn(`[Profile] Native interaction webhook failed (${formatError(error)}); trying Discord.js webhook.`);
        }
    }

    if (interaction.deferred) {
        return sendWithRetry(() => interaction.editReply(payload), 'interaction webhook');
    }
    if (interaction.replied) {
        return sendWithRetry(() => interaction.followUp(payload), 'interaction follow-up');
    }
    return sendWithRetry(() => interaction.reply(payload), 'interaction reply');
}

async function sendNativeProfileUpload(client, requestPath, method, payload, label) {
    const body = createMultipartBody(payload);
    return sendWithRetry(
        () => nativeDiscordRequest({
            token: client.token,
            requestPath,
            method,
            body,
            boundary: body.boundary
        }),
        label
    );
}

function createMultipartBody(payload) {
    const boundary = `----GrooveProfile${Date.now().toString(36)}`;
    const files = (payload.files || []).map((file, index) => {
        const attachment = file.attachment;
        if (!Buffer.isBuffer(attachment)) {
            throw new TypeError('Profile attachment must be an in-memory Buffer');
        }
        return {
            id: String(index),
            filename: file.name || `profile-${index}.png`,
            description: file.description,
            data: attachment
        };
    });

    const components = (payload.components || []).map(component =>
        typeof component?.toJSON === 'function' ? component.toJSON() : component
    );
    const jsonPayload = {
        ...payload,
        components,
        attachments: files.map(({ id, filename, description }) => ({
            id,
            filename,
            ...(description ? { description } : {})
        }))
    };
    delete jsonPayload.files;

    const parts = [
        Buffer.from(
            `--${boundary}\r\n` +
            'Content-Disposition: form-data; name="payload_json"\r\n' +
            'Content-Type: application/json\r\n\r\n' +
            `${JSON.stringify(jsonPayload)}\r\n`
        )
    ];

    for (const file of files) {
        parts.push(Buffer.from(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="files[${file.id}]"; filename="${file.filename}"\r\n` +
            'Content-Type: image/png\r\n\r\n'
        ));
        parts.push(file.data);
        parts.push(Buffer.from('\r\n'));
    }
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    return {
        boundary,
        data: Buffer.concat(parts)
    };
}

function nativeDiscordRequest({ token, requestPath, method, body, boundary }) {
    return new Promise((resolve, reject) => {
        const request = https.request({
            hostname: 'discord.com',
            port: 443,
            path: requestPath,
            method,
            headers: {
                Authorization: `Bot ${token}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.data.length,
                'User-Agent': 'DiscordBot (https://discord.com, 14.22.1)'
            },
            agent: false,
            timeout: 60_000
        }, response => {
            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => {
                const responseBody = Buffer.concat(chunks).toString('utf8');
                if (response.statusCode >= 200 && response.statusCode < 300) {
                    try {
                        resolve(responseBody ? JSON.parse(responseBody) : null);
                    } catch {
                        resolve(responseBody);
                    }
                    return;
                }

                const error = new Error(`Discord API returned HTTP ${response.statusCode}: ${responseBody.slice(0, 500)}`);
                error.status = response.statusCode;
                reject(error);
            });
        });

        request.once('timeout', () => request.destroy(new Error('Native Discord request timed out')));
        request.once('error', reject);
        request.end(body.data);
    });
}