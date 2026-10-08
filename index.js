if (require.main === module && !process.env.CLUSTER_MANAGER_MODE) {
  // MusicBot is initialized only inside a cluster child. If this file is
  // launched directly, hand off to the cluster manager instead.
  require("./Shard.js");
} else {
require('dotenv').config();
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");


const { setGlobalDispatcher, Agent } = require("undici");
setGlobalDispatcher(new Agent({
  connect: { timeout: 60_000 },
  headersTimeout: 60_000,
  bodyTimeout: 60_000,
    // Discord may close an idle reused TLS connection. Short keep-alive
    // windows and no pipelining make REST uploads establish a fresh socket
    // instead of sending a profile upload through a stale one.
    keepAliveTimeout: 4_000,
    keepAliveMaxTimeout: 10_000,
    pipelining: 0
}));

const { Collection } = require("discord.js");
const MusicBot = require("./src/structures/MusicClient");
const initializeCleanup = require("./src/events/Client/PremiumChecks");
const Dokdo = require("dokdo");
const config = require("./src/config.json");

const client = new MusicBot();
module.exports = client;

async function startClient() {
  await client.mongoDb.connect();
  await client.connect();
}

startClient().catch((error) => {
  console.error("[Startup] MongoDB connection failed:", error);
  process.exitCode = 1;
});

client.Jsk = new Dokdo.Client(client, {
  aliases: ["dokdo", "dok", "jsk"],
  prefix: [''],
  owners: client.owners,
});

process.env.SHELL = process.platform === "win32" ? "powershell" : "bash";


const emojis = require("./src/emojis");
client.emoji = emojis;

client.on("messageCreate", (message) => {
  client.Jsk.run(message);
});

process.on("unhandledRejection", (reason, p) => {
  if (reason && (reason.code === 'UND_ERR_CONNECT_TIMEOUT' || (reason.message && reason.message.includes('fetch failed')))) {
    console.log("[Lavalink Error] Connection timeout or fetch failed. Node might be down.");
    return;
  }

  console.log("[Unhandled Rejection]", reason, p);

  if (reason && reason.message && reason.message.includes('Session not found')) {
    console.log("[Session Error] Lavalink session lost, attempting cleanup...");

    if (reason.path && typeof reason.path === 'string') {
      const guildIdMatch = reason.path.match(/\/players\/(\d+)/);
      if (guildIdMatch && guildIdMatch[1]) {
        const guildId = guildIdMatch[1];
        console.log(`[Session Error] Cleaning up player for guild ${guildId}`);

        try {
          if (client.manager && client.manager.players.has(guildId)) {
            client.manager.players.delete(guildId);
          }

          if (client.voiceHealthMonitor) {
            client.voiceHealthMonitor.stopMonitoring(guildId);
          }
        } catch (cleanupError) {
          console.error("[Session Error] Cleanup failed:", cleanupError);
        }
      }
    }
  }
});

process.on("uncaughtException", (err, origin) => {
  console.log("[Uncaught Exception]", err, origin);
});

process.on("uncaughtExceptionMonitor", (err, origin) => {
  console.log("[Uncaught Exception Monitor]", err, origin);
});

initializeCleanup(client);
}
