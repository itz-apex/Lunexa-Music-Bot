const { prefix } = require("../../config.js");
const { ActivityType, REST, Routes } = require("discord.js");
const { syncApplicationEmojis } = require("../../utils/applicationEmojis");

module.exports = {
  name: "clientReady",
  run: async (client) => {
    await syncApplicationEmojis(client);
    if (client.applicationEmojiSyncInterval) {
      clearInterval(client.applicationEmojiSyncInterval);
    }
    client.applicationEmojiSyncInterval = setInterval(() => {
      syncApplicationEmojis(client).catch((error) => {
        client.logger.log(
          `Application emoji background sync failed: ${error.message}`,
          "error",
        );
      });
    }, 5 * 60 * 1000);
    client.applicationEmojiSyncInterval.unref?.();

    client.logger.log(`${client.user.username} is now online.`, "ready");

    const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require("discord.js");
    const rebootData = client.mongoDb.reboot.getAll()[0];
    if (rebootData) {
      client.mongoDb.reboot.delete(rebootData.id);
      const channel = client.channels.cache.get(rebootData.channelId);
      if (channel) {
        try {
          const msg = await channel.messages.fetch(rebootData.messageId);
          if (msg) {
            const restartedContainer = new ContainerBuilder()
              .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${client.emoji.check} Bot has been successfully restarted.**`))

            await msg.edit({
              components: [restartedContainer],
              flags: MessageFlags.IsComponentsV2
            });
          }
        } catch (e) { }
      }
    }

    client.logger.log(
      `Ready on ${client.guilds.cache.size} servers, for a total of ${client.users.cache.size} users`,
      "ready",
    );

    if (client.slashCommands.size > 0) {
      const rest = new REST({ version: "10" }).setToken(client.token);
      try {
        const commands = Array.from(client.slashCommands.values()).map((cmd) => {
          const commandData = {
            name: cmd.name,
            description: cmd.description,
            options: cmd.options || [],
          };

          if (cmd.owner) {
            commandData.default_member_permissions = "8";
            commandData.dm_permission = false;
          } else if (cmd.userPerms && cmd.userPerms.length > 0) {
            const { PermissionsBitField } = require("discord.js");
            try {
              commandData.default_member_permissions = PermissionsBitField.resolve(cmd.userPerms).toString();
            } catch (e) {
              console.error(`Error resolving perms for ${cmd.name}:`, e);
            }
          }

          return commandData;
        });

        client.logger.log(`Deploying ${commands.length} slash commands...`, "cmd");

        await rest.put(Routes.applicationCommands(client.user.id), {
          body: commands,
        });

        client.logger.log(`Successfully deployed ${commands.length} slash commands.`, "cmd");
      } catch (error) {
        console.error("Error deploying slash commands:", error);
      }
    } else {
      console.log("\n⚠️ WARNING: No slash commands to deploy! client.slashCommands.size = 0\n");
    }

    setInterval(() => {
      const totalMembers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
      const statuses = [
        `Serving ${client.guilds.cache.size} Guilds | ${client.users.cache.size} Users`,
        `Use /help to get started`,
        `Pure Musical Bliss!`,
        `High Quality | 24/7 Music`
      ];

      const status = statuses[Math.floor(Math.random() * statuses.length)];

      client.user.setPresence({
        activities: [
          {
            name: status,
            type: ActivityType.Custom,
          },
        ],
        status: "online",
      });
    }, 7000);
  },
};
