const {
    AttachmentBuilder,
    ContainerBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    MessageFlags
} = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const moment = require('moment');
const axios = require('axios');
const path = require('path');
const {
    createLoadingPayload,
    sendLoadingResponse,
    updateImageResponse
} = require('../../utils/discordImageResponse');

module.exports = {
    name: 'ping',
    aliases: ['latency', 'pong'],
    description: "Displays the bot's various latencies.",
    category: 'Information',
    slashOptions: [],

    async slashExecute(interaction, client) {
        const interactionWrapper = {
            guild: interaction.guild,
            channel: interaction.channel,
            author: interaction.user,
            member: interaction.member,
            client,
            __imageInteraction: interaction,
            createdTimestamp: interaction.createdTimestamp
        };

        const args = [];
        for (const option of interaction.options?.data || []) {
            if (option.value !== undefined) args.push(option.value.toString());
        }

        return this.execute(interactionWrapper, args, client, client.prefix);
    },

    async execute(message, args, client) {
        const requestStartedAt = Date.now();
        const loadingResponse = await sendLoadingResponse(
            message,
            createLoadingPayload('PING MONITOR', 'Measuring Lunexa services...'),
            'Ping'
        );
        const rawApiLatency = Number(client.ws?.ping);
        const apiLatency = Number.isFinite(rawApiLatency) && rawApiLatency >= 0
            ? rawApiLatency
            : null;

        const [dbLatency, lavalinkLatency] = await Promise.all([
            measureDatabaseLatency(client),
            measureLavalinkLatency(client)
        ]);

        const messageTimestamp = Number(message.createdTimestamp);
        const responseTime = Number.isFinite(messageTimestamp) && messageTimestamp > 0
            ? Math.max(0, Date.now() - messageTimestamp)
            : Date.now() - requestStartedAt;
        const requester = message.author || client.user;
        const avatarImg = await loadRequesterAvatar(requester);
        const healthy = (apiLatency === null || apiLatency < 400)
            && dbLatency !== 'Error'
            && lavalinkLatency !== 'Disconnected'
            && lavalinkLatency !== 'Error';

        const buffer = await renderPingCard({
            botName: client.user?.username || 'Lunexa',
            requesterName: requester?.globalName || requester?.username || 'Unknown user',
            requesterTag: requester?.username ? `@${requester.username}` : 'Discord user',
            requesterId: requester?.id || 'Unavailable',
            avatarImg,
            apiLatency: apiLatency === null ? 'N/A' : `${apiLatency} ms`,
            responseTime: `${responseTime} ms`,
            dbLatency,
            lavalinkLatency,
            status: healthy ? 'Operational' : 'Attention needed',
            statusColor: healthy ? '#87e6b0' : '#f1b76e',
            requestedAt: moment().format('DD MMM YYYY  •  HH:mm')
        });

        const attachment = new AttachmentBuilder(buffer, { name: 'ping.png' });
        const container = new ContainerBuilder()
            .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL('attachment://ping.png')
            ));

        return updateImageResponse(message, loadingResponse, {
            files: [attachment],
            components: [container],
            flags: MessageFlags.IsComponentsV2
        }, 'Ping');
    }
};

async function loadRequesterAvatar(user) {
    try {
        if (user?.displayAvatarURL) {
            const response = await axios.get(
                user.displayAvatarURL({ extension: 'png', size: 256 }),
                { responseType: 'arraybuffer', timeout: 5000 }
            );
            return loadImage(Buffer.from(response.data));
        }
    } catch {
        // The fallback keeps the image response available if Discord's CDN is slow.
    }

    const fallback = createCanvas(256, 256);
    const ctx = fallback.getContext('2d');
    const glow = ctx.createLinearGradient(0, 0, 256, 256);
    glow.addColorStop(0, '#cf9fff');
    glow.addColorStop(1, '#50357d');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
    ctx.font = '700 108px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((user?.username || 'S').charAt(0).toUpperCase(), 128, 166);
    ctx.textAlign = 'left';
    return loadImage(fallback.toBuffer('image/png'));
}

async function measureDatabaseLatency(client) {
    const start = performance.now();
    try {
        await client.mongoDb.ping();
        const elapsed = performance.now() - start;
        return elapsed < 1 ? `${elapsed.toFixed(3)} ms` : `${Math.round(elapsed)} ms`;
    } catch {
        return 'Error';
    }
}

async function measureLavalinkLatency(client) {
    try {
        const nodes = client.manager?.shoukaku?.nodes;
        if (nodes && nodes.size > 0) {
            const node = Array.from(nodes.values())[0];
            if (node && node.state === 1) {
                const start = Date.now();
                try {
                    await node.rest.resolve('ytsearch:test');
                    return `${Date.now() - start} ms`;
                } catch {
                    return 'Connected';
                }
            }
        }
        return 'Disconnected';
    } catch {
        return 'Error';
    }
}

async function renderPingCard(data) {
    const width = 1200;
    const height = 760;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    let backdrop = null;
    try {
        backdrop = await loadImage(
            path.join(process.cwd(), 'attached_assets', 'image_1789144441840.png')
        );
    } catch {
        // Keep the card usable if the optional artwork is unavailable.
    }

    ctx.fillStyle = '#1b0b18';
    ctx.fillRect(0, 0, width, height);

    if (backdrop) {
        drawImageCover(ctx, backdrop, 0, 0, width, height);
    }

    const leftShade = ctx.createLinearGradient(0, 0, 880, 0);
    leftShade.addColorStop(0, 'rgba(12, 6, 12, 0.76)');
    leftShade.addColorStop(0.58, 'rgba(18, 8, 18, 0.48)');
    leftShade.addColorStop(1, 'rgba(18, 8, 18, 0.12)');
    ctx.fillStyle = leftShade;
    ctx.fillRect(0, 0, width, height);

    const pinkGlow = ctx.createRadialGradient(820, 470, 0, 820, 470, 520);
    pinkGlow.addColorStop(0, 'rgba(255, 105, 178, 0.18)');
    pinkGlow.addColorStop(1, 'rgba(255, 105, 178, 0)');
    ctx.fillStyle = pinkGlow;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    roundedRect(ctx, 34, 30, 1132, 664, 26);
    ctx.fillStyle = 'rgba(17, 8, 17, 0.28)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 148, 201, 0.48)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    drawStatusDot(ctx, 74, 82, data.statusColor, 12);
    ctx.fillStyle = '#fff5fb';
    ctx.font = '800 35px sans-serif';
    ctx.fillText(data.botName, 108, 80);
    ctx.fillStyle = '#ff9fc9';
    ctx.font = '700 12px sans-serif';
    ctx.fillText('REAL-TIME SYSTEM METRICS', 110, 108);

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255, 220, 237, 0.7)';
    ctx.font = '700 11px sans-serif';
    ctx.fillText('SERVICE STATUS', 1128, 62);
    ctx.fillStyle = data.statusColor;
    ctx.font = '800 21px sans-serif';
    ctx.fillText(data.status.toUpperCase(), 1128, 91);
    ctx.fillStyle = 'rgba(255, 220, 237, 0.58)';
    ctx.font = '500 12px sans-serif';
    ctx.fillText(data.requestedAt, 1128, 116);
    ctx.textAlign = 'left';

    drawPinkRule(ctx, 58, 136, 1070);

    const panelFill = 'rgba(10, 5, 11, 0.52)';
    metricCard(ctx, 58, 164, 220, 112, 'GATEWAY LATENCY', data.apiLatency, '◉', data.statusColor);
    metricCard(ctx, 294, 164, 220, 112, 'DATABASE', data.dbLatency, '◇', '#ffb1d2');
    metricCard(ctx, 530, 164, 220, 112, 'LAVALINK', data.lavalinkLatency, '♫', '#ff8fbc');

    roundedRect(ctx, 58, 298, 692, 338, 20);
    ctx.fillStyle = panelFill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 148, 201, 0.2)';
    ctx.stroke();
    sectionTitle(ctx, 84, 336, 'NETWORK PULSE', 'Discord gateway response');
    drawLatencyArc(ctx, 174, 445, data.apiLatency, data.statusColor);
    ctx.fillStyle = '#ffeaf4';
    ctx.font = '800 34px sans-serif';
    ctx.fillText(data.apiLatency, 270, 434);
    ctx.fillStyle = 'rgba(255, 220, 237, 0.68)';
    ctx.font = '500 14px sans-serif';
    ctx.fillText(`Response received in ${data.responseTime}`, 270, 462);
    ctx.fillStyle = data.statusColor;
    ctx.font = '800 11px sans-serif';
    ctx.fillText('CONNECTION STABLE', 270, 494);

    serviceRow(ctx, 84, 540, 'DATABASE RESPONSE', data.dbLatency, '◇', '#ffb1d2');
    serviceRow(ctx, 84, 588, 'AUDIO ENGINE', data.lavalinkLatency, '♫', '#ff8fbc');

    roundedRect(ctx, 774, 164, 354, 472, 20);
    ctx.fillStyle = 'rgba(10, 5, 11, 0.46)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 148, 201, 0.28)';
    ctx.stroke();
    sectionTitle(ctx, 804, 204, 'INVOKED BY USER', 'Live request profile');
    drawAvatar(ctx, data.avatarImg, 804, 232, 112);
    drawStatusDot(ctx, 902, 329, data.statusColor, 7);
    drawFittedText(ctx, data.requesterName, 804, 382, 290, '800', 24, '#fff5fb');
    drawFittedText(ctx, data.requesterTag, 804, 410, 290, '500', 14, 'rgba(255, 220, 237, 0.68)');
    drawPinkRule(ctx, 804, 438, 294);
    profileDetail(ctx, 804, 470, 'USER ID', data.requesterId, 294);
    profileDetail(ctx, 804, 526, 'COMMAND', '/ping', 294, '#ff9fc9');
    profileDetail(ctx, 804, 582, 'REQUESTED', data.requestedAt, 294);

    roundedRect(ctx, 34, 710, 1132, 34, 12);
    ctx.fillStyle = 'rgba(17, 8, 17, 0.64)';
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 220, 237, 0.7)';
    ctx.font = '500 12px sans-serif';
    ctx.fillText('Lunexa  •  real-time connection monitor', 58, 732);
    ctx.textAlign = 'right';
    ctx.fillText(`PING • ${moment().format('HH:mm')}`, 1142, 732);
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

function drawPinkRule(ctx, x, y, width) {
    const gradient = ctx.createLinearGradient(x, y, x + width, y);
    gradient.addColorStop(0, '#ff4f9a');
    gradient.addColorStop(0.7, 'rgba(255, 79, 154, 0.42)');
    gradient.addColorStop(1, 'rgba(255, 79, 154, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, 2);
}

function metricCard(ctx, x, y, width, height, label, value, icon, color) {
    roundedRect(ctx, x, y, width, height, 16);
    ctx.fillStyle = 'rgba(10, 5, 11, 0.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 148, 201, 0.2)';
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = '800 20px sans-serif';
    ctx.fillText(icon, x + 18, y + 34);
    ctx.fillStyle = 'rgba(255, 220, 237, 0.7)';
    ctx.font = '700 10px sans-serif';
    ctx.fillText(label, x + 52, y + 27);
    drawFittedText(ctx, value, x + 18, y + 73, width - 36, '800', 25, '#fff5fb');
    drawProgressBar(ctx, x + 18, y + 91, width - 36, 5, color, serviceProgress(value), 1);
}

function drawAvatar(ctx, avatar, x, y, size) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, x, y, size, size);
    ctx.restore();
    ctx.strokeStyle = '#cda6ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.stroke();
}

function profileDetail(ctx, x, y, label, value, width, color = '#f8efff') {
    ctx.fillStyle = 'rgba(226, 204, 255, 0.5)';
    ctx.font = '700 10px sans-serif';
    ctx.fillText(label, x, y);
    drawFittedText(ctx, value, x, y + 22, width, '600', 14, color);
}

function drawLatencyArc(ctx, x, y, latency, color) {
    const numericLatency = Number.parseFloat(latency);
    const progress = Number.isFinite(numericLatency)
        ? Math.min(1, Math.max(0.12, 1 - numericLatency / 500))
        : 0.12;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(226, 204, 255, 0.12)';
    ctx.beginPath();
    ctx.arc(x, y, 53, -Math.PI * 0.8, Math.PI * 0.8);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 53, -Math.PI * 0.8, -Math.PI * 0.8 + Math.PI * 1.6 * progress);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = color;
    ctx.font = '700 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LIVE', x, y + 5);
    ctx.textAlign = 'left';
}

function serviceCard(ctx, x, y, width, height, label, value, icon, color) {
    roundedRect(ctx, x, y, width, height, 16);
    ctx.fillStyle = 'rgba(15, 9, 27, 0.38)';
    ctx.fill();
    ctx.fillStyle = 'rgba(191, 139, 255, 0.15)';
    ctx.beginPath();
    ctx.arc(x + 24, y + 28, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = '700 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(icon, x + 24, y + 33);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(226, 204, 255, 0.56)';
    ctx.font = '700 10px sans-serif';
    ctx.fillText(label, x + 48, y + 25);
    drawFittedText(ctx, value, x + 18, y + 60, width - 36, '700', 17, color);
    drawProgressBar(ctx, x + 18, y + 82, width - 36, 6, color, serviceProgress(value), 1);
}

function serviceProgress(value) {
    const text = String(value).toLowerCase();
    if (text.includes('error') || text.includes('disconnect')) return 0.18;
    if (text.includes('connect')) return 0.68;
    const numeric = Number.parseFloat(text);
    if (!Number.isFinite(numeric)) return 0.76;
    return Math.min(1, Math.max(0.12, 1 - numeric / 500));
}

function drawProgressBar(ctx, x, y, width, height, color, filledSegments, totalSegments) {
    const gap = 5;
    const segmentWidth = (width - gap * (totalSegments - 1)) / totalSegments;
    for (let index = 0; index < totalSegments; index++) {
        roundedRect(ctx, x + index * (segmentWidth + gap), y, segmentWidth, height, height / 2);
        ctx.fillStyle = index < filledSegments ? color : 'rgba(226, 204, 255, 0.12)';
        ctx.fill();
    }
}

function sectionTitle(ctx, x, y, title, subtitle) {
    ctx.fillStyle = '#f8efff';
    ctx.font = '800 15px sans-serif';
    ctx.fillText(title, x, y);
    ctx.fillStyle = 'rgba(226, 204, 255, 0.58)';
    ctx.font = '500 12px sans-serif';
    ctx.fillText(subtitle, x, y + 20);
}

function latencyTile(ctx, x, y, width, height, label, value, icon, color) {
    roundedRect(ctx, x, y, width, height, 16);
    ctx.fillStyle = 'rgba(15, 9, 27, 0.38)';
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = '700 24px sans-serif';
    ctx.fillText(icon, x + 18, y + 39);
    ctx.fillStyle = 'rgba(226, 204, 255, 0.56)';
    ctx.font = '700 11px sans-serif';
    ctx.fillText(label, x + 58, y + 31);
    drawFittedText(ctx, value, x + 58, y + 61, width - 80, '700', 24, '#fff7ff');
}

function serviceRow(ctx, x, y, label, value, icon, color) {
    ctx.fillStyle = 'rgba(191, 139, 255, 0.14)';
    ctx.beginPath();
    ctx.arc(x + 18, y + 8, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = '700 17px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(icon, x + 18, y + 14);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(226, 204, 255, 0.58)';
    ctx.font = '700 11px sans-serif';
    ctx.fillText(label, x + 54, y + 5);
    drawFittedTextRight(ctx, value, x + 500, y + 9, 220, '700', 17, color);
    ctx.strokeStyle = 'rgba(221, 195, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 54, y + 28);
    ctx.lineTo(x + 500, y + 28);
    ctx.stroke();
}

function drawLatencyMeter(ctx, x, y, width, latency, color) {
    const numericLatency = Number.parseFloat(latency);
    const progress = Number.isFinite(numericLatency)
        ? Math.min(1, Math.max(0.08, numericLatency / 500))
        : 0.08;
    ctx.fillStyle = 'rgba(226, 204, 255, 0.54)';
    ctx.font = '700 11px sans-serif';
    ctx.fillText('RESPONSE HEALTH', x, y);
    roundedRect(ctx, x, y + 20, width, 12, 6);
    ctx.fillStyle = 'rgba(15, 9, 27, 0.55)';
    ctx.fill();
    roundedRect(ctx, x, y + 20, width * progress, 12, 6);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = 'rgba(226, 204, 255, 0.5)';
    ctx.font = '500 12px sans-serif';
    ctx.fillText('Lower latency means a faster response', x, y + 58);
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

function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
}

function formatError(error) {
    if (!error) return 'unknown error';
    const cause = error.cause;
    const code = error.code || cause?.code;
    return `${error.name || 'Error'}${code ? ` [${code}]` : ''}: ${error.message || String(error)}`;
}