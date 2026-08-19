const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
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

const rpsGames = new Map();

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
    ),

  new SlashCommandBuilder()
    .setName('arcade')
    .setDescription('Main game arcade bersama member lain')
    .addSubcommand(subcommand =>
      subcommand
        .setName('rps')
        .setDescription('Tantang member lain bermain batu gunting kertas')
        .addUserOption(option =>
          option
            .setName('lawan')
            .setDescription('Member yang ingin ditantang')
            .setRequired(true)
        )
    )
].map(command => command.toJSON());

client.once('ready', async (readyClient) => {
  console.log(`Hazelinos online as ${readyClient.user.tag}`);

  try {
    const rest = new REST({ version: '10' }).setToken(token);
    await rest.put(
      Routes.applicationCommands(readyClient.user.id),
      { body: commands }
    );
    console.log('Global slash commands registered: /ping, /help, /clear, /tanya, /arcade');
  } catch (error) {
    console.error('Failed to register slash commands:', error);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    const [type, gameId, choice] = interaction.customId.split(':');

    if (type !== 'rps') return;

    const game = rpsGames.get(gameId);
    if (!game) {
      return interaction.reply({
        content: '❌ Game sudah berakhir atau tidak ditemukan',
        ephemeral: true
      });
    }

    if (interaction.user.id !== game.challenger && interaction.user.id !== game.opponent) {
      return interaction.reply({
        content: '❌ Kamu bukan pemain game ini',
        ephemeral: true
      });
    }

    if (game.choices[interaction.user.id]) {
      return interaction.reply({
        content: '❌ Kamu sudah memilih',
        ephemeral: true
      });
    }

    game.choices[interaction.user.id] = choice;
    await interaction.reply({
      content: '✅ Pilihan kamu sudah dicatat',
      ephemeral: true
    });

    const players = [game.challenger, game.opponent];
    if (players.every(id => game.choices[id])) {
      const names = { rock: '🪨 Batu', paper: '📄 Kertas', scissors: '✂️ Gunting' };
      const a = game.choices[game.challenger];
      const b = game.choices[game.opponent];
      let result;

      if (a === b) {
        result = '🤝 **Seri!**';
      } else if (
        (a === 'rock' && b === 'scissors') ||
        (a === 'paper' && b === 'rock') ||
        (a === 'scissors' && b === 'paper')
      ) {
        result = `🏆 <@${game.challenger}> **menang!**`;
      } else {
        result = `🏆 <@${game.opponent}> **menang!**`;
      }

      await interaction.message.edit({
        content:
          `🎮 **HASIL RPS**\n\n` +
          `<@${game.challenger}>: ${names[a]}\n` +
          `<@${game.opponent}>: ${names[b]}\n\n` +
          result,
        components: []
      });

      rpsGames.delete(gameId);
    }

    return;
  }

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply(`🏓 Pong! ${client.ws.ping}ms`);
  }

  if (interaction.commandName === 'help') {
    await interaction.reply({
      content:
        '**Hazelinos**\n\n' +
        '`/ping` — Cek apakah bot aktif\n' +
        '`/help` — Lihat daftar bantuan bot\n' +
        '`/clear jumlah` — Hapus pesan di channel ini\n' +
        '`/tanya pertanyaan` — Tanyakan sesuatu kepada AI\n' +
        '`/arcade rps lawan` — Tantang member lain bermain batu gunting kertas',
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
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',
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
                  text: 'Kamu adalah Hazelinos, asisten Discord yang ramah. Jawab dalam bahasa Indonesia kecuali pengguna meminta bahasa lain. Jawab dengan jelas, akurat, dan ringkas. Jangan mengarang fakta. Jika informasi bisa berubah, nyatakan ketidakpastian dan gunakan tanggal yang relevan.'
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
              maxOutputTokens: 1024
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
