const path = require('path');

const jsonConfig = path.join(__dirname, 'config.json');

let config;
try {
  config = require(jsonConfig);
} catch (err) {
  console.error("❌ config.json not found or is invalid!", err.message);
  process.exit(1);
}

function parseBoolean(value) {
  if (typeof value === "string") {
    value = value.trim().toLowerCase();
  }
  switch (value) {
    case true:
    case "true":
      return true;
    default:
      return false;
  }
}

config.parseBoolean = parseBoolean;

// Environment variables take precedence so deployment credentials and IDs do
// not need to be committed to config.json.
if (process.env.DISCORD_TOKEN) config.token = process.env.DISCORD_TOKEN;
if (process.env.DISCORD_APPLICATION_ID) {
  config.applicationId = process.env.DISCORD_APPLICATION_ID;
}

module.exports = config;