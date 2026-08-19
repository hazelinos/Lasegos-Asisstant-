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

const token = process.env.DISCORD_TOKEN;
const geminiKey = process.env.GEMINI_API_KEY;

if (!token) {
  console.error('Missing DISCORD_TOKEN environment variable.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const users = new Map();
const games = new Map();

const cards = [
  { id: 'ember', name: 'Ember Fox', emoji: '🔥', tier: 'Common', power: 18 },
  { id: 'aqua', name: 'Aqua Serpent', emoji: '💧', tier: 'Common', power: 20 },
  { id: 'leaf', name: 'Leaf Sprite', emoji: '🌿', tier: 'Common', power: 17 },
  { id: 'thunder', name: 'Thunder Lynx', emoji: '⚡', tier: 'Rare', power: 32 },
  { id: 'frost', name: 'Frost Wolf', emoji: '❄️', tier: 'Rare', power: 35 },
  { id: 'shadow', name: 'Shadow Raven', emoji: '🌑', tier: 'Epic', power: 48 },
  { id: 'dragon', name: 'Crimson Dragon', emoji: '🐉', tier: 'Epic', power: 55 },
  { id: 'phoenix', name: 'Solar Phoenix', emoji: '☀️', tier: 'Legendary', power: 72 },
  { id: 'void', name: 'Void Titan', emoji: '🌌', tier: 'Mythic', power: 100 }
];

const tierEmoji = {
  Common: '⚪',
  Rare: '🔵',
  Epic: '🟣',
  Legendary: '🟡',
  Mythic: '🔴'
};

function getUser(id) {
  if (!users.has(id)) {
    users.set(id, { coins: 1000, collection: ['ember'] });
  }
  return users.get(id);
}

function getCard(id) {
  return cards.find(card => card.id === id);
}

function gameMenu() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('game:arcade').setLabel('🎮 Arcade').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('game:duel').setLabel('⚔️ Lawan Orang').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('game:gacha').setLabel('🎴 Gacha').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('game:cards').setLabel('📚 Kartu').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('game:coin').setLabel('🪙 Coin').setStyle(ButtonStyle.Secondary)
  );
}

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Cek apakah bot aktif'),
  new SlashCommandBuilder().setName('help').setDescription('Lihat daftar bantuan bot'),
  new SlashCommandBuilder()
    .setName('clear').setDescription('Hapus pesan di channel ini')
    .addIntegerOption(option => option.setName('jumlah').setDescription('Jumlah pesan yang dihapus').setRequired(true).setMinValue(1).setMaxValue(100))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder()
    .setName('tanya').setDescription('Tanyakan sesuatu kepada AI')
    .addStringOption(option => option.setName('pertanyaan').setDescription('Pertanyaan yang ingin ditanyakan').setRequired(true).setMaxLength(2000)),
  new SlashCommandBuilder().setName('game').setDescription('Buka menu game Hazelinos')
].map(command => command.toJSON());

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
  if (interaction.isButton()) {
    const [group, action, id] = interaction.customId.split(':');
    if (group !== 'game') return;
    const user = getUser(interaction.user.id);

    if (action === 'menu') return interaction.update({ content: '🎮 **HAZELINOS GAME**\nPilih permainan', components: [gameMenu()] });

    if (action === 'coin') {
      return interaction.update({ content: `🪙 **Coin kamu: ${user.coins.toLocaleString('id-ID')}**`, components: [gameMenu()] });
    }

    if (action === 'cards') {
      const counts = {};
      user.collection.forEach(cardId => counts[cardId] = (counts[cardId] || 0) + 1);
      const text = user.collection.map(cardId => {
        const card = getCard(cardId);
        return `${card.emoji} **${card.name}** — ${tierEmoji[card.tier]} ${card.tier} — Power ${card.power}`;
      }).join('\n');
      return interaction.update({ content: `📚 **KOLEKSI KARTU**\n\n${text}`, components: [gameMenu()] });
    }

    if (action === 'gacha') {
      if (user.coins < 100) return interaction.reply({ content: '❌ Coin kamu tidak cukup (100 coin)', ephemeral: true });
      user.coins -= 100;
      const roll = Math.random() * 100;
      let tier = roll < 65 ? 'Common' : roll < 87 ? 'Rare' : roll < 96 ? 'Epic' : roll < 99.5 ? 'Legendary' : 'Mythic';
      const pool = cards.filter(card => card.tier === tier);
      const card = pool[Math.floor(Math.random() * pool.length)];
      user.collection.push(card.id);
      return interaction.update({ content: `🎴 **GACHA**\n\nKamu mendapatkan:\n${card.emoji} **${card.name}**\n${tierEmoji[card.tier]} **${card.tier}** • Power **${card.power}**\n\n🪙 Sisa coin: **${user.coins.toLocaleString('id-ID')}**`, components: [gameMenu()] });
    }

    if (action === 'arcade') {
      return interaction.update({
        content: '🎮 **ARCADE**\n\nPilih permainan',
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('game:coinflip').setLabel('🪙 Coin Flip').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('game:dice').setLabel('🎲 Dadu').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('game:rps').setLabel('✊ RPS').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('game:menu').setLabel('↩️ Kembali').setStyle(ButtonStyle.Secondary)
        )]
      });
    }

    if (action === 'coinflip' || action === 'dice' || action === 'rps') {
      let result;
      if (action === 'coinflip') result = Math.random() < 0.5 ? '🪙 Kepala' : '🪙 Ekor';
      if (action === 'dice') result = `🎲 Kamu mendapatkan **${Math.floor(Math.random() * 6) + 1}**`;
      if (action === 'rps') result = '✊ RPS solo akan segera hadir';
      return interaction.update({ content: `🎮 **ARCADE**\n\n${result}`, components: [gameMenu()] });
    }

    if (action === 'duel') {
      return interaction.update({
        content: '⚔️ **LAWAN ORANG**\n\nPilih member yang ingin kamu tantang',
        components: [new ActionRowBuilder().addComponents(
          new UserSelectMenuBuilder().setCustomId('game:challenge').setPlaceholder('Pilih lawan').setMinValues(1).setMaxValues(1)
        ), new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('game:menu').setLabel('↩️ Kembali').setStyle(ButtonStyle.Secondary)
        )]
      });
    }

    return;
  }

  if (interaction.isUserSelectMenu()) {
    if (interaction.customId !== 'game:challenge') return;
    const opponent = interaction.values[0];
    if (opponent === interaction.user.id) return interaction.reply({ content: '❌ Kamu tidak bisa menantang diri sendiri', ephemeral: true });
    const gameId = `${interaction.user.id}-${opponent}-${Date.now()}`;
    games.set(gameId, { challenger: interaction.user.id, opponent, wager: 0, choices: {} });
    return interaction.update({
      content: `⚔️ <@${interaction.user.id}> menantang <@${opponent}>\n\nPilih jumlah coin yang dipertaruhkan`,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`game:wager:${gameId}:0`).setLabel('Gratis').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`game:wager:${gameId}:100`).setLabel('100 🪙').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`game:wager:${gameId}:250`).setLabel('250 🪙').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`game:wager:${gameId}:500`).setLabel('500 🪙').setStyle(ButtonStyle.Danger)
      )]
    });
  }

  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'ping') return interaction.reply(`🏓 Pong! ${client.ws.ping}ms`);
    if (interaction.commandName === 'help') return interaction.reply({ content: '**Hazelinos**\n\n`/ping` — Cek apakah bot aktif\n`/help` — Lihat daftar bantuan bot\n`/clear jumlah` — Hapus pesan di channel ini\n`/tanya pertanyaan` — Tanyakan sesuatu kepada AI\n`/game` — Buka menu game Hazelinos', ephemeral: true });
    if (interaction.commandName === 'game') return interaction.reply({ content: '🎮 **HAZELINOS GAME**\nPilih menu permainan', components: [gameMenu()] });

    if (interaction.commandName === 'clear') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: '❌ Kamu tidak punya izin **Manage Messages**.', ephemeral: true });
      const jumlah = interaction.options.getInteger('jumlah', true);
      try {
        const deleted = await interaction.channel.bulkDelete(jumlah, true);
        return interaction.reply({ content: `🗑️ Berhasil menghapus **${deleted.size} pesan**.`, ephemeral: true });
      } catch (error) {
        console.error(error);
        return interaction.reply({ content: '❌ Gagal menghapus pesan.', ephemeral: true });
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
          body: JSON.stringify({ systemInstruction: { parts: [{ text: 'Kamu adalah Hazelinos, asisten Discord yang ramah. Jawab dalam bahasa Indonesia kecuali pengguna meminta bahasa lain. Jawab dengan jelas, akurat, dan ringkas. Jangan mengarang fakta. Jika informasi bisa berubah, nyatakan ketidakpastian dan gunakan tanggal yang relevan.' }] }, contents: [{ role: 'user', parts: [{ text: question }] }], generationConfig: { maxOutputTokens: 1024 } })
        });
        const data = await response.json();
        if (!response.ok) { console.error(data); return interaction.editReply('❌ Gagal mendapatkan jawaban dari AI'); }
        const answer = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
        if (!answer) return interaction.editReply('❌ AI tidak memberikan jawaban');
        const chunks = answer.match(/[\s\S]{1,1900}/g) || [];
        await interaction.editReply(chunks[0]);
        for (let i = 1; i < chunks.length; i++) await interaction.followUp(chunks[i]);
      } catch (error) { console.error(error); await interaction.editReply('❌ Terjadi kesalahan saat menghubungi AI'); }
    }
  }

  if (interaction.isButton() && interaction.customId.startsWith('game:wager:')) {
    const [, , gameId, wagerText] = interaction.customId.split(':');
    const game = games.get(gameId);
    if (!game) return interaction.reply({ content: '❌ Tantangan sudah tidak tersedia', ephemeral: true });
    const wager = Number(wagerText);
    const challenger = getUser(game.challenger);
    if (interaction.user.id !== game.challenger) return interaction.reply({ content: '❌ Hanya penantang yang bisa memilih taruhan', ephemeral: true });
    if (challenger.coins < wager) return interaction.reply({ content: '❌ Coin penantang tidak cukup', ephemeral: true });
    game.wager = wager;
    return interaction.update({
      content: `⚔️ <@${game.challenger}> menantang <@${game.opponent}>\n\nTaruhan: **${wager} 🪙**\n<@${game.opponent}> pilih **Terima** atau **Tolak**`,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`game:accept:${gameId}`).setLabel('✅ Terima').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`game:decline:${gameId}`).setLabel('❌ Tolak').setStyle(ButtonStyle.Danger)
      )]
    });
  }

  if (interaction.isButton() && (interaction.customId.startsWith('game:accept:') || interaction.customId.startsWith('game:decline:'))) {
    const [, action, gameId] = interaction.customId.split(':');
    const game = games.get(gameId);
    if (!game) return interaction.reply({ content: '❌ Game sudah berakhir', ephemeral: true });
    if (interaction.user.id !== game.opponent) return interaction.reply({ content: '❌ Hanya lawan yang bisa merespons tantangan', ephemeral: true });
    if (action === 'decline') { games.delete(gameId); return interaction.update({ content: '❌ Tantangan ditolak', components: [] }); }
    const opponent = getUser(game.opponent);
    if (opponent.coins < game.wager) return interaction.reply({ content: '❌ Coin kamu tidak cukup untuk taruhan ini', ephemeral: true });
    return interaction.update({ content: `⚔️ **DUEL KARTU**\n\n<@${game.challenger}> vs <@${game.opponent}>\nTaruhan: **${game.wager} 🪙**\n\nPilih kartu kamu`, components: [new ActionRowBuilder().addComponents(...getUser(game.challenger).collection.slice(0, 5).map(cardId => { const c = getCard(cardId); return new ButtonBuilder().setCustomId(`game:card:${gameId}:${cardId}`).setLabel(`${c.emoji} ${c.name}`).setStyle(ButtonStyle.Primary); }))] });
  }

  if (interaction.isButton() && interaction.customId.startsWith('game:card:')) {
    const [, , gameId, cardId] = interaction.customId.split(':');
    const game = games.get(gameId);
    if (!game) return interaction.reply({ content: '❌ Game sudah berakhir', ephemeral: true });
    if (![game.challenger, game.opponent].includes(interaction.user.id)) return interaction.reply({ content: '❌ Kamu bukan pemain game ini', ephemeral: true });
    const user = getUser(interaction.user.id);
    if (!user.collection.includes(cardId)) return interaction.reply({ content: '❌ Kamu tidak memiliki kartu itu', ephemeral: true });
    if (game.choices[interaction.user.id]) return interaction.reply({ content: '❌ Kamu sudah memilih kartu', ephemeral: true });
    game.choices[interaction.user.id] = cardId;
    await interaction.reply({ content: '✅ Kartu kamu sudah dipilih', ephemeral: true });
    if (!game.choices[game.challenger] || !game.choices[game.opponent]) return;
    const a = getCard(game.choices[game.challenger]);
    const b = getCard(game.choices[game.opponent]);
    let winner;
    if (a.power === b.power) winner = '🤝 **Seri!**';
    else winner = a.power > b.power ? `🏆 <@${game.challenger}> **menang!**` : `🏆 <@${game.opponent}> **menang!**`;
    if (game.wager > 0) {
      const pot = game.wager * 2;
      if (winner.includes(`<@${game.challenger}>`)) getUser(game.challenger).coins += pot;
      else if (winner.includes(`<@${game.opponent}>`)) getUser(game.opponent).coins += pot;
      else { getUser(game.challenger).coins += game.wager; getUser(game.opponent).coins += game.wager; }
      getUser(game.challenger).coins -= game.wager;
      getUser(game.opponent).coins -= game.wager;
    }
    await interaction.message.edit({ content: `🎴 **HASIL DUEL KARTU**\n\n<@${game.challenger}>: ${a.emoji} **${a.name}** — ${tierEmoji[a.tier]} ${a.tier} — Power ${a.power}\n<@${game.opponent}>: ${b.emoji} **${b.name}** — ${tierEmoji[b.tier]} ${b.tier} — Power ${b.power}\n\n${winner}${game.wager ? `\n💰 Hadiah: **${game.wager * 2} 🪙**` : ''}`, components: [] });
    games.delete(gameId);
  }
});

client.on('error', error => console.error('Discord client error:', error));
client.login(token).catch(error => { console.error('Failed to login to Discord:', error.message); process.exit(1); });
