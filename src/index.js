const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const geminiKey = process.env.GEMINI_API_KEY;

if (!token) {
  console.error('Missing DISCORD_TOKEN environment variable.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Cek apakah bot aktif'),
  new SlashCommandBuilder().setName('help').setDescription('Lihat daftar bantuan bot'),
  new SlashCommandBuilder().setName('clear').setDescription('Hapus pesan di channel ini').addIntegerOption(option => option.setName('jumlah').setDescription('Jumlah pesan yang dihapus').setRequired(true).setMinValue(1).setMaxValue(100)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('tanya').setDescription('Tanyakan sesuatu kepada AI').addStringOption(option => option.setName('pertanyaan').setDescription('Pertanyaan yang ingin ditanyakan').setRequired(true).setMaxLength(2000)),
  new SlashCommandBuilder().setName('roblox').setDescription('Cek profil Roblox').addSubcommand(subcommand => subcommand.setName('profile').setDescription('Cek profil Roblox').addStringOption(option => option.setName('username').setDescription('Username Roblox').setRequired(true).setMaxLength(20)))
].map(command => command.toJSON());

client.once('ready', async readyClient => {
  console.log(`Hazelinos online as ${readyClient.user.tag}`);
  try {
    const rest = new REST({ version: '10' }).setToken(token);
    await rest.put(Routes.applicationCommands(readyClient.user.id), { body: commands });
    console.log('Global slash commands registered: /ping, /help, /clear, /tanya, /roblox profile');
  } catch (error) { console.error('Failed to register slash commands:', error); }
});

async function getRobloxProfile(username) {
  const userResponse = await fetch('https://users.roblox.com/v1/usernames/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }) });
  if (!userResponse.ok) throw new Error(`Roblox user lookup failed: ${userResponse.status}`);
  const userData = await userResponse.json();
  const user = userData.data?.[0];
  if (!user) return null;
  const [detailResponse, avatarResponse, gamesResponse] = await Promise.all([
    fetch(`https://users.roblox.com/v1/users/${user.id}`),
    fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=420x420&format=Png&isCircular=false`),
    fetch(`https://games.roblox.com/v2/users/${user.id}/games?accessFilter=Public&sortOrder=Desc&limit=10`)
  ]);
  const details = detailResponse.ok ? await detailResponse.json() : {};
  const avatar = avatarResponse.ok ? await avatarResponse.json() : {};
  const games = gamesResponse.ok ? await gamesResponse.json() : {};
  return { ...user, ...details, avatarUrl: avatar.data?.[0]?.imageUrl, games: games.data || [] };
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'ping') return interaction.reply(`🏓 Pong! ${client.ws.ping}ms`);
  if (interaction.commandName === 'help') return interaction.reply({ content: '**Hazelinos**\n\n`/ping` — Cek apakah bot aktif\n`/help` — Lihat daftar bantuan bot\n`/clear jumlah` — Hapus pesan di channel ini\n`/tanya pertanyaan` — Tanyakan sesuatu kepada AI\n`/roblox profile username` — Cek profil Roblox', ephemeral: true });
  if (interaction.commandName === 'clear') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: '❌ Kamu tidak punya izin **Manage Messages**', ephemeral: true });
    const jumlah = interaction.options.getInteger('jumlah', true);
    try { const deleted = await interaction.channel.bulkDelete(jumlah, true); return interaction.reply({ content: `🗑️ Berhasil menghapus **${deleted.size} pesan**`, ephemeral: true }); }
    catch (error) { console.error(error); return interaction.reply({ content: '❌ Gagal menghapus pesan', ephemeral: true }); }
  }
  if (interaction.commandName === 'roblox' && interaction.options.getSubcommand() === 'profile') {
    const username = interaction.options.getString('username', true);
    await interaction.deferReply();
    try {
      const profile = await getRobloxProfile(username);
      if (!profile) return interaction.editReply(`❌ Username Roblox **${username}** tidak ditemukan`);
      const created = profile.created ? `<t:${Math.floor(new Date(profile.created).getTime() / 1000)}:D>` : 'Tidak diketahui';
      const description = profile.description?.trim() || 'Tidak ada bio';
      const gameText = profile.games.length ? profile.games.slice(0, 5).map(game => `**${game.name}** — ${Number(game.placeVisits || 0).toLocaleString('id-ID')} visits`).join('\n') : 'Tidak ada experience publik';
      const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`${profile.displayName || profile.name}`).setURL(`https://www.roblox.com/users/${profile.id}/profile`).setThumbnail(profile.avatarUrl || null).addFields(
        { name: 'Username', value: `@${profile.name}`, inline: true },
        { name: 'User ID', value: String(profile.id), inline: true },
        { name: 'Bergabung', value: created, inline: true },
        { name: 'Bio', value: description.slice(0, 1024), inline: false },
        { name: 'Experience', value: gameText.slice(0, 1024), inline: false }
      ).setFooter({ text: 'Roblox Profile' });
      return interaction.editReply({ embeds: [embed] });
    } catch (error) { console.error('Roblox lookup error:', error); return interaction.editReply('❌ Gagal mengambil data Roblox. Coba lagi nanti'); }
  }
  if (interaction.commandName === 'tanya') {
    if (!geminiKey) return interaction.reply({ content: '❌ GEMINI_API_KEY belum diatur di Environment', ephemeral: true });
    const question = interaction.options.getString('pertanyaan', true);
    await interaction.deferReply();
    try {
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent', { method: 'POST', headers: { 'x-goog-api-key': geminiKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: 'Kamu adalah Hazelinos. Jawab langsung pertanyaan pengguna dalam bahasa Indonesia kecuali pengguna meminta bahasa lain. Jangan membuka jawaban dengan Halo, Hai, salam, sapaan, atau perkenalan kecuali pengguna memang menyapa terlebih dahulu. Jangan mengulang pertanyaan pengguna. Jawab dengan jelas, akurat, ringkas, dan natural. Jangan mengarang fakta. Jika informasi bisa berubah, nyatakan ketidakpastian dan gunakan tanggal yang relevan.' }] }, contents: [{ role: 'user', parts: [{ text: question }] }], generationConfig: { maxOutputTokens: 1024 } }) });
      const data = await response.json();
      if (!response.ok) { console.error('Gemini API error:', data); return interaction.editReply('❌ Gagal mendapatkan jawaban dari AI'); }
      const answer = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('').trim();
      if (!answer) return interaction.editReply('❌ AI tidak memberikan jawaban');
      const chunks = answer.match(/[\s\S]{1,1900}/g) || [];
      await interaction.editReply(chunks[0]);
      for (let i = 1; i < chunks.length; i++) await interaction.followUp(chunks[i]);
    } catch (error) { console.error('Gemini error:', error); await interaction.editReply('❌ Terjadi kesalahan saat menghubungi AI'); }
  }
});

client.on('error', error => console.error('Discord client error:', error));
client.login(token).catch(error => { console.error('Failed to login to Discord:', error.message); process.exit(1); });
