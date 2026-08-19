const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('Missing DISCORD_TOKEN environment variable.');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check whether Lasegos Assistant is online.'),
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show available Lasegos Assistant commands.')
].map(command => command.toJSON());

client.once('ready', async (readyClient) => {
  console.log(`Lasegos Assistant online as ${readyClient.user.tag}`);

  try {
    const rest = new REST({ version: '10' }).setToken(token);
    await rest.put(
      Routes.applicationCommands(readyClient.user.id),
      { body: commands }
    );
    console.log('Global slash commands registered: /ping, /help');
  } catch (error) {
    console.error('Failed to register slash commands:', error);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply(`🏓 Pong! ${client.ws.ping}ms`);
  }

  if (interaction.commandName === 'help') {
    await interaction.reply({
      content: '**Lasegos Assistant**\n\n`/ping` — Check bot latency\n`/help` — Show this help menu',
      ephemeral: true
    });
  }
});

client.on('error', (error) => {
  console.error('Discord client error:', error);
});

client.login(token).catch((error) => {
  console.error('Failed to login to Discord:', error.message);
  process.exit(1);
});
