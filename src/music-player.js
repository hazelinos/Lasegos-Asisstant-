const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const play = require('play-dl');

const queues = new Map();

function getQueue(guildId) {
  if (!queues.has(guildId)) queues.set(guildId, { tracks: [], current: null, connection: null, player: null, loop: false });
  return queues.get(guildId);
}

async function search(query) {
  const results = await play.search(query, { limit: 1, source: { youtube: 'video' } });
  return results[0] || null;
}

function trackFromResult(v) {
  return { title: v.title, url: v.url, duration: v.durationRaw || '—', thumbnail: v.thumbnails?.[0]?.url || null, author: v.channel?.name || 'Unknown' };
}

async function playNext(guildId, textChannel) {
  const q = getQueue(guildId);
  if (!q.tracks.length) { q.current = null; return; }
  const track = q.tracks.shift(); q.current = track;
  try {
    const stream = await play.stream(track.url, { quality: 2 });
    const resource = createAudioResource(stream.stream, { inputType: stream.type, inlineVolume: true });
    resource.volume?.setVolume(0.8);
    if (!q.player) {
      q.player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
      q.player.on(AudioPlayerStatus.Idle, () => playNext(guildId, textChannel));
      q.player.on('error', err => { console.error('Music player error:', err); playNext(guildId, textChannel); });
    }
    q.player.play(resource);
    q.connection?.subscribe(q.player);
    return track;
  } catch (err) {
    console.error('Music stream error:', err);
    return playNext(guildId, textChannel);
  }
}

async function connectAndPlay({ guild, member, textChannel, track }) {
  const channel = member.voice?.channel;
  if (!channel) throw new Error('NO_VOICE');
  const q = getQueue(guild.id);
  if (!q.connection || q.connection.state.status === VoiceConnectionStatus.Destroyed) {
    q.connection = joinVoiceChannel({ channelId: channel.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true });
    await entersState(q.connection, VoiceConnectionStatus.Ready, 15_000);
  }
  q.tracks.push(track);
  if (!q.current) await playNext(guild.id, textChannel);
}

function skip(guildId, textChannel) {
  const q = getQueue(guildId);
  if (!q.player) return false;
  q.player.stop();
  return true;
}
function stop(guildId) {
  const q = getQueue(guildId);
  q.tracks = []; q.current = null;
  q.player?.stop(); q.connection?.destroy();
  queues.delete(guildId);
}
function pause(guildId) { return getQueue(guildId).player?.pause() || false; }
function resume(guildId) { return getQueue(guildId).player?.unpause() || false; }
function getState(guildId) { return getQueue(guildId); }

module.exports = { search, trackFromResult, connectAndPlay, skip, stop, pause, resume, getState };
