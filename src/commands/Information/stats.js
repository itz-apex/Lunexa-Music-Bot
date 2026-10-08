const {
  AttachmentBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} = require("discord.js");
const { createCanvas } = require("@napi-rs/canvas");
const os = require("os");
const moment = require("moment");
const {
  createLoadingPayload,
  sendLoadingResponse,
  updateImageResponse,
} = require("../../utils/discordImageResponse");
require("moment-duration-format");

module.exports = {
  name: "stats",
  category: "Information",
  description: "Show detailed bot statistics",
  args: false,
  usage: "",
  aliases: ["statistics", "botinfo", "bi"],
  userPerms: [],
  owner: false,
  slashOptions: [],

  async slashExecute(interaction, client) {
    const interactionWrapper = {
      guild: interaction.guild,
      channel: interaction.channel,
      author: interaction.user,
      member: interaction.member,
      client,
      __imageInteraction: interaction,
      createdTimestamp: interaction.createdTimestamp,
    };

    const args = [];
    for (const option of interaction.options?.data || []) {
      if (option.value !== undefined) args.push(option.value.toString());
    }

    return this.execute(interactionWrapper, args, client, client.prefix);
  },

  async execute(message, args, client) {
    const loadingResponse = await sendLoadingResponse(
      message,
      createLoadingPayload("SYSTEM STATS", "Collecting live metrics..."),
      "Stats"
    );
    const guildCount = client.guilds.cache.size;
    const userCount = client.users.cache.size;
    const shardId = (message.guild?.shardId || 0) + 1;
    const totalShards = client.shard?.count || 1;

    const players = client.manager?.players
      ? Array.from(client.manager.players.values())
      : [];
    const totalPlayers = players.length;
    const playingPlayers = players.filter((player) => player.playing).length;
    const idlePlayers = totalPlayers - playingPlayers;

    const processUptime = process.uptime();
    const uptime = processUptime >= 86400
      ? moment.duration(processUptime * 1000).format("d[d] h[h] m[m]")
      : processUptime >= 3600
        ? moment.duration(processUptime * 1000).format("h[h] m[m] s[s]")
        : moment.duration(processUptime * 1000).format("m[m] s[s]");

    const cpuModel = os.cpus()[0]?.model.split(" @")[0].trim() || "Unknown CPU";
    const platform = os.platform().charAt(0).toUpperCase() + os.platform().slice(1);
    const load = os.loadavg();
    const systemLoad = ((load[0] * 100) / Math.max(os.cpus().length, 1)).toFixed(1);
    const processRam = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
    const numb = (value) => client.numb ? client.numb(value) : value.toLocaleString();

    const buffer = await renderStatsCard({
      guildCount: numb(guildCount),
      userCount: numb(userCount),
      shard: `${shardId}/${totalShards}`,
      totalPlayers,
      playingPlayers,
      idlePlayers,
      uptime,
      ping: `${client.ws.ping} ms`,
      cpuModel,
      systemLoad: `${systemLoad}%`,
      processRam: `${processRam} MB`,
      platform,
      nodeVersion: process.version,
      discordVersion: `v${require("discord.js").version}`,
    });

    const attachment = new AttachmentBuilder(buffer, { name: "stats.png" });
    const container = new ContainerBuilder()
      .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL("attachment://stats.png")
      ));

    return updateImageResponse(message, loadingResponse, {
      files: [attachment],
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    }, "Stats");
  },
};

async function renderStatsCard(stats) {
  const width = 1200;
  const height = 760;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#100b1d";
  ctx.fillRect(0, 0, width, height);

  const purpleGlow = ctx.createRadialGradient(210, 80, 0, 210, 80, 560);
  purpleGlow.addColorStop(0, "rgba(176, 122, 255, 0.34)");
  purpleGlow.addColorStop(0.45, "rgba(110, 63, 188, 0.13)");
  purpleGlow.addColorStop(1, "rgba(16, 11, 29, 0)");
  ctx.fillStyle = purpleGlow;
  ctx.fillRect(0, 0, width, height);

  const pinkGlow = ctx.createRadialGradient(1020, 620, 0, 1020, 620, 500);
  pinkGlow.addColorStop(0, "rgba(226, 185, 255, 0.15)");
  pinkGlow.addColorStop(1, "rgba(16, 11, 29, 0)");
  ctx.fillStyle = pinkGlow;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(226, 204, 255, 0.035)";
  ctx.lineWidth = 1;
  for (let i = -height; i < width; i += 42) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + height, height);
    ctx.stroke();
  }

  const drawPanel = (x, y, w, h, fill = "rgba(35, 24, 56, 0.82)") => {
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.2)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    roundedRect(ctx, x, y, w, h, 24);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(221, 195, 255, 0.14)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  };

  drawPanel(34, 30, 1132, 130, "rgba(46, 30, 72, 0.92)");
  drawStatusDot(ctx, 74, 84, "#87e6b0", 13);
  ctx.fillStyle = "#f8efff";
  ctx.font = "bold 38px sans-serif";
  ctx.fillText("Lunexa", 108, 88);
  ctx.fillStyle = "rgba(238, 221, 255, 0.62)";
  ctx.font = "500 16px sans-serif";
  ctx.fillText("Your music companion, running smoothly.", 110, 118);

  ctx.fillStyle = "#dec3ff";
  ctx.font = "700 13px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("LIVE SYSTEM STATUS", 1130, 70);
  ctx.fillStyle = "#87e6b0";
  ctx.font = "700 24px sans-serif";
  ctx.fillText("Operational", 1130, 105);
  ctx.fillStyle = "rgba(238, 221, 255, 0.52)";
  ctx.font = "500 14px sans-serif";
  ctx.fillText("All core services online", 1130, 130);
  ctx.textAlign = "left";

  drawPanel(34, 182, 560, 260);
  drawPanel(618, 182, 548, 260);
  drawPanel(34, 466, 1132, 260);

  sectionTitle(ctx, 58, 216, "BOT OVERVIEW", "The numbers behind Lunexa");
  statTile(ctx, 58, 256, 240, 72, "SERVERS", stats.guildCount, "◆", "#cf9fff");
  statTile(ctx, 316, 256, 240, 72, "USERS", stats.userCount, "●", "#b8a0ff");
  statTile(ctx, 58, 344, 240, 72, "SHARD", stats.shard, "◇", "#f1b7ff");
  statTile(ctx, 316, 344, 240, 72, "LATENCY", stats.ping, "◷", "#87e6b0");

  sectionTitle(ctx, 642, 216, "MUSIC ENGINE", "Live player activity");
  activityLine(ctx, 642, 262, "ACTIVE PLAYERS", stats.playingPlayers, "#87e6b0", 500);
  activityLine(ctx, 642, 316, "IDLE PLAYERS", stats.idlePlayers, "#f1b7ff", 500);
  activityLine(ctx, 642, 370, "TOTAL PLAYERS", stats.totalPlayers, "#cf9fff", 500);

  sectionTitle(ctx, 58, 500, "SYSTEM PERFORMANCE", "Infrastructure and runtime details");
  detailItem(ctx, 58, 548, "UPTIME", stats.uptime, 250);
  detailItem(ctx, 338, 548, "CPU LOAD", stats.systemLoad, 250, "#f1b7ff");
  detailItem(ctx, 618, 548, "BOT MEMORY", stats.processRam, 250, "#cf9fff");
  detailItem(ctx, 898, 548, "PLATFORM", stats.platform, 220);
  detailItem(ctx, 58, 612, "NODE.JS", stats.nodeVersion, 250);
  detailItem(ctx, 338, 612, "DISCORD.JS", stats.discordVersion, 250, "#b8a0ff");
  drawFittedText(ctx, stats.cpuModel, 618, 646, 500, "500", 15, "rgba(226, 204, 255, 0.58)");
  ctx.fillStyle = "rgba(226, 204, 255, 0.42)";
  ctx.font = "700 11px sans-serif";
  ctx.fillText("HOST HARDWARE", 618, 622);

  ctx.fillStyle = "rgba(238, 221, 255, 0.4)";
  ctx.font = "500 13px sans-serif";
  ctx.fillText("Lunexa  •  real-time bot statistics", 42, 750);
  ctx.textAlign = "right";
  ctx.fillText("SYSTEM • 2026", width - 42, 750);
  ctx.textAlign = "left";

  return canvas.encode("png");
}

function sectionTitle(ctx, x, y, title, subtitle) {
  ctx.fillStyle = "#f8efff";
  ctx.font = "800 15px sans-serif";
  ctx.fillText(title, x, y);
  ctx.fillStyle = "rgba(226, 204, 255, 0.58)";
  ctx.font = "500 12px sans-serif";
  ctx.fillText(subtitle, x, y + 20);
}

function statTile(ctx, x, y, width, height, label, value, icon, color) {
  roundedRect(ctx, x, y, width, height, 16);
  ctx.fillStyle = "rgba(15, 9, 27, 0.38)";
  ctx.fill();
  ctx.fillStyle = color;
  ctx.font = "700 20px sans-serif";
  ctx.fillText(icon, x + 16, y + 29);
  ctx.fillStyle = "rgba(226, 204, 255, 0.56)";
  ctx.font = "700 10px sans-serif";
  ctx.fillText(label, x + 48, y + 24);
  drawFittedText(ctx, value, x + 48, y + 51, width - 64, "700", 20, "#fff7ff");
}

function activityLine(ctx, x, y, label, value, color, width) {
  ctx.fillStyle = "rgba(191, 139, 255, 0.14)";
  ctx.beginPath();
  ctx.arc(x + 10, y + 7, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(226, 204, 255, 0.58)";
  ctx.font = "700 11px sans-serif";
  ctx.fillText(label, x + 28, y + 12);
  drawFittedTextRight(ctx, value, x + width, y + 12, 200, "700", 17, color);
  ctx.strokeStyle = "rgba(221, 195, 255, 0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 28, y + 28);
  ctx.lineTo(x + width, y + 28);
  ctx.stroke();
}

function detailItem(ctx, x, y, label, value, width, color = "#f8efff") {
  ctx.fillStyle = "rgba(226, 204, 255, 0.54)";
  ctx.font = "700 11px sans-serif";
  ctx.fillText(label, x, y);
  drawFittedText(ctx, value, x, y + 29, width, "600", 18, color);
}

function drawStatusDot(ctx, x, y, color, radius) {
  ctx.fillStyle = "rgba(12, 7, 22, 0.95)";
  ctx.beginPath();
  ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawFittedText(ctx, value, x, y, maxWidth, weight, size, color) {
  const text = String(value ?? "");
  let fontSize = size;
  ctx.textAlign = "left";
  while (fontSize > 11) {
    ctx.font = `${weight} ${fontSize}px sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    fontSize -= 1;
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawFittedTextRight(ctx, value, rightX, y, maxWidth, weight, size, color) {
  const text = String(value ?? "");
  let fontSize = size;
  ctx.textAlign = "right";
  while (fontSize > 11) {
    ctx.font = `${weight} ${fontSize}px sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    fontSize -= 1;
  }
  ctx.fillStyle = color;
  ctx.fillText(text, rightX, y);
  ctx.textAlign = "left";
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