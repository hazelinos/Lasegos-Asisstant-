const { Client, GatewayIntentBits } = require('discord.js');

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('Missing DISCORD_TOKEN environment variable.');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', (readyClient) => {
  console.log(`Lasegos Assistant online as ${readyClient.user.tag}`);
});

client.on('error', (error) => {
  console.error('Discord client error:', error);
});

client.login(token).catch((error) => {
  console.error('Failed to login to Discord:', error.message);
  process.exit(1);
});
