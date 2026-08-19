const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder
} = require('discord.js');

const { getUser, getCard, gacha, formatCard, tierInfo } = require('./cardGame');

const token = process.env.DISCORD_TOKEN;
const geminiKey = process.env.GEMINI_API_KEY;

if (!token) {
  console.error('Missing DISCORD_TOKEN environment variable.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const duels = new Map();

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Cek apakah bot aktif'),
  new SlashCommandBuilder().setName('help').setDescription('Lihat daftar bantuan bot'),
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Hapus pesan di channel ini')
    .addIntegerOption(option => option.setName('jumlah').setDescription('Jumlah pesan yang dihapus').setRequired(true).setMinValue(1).setMaxValue(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName('tanya')
    .setDescription('Tanyakan sesuatu kepada AI')
    .addStringOption(option => option.setName('pertanyaan').setDescription('Pertanyaan yang ingin ditanyakan').setRequired(true).setMaxLength(2000)),
  new SlashCommandBuilder().setName('game').setDescription('Buka card game Hazelinos')
].map(command => command.toJSON());

function mainMenu() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('card:duel').setLabel('⚔️ Duel').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('card:gacha').setLabel('🎴 Gacha').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('card:collection').setLabel('📚 Koleksi').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('card:wallet').setLabel('🪙 Coin').setStyle(ButtonStyle.Secondary)
  );
}

function collectionText(userId) {
  const user = getUser(userId);
  if (!user.cards.length) return 'Kamu belum punya kartu';
  const counts = new Map();
  for (const id of user.cards) counts.set(id, (counts.get(id) || 0) + 1);
  return [...counts.entries()].map(([id, count]) => {
    const card = getCard(id);
    return `${formatCard(card)}\n📦 Jumlah: **${count}**`;
  }).join('\n\n');
}

function cardSelect(userId, customId = 'card:pick') {
  const user = getUser(userId);
  const unique = [...new Set(user.cards)];
  return new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Pilih kartu')
    .addOptions(unique.slice(0, 25).map(id => {
      const card = getCard(id);
      return { label: card.name, value: card.id, description: `${card.tier} • ATK ${card.atk} • DEF ${card.def}`.slice(0, 100), emoji: card.emoji };
    }));
}

client.once('ready', async readyClient => {
  console.log(`Hazelinos online as ${readyClient.user.tag}`);
  try {
    const rest = new REST({ version: '10' }).setToken(token);
    await rest.put(Routes.applicationCommands(readyClient.user.id), { body: commands });
    console.log('Global slash commands registered: /ping, /help, /clear, /tanya, /game');
  } catch (error) {
    console.error('Failed to register slash commands:', error);
  }
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isUserSelectMenu() && interaction.customId === 'card:opponent') {
      const opponentId = interaction.values[0];
      if (opponentId === interaction.user.id) return interaction.reply({ content: '❌ Kamu tidak bisa melawan diri sendiri', ephemeral: true });
      const challenger = getUser(interaction.user.id);
      const opponent = getUser(opponentId);
      if (challenger.coins < 100 || opponent.coins < 100) return interaction.reply({ content: '❌ Kedua pemain harus punya minimal 100 coin', ephemeral: true });
      const duelId = `${interaction.user.id}-${opponentId}-${Date.now()}`;
      duels.set(duelId, { challenger: interaction.user.id, opponent: opponentId, wager: 100, choices: {} });
      return interaction.update({
        content: `⚔️ <@${interaction.user.id}> menantang <@${opponentId}>\n\nTaruhan: **100 🪙**\n<@${opponentId}> pilih tindakan`,
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`card:accept:${duelId}`).setLabel('✅ Terima').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`card:decline:${duelId}`).setLabel('❌ Tolak').setStyle(ButtonStyle.Danger)
        )]
      });
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('card:pick:')) {
      const duelId = interaction.customId.split(':')[2];
      const duel = duels.get(duelId);
      if (!duel) return interaction.reply({ content: '❌ Duel sudah berakhir', ephemeral: true });
      if (![duel.challenger, duel.opponent].includes(interaction.user.id)) return interaction.reply({ content: '❌ Kamu bukan pemain duel ini', ephemeral: true });
      if (!duel.accepted) return interaction.reply({ content: '❌ Lawan belum menerima duel', ephemeral: true });
      if (duel.choices[interaction.user.id]) return interaction.reply({ content: '❌ Kamu sudah memilih kartu', ephemeral: true });
      duel.choices[interaction.user.id] = interaction.values[0];
      await interaction.reply({ content: '✅ Kartu kamu sudah dipilih', ephemeral: true });
      if (!duel.choices[duel.challenger] || !duel.choices[duel.opponent]) return;
      const a = getCard(duel.choices[duel.challenger]);
      const b = getCard(duel.choices[duel.opponent]);
      const scoreA = a.atk + a.def + a.hp / 10;
      const scoreB = b.atk + b.def + b.hp / 10;
      let result;
      if (scoreA === scoreB) {
        result = '🤝 **Seri!**';
      } else if (scoreA > scoreB) {
        const winner = getUser(duel.challenger);
        winner.coins += duel.wager;
        winner.wins++;
        getUser(duel.opponent).losses++;
        result = `🏆 <@${duel.challenger}> menang dan mendapatkan **${duel.wager * 2} 🪙**`;
      } else {
        const winner = getUser(duel.opponent);
        winner.coins += duel.wager;
        winner.wins++;
        getUser(duel.challenger).losses++;
        result = `🏆 <@${duel.opponent}> menang dan mendapatkan **${duel.wager * 2} 🪙**`;
      }
      getUser(duel.challenger).coins -= duel.wager;
      getUser(duel.opponent).coins -= duel.wager;
      if (scoreA === scoreB) {
        getUser(duel.challenger).coins += duel.wager;
        getUser(duel.opponent).coins += duel.wager;
      }
      await interaction.message.edit({ content: `⚔️ **HASIL DUEL**\n\n<@${duel.challenger}>\n${formatCard(a)}\n\nVS\n\n<@${duel.opponent}>\n${formatCard(b)}\n\n${result}`, components: [mainMenu()] });
      duels.delete(duelId);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('card:')) {
      const parts = interaction.customId.split(':');
      const action = parts[1];

      if (action === 'gacha') {
        const result = gacha(interaction.user.id, 100);
        if (!result.ok) return interaction.reply({ content: '❌ Coin kamu tidak cukup. Gacha membutuhkan 100 coin', ephemeral: true });
        return interaction.update({ content: `🎴 **KARTU DIDAPATKAN**\n\n${formatCard(result.card)}\n\n🪙 Sisa coin: **${result.coins.toLocaleString('id-ID')}**`, components: [mainMenu()] });
      }

      if (action === 'collection') return interaction.update({ content: `📚 **KOLEKSI KAMU**\n\n${collectionText(interaction.user.id)}`, components: [mainMenu()] });

      if (action === 'wallet') {
        const user = getUser(interaction.user.id);
        return interaction.update({ content: `🪙 **WALLET**\n\nCoin: **${user.coins.toLocaleString('id-ID')}**\n🏆 Menang: **${user.wins}**\n💀 Kalah: **${user.losses}**`, components: [mainMenu()] });
      }

      if (action === 'duel') {
        return interaction.update({
          content: '⚔️ **DUEL KARTU**\n\nPilih member yang ingin kamu tantang\nTaruhan dasar: **100 🪙**',
          components: [
            new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('card:opponent').setPlaceholder('Pilih lawan').setMinValues(1).setMaxValues(1)),
            new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('card:home').setLabel('↩️ Kembali').setStyle(ButtonStyle.Secondary))
          ]
        });
      }

      if (action === 'accept') {
        const duelId = parts.slice(2).join(':');
        const duel = duels.get(duelId);
        if (!duel) return interaction.reply({ content: '❌ Duel sudah berakhir', ephemeral: true });
        if (interaction.user.id !== duel.opponent) return interaction.reply({ content: '❌ Hanya lawan yang bisa menerima duel', ephemeral: true });
        duel.accepted = true;
        return interaction.update({
          content: `⚔️ **DUEL DIMULAI**\n\n<@${duel.challenger}> vs <@${duel.opponent}>\nTaruhan: **${duel.wager} 🪙**\n\nPilih kartu yang akan digunakan`,
          components: [new ActionRowBuilder().addComponents(cardSelect(duel.challenger, `card:pick:${duelId}`))]
        });
      }

      if (action === 'decline') {
        const duelId = parts.slice(2).join(':');
        const duel = duels.get(duelId);
        if (!duel) return interaction.reply({ content: '❌ Duel sudah berakhir', ephemeral: true });
        if (interaction.user.id !== duel.opponent) return interaction.reply({ content: '❌ Hanya lawan yang bisa menolak duel', ephemeral: true });
        duels.delete(duelId);
        return interaction.update({ content: '❌ Tantangan duel ditolak', components: [mainMenu()] });
      }

      if (action === 'home') return interaction.update({ content: '🎴 **HAZELINOS CARD GAME**\n\nPilih menu', components: [mainMenu()] });
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'ping') return interaction.reply(`🏓 Pong! ${client.ws.ping}ms`);
    if (interaction.commandName === 'help') return interaction.reply({ content: '**Hazelinos**\n\n`/ping` — Cek apakah bot aktif\n`/help` — Lihat daftar bantuan bot\n`/clear jumlah` — Hapus pesan di channel ini\n`/tanya pertanyaan` — Tanyakan sesuatu kepada AI\n`/game` — Buka card game Hazelinos', ephemeral: true });
    if (interaction.commandName === 'game') return interaction.reply({ content: '🎴 **HAZELINOS CARD GAME**\n\n🪙 Setiap pemain mulai dengan **1.000 coin**\n🎴 Gacha: **100 coin**\n⚔️ Duel: **100 coin**\n\nPilih menu', components: [mainMenu()] });

    if (interaction.commandName === 'clear') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: '❌ Kamu tidak punya izin **Manage Messages**', ephemeral: true });
      const jumlah = interaction.options.getInteger('jumlah', true);
      try {
        const deleted = await interaction.channel.bulkDelete(jumlah, true);
        return interaction.reply({ content: `🗑️ Berhasil menghapus **${deleted.size} pesan**`, ephemeral: true });
      } catch (error) {
        console.error(error);
        return interaction.reply({ content: '❌ Gagal menghapus pesan', ephemeral: true });
      }
    }

    if (interaction.commandName === 'tanya') {
      if (!geminiKey) return interaction.reply({ content: '❌ GEMINI_API_KEY belum diatur di Environment', ephemeral: true });
      const question = interaction.options.getString('pertanyaan', true);
      await interaction.deferReply();
      try {
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent', {
          method: 'POST',
          headers: { 'x-goog-api-key': geminiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: 'Kamu adalah Hazelinos, asisten Discord yang ramah. Jawab dalam bahasa Indonesia kecuali pengguna meminta bahasa lain. Jawab dengan jelas, akurat, dan ringkas. Jangan mengarang fakta. Jika informasi bisa berubah, nyatakan ketidakpastian dan gunakan tanggal yang relevan.' }] },
            contents: [{ role: 'user', parts: [{ text: question }] }],
            generationConfig: { maxOutputTokens: 1024 }
          })
        });
        const data = await response.json();
        if (!response.ok) { console.error('Gemini API error:', data); return interaction.editReply('❌ Gagal mendapatkan jawaban dari AI'); }
        const answer = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
        if (!answer) return interaction.editReply('❌ AI tidak memberikan jawaban');
        const chunks = answer.match(/[\s\S]{1,1900}/g) || [];
        await interaction.editReply(chunks[0]);
        for (let i = 1; i < chunks.length; i++) await interaction.followUp(chunks[i]);
      } catch (error) { console.error('Gemini error:', error); await interaction.editReply('❌ Terjadi kesalahan saat menghubungi AI'); }
    }
  } catch (error) {
    console.error('Interaction error:', error);
    if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Terjadi kesalahan', ephemeral: true });
  }
});

client.on('error', error => console.error('Discord client error:', error));
client.login(token).catch(error => {
  console.error('Failed to login to Discord:', error.message);
  process.exit(1);
});
