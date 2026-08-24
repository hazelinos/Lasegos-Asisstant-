const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const play = require('play-dl');

module.exports = function setupMusicSearch(client) {
  client.on('interactionCreate', async interaction => {
    if (!interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;
    if (!interaction.customId.startsWith('music_')) return;

    if (interaction.isStringSelectMenu() && interaction.customId === 'music_menu') {
      if (interaction.values[0] === 'search') {
        const modal = new ModalBuilder().setCustomId('music_search_modal').setTitle('Search Music');
        const input = new TextInputBuilder().setCustomId('query').setLabel('Cari lagu atau artis').setPlaceholder('Contoh: The Weeknd Blinding Lights').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }
      if (interaction.values[0] === 'liked' || interaction.values[0] === 'recent' || interaction.values[0] === 'playlists') {
        const { getLibrary } = require('./music');
        const lib = getLibrary(interaction.user.id);
        let title = '📚 Library';
        let list = [];
        if (interaction.values[0] === 'liked') { title = '❤️ Liked Songs'; list = lib.liked; }
        if (interaction.values[0] === 'recent') { title = '🕘 Recently Played'; list = lib.recent; }
        if (interaction.values[0] === 'playlists') { title = '📁 Playlists'; list = Object.entries(lib.playlists).map(([name, songs]) => ({ title: name, duration: `${songs.length} songs` })); }
        const description = list.length ? list.slice(0, 15).map((t, i) => `${i + 1}. **${t.title}**${t.duration ? ` — ${t.duration}` : ''}`).join('\n') : 'Belum ada lagu di sini.';
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x1DB954).setTitle(title).setDescription(description)], ephemeral: true });
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'music_search_modal') {
      await interaction.deferReply({ ephemeral: true });
      const query = interaction.fields.getTextInputValue('query');
      try {
        const results = await play.search(query, { limit: 5, source: { youtube: 'video' } });
        if (!results.length) return interaction.editReply('❌ Lagu tidak ditemukan.');
        const menu = new StringSelectMenuBuilder().setCustomId('music_results').setPlaceholder('Pilih lagu');
        results.forEach((r, i) => menu.addOptions({ label: (r.title || 'Unknown').slice(0, 100), description: `${r.channel?.name || 'YouTube'} • ${r.durationRaw || ''}`.slice(0, 100), value: String(i) }));
        // Store the short-lived search results on the user to avoid exposing URLs in component values.
        globalThis.hazelinosMusicSearches ||= new Map();
        globalThis.hazelinosMusicSearches.set(interaction.user.id, results);
        setTimeout(() => globalThis.hazelinosMusicSearches?.delete(interaction.user.id), 5 * 60 * 1000);
        return interaction.editReply({ content: `🔍 Hasil untuk **${query}**`, components: [new ActionRowBuilder().addComponents(menu)] });
      } catch (error) { console.error('Music search error:', error); return interaction.editReply('❌ Gagal mencari lagu.'); }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'music_results') {
      const results = globalThis.hazelinosMusicSearches?.get(interaction.user.id);
      const result = results?.[Number(interaction.values[0])];
      if (!result) return interaction.reply({ content: '❌ Hasil pencarian sudah kedaluwarsa. Cari lagi.', ephemeral: true });
      const startMusic = globalThis.hazelinosMusic?.startMusic;
      if (!startMusic) return interaction.reply({ content: '❌ Music engine belum siap.', ephemeral: true });
      const track = { title: result.title, url: result.url, duration: result.durationRaw || '', thumbnail: result.thumbnails?.[0]?.url || null };
      await interaction.deferReply({ ephemeral: true });
      const started = await startMusic(interaction, track);
      if (started.error) return interaction.editReply(started.error);
      return interaction.editReply({ content: `🎵 **${track.title}** ${started.state.queue.includes(track) ? 'ditambahkan ke queue' : 'sedang diputar'}.` });
    }
  });
};
