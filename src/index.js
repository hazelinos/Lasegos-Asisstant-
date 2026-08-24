const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const music = require('./music-player');
const library = require('./music');

const token = process.env.DISCORD_TOKEN;
const geminiKey = process.env.GEMINI_API_KEY;
if (!token) { console.error('Missing DISCORD_TOKEN environment variable.'); process.exit(1); }
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
const musicCommand = new SlashCommandBuilder().setName('music').setDescription('Music player dan library pribadi')
  .addSubcommand(s => s.setName('play').setDescription('Putar lagu').addStringOption(o => o.setName('query').setDescription('Judul atau URL YouTube').setRequired(true).setMaxLength(200)))
  .addSubcommand(s => s.setName('pause').setDescription('Pause lagu'))
  .addSubcommand(s => s.setName('resume').setDescription('Lanjutkan lagu'))
  .addSubcommand(s => s.setName('skip').setDescription('Lewati lagu'))
  .addSubcommand(s => s.setName('stop').setDescription('Hentikan music dan kosongkan queue'))
  .addSubcommand(s => s.setName('queue').setDescription('Lihat antrean lagu'))
  .addSubcommand(s => s.setName('library').setDescription('Lihat library music pribadi'))
  .addSubcommand(s => s.setName('like').setDescription('Simpan atau hapus lagu yang sedang diputar dari Liked Songs'))
  .addSubcommand(s => s.setName('playlist').setDescription('Kelola playlist pribadi').addStringOption(o => o.setName('action').setDescription('Aksi playlist').setRequired(true).addChoices({name:'create',value:'create'},{name:'add',value:'add'})).addStringOption(o => o.setName('name').setDescription('Nama playlist').setRequired(true).setMaxLength(40)));
const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Cek apakah bot aktif'),
  new SlashCommandBuilder().setName('help').setDescription('Lihat daftar bantuan bot'),
  new SlashCommandBuilder().setName('clear').setDescription('Hapus pesan di channel ini').addIntegerOption(o => o.setName('jumlah').setDescription('Jumlah pesan yang dihapus').setRequired(true).setMinValue(1).setMaxValue(100)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('ask').setDescription('Tanyakan sesuatu kepada AI').addStringOption(o => o.setName('pertanyaan').setDescription('Pertanyaan yang ingin ditanyakan').setRequired(true).setMaxLength(2000)),
  new SlashCommandBuilder().setName('roblox').setDescription('Cek profil Roblox').addSubcommand(s => s.setName('profile').setDescription('Cek profil Roblox').addStringOption(o => o.setName('username').setDescription('Username Roblox').setRequired(true).setMaxLength(20))).addSubcommand(s => s.setName('avatar').setDescription('Cek avatar Roblox').addStringOption(o => o.setName('username').setDescription('Username Roblox').setRequired(true).setMaxLength(20))),
  musicCommand
].map(c => c.toJSON());
client.once('ready', async readyClient => {
  console.log(`Hazelinos online as ${readyClient.user.tag}`);
  try { const rest = new REST({ version: '10' }).setToken(token); await rest.put(Routes.applicationCommands(readyClient.user.id), { body: commands }); console.log('Slash commands registered including music'); }
  catch (error) { console.error('Failed to register slash commands:', error); }
});
async function getRobloxProfile(username) {
  const r = await fetch('https://users.roblox.com/v1/usernames/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }) });
  if (!r.ok) throw new Error(`Roblox user lookup failed: ${r.status}`);
  const d = await r.json(), user = d.data?.[0]; if (!user) return null;
  const [dr, ar, gr] = await Promise.all([fetch(`https://users.roblox.com/v1/users/${user.id}`), fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=420x420&format=Png&isCircular=false`), fetch(`https://games.roblox.com/v2/users/${user.id}/games?accessFilter=Public&sortOrder=Desc&limit=10`)]);
  const details = dr.ok ? await dr.json() : {}, avatar = ar.ok ? await ar.json() : {}, games = gr.ok ? await gr.json() : {};
  return { ...user, ...details, avatarUrl: avatar.data?.[0]?.imageUrl, games: games.data || [] };
}
async function getRobloxAvatar(userId) {
  const [avatarRes, itemsRes] = await Promise.all([fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=720x720&format=Png&isCircular=false`), fetch(`https://avatar.roblox.com/v1/users/${userId}/avatar`)]);
  if (!avatarRes.ok) throw new Error(`Roblox avatar thumbnail failed: ${avatarRes.status}`);
  const avatar = await avatarRes.json(); const outfit = itemsRes.ok ? await itemsRes.json() : {};
  return { imageUrl: avatar.data?.[0]?.imageUrl, outfit };
}
function formatAvatarItems(outfit) {
  const assets = outfit.assets || [];
  if (!assets.length) return 'Tidak ada item yang tersedia';
  return assets.slice(0, 15).map(asset => { const type = asset.assetType?.name || 'Item'; const name = asset.name || 'Unknown'; const url = asset.id ? `https://www.roblox.com/catalog/${asset.id}` : null; return `**${type}** — ${url ? `[${name}](${url})` : name}`; }).join('\n');
}
function musicEmbed(track, title = 'Now Playing') {
  return new EmbedBuilder().setColor(0x1DB954).setTitle(title).setDescription(`**[${track.title}](${track.url})**\n${track.author || 'Unknown'}\n\n▶️ \`${track.duration || '—'}\``).setThumbnail(track.thumbnail || null).setFooter({ text: 'Hazelinos Music' });
}
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'ping') return interaction.reply(`🏓 Pong! ${client.ws.ping}ms`);
  if (interaction.commandName === 'help') return interaction.reply({ content: '**Hazelinos**\n\n`/ping` — Cek apakah bot aktif\n`/help` — Lihat daftar bantuan bot\n`/clear jumlah` — Hapus pesan di channel ini\n`/ask pertanyaan` — Tanyakan sesuatu kepada AI\n`/roblox profile username` — Cek profil Roblox\n`/roblox avatar username` — Cek avatar Roblox\n`/music play query` — Putar lagu\n`/music library` — Library pribadi\n`/music like` — Like lagu\n`/music playlist` — Kelola playlist', ephemeral: true });
  if (interaction.commandName === 'clear') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: '❌ Kamu tidak punya izin **Manage Messages**', ephemeral: true });
    try { const deleted = await interaction.channel.bulkDelete(interaction.options.getInteger('jumlah', true), true); return interaction.reply({ content: `🗑️ Berhasil menghapus **${deleted.size} pesan**`, ephemeral: true }); } catch (error) { return interaction.reply({ content: '❌ Gagal menghapus pesan', ephemeral: true }); }
  }
  if (interaction.commandName === 'music') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'library') {
      const lib = library.getLibrary(interaction.user.id);
      const playlists = Object.entries(lib.playlists).map(([name, tracks]) => `📁 **${name}** — ${tracks.length} lagu`).join('\n') || 'Belum ada playlist';
      const liked = lib.liked.length ? lib.liked.slice(0, 8).map(t => `❤️ [${t.title}](${t.url})`).join('\n') : 'Belum ada lagu';
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setTitle(`${interaction.user.username}'s Library`).addFields({ name: 'Liked Songs', value: liked.slice(0,1024) }, { name: 'Playlists', value: playlists.slice(0,1024) }, { name: 'Recently Played', value: lib.recent.slice(0,5).map(t => `[${t.title}](${t.url})`).join('\n').slice(0,1024) || 'Belum ada riwayat' }).setFooter({ text: 'Private library • Hazelinos Music' })] });
    }
    if (sub === 'play') {
      await interaction.deferReply();
      try {
        const result = await music.search(interaction.options.getString('query', true));
        if (!result) return interaction.editReply('❌ Lagu tidak ditemukan.');
        const track = music.trackFromResult(result); await music.connectAndPlay({ guild: interaction.guild, member: interaction.member, textChannel: interaction.channel, track }); library.addRecent(interaction.user.id, track);
        return interaction.editReply({ embeds: [musicEmbed(track)] });
      } catch (e) { return interaction.editReply(e.message === 'NO_VOICE' ? '❌ Masuk voice channel dulu.' : '❌ Gagal memutar lagu.'); }
    }
    const state = music.getState(interaction.guild.id);
    if (sub === 'pause') return interaction.reply(state.player?.pause() ? '⏸️ Music dijeda.' : '❌ Tidak ada lagu yang sedang diputar.');
    if (sub === 'resume') return interaction.reply(state.player?.unpause() ? '▶️ Music dilanjutkan.' : '❌ Tidak ada lagu yang dijeda.');
    if (sub === 'skip') return interaction.reply(music.skip(interaction.guild.id, interaction.channel) ? '⏭️ Lagu dilewati.' : '❌ Tidak ada lagu.');
    if (sub === 'stop') { music.stop(interaction.guild.id); return interaction.reply('⏹️ Music dihentikan dan queue dikosongkan.'); }
    if (sub === 'queue') return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setTitle('Music Queue').setDescription(state.current ? `▶️ **[${state.current.title}](${state.current.url})**\n\n${state.tracks.length ? state.tracks.map((t,i)=>`${i+1}. [${t.title}](${t.url})`).join('\n') : 'Queue kosong.'}` : 'Tidak ada lagu yang sedang diputar.')] });
    if (sub === 'like') {
      if (!state.current) return interaction.reply('❌ Tidak ada lagu yang sedang diputar.');
      const liked = library.toggleLiked(interaction.user.id, state.current); return interaction.reply(liked ? '❤️ Ditambahkan ke Liked Songs.' : '💔 Dihapus dari Liked Songs.');
    }
    if (sub === 'playlist') {
      const action = interaction.options.getString('action', true), name = interaction.options.getString('name', true);
      if (action === 'create') return interaction.reply(library.createPlaylist(interaction.user.id, name) ? `📁 Playlist **${name}** dibuat.` : '❌ Playlist dengan nama itu sudah ada.');
      if (!state.current) return interaction.reply('❌ Putar lagu dulu sebelum menambahkannya.');
      return interaction.reply(library.addToPlaylist(interaction.user.id, name, state.current) ? `➕ Lagu ditambahkan ke **${name}**.` : `❌ Playlist **${name}** tidak ditemukan.`);
    }
  }
  if (interaction.commandName === 'roblox' && interaction.options.getSubcommand() === 'profile') {
    const username = interaction.options.getString('username', true); await interaction.deferReply();
    try { const p = await getRobloxProfile(username); if (!p) return interaction.editReply(`❌ Username Roblox **${username}** tidak ditemukan`); const created = p.created ? `<t:${Math.floor(new Date(p.created).getTime()/1000)}:D>` : 'Tidak diketahui'; const bio = p.description?.trim() || 'Tidak ada bio'; const games = p.games.length ? p.games.slice(0,5).map(g=>`**${g.name}**\n${Number(g.placeVisits||0).toLocaleString('id-ID')} visits`).join('\n\n') : 'Tidak ada experience publik'; const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(p.displayName||p.name).setURL(`https://www.roblox.com/users/${p.id}/profile`).setThumbnail(p.avatarUrl||null).setDescription(`**@${p.name}**\n\n${bio.slice(0,500)}`).addFields({name:'User ID',value:String(p.id),inline:true},{name:'Bergabung',value:created,inline:true},{name:'Experience',value:games.slice(0,1024)}).setFooter({text:'Roblox Profile'}); return interaction.editReply({embeds:[embed]}); } catch { return interaction.editReply('❌ Gagal mengambil data Roblox.'); }
  }
  if (interaction.commandName === 'roblox' && interaction.options.getSubcommand() === 'avatar') {
    const username = interaction.options.getString('username', true); await interaction.deferReply();
    try { const p=await getRobloxProfile(username); if(!p) return interaction.editReply(`❌ Username Roblox **${username}** tidak ditemukan`); const {imageUrl,outfit}=await getRobloxAvatar(p.id); const embed=new EmbedBuilder().setColor(0x5865F2).setTitle('Username').setDescription(`**[@${p.name}](https://www.roblox.com/users/${p.id}/profile)**`).setImage(imageUrl||null).addFields({name:'Worn Items',value:formatAvatarItems(outfit).slice(0,1024)}).setFooter({text:'Roblox Avatar'}); return interaction.editReply({embeds:[embed]}); } catch { return interaction.editReply('❌ Gagal mengambil avatar Roblox.'); }
  }
  if (interaction.commandName === 'ask') {
    if (!geminiKey) return interaction.reply({ content: '❌ GEMINI_API_KEY belum diatur di Environment', ephemeral: true });
    const question = interaction.options.getString('pertanyaan', true); await interaction.deferReply();
    try { const r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent',{method:'POST',headers:{'x-goog-api-key':geminiKey,'Content-Type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:'Kamu adalah Hazelinos. Jawab langsung pertanyaan pengguna dalam bahasa Indonesia kecuali pengguna meminta bahasa lain. Jangan membuka jawaban dengan Halo, Hai, salam, sapaan, atau perkenalan kecuali pengguna memang menyapa terlebih dahulu. Jangan mengulang pertanyaan pengguna. Jawab dengan jelas, akurat, ringkas, dan natural. Jangan mengarang fakta.'}]},contents:[{role:'user',parts:[{text:question}]}],generationConfig:{maxOutputTokens:1024}})}); const data=await r.json(); if(!r.ok) return interaction.editReply('❌ Gagal mendapatkan jawaban dari AI'); const answer=data.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim(); if(!answer) return interaction.editReply('❌ AI tidak memberikan jawaban'); const chunks=answer.match(/[\s\S]{1,1900}/g)||[]; await interaction.editReply(chunks[0]); for(let i=1;i<chunks.length;i++) await interaction.followUp(chunks[i]); } catch { await interaction.editReply('❌ Terjadi kesalahan saat menghubungi AI'); }
  }
});
client.on('error', error => console.error('Discord client error:', error));
client.login(token).catch(error => { console.error('Failed to login to Discord:', error.message); process.exit(1); });
