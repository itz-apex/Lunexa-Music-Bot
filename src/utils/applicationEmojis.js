const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");
const emojis = require("../emojis");

const emojiFile = path.join(__dirname, "..", "emojis.js");
const emojiPattern = /^<(a)?:([a-zA-Z0-9_]+):(\d+)>$/;

function emojiMention(emoji) {
  return `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>`;
}

function parseCustomEmoji(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(emojiPattern);
  if (!match) return null;

  return {
    mention: match[0],
    name: match[2],
    id: match[3],
    animated: Boolean(match[1]),
  };
}

function collectLocalEmojis(target, entries = []) {
  if (!target || typeof target !== "object") return entries;

  for (const [key, value] of Object.entries(target)) {
    if (value && typeof value === "object") {
      collectLocalEmojis(value, entries);
      continue;
    }

    const parsed = parseCustomEmoji(value);
    if (parsed) entries.push({ key, ...parsed });
  }

  return entries;
}

function replaceMatchingEmojiValues(target, applicationEmojis) {
  if (!target || typeof target !== "object") return;

  for (const [key, value] of Object.entries(target)) {
    if (value && typeof value === "object") {
      replaceMatchingEmojiValues(value, applicationEmojis);
      continue;
    }

    const applicationEmoji = applicationEmojis.get(key);
    if (applicationEmoji) {
      target[key] = emojiMention(applicationEmoji);
    }
  }
}

function persistEmojiFile(localEntries, applicationEmojis) {
  let source = fs.readFileSync(emojiFile, "utf8");
  let changed = false;
  const localNames = new Set();

  for (const entry of localEntries) {
    localNames.add(entry.name);
    const applicationEmoji = applicationEmojis.get(entry.name);
    if (!applicationEmoji) continue;

    const nextMention = emojiMention(applicationEmoji);
    if (entry.mention !== nextMention && source.includes(entry.mention)) {
      source = source.replaceAll(entry.mention, nextMention);
      changed = true;
    }
  }

  const additions = [];
  for (const [name, applicationEmoji] of applicationEmojis) {
    if (localNames.has(name) || typeof emojis[name] === "object") continue;

    const mention = emojiMention(applicationEmoji);
    if (!source.includes(mention)) {
      emojis[name] = mention;
      additions.push(`  ${JSON.stringify(name)}: ${JSON.stringify(mention)},`);
    }
  }

  if (additions.length > 0) {
    const closingIndex = source.lastIndexOf("};");
    if (closingIndex === -1) {
      throw new Error("Could not find the end of src/emojis.js");
    }

    source =
      source.slice(0, closingIndex) +
      `${additions.join("\n")}\n` +
      source.slice(closingIndex);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(emojiFile, source, "utf8");
  }

  return changed;
}

async function fetchEmojiImage(emoji) {
  const extension = emoji.animated ? "gif" : "png";
  const response = await fetch(
    `https://cdn.discordapp.com/emojis/${emoji.id}.${extension}`,
  );

  if (!response.ok) {
    throw new Error(
      `could not download source emoji ${emoji.name} (${response.status})`,
    );
  }

  const contentType =
    response.headers.get("content-type") ||
    (emoji.animated ? "image/gif" : "image/png");
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

async function createApplicationEmoji(rest, emoji) {
  const image = await fetchEmojiImage(emoji);
  return rest.post(Routes.applicationEmojis(emoji.applicationId), {
    body: {
      name: emoji.name,
      image,
    },
  });
}

/**
 * Keeps the local emoji map and Discord Developer Portal application emojis
 * synchronized in both directions.
 */
async function syncApplicationEmojis(client) {
  const applicationId =
    client.config.applicationId ||
    process.env.DISCORD_APPLICATION_ID ||
    client.user?.id;

  if (!applicationId) {
    client.logger.log(
      "Application emoji sync skipped: no Discord application ID configured.",
      "warn",
    );
    return { synced: 0, created: 0, applicationId: null };
  }

  const rest = new REST({ version: "10" }).setToken(client.token);

  try {
    const response = await rest.get(Routes.applicationEmojis(applicationId));
    const applicationEmojis = new Map(
      (Array.isArray(response) ? response : response.items || []).map((emoji) => [
        emoji.name,
        emoji,
      ]),
    );
    const localEntries = collectLocalEmojis(emojis);
    let created = 0;
    let failed = 0;

    for (const entry of localEntries) {
      if (applicationEmojis.has(entry.name)) continue;

      try {
        const createdEmoji = await createApplicationEmoji(rest, {
          ...entry,
          applicationId,
        });
        applicationEmojis.set(createdEmoji.name, createdEmoji);
        created += 1;
      } catch (error) {
        failed += 1;
        client.logger.log(
          `Could not create application emoji ${entry.name}: ${error.message}`,
          "warn",
        );
      }
    }

    replaceMatchingEmojiValues(emojis, applicationEmojis);

    for (const [name, emoji] of applicationEmojis) {
      if (typeof emojis[name] !== "object") {
        emojis[name] = emojiMention(emoji);
      }
    }

    let persisted = false;
    try {
      persisted = persistEmojiFile(localEntries, applicationEmojis);
    } catch (error) {
      client.logger.log(
        `Application emoji sync could not update src/emojis.js: ${error.message}`,
        "error",
      );
    }

    client.applicationEmojis = applicationEmojis;
    client.emoji = emojis;

    client.logger.log(
      `Synced ${applicationEmojis.size} application emoji${applicationEmojis.size === 1 ? "" : "s"} from ${applicationId} (${created} created${failed ? `, ${failed} unavailable` : ""}${persisted ? ", file updated" : ""}).`,
      "ready",
    );

    return {
      synced: applicationEmojis.size,
      created,
      failed,
      persisted,
      applicationId,
    };
  } catch (error) {
    client.logger.log(
      `Application emoji sync failed: ${error.message}`,
      "error",
    );
    return { synced: 0, created: 0, applicationId, error };
  }
}

module.exports = {
  syncApplicationEmojis,
  parseCustomEmoji,
  collectLocalEmojis,
};