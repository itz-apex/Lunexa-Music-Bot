const {
  WebhookClient,
  ComponentType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  EmbedBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  AttachmentBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const { player_create } = require("../../config").Webhooks;
const axios = require("axios");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const {
  sendImageResponse,
  updateImageResponse
} = require("../../utils/discordImageResponse");

const NOW_PLAYING_REFRESH_INTERVAL = 15_000;
const NOW_PLAYING_RETRY_FLOOR = 15_000;

const createButtonRow = (client, paused) => {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("previous")
      .setEmoji(client.emoji.previous)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(paused ? "resume" : "pause")
      .setEmoji(paused ? client.emoji.play : client.emoji.pause)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("skip")
      .setEmoji(client.emoji.skip)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("like")
      .setEmoji(client.emoji.like)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("stop")
      .setEmoji(client.emoji.stop)
      .setStyle(ButtonStyle.Secondary)
  );
};

const createUtilityButtonRow = (client) => {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("volume")
      .setEmoji(client.emoji.volume)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("queue")
      .setEmoji(client.emoji.queue)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("lyrics")
      .setEmoji(client.emoji.lyrics)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("loop")
      .setEmoji(client.emoji.loop)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("autoplay")
      .setEmoji(client.emoji.autoplay)
      .setStyle(ButtonStyle.Secondary)
  );
};

function formatDuration(ms) {
  if (!ms || ms === 0) return 'Unknown';

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function cleanAuthorName(author) {
  if (!author) return 'Unknown Artist';

  return author.replace(/\s*-\s*Topic\s*$/i, '').trim();
}

function getRequesterInfo(track) {
  const requester = track?.requester;
  if (typeof requester === 'string') {
    return { name: requester, id: null };
  }

  return {
    name: requester?.globalName
      || requester?.displayName
      || requester?.username
      || requester?.tag
      || track?.requesterName
      || 'Unknown User',
    id: requester?.id || track?.requesterId || null
  };
}

function getSourceLabel(uri) {
  if (!uri) return 'STREAM';
  const source = String(uri).toLowerCase();
  if (source.includes('spotify')) return 'SPOTIFY';
  if (source.includes('youtube') || source.includes('youtu.be')) return 'YOUTUBE';
  if (source.includes('soundcloud')) return 'SOUNDCLOUD';
  if (source.includes('apple')) return 'APPLE MUSIC';
  return 'STREAM';
}

function getLoopLabel(player) {
  const loop = player?.loop || 'none';
  if (loop === 'track') return 'TRACK';
  if (loop === 'queue') return 'QUEUE';
  return 'OFF';
}

function getPlayerDetails(player, paused = false) {
  return {
    volume: Math.max(0, Math.min(100, Number(player?.volume ?? 100))),
    queue: Number(player?.queue?.length || 0),
    loop: getLoopLabel(player),
    autoplay: player?.data?.get('autoplay') ? 'ON' : 'OFF',
    state: paused || player?.paused ? 'PAUSED' : 'PLAYING'
  };
}

function truncateTitle(title, maxLength = 30) {
  if (!title) return 'Unknown Title';
  if (title.length <= maxLength) return title;
  return title.substring(0, maxLength) + '...';
}

function getCleanThumbnail(thumbnailUrl) {
  if (!thumbnailUrl) return null;

  if (thumbnailUrl.includes('i.ytimg.com') || thumbnailUrl.includes('img.youtube.com')) {
    const videoIdMatch = thumbnailUrl.match(/vi\/([^\/]+)\//);
    if (videoIdMatch && videoIdMatch[1]) {
      return `https://i.ytimg.com/vi/${videoIdMatch[1]}/maxresdefault.jpg`;
    }
  }

  return thumbnailUrl;
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fitCanvasText(ctx, text, x, y, maxWidth, font, fillStyle) {
  ctx.font = font;
  let value = String(text || "");
  while (value.length > 1 && ctx.measureText(value).width > maxWidth) {
    value = `${value.slice(0, -2)}…`;
  }
  ctx.fillStyle = fillStyle;
  ctx.fillText(value, x, y);
}

function drawInfoChip(ctx, x, y, width, label, value, accent) {
  ctx.save();
  roundedRect(ctx, x, y, width, 44, 12);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.055)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.11)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = 'rgba(237, 245, 244, 0.54)';
  ctx.font = '700 9px sans-serif';
  ctx.fillText(label, x + 12, y + 16);
  ctx.fillStyle = accent;
  ctx.font = '700 14px sans-serif';
  ctx.fillText(value, x + 12, y + 34);
  ctx.restore();
}

function drawAuroraRibbon(ctx, color, y, bend) {
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-80, y);
  ctx.bezierCurveTo(220, y - bend, 420, y + bend, 700, y - 12);
  ctx.bezierCurveTo(860, y - 28, 1010, y + bend, 1280, y - 42);
  ctx.stroke();
  ctx.restore();
}

function drawEqualizer(ctx, x, y, colorA, colorB) {
  const bars = [18, 30, 12, 42, 25, 36, 16, 28, 44, 22, 34, 15];

  ctx.save();
  bars.forEach((barHeight, index) => {
    const barX = x + index * 7;
    const gradient = ctx.createLinearGradient(0, y + 48, 0, y + 48 - barHeight);
    gradient.addColorStop(0, colorA);
    gradient.addColorStop(1, index % 2 === 0 ? colorB : colorA);
    roundedRect(ctx, barX, y + 48 - barHeight, 4, barHeight, 2);
    ctx.fillStyle = gradient;
    ctx.fill();
  });
  ctx.restore();
}

async function loadArtwork(thumbnailUrl) {
  if (!thumbnailUrl) return null;

  try {
    const response = await axios.get(thumbnailUrl, {
      responseType: "arraybuffer",
      timeout: 8000,
      headers: { "User-Agent": "Lunexa Music Bot" }
    });
    return await loadImage(Buffer.from(response.data));
  } catch {
    return null;
  }
}

async function renderNowPlayingCard(track, player) {
  const width = 1200;
  const height = 520;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const accent = "#8BFFD7";
  const accentBright = "#D4FFF0";
  const purple = "#A88CFF";
  const blue = "#72C8FF";
  const details = getPlayerDetails(player);
  const requester = getRequesterInfo(track);
  const source = getSourceLabel(track.uri || track.url);
  const duration = Number(track.length || track.duration || 0);
  const rawPosition = Number(player?.position || player?.positionMs || 0);
  const position = Number.isFinite(rawPosition) ? Math.max(0, rawPosition) : 0;
  const progress = duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;
  const artworkUrl = getCleanThumbnail(track.thumbnail || track.artworkUrl || track.image);
  const cachedArtwork = player?.data?.get("nowPlayingArtwork");
  let artwork = cachedArtwork?.url === artworkUrl ? cachedArtwork.image : null;
  if (!cachedArtwork || cachedArtwork.url !== artworkUrl) {
    artwork = await loadArtwork(artworkUrl);
    player?.data?.set("nowPlayingArtwork", { url: artworkUrl, image: artwork });
  }

  ctx.fillStyle = "#070A12";
  ctx.fillRect(0, 0, width, height);

  const baseGradient = ctx.createLinearGradient(0, 0, width, height);
  baseGradient.addColorStop(0, "#050812");
  baseGradient.addColorStop(0.48, "#0B1020");
  baseGradient.addColorStop(1, "#110C24");
  ctx.fillStyle = baseGradient;
  ctx.fillRect(0, 0, width, height);

  if (artwork) {
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.filter = "blur(72px)";
    ctx.drawImage(artwork, -120, -120, width + 240, height + 240);
    ctx.restore();
  }

  const indigoGlow = ctx.createRadialGradient(1010, -20, 0, 1010, -20, 560);
  indigoGlow.addColorStop(0, "rgba(125, 108, 255, 0.2)");
  indigoGlow.addColorStop(0.42, "rgba(82, 89, 190, 0.07)");
  indigoGlow.addColorStop(1, "rgba(15, 17, 39, 0)");
  ctx.fillStyle = indigoGlow;
  ctx.fillRect(0, 0, width, height);

  const mintGlow = ctx.createRadialGradient(40, 540, 0, 40, 540, 500);
  mintGlow.addColorStop(0, "rgba(71, 224, 186, 0.13)");
  mintGlow.addColorStop(0.48, "rgba(42, 137, 153, 0.045)");
  mintGlow.addColorStop(1, "rgba(7, 13, 24, 0)");
  ctx.fillStyle = mintGlow;
  ctx.fillRect(0, 0, width, height);

  const centerGlow = ctx.createRadialGradient(610, 210, 0, 610, 210, 520);
  centerGlow.addColorStop(0, "rgba(97, 128, 255, 0.06)");
  centerGlow.addColorStop(1, "rgba(7, 10, 18, 0)");
  ctx.fillStyle = centerGlow;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.1;
  const diagonalSheen = ctx.createLinearGradient(-200, 80, 860, 520);
  diagonalSheen.addColorStop(0, "rgba(255, 255, 255, 0)");
  diagonalSheen.addColorStop(0.48, "rgba(142, 168, 255, 0.18)");
  diagonalSheen.addColorStop(0.72, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = diagonalSheen;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  for (let index = 0; index < 46; index++) {
    const x = (index * 97 + 23) % width;
    const y = (index * 53 + 19) % height;
    const size = index % 5 === 0 ? 2 : 1;
    ctx.fillStyle = index % 4 === 0
      ? "rgba(139, 255, 215, 0.12)"
      : "rgba(195, 204, 255, 0.08)";
    ctx.fillRect(x, y, size, size);
  }

  const readabilityOverlay = ctx.createLinearGradient(0, 0, width, 0);
  readabilityOverlay.addColorStop(0, "rgba(4, 7, 15, 0.22)");
  readabilityOverlay.addColorStop(0.52, "rgba(4, 7, 15, 0.06)");
  readabilityOverlay.addColorStop(1, "rgba(4, 7, 15, 0.18)");
  ctx.fillStyle = readabilityOverlay;
  ctx.fillRect(0, 0, width, height);

  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    120,
    width / 2,
    height / 2,
    720
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.34)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.34)";
  ctx.shadowBlur = 34;
  roundedRect(ctx, 34, 28, 1132, 464, 30);
  ctx.fillStyle = "rgba(7, 10, 22, 0.86)";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(190, 214, 255, 0.16)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = accent;
  roundedRect(ctx, 66, 61, 4, 360, 2);
  ctx.fill();
  ctx.fill();

  const artworkX = 92;
  const artworkY = 92;
  const artworkSize = 286;
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.62)";
  ctx.shadowBlur = 34;
  roundedRect(ctx, artworkX, artworkY, artworkSize, artworkSize, 28);
  ctx.fillStyle = "#11182A";
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedRect(ctx, artworkX, artworkY, artworkSize, artworkSize, 28);
  ctx.clip();
  if (artwork) {
    const sourceRatio = artwork.width / artwork.height;
    let drawWidth = artworkSize;
    let drawHeight = artworkSize;
    let offsetX = artworkX;
    let offsetY = artworkY;
    if (sourceRatio > 1) {
      drawWidth = artworkSize * sourceRatio;
      offsetX -= (drawWidth - artworkSize) / 2;
    } else {
      drawHeight = artworkSize / sourceRatio;
      offsetY -= (drawHeight - artworkSize) / 2;
    }

    ctx.globalAlpha = 0.34;
    ctx.filter = "blur(20px)";
    ctx.drawImage(artwork, artworkX, artworkY, artworkSize, artworkSize);
    ctx.globalAlpha = 1;
    ctx.filter = "none";
    ctx.drawImage(artwork, offsetX, offsetY, drawWidth, drawHeight);
  } else {
    const fallbackGradient = ctx.createLinearGradient(
      artworkX,
      artworkY,
      artworkX + artworkSize,
      artworkY + artworkSize
    );
    fallbackGradient.addColorStop(0, "#7C5CFF");
    fallbackGradient.addColorStop(0.5, "#176B8F");
    fallbackGradient.addColorStop(1, "#65E7B7");
    ctx.fillStyle = fallbackGradient;
    ctx.fillRect(artworkX, artworkY, artworkSize, artworkSize);
    ctx.globalAlpha = 0.18;
    for (let index = 0; index < 7; index++) {
      ctx.beginPath();
      ctx.arc(
        artworkX + 35 + index * 48,
        artworkY + 62 + (index % 2) * 126,
        76,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
  }
  ctx.restore();

  ctx.strokeStyle = "rgba(139, 255, 215, 0.9)";
  ctx.lineWidth = 2;
  roundedRect(ctx, artworkX, artworkY, artworkSize, artworkSize, 28);
  ctx.stroke();

  ctx.fillStyle = "rgba(7, 10, 22, 0.72)";
  roundedRect(ctx, artworkX + 16, artworkY + 16, 116, 30, 15);
  ctx.fill();
  ctx.fillStyle = accentBright;
  ctx.font = "700 10px sans-serif";
  ctx.fillText(details.state === "PAUSED" ? "PAUSED" : "PLAYING", artworkX + 30, artworkY + 36);

  const contentX = 430;
  const contentRight = 1082;
  const contentWidth = contentRight - contentX;

  ctx.fillStyle = "rgba(139, 255, 215, 0.12)";
  roundedRect(ctx, contentX, 64, 160, 30, 15);
  ctx.fill();
  ctx.strokeStyle = "rgba(139, 255, 215, 0.34)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = accentBright;
  ctx.font = "700 11px sans-serif";
  ctx.fillText("LUNEXA  /  MUSIC", contentX + 18, 84);

  ctx.fillStyle = "rgba(237, 245, 244, 0.5)";
  ctx.font = "700 12px sans-serif";
  ctx.fillText("NOW PLAYING", contentX, 133);

  ctx.fillStyle = "rgba(237, 245, 244, 0.12)";
  roundedRect(ctx, 964, 64, 118, 30, 15);
  ctx.fill();
  ctx.fillStyle = blue;
  ctx.font = "700 10px sans-serif";
  ctx.fillText(source, 980, 84);

  fitCanvasText(
    ctx,
    track.title || "Unknown Title",
    contentX,
    187,
    contentWidth,
    "700 42px sans-serif",
    "#F7FFFB"
  );
  fitCanvasText(
    ctx,
    cleanAuthorName(track.author),
    contentX,
    224,
    contentWidth,
    "500 21px sans-serif",
    "rgba(237, 245, 244, 0.68)"
  );

  ctx.fillStyle = "rgba(237, 245, 244, 0.48)";
  ctx.font = "500 13px sans-serif";
  ctx.fillText("REQUESTED BY", contentX, 258);
  fitCanvasText(
    ctx,
    requester.name,
    contentX + 104,
    258,
    contentWidth - 104,
    "600 13px sans-serif",
    accentBright
  );

  const progressX = contentX;
  const progressY = 298;
  const progressWidth = contentWidth;
  ctx.fillStyle = "rgba(237, 245, 244, 0.12)";
  roundedRect(ctx, progressX, progressY, progressWidth, 10, 5);
  ctx.fill();
  const progressGradient = ctx.createLinearGradient(progressX, 0, contentRight, 0);
  progressGradient.addColorStop(0, accent);
  progressGradient.addColorStop(0.6, blue);
  progressGradient.addColorStop(1, purple);
  ctx.fillStyle = progressGradient;
  roundedRect(ctx, progressX, progressY, Math.max(10, progressWidth * progress), 10, 5);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(progressX + Math.max(10, progressWidth * progress), progressY + 5, 7, 0, Math.PI * 2);
  ctx.fillStyle = "#F7FFFB";
  ctx.fill();

  ctx.fillStyle = "rgba(237, 245, 244, 0.5)";
  ctx.font = "600 12px sans-serif";
  ctx.fillText(formatDuration(position) === "Unknown" ? "0:00" : formatDuration(position), progressX, 327);
  ctx.textAlign = "right";
  ctx.fillText(formatDuration(duration), contentRight, 327);
  ctx.textAlign = "left";

  const chipY = 356;
  const chipWidth = 153;
  const chipGap = 12;
  drawInfoChip(ctx, contentX, chipY, chipWidth, "VOLUME", `${details.volume}%`, accent);
  drawInfoChip(ctx, contentX + (chipWidth + chipGap), chipY, chipWidth, "QUEUE", `${details.queue}`, purple);
  drawInfoChip(ctx, contentX + (chipWidth + chipGap) * 2, chipY, chipWidth, "LOOP", details.loop, blue);
  drawInfoChip(ctx, contentX + (chipWidth + chipGap) * 3, chipY, chipWidth, "AUTOPLAY", details.autoplay, accent);

  drawEqualizer(ctx, 1002, 113, accent, purple);

  ctx.fillStyle = "rgba(237, 245, 244, 0.3)";
  ctx.font = "600 10px sans-serif";
  ctx.fillText("HIGH QUALITY AUDIO  •  LUNEXA MUSIC", contentX, 465);

  ctx.fillStyle = "rgba(139, 255, 215, 0.75)";
  ctx.fillRect(contentRight - 42, 462, 42, 2);

  return canvas.encode("png");
}

function buildNowPlayingContainer(client, track, paused, player) {
  const trackUrl = track.uri || track.url;
  const requester = getRequesterInfo(track);
  const requesterLabel = requester.id
    ? `[${requester.name}](https://discord.com/users/${requester.id})`
    : requester.name;
  const details = getPlayerDetails(player, paused);
  const title = trackUrl
    ? `[${truncateTitle(track.title)}](${trackUrl})`
    : truncateTitle(track.title);
  const infoDisplay = new TextDisplayBuilder()
    .setContent(
      `### ${title}\n` +
      `> **Author:** ${cleanAuthorName(track.author)}\n` +
      `> **Duration:** \`${formatDuration(track.length || track.duration || 0)}\`  |  **Requester:** ${requesterLabel}\n` +
      `> **Volume:** \`${details.volume}%\`  |  **Queue:** \`${details.queue}\`  |  **Loop:** \`${details.loop}\`  |  **Autoplay:** \`${details.autoplay}\``
    );

  const container = new ContainerBuilder()
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL("attachment://now-playing.png")
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(infoDisplay);

  const buttonRow = createButtonRow(client, paused);
  container
    .addActionRowComponents(buttonRow)
    .addActionRowComponents(createUtilityButtonRow(client));

  return container;
}

async function buildNowPlayingPayload(client, player, track, paused) {
  const artwork = await renderNowPlayingCard(track, player);
  const attachment = new AttachmentBuilder(artwork, { name: "now-playing.png" });

  return {
    files: [attachment],
    components: [buildNowPlayingContainer(client, track, paused, player)],
    flags: MessageFlags.IsComponentsV2
  };
}

async function sendNowPlaying(client, player, track) {
  try {
    const channel = client.channels.cache.get(player.textId);
    if (!channel) {
      return null;
    }

    try {
      const payload = await buildNowPlayingPayload(client, player, track, player.paused || false);
      const response = await sendImageResponse({ channel, client }, payload, "Now Playing");
      const message = response?.id && channel.messages?.fetch
        ? await channel.messages.fetch(response.id).catch(() => response)
        : response;

      player.data?.set("currentTrack", track);
      return message;
    } catch (embedError) {
      console.error("[Now Playing] Failed to send control message:", embedError);
      return null;
    }
  } catch (error) {
    console.error("[Now Playing] Failed to prepare control message:", error);
    return null;
  }
}

function getRetryAfterMs(error) {
  const discordJsRetryAfter = Number(error?.retryAfter);
  if (Number.isFinite(discordJsRetryAfter) && discordJsRetryAfter > 0) {
    return discordJsRetryAfter;
  }

  const rawRetryAfter = Number(
    error?.data?.retry_after
      || error?.rawError?.retry_after
  );
  if (Number.isFinite(rawRetryAfter) && rawRetryAfter > 0) {
    return rawRetryAfter * 1000;
  }

  const message = String(error?.message || "");
  const retryMatch = message.match(/retry[_ -]?after["':= ]+([0-9.]+)/i);
  if (retryMatch) {
    const retryAfter = Number(retryMatch[1]);
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      return retryAfter * 1000;
    }
  }

  return NOW_PLAYING_RETRY_FLOOR;
}

function stopNowPlayingRefresh(player) {
  const timer = player?.data?.get("nowPlayingRefreshTimer");
  if (timer) {
    clearInterval(timer);
    player.data.delete("nowPlayingRefreshTimer");
  }
  player?.data?.delete("nowPlayingUpdateInFlight");
  player?.data?.delete("nowPlayingArtwork");
}

function startNowPlayingRefresh(client, player) {
  stopNowPlayingRefresh(player);

  const timer = setInterval(() => {
    if (
      !player?.data?.get("message")
      || !player?.queue?.current
      || !player.playing
      || player.paused
    ) {
      return;
    }

    updateNowPlayingButtons(
      client,
      player,
      false,
      { force: false }
    ).catch(() => { });
  }, NOW_PLAYING_REFRESH_INTERVAL);

  timer.unref?.();
  player?.data?.set("nowPlayingRefreshTimer", timer);
}

async function updateNowPlayingButtons(client, player, paused, options = {}) {
  const force = options.force !== false;
  const now = Date.now();

  try {
    const nowPlayingMsg = player.data?.get("message");
    if (!nowPlayingMsg) {
      return;
    }

    if (player.data?.get("nowPlayingUpdateInFlight")) {
      return;
    }

    const lastUpdateAt = Number(player.data?.get("nowPlayingLastUpdateAt") || 0);
    const retryAt = Number(player.data?.get("nowPlayingRetryAt") || 0);
    if ((!force && now - lastUpdateAt < NOW_PLAYING_REFRESH_INTERVAL) || now < retryAt) {
      return;
    }

    const track = player.data?.get("currentTrack") || player.queue?.current;
    if (!track) {
      return;
    }

    player.data?.set("nowPlayingUpdateInFlight", true);
    const payload = await buildNowPlayingPayload(client, player, track, paused);
    await updateImageResponse(
      nowPlayingMsg,
      {
        type: "message",
        client,
        channelId: nowPlayingMsg.channelId || player.textId,
        messageId: nowPlayingMsg.id
      },
      payload,
      "Now Playing"
    );
    player.data?.set("nowPlayingLastUpdateAt", Date.now());
    player.data?.delete("nowPlayingRetryAt");
  } catch (error) {
    const retryAt = Date.now() + Math.max(NOW_PLAYING_RETRY_FLOOR, getRetryAfterMs(error));
    player?.data?.set("nowPlayingRetryAt", retryAt);
    if (error?.status === 429 || String(error?.message || "").includes("429")) {
      console.warn(`[Now Playing] Discord rate limit; retrying after ${Math.round((retryAt - Date.now()) / 1000)}s.`);
    }
  } finally {
    player?.data?.delete("nowPlayingUpdateInFlight");
  }
}

async function handleButtonInteraction(interaction, player, client) {
  try {
    switch (interaction.customId) {
      case "pause":
        if (player.paused) {
          return interaction.deferUpdate();
        }

        player.pause(true);
        await updateNowPlayingButtons(client, player, true);
        await interaction.deferUpdate();
        break;

      case "resume":
        if (!player.paused) {
          return interaction.deferUpdate();
        }
        player.pause(false);
        await updateNowPlayingButtons(client, player, false);
        await interaction.deferUpdate();
        break;

      case "skip":
        if (!player.queue?.current) {
          return interaction.deferUpdate();
        }
        player.skip();
        await interaction.deferUpdate();
        break;

      case "stop":
        try {
          player.queue?.clear();
          if (player.setLoop) {
            player.setLoop('none');
          } else {
            player.loop = 'none';
          }
          const { safeDestroyPlayer } = require("../../utils/playerUtils");
          await safeDestroyPlayer(player);
          await interaction.deferUpdate();
        } catch (error) {
          await interaction.deferUpdate();
        }
        break;

      case "previous":
        const history = player.data?.get("history") || [];

        if (history.length === 0) {
          const display = new TextDisplayBuilder()
            .setContent(`**${client.emoji.info} No previous track found in history.**`);
          const container = new ContainerBuilder()
            .addTextDisplayComponents(display);
          return interaction.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
          });
        }

        const lastHistoryTrack = history[history.length - 1];

        try {
          const result = await client.manager.search(lastHistoryTrack.uri, {
            requester: interaction.user
          });

          if (result && result.tracks && result.tracks.length > 0) {
            player.queue.unshift(result.tracks[0]);
            history.pop();
            player.data?.set("history", history);
            await player.skip();
          }
        } catch (error) {
          console.error("Error loading previous track:", error);
        }

        await interaction.deferUpdate();
        break;

      case "like":
        const currentLikeTrack = player.queue?.current;
        if (!currentLikeTrack) {
          return interaction.deferUpdate();
        }

        try {
          const songs = client.mongoDb.liked.get(interaction.user.id);
          const alreadyLiked = songs.some(song => song.url === (currentLikeTrack.uri || currentLikeTrack.url));

          if (alreadyLiked) {
            const display = new TextDisplayBuilder()
              .setContent(`**${client.emoji.info} \`${currentLikeTrack.title}\` is already in your favourite list.**`);
            const container = new ContainerBuilder()
              .addTextDisplayComponents(display);
            return interaction.reply({
              components: [container],
              flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
            });
          } else {
            songs.push({
              title: currentLikeTrack.title,
              url: currentLikeTrack.uri || currentLikeTrack.url,
              duration: currentLikeTrack.length || currentLikeTrack.duration,
              thumbnail: currentLikeTrack.thumbnail || currentLikeTrack.artworkUrl || currentLikeTrack.image,
              author: currentLikeTrack.author,
              addedAt: new Date().toISOString()
            });

            client.mongoDb.liked.set(interaction.user.id, songs);

            const display = new TextDisplayBuilder()
              .setContent(`**${client.emoji.check} Added \`${currentLikeTrack.title}\` to your favourite list.**`);
            const container = new ContainerBuilder()
              .addTextDisplayComponents(display);
            return interaction.reply({
              components: [container],
              flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
            });
          }
        } catch (dbError) {
          console.error('[Like Button] Error:', dbError);
          const display = new TextDisplayBuilder()
            .setContent(`**${client.emoji.cross} Failed to save song to favorites. Please try again.**`);
          const container = new ContainerBuilder()
            .addTextDisplayComponents(display);
          return interaction.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
          }).catch(() => { });
        }

        break;

      case "volume": {
        const modal = new ModalBuilder()
          .setCustomId("player_volume_modal")
          .setTitle("Set Player Volume");
        const volumeInput = new TextInputBuilder()
          .setCustomId("volume_value")
          .setLabel("Volume from 0 to 100")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(String(player.volume ?? 100))
          .setValue(String(player.volume ?? 100))
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(3);
        modal.addComponents(new ActionRowBuilder().addComponents(volumeInput));
        await interaction.showModal(modal);
        break;
      }

      case "queue":
        await invokeMusicCommand("queue", interaction, client);
        break;

      case "lyrics":
        await invokeMusicCommand("lyrics", interaction, client);
        break;

      case "loop":
        await invokeMusicCommand("loop", interaction, client);
        break;

      case "autoplay": {
        const newStatus = !(player.data?.get("autoplay") || false);
        player.data?.set("autoplay", newStatus);
        await updateNowPlayingButtons(client, player, player.paused || false);
        const display = new TextDisplayBuilder()
          .setContent(`**${client.emoji.check} Autoplay has been \`${newStatus ? "Enabled" : "Disabled"}\`.**`);
        const container = new ContainerBuilder().addTextDisplayComponents(display);
        await interaction.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
        break;
      }

      default:
        const unknownDisplay = new TextDisplayBuilder()
          .setContent(`**${client.emoji.cross} Unknown button interaction.**`);

        const unknownContainer = new ContainerBuilder()
          .addTextDisplayComponents(unknownDisplay);

        await interaction.editReply({
          components: [unknownContainer],
          flags: MessageFlags.IsComponentsV2
        });
        break;
    }
  } catch (error) {
    const display = new TextDisplayBuilder()
      .setContent(`**${client.emoji.cross} An error occurred while processing your request.**`);
    const container = new ContainerBuilder()
      .addTextDisplayComponents(display);
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
      } catch (replyError) {
      }
    } else {
      try {
        await interaction.editReply({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });
      } catch (editError) {
      }
    }
  }
}

function createCommandMessageWrapper(interaction) {
  const reply = async (options) => {
    if (interaction.deferred) {
      await interaction.editReply(options);
    } else if (interaction.replied) {
      await interaction.followUp(options);
    } else {
      await interaction.reply(options);
    }
    return interaction.fetchReply();
  };

  return {
    guild: interaction.guild,
    channel: {
      ...interaction.channel,
      send: reply
    },
    author: interaction.user,
    member: interaction.member,
    createdTimestamp: interaction.createdTimestamp,
    reply
  };
}

async function invokeMusicCommand(commandName, interaction, client) {
  const command = require(`../../commands/Music/${commandName}`);
  return command.execute(createCommandMessageWrapper(interaction), [], client, client.prefix);
}

function setupMessageCollector(client, player, message) {
  try {
    const track = player.queue?.current;
    const collector = message.createMessageComponentCollector({
      time: Math.min(track?.length || track?.duration || 600000, 900000),
      componentType: ComponentType.Button,
    });

    collector.on("collect", async (interaction) => {
      try {
        if (!interaction.member?.voice?.channelId || interaction.member.voice.channelId !== player.voiceId) {
          const display = new TextDisplayBuilder()
            .setContent(`**${client.emoji.warn} You must be in the same voice channel as the bot.**`);
          const container = new ContainerBuilder()
            .addTextDisplayComponents(display);
          return interaction.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
          });
        }

        await handleButtonInteraction(interaction, player, client);

      } catch (interactionError) {
        if (!interaction.replied && !interaction.deferred) {
          const display = new TextDisplayBuilder()
            .setContent(`**${client.emoji.cross} An error occurred while processing your request.**`);
          const container = new ContainerBuilder()
            .addTextDisplayComponents(display);
          await interaction.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
          }).catch(() => { });
        }
      }
    });

    collector.on("end", (collected, reason) => {
    });

  } catch (error) {
  }
}

async function updateVoiceStatus(client, player, track) {
  try {
    if (!player.voiceId) {
      return;
    }

    if (player.state === 'DESTROYED' || player.state === 'DISCONNECTED') {
      return;
    }

    await client.rest
      .put(`/channels/${player.voiceId}/voice-status`, {
        body: { status: `${client.emoji.dance} Playing **${track.title}**` },
      })
      .catch((err) => {
        console.error('[VoiceStatus] Failed to update:', err.message || err);
      });
  } catch (error) {
    console.error('[VoiceStatus] Exception:', error.message || error);
  }
}

module.exports = {
  name: "playerStart",
  run: async (client, player, track) => {
    try {
      const guild = client.guilds.cache.get(player.guildId);
      if (!guild) {
        return;
      }

      if (!player.data?.get("playerStarted")) {
        player.data?.set("playerStarted", true);

        if (player_create) {
          const webhook = new WebhookClient({ url: player_create });

          const embed = new EmbedBuilder()
            .setColor(client.color)
            .setAuthor({
              name: `Player Started`,
              iconURL: client.user.displayAvatarURL()
            })
            .setDescription(`**Server:** \`${guild.name}\`\n**ID:** \`${player.guildId}\``);

          webhook.send({ embeds: [embed] }).catch(() => { });
        }
      }

      const currentTrack = track || player.queue?.current;

      if (currentTrack) {
        await handleTrackStart(client, player, currentTrack);
      }

    } catch (error) {
    }
  },
};

async function handleTrackStart(client, player, track) {
  try {
    if (!track) {
      return;
    }

    player.data?.delete("playerEmptyProcessed");

    const oldMessage = player.data?.get("message");
    stopNowPlayingRefresh(player);
    if (oldMessage) {
      oldMessage.delete().catch(() => { });
    }

    if (client.voiceHealthMonitor) {
      client.voiceHealthMonitor.updateActivity(player.guildId);
    }

    await updateVoiceStatus(client, player, track);

    const message = await sendNowPlaying(client, player, track);

    if (!message) {
      return;
    }

    player.data?.set("message", message);

    setupMessageCollector(client, player, message);
    startNowPlayingRefresh(client, player);

  } catch (error) {
    console.error('[HandleTrackStart] Error:', error);
  }
}
module.exports.updateNowPlayingButtons = updateNowPlayingButtons;
module.exports.stopNowPlayingRefresh = stopNowPlayingRefresh;
module.exports.renderNowPlayingCard = renderNowPlayingCard;
