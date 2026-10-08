const { Client, GatewayIntentBits, Collection } = require("discord.js");
const { Kazagumo, Plugins } = require("kazagumo");
const { readdirSync, existsSync } = require("fs");
const { Connectors } = require("shoukaku");
const Spotify = require("kazagumo-spotify");
const { ClusterClient, getInfo } = require("discord-hybrid-sharding");
const { Agent } = require("undici");
const loadPlayerManager = require("../loaders/loadPlayerManager");
const permissionHandler = require("../events/Client/PremiumChecks");
const VoiceHealthMonitor = require("../utils/voiceHealthMonitor");

class MusicBot extends Client {
  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
      ],
      partials: ["MESSAGE", "CHANNEL", "REACTION"],
      properties: {
        browser: "Discord Android",
      },
      allowedMentions: {
        parse: ["roles", "users", "everyone"],
        repliedUser: false,
      },
      shards: getInfo().SHARD_LIST,
      shardCount: getInfo().TOTAL_SHARDS,
    });

    this.commands = new Collection();
    this.slashCommands = new Collection();
    this.config = require("../config.js");
    this.owners = this.config.ownerID;
    this.prefix = this.config.prefix;
    this.color = this.config.color;
    this.embedColor = this.config.color;
    this.button = require("../custom/button.js");
    this.embed = require("../custom/embed.js")(this.color);
    require("../custom/numformat")(this);
    this.mongoDb = require("./MongoDatabase");
    this.aliases = new Collection();
    this.logger = require("../utils/logger.js");
    this.emoji = require("../emojis.js");
    // Profile cards include a generated attachment and can exceed the
    // discord.js REST manager's default 15-second request timeout.
    this.rest.options.timeout = 60_000;
    this.rest.options.retries = 5;
    // Use a dedicated short-lived agent for Discord REST calls. Discord's
    // edge can close idle keep-alive sockets while a multipart profile upload
    // is queued, which surfaces as UND_ERR_SOCKET before a response arrives.
    this.rest.setAgent(new Agent({
      connect: { timeout: 60_000 },
      headersTimeout: 60_000,
      bodyTimeout: 60_000,
      keepAliveTimeout: 1_000,
      keepAliveMaxTimeout: 2_000,
      pipelining: 0
    }));
    this.cluster = new ClusterClient(this);
    if (!this.token) this.token = this.config.token;
    // Cluster startup can provide the gateway token without populating the
    // REST manager. Set it explicitly so REST calls and native profile
    // uploads use the same authenticated client.
    if (this.token) this.rest.setToken(this.token);
    this.manager = null;
    this.spamMap = new Map();
    this.cooldowns = new Collection();
    this.db = require("./Database");
    this.logger.log("[DB] SQLite + MongoDB database adapters initialized", "ready");

    try {
      this.voiceHealthMonitor = new VoiceHealthMonitor(this);
      this.logger.log("[VoiceHealth] Monitor Initialized Successfully", "ready");
    } catch (err) {
      this.logger.log(`[VoiceHealth] Failed to initialize: ${err.message}`, "error");
      console.error(err);
    }

    permissionHandler(this);
    loadPlayerManager(this);
    [
      "loadClients",
      "loadCommands",
      "loadNodes",
      "loadPlayers",
    ].forEach((handler) => {
      require(`../loaders/${handler}`)(this);
    });
  }

  connect() {
    return super.login(this.token);
  }
}

module.exports = MusicBot;
