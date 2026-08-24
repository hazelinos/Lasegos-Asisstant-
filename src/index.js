const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior } = require('@discordjs/voice');
const play = require('play-dl');
const { musicPanel } = require('./music-panel');
const { getLibrary, addRecent, toggleLiked } = require('./music');

const token = process.env.DISCORD_TOKEN;
const geminiKey = process.env.GEMINI_API_KEY;
if (!token) { console.error('Missing DISCORD_TOKEN environment variable.'); process.exit(1); }
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
const players = new Map();
const queues = new Map();

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Cek apakah bot aktif'),
  new SlashCommandBuilder().setName('help').setDescription('Lihat daftar bantuan bot'),
  new SlashCommandBuilder().setName('clear').setDescription('Hapus pesan di channel ini').addIntegerOption(o => o.setName('jumlah').setDescription('Jumlah pesan yang dihapus').setRequired(true).setMinValue(1).setMaxValue(100)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('ask').setDescription('Tanyakan sesuatu kepada AI').addStringOption(o => o.setName('pertanyaan').setDescription('Pertanyaan yang ingin ditanyakan').setRequired(true).setMaxLength(2000)),
  new SlashCommandBuilder().setName('music').setDescription('Buka panel music'),
  new SlashCommandBuilder().setName('roblox').setDescription('Cek profil Roblox').addSubcommand(s => s.setName('profile').setDescription('Cek profil Roblox').addStringOption(o => o.setName('username').setDescription('Username Roblox').setRequired(true).setMaxLength(20))).addSubcommand(s => s.setName('avatar').setDescription('Cek avatar Roblox').addStringOption(o => o.setName('username').setDescription('Username Roblox').setRequired(true).setMaxLength(20)))
].map(c => c.toJSON());

client.once('ready', async readyClient => {
  console.log(`Hazelinos online as ${readyClient.user.tag}`);
  try { const rest = new REST({ version: '10' }).setToken(token); await rest.put(Routes.applicationCommands(readyClient.user.id), { body: commands }); console.log('Slash commands registered'); }
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
  const avatar = await avatarRes.json();
  const outfit = itemsRes.ok ? await itemsRes.json() : {};
  return { imageUrl: avatar.data?.[0]?.imageUrl, outfit };
}
function formatAvatarItems(outfit) {
  const assets = outfit.assets || [];
  if (!assets.length) return 'Tidak ada item yang tersedia';
  return assets.slice(0, 15).map(asset => { const type = asset.assetType?.name || 'Item'; const name = asset.name || 'Unknown'; const url = asset.id ? `https://www.roblox.com/catalog/${asset.id}` : null; return `**${type}** — ${url ? `[${name}](${url})` : name}`; }).join('\n');
}

async function playTrack(guildId, track) {
  const state = queues.get(guildId); if (!state) return;
  try {
    const stream = await play.stream(track.url, { discordPlayerCompatibility: true });
    const resource = createAudioResource(stream.stream, { inputType: stream.type, inlineVolume: true });
    resource.volume?.setVolume(state.volume / 100);
    state.player.play(resource); state.current = track;
  } catch (error) { console.error('Music stream error:', error); state.current = null; if (state.queue.length) return playTrack(guildId, state.queue.shift()); }
}
async function startMusic(interaction, track) {
  const voice = interaction.member?.voice?.channel;
  if (!voice) return { error: '❌ Masuk voice channel dulu.' };
  let state = queues.get(interaction.guildId);
  if (!state) {
    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
    state = { player, connection: null, queue: [], current: null, volume: 80, loop: false };
    queues.set(interaction.guildId, state); players.set(interaction.guildId, player);
    player.on(AudioPlayerStatus.Idle, () => { if (state.loop && state.current) return playTrack(interaction.guildId, state.current); const next = state.queue.shift(); if (next) playTrack(interaction.guildId, next); else state.current = null; });
  }
  if (!state.connection) state.connection = joinVoiceChannel({ channelId: voice.id, guildId: interaction.guildId, adapterCreator: interaction.guild.voiceAdapterCreator });
  state.connection.subscribe(state.player);
  if (state.current) state.queue.push(track); else await playTrack(interaction.guildId, track);
  addRecent(interaction.user.id, track);
  return { state };
}
function musicNowPlaying(state) {
  const t = state?.current;
  if (!t) return musicPanel();
  const embed = new EmbedBuilder().setColor(0x1DB954).setTitle('🎵 Hazelinos Music').setDescription(`**${t.title}**\n${t.duration ? `\`${t.duration}\`` : ''}`).setThumbnail(t.thumbnail || null).addFields({ name: 'Queue', value: `${state.queue.length} song(s)`, inline: true }, { name: 'Volume', value: `${state.volume}%`, inline: true });
  const controls = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('music_previous').setEmoji('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(true), new ButtonBuilder().setCustomId('music_pause').setEmoji(state.player.state.status === AudioPlayerStatus.Paused ? '▶️' : '⏸️').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('music_skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('music_loop').setEmoji('🔁').setStyle(state.loop ? ButtonStyle.Success : ButtonStyle.Secondary), new ButtonBuilder().setCustomId('music_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger));
  const library = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('music_library').setLabel('Library').setEmoji('📚').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('music_like').setLabel('Like').setEmoji('❤️').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('music_queue').setLabel('Queue').setEmoji('📜').setStyle(ButtonStyle.Secondary));
  return { embeds: [embed], components: [controls, library] };
}

function searchModal() {
  return new ModalBuilder().setCustomId('music_search_modal').setTitle('Search & Play').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('music_query').setLabel('Cari lagu').setPlaceholder('Contoh: The Weeknd - Blinding Lights').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)));
}

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'music') return interaction.reply(musicPanel());
      if (interaction.commandName === 'ping') return interaction.reply(`🏓 Pong! ${client.ws.ping}ms`);
      if (interaction.commandName === 'help') return interaction.reply({ content: '**Hazelinos**\n\n`/music` — Buka music panel\n`/roblox profile username` — Cek profil Roblox\n`/roblox avatar username` — Cek avatar Roblox\n`/ask pertanyaan` — Tanya AI\n`/clear jumlah` — Hapus pesan', ephemeral: true });
      if (interaction.commandName === 'clear') { if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: '❌ Kamu tidak punya izin **Manage Messages**', ephemeral: true }); try { const deleted = await interaction.channel.bulkDelete(interaction.options.getInteger('jumlah', true), true); return interaction.reply({ content: `🗑️ Berhasil menghapus **${deleted.size} pesan**`, ephemeral: true }); } catch { return interaction.reply({ content: '❌ Gagal menghapus pesan', ephemeral: true }); } }
      if (interaction.commandName === 'roblox' && interaction.options.getSubcommand() === 'profile') { const username = interaction.options.getString('username', true); await interaction.deferReply(); try { const p = await getRobloxProfile(username); if (!p) return interaction.editReply(`❌ Username Roblox **${username}** tidak ditemukan`); const created = p.created ? `<t:${Math.floor(new Date(p.created).getTime() / 1000)}:D>` : 'Tidak diketahui'; const bio = p.description?.trim() || 'Tidak ada bio'; const games = p.games.length ? p.games.slice(0, 5).map(g => `**${g.name}**\n${Number(g.placeVisits || 0).toLocaleString('id-ID')} visits`).join('\n\n') : 'Tidak ada experience publik'; const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(p.displayName || p.name).setURL(`https://www.roblox.com/users/${p.id}/profile`).setThumbnail(p.avatarUrl || null).setDescription(`**@${p.name}**\n\n${bio.slice(0, 500)}`).addFields({ name: 'User ID', value: String(p.id), inline: true }, { name: 'Bergabung', value: created, inline: true }, { name: 'Experience', value: games.slice(0, 1024) }).setFooter({ text: 'Roblox Profile' }); return interaction.editReply({ embeds: [embed] }); } catch { return interaction.editReply('❌ Gagal mengambil data Roblox.'); } }
      if (interaction.commandName === 'roblox' && interaction.options.getSubcommand() === 'avatar') { const username = interaction.options.getString('username', true); await interaction.deferReply(); try { const p = await getRobloxProfile(username); if (!p) return interaction.editReply(`❌ Username Roblox **${username}** tidak ditemukan`); const { imageUrl, outfit } = await getRobloxAvatar(p.id); const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('Username').setDescription(`**[@${p.name}](https://www.roblox.com/users/${p.id}/profile)**`).setImage(imageUrl || null).addFields({ name: 'Worn Items', value: formatAvatarItems(outfit).slice(0, 1024) }).setFooter({ text: 'Roblox Avatar' }); return interaction.editReply({ embeds: [embed] }); } catch { return interaction.editReply('❌ Gagal mengambil avatar Roblox.'); } }
      if (interaction.commandName === 'ask') { if (!geminiKey) return interaction.reply({ content: '❌ GEMINI_API_KEY belum diatur di Environment', ephemeral: true }); const question = interaction.options.getString('pertanyaan', true); await interaction.deferReply(); try { const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent', { method: 'POST', headers: { 'x-goog-api-key': geminiKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: question }] }], generationConfig: { maxOutputTokens: 1024 } }) }); const data = await r.json(); const answer = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim(); return interaction.editReply(answer || '❌ AI tidak memberikan jawaban'); } catch { return interaction.editReply('❌ Terjadi kesalahan saat menghubungi AI'); } }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'music_menu') {
      const choice = interaction.values[0];
      if (choice === 'search') return interaction.showModal(searchModal());
      const lib = getLibrary(interaction.user.id);
      if (choice === 'liked') {
        const text = lib.liked.length ? lib.liked.slice(0, 10).map((t, i) => `${i + 1}. **${t.title}**`).join('\n') : 'Belum ada lagu yang disukai.';
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setTitle('❤️ Liked Songs').setDescription(text)], ephemeral: true });
      }
      if (choice === 'recent') {
        const text = lib.recent.length ? lib.recent.slice(0, 10).map((t, i) => `${i + 1}. **${t.title}**`).join('\n') : 'Belum ada riwayat lagu.';
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setTitle('🕘 Recently Played').setDescription(text)], ephemeral: true });
      }
      if (choice === 'playlists') {
        const names = Object.keys(lib.playlists);
        const text = names.length ? names.map((name, i) => `${i + 1}. **${name}** — ${lib.playlists[name].length} lagu`).join('\n') : 'Belum ada playlist.';
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setTitle('📁 Playlists').setDescription(text)], ephemeral: true });
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'music_search_modal') {
      const query = interaction.fields.getTextInputValue('music_query').trim();
      await interaction.deferReply({ ephemeral: true });
      try {
        const results = await play.search(query, { limit: 8, source: { youtube: 'video' } });
        if (!results.length) return interaction.editReply('❌ Lagu tidak ditemukan.');
        const options = results.map((r, i) => ({ label: String(r.title || 'Unknown').slice(0, 100), description: `${r.channel?.name || 'Unknown artist'} • ${r.durationRaw || ''}`.slice(0, 100), value: r.url, emoji: '🎵' }));
        const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('music_search_results').setPlaceholder('Pilih lagu untuk diputar').addOptions(options));
        return interaction.editReply({ content: `🔎 Hasil pencarian untuk **${query}**`, components: [row] });
      } catch (error) { console.error('Music search error:', error); return interaction.editReply('❌ Gagal mencari lagu. Coba lagi.'); }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'music_search_results') {
      await interaction.deferReply({ ephemeral: true });
      const url = interaction.values[0];
      try {
        const info = await play.video_info(url);
        const track = { title: info.video_details?.title || 'Unknown', url, duration: info.video_details?.durationRaw || '', thumbnail: info.video_details?.thumbnails?.[0]?.url || null };
        const result = await startMusic(interaction, track);
        if (result.error) return interaction.editReply(result.error);
        return interaction.editReply({ content: `🎵 **${track.title}** ${result.state.current?.url === track.url ? 'sedang diputar.' : 'ditambahkan ke queue.'}` });
      } catch (error) { console.error('Music play error:', error); return interaction.editReply('❌ Gagal memutar lagu. Pastikan kamu sudah masuk voice channel.'); }
    }

    if (!interaction.isButton()) return;
    if (!interaction.customId.startsWith('music_')) return;
    const state = queues.get(interaction.guildId);
    if (interaction.customId === 'music_library') { const lib = getLibrary(interaction.user.id); const playlists = Object.keys(lib.playlists); const embed = new EmbedBuilder().setColor(0x1DB954).setTitle('📚 Your Library').setDescription(`❤️ Liked Songs: **${lib.liked.length}**\n📁 Playlists: **${playlists.length}**\n🕘 Recently Played: **${lib.recent.length}**`); return interaction.reply({ embeds: [embed], ephemeral: true }); }
    if (!state) return interaction.reply({ content: '❌ Belum ada lagu yang sedang diputar.', ephemeral: true });
    if (interaction.customId === 'music_pause') { state.player.state.status === AudioPlayerStatus.Paused ? state.player.unpause() : state.player.pause(); return interaction.update(musicNowPlaying(state)); }
    if (interaction.customId === 'music_skip') { state.player.stop(); return interaction.update(musicNowPlaying(state)); }
    if (interaction.customId === 'music_stop') { state.queue.length = 0; state.current = null; state.player.stop(); if (state.connection) state.connection.destroy(); queues.delete(interaction.guildId); return interaction.update(musicPanel()); }
    if (interaction.customId === 'music_loop') { state.loop = !state.loop; return interaction.update(musicNowPlaying(state)); }
    if (interaction.customId === 'music_like') { if (!state.current) return interaction.reply({ content: '❌ Tidak ada lagu.', ephemeral: true }); const liked = toggleLiked(interaction.user.id, state.current); return interaction.reply({ content: liked ? '❤️ Ditambahkan ke Liked Songs.' : '💔 Dihapus dari Liked Songs.', ephemeral: true }); }
    if (interaction.customId === 'music_queue') { const text = state.queue.length ? state.queue.slice(0, 10).map((t, i) => `${i + 1}. ${t.title}`).join('\n') : 'Queue kosong'; return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setTitle('📜 Queue').setDescription(text)], ephemeral: true }); }
  } catch (error) {
    console.error('Interaction error:', error);
    if (!interaction.replied && !interaction.deferred) return interaction.reply({ content: '❌ Terjadi kesalahan.', ephemeral: true }).catch(() => {});
    if (interaction.deferred && !interaction.replied) return interaction.editReply('❌ Terjadi kesalahan.').catch(() => {});
  }
});

client.on('error', error => console.error('Discord client error:', error));
client.login(token).catch(error => { console.error('Failed to login to Discord:', error.message); process.exit(1); });
