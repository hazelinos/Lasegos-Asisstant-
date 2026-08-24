const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');

function musicPanel() {
  const embed = new EmbedBuilder()
    .setColor(0x1DB954)
    .setTitle('🎵 Hazelinos Music')
    .setDescription('**Nothing is playing**\n\nJoin a voice channel and choose a song to start listening.')
    .addFields({ name: 'Queue', value: 'No songs in queue', inline: true }, { name: 'Volume', value: '80%', inline: true });

  const controls = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('music_previous').setEmoji('⏮️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music_pause').setEmoji('⏸️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music_skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music_loop').setEmoji('🔁').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger)
  );
  const library = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('music_library').setLabel('Library').setEmoji('📚').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('music_like').setLabel('Like').setEmoji('❤️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('music_queue').setLabel('Queue').setEmoji('📜').setStyle(ButtonStyle.Secondary)
  );
  const menu = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('music_menu').setPlaceholder('Music options').addOptions(
    { label: 'Search & Play', value: 'search', emoji: '🔍' },
    { label: 'Liked Songs', value: 'liked', emoji: '❤️' },
    { label: 'Playlists', value: 'playlists', emoji: '📁' },
    { label: 'Recently Played', value: 'recent', emoji: '🕘' }
  ));
  return { embeds: [embed], components: [controls, library, menu] };
}

module.exports = { musicPanel };
