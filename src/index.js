const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits
} = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const geminiKey = process.env.GEMINI_API_KEY;

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
    if (!geminiKey) {
      return interaction.reply({
        content: '❌ GEMINI_API_KEY belum diatur di Environment',
        ephemeral: true
      });
    }

    const question = interaction.options.getString('pertanyaan', true);
    await interaction.deferReply();

    try {
      const response = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        {
          method: 'POST',
          headers: {
            'x-goog-api-key': geminiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text: 'Kamu adalah Lasegos Assistant, asisten Discord yang ramah. Jawab dalam bahasa Indonesia kecuali pengguna meminta bahasa lain. Jawab dengan jelas, akurat, dan ringkas. Jangan mengarang fakta. Jika informasi bisa berubah, nyatakan ketidakpastian dan gunakan tanggal yang relevan.'
                }
              ]
            },
            contents: [
              {
                role: 'user',
                parts: [{ text: question }]
              }
            ],
            generationConfig: {
              maxOutputTokens: 1024,
              temperature: 0.7
            }
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error('Gemini API error:', data);
        return interaction.editReply('❌ Gagal mendapatkan jawaban dari AI');
      }

      const answer = data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || '')
        .join('')
        .trim();

      if (!answer) {
        console.error('Gemini returned no answer:', data);
        return interaction.editReply('❌ AI tidak memberikan jawaban');
      }

      const chunks = answer.match(/[\s\S]{1,1900}/g) || [];
      await interaction.editReply(chunks[0]);

      for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp(chunks[i]);
      }
    } catch (error) {
      console.error('Failed to contact Gemini:', error);
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
