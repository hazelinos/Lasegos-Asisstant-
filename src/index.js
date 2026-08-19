const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits
} = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const groqKey = process.env.GROQ_API_KEY;

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
    .setDescription('Cek apakah bot aktif'),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Lihat daftar bantuan bot'),

  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Hapus pesan di channel ini')
    .addIntegerOption(option =>
      option
        .setName('jumlah')
        .setDescription('Jumlah pesan yang dihapus')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('tanya')
    .setDescription('Tanyakan sesuatu kepada AI')
    .addStringOption(option =>
      option
        .setName('pertanyaan')
        .setDescription('Pertanyaan yang ingin ditanyakan')
        .setRequired(true)
        .setMaxLength(2000)
    )
].map(command => command.toJSON());

client.once('ready', async (readyClient) => {
  console.log(`Lasegos Assistant online as ${readyClient.user.tag}`);

  try {
    const rest = new REST({ version: '10' }).setToken(token);
    await rest.put(
      Routes.applicationCommands(readyClient.user.id),
      { body: commands }
    );
    console.log('Global slash commands registered: /ping, /help, /clear, /tanya');
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
      content:
        '**Lasegos Assistant**\n\n' +
        '`/ping` — Cek apakah bot aktif\n' +
        '`/help` — Lihat daftar bantuan bot\n' +
        '`/clear jumlah` — Hapus pesan di channel ini\n' +
        '`/tanya pertanyaan` — Tanyakan sesuatu kepada AI',
      ephemeral: true
    });
  }

  if (interaction.commandName === 'clear') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        content: '❌ Kamu tidak punya izin **Manage Messages**.',
        ephemeral: true
      });
    }

    const jumlah = interaction.options.getInteger('jumlah', true);

    try {
      const deleted = await interaction.channel.bulkDelete(jumlah, true);
      await interaction.reply({
        content: `🗑️ Berhasil menghapus **${deleted.size} pesan**.`,
        ephemeral: true
      });
    } catch (error) {
      console.error('Failed to clear messages:', error);
      await interaction.reply({
        content: '❌ Gagal menghapus pesan. Pastikan bot punya izin **Manage Messages** dan **Read Message History**.',
        ephemeral: true
      });
    }
  }

  if (interaction.commandName === 'tanya') {
    if (!groqKey) {
      return interaction.reply({
        content: '❌ GROQ_API_KEY belum diatur di Environment',
        ephemeral: true
      });
    }

    const question = interaction.options.getString('pertanyaan', true);
    await interaction.deferReply();

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: 'Kamu adalah asisten Discord yang ramah. Jawab dalam bahasa Indonesia kecuali pengguna meminta bahasa lain. Jawab dengan jelas dan ringkas.'
            },
            {
              role: 'user',
              content: question
            }
          ],
          temperature: 0.7,
          max_tokens: 1024
        })
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Groq API error:', data);
        return interaction.editReply('❌ Gagal mendapatkan jawaban dari AI');
      }

      const answer = data.choices?.[0]?.message?.content?.trim();

      if (!answer) {
        return interaction.editReply('❌ AI tidak memberikan jawaban');
      }

      const chunks = answer.match(/[\s\S]{1,1900}/g) || [];
      await interaction.editReply(chunks[0]);

      for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp(chunks[i]);
      }
    } catch (error) {
      console.error('Failed to contact Groq:', error);
      await interaction.editReply('❌ Terjadi kesalahan saat menghubungi AI');
    }
  }
});

client.on('error', (error) => {
  console.error('Discord client error:', error);
});

client.login(token).catch((error) => {
  console.error('Failed to login to Discord:', error.message);
  process.exit(1);
});
