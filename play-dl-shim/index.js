const youtubedl = require('youtube-dl-exec');

const BASE = {
  jsRuntimes: 'deno',
  remoteComponents: 'ejs:npm',
  extractorArgs: 'youtube:player_client=tv,web_safari',
  noWarnings: true,
  noCheckCertificates: true
};

async function search(query, options = {}) {
  const result = await youtubedl(`ytsearch${options.limit || 5}:${query}`, {
    ...BASE,
    dumpSingleJson: true,
    flatPlaylist: true,
    skipDownload: true,
    quiet: true
  });
  return (result?.entries || []).map(v => ({
    title: v.title || 'Unknown title',
    url: v.webpage_url || v.original_url || `https://www.youtube.com/watch?v=${v.id}`,
    durationRaw: v.duration_string || '',
    durationInSec: v.duration || 0,
    thumbnails: v.thumbnails || (v.thumbnail ? [{ url: v.thumbnail }] : []),
    channel: { name: v.channel || v.uploader || 'YouTube' }
  })).filter(v => v.url);
}

async function video_info(url) {
  const info = await youtubedl(url, {
    ...BASE,
    dumpSingleJson: true,
    skipDownload: true,
    quiet: true
  });
  return {
    video_details: {
      title: info?.title || 'Unknown title',
      url,
      durationRaw: info?.duration_string || '',
      thumbnails: info?.thumbnails || []
    }
  };
}

function stream(url) {
  const process = youtubedl.exec(url, {
    ...BASE,
    output: '-',
    extractAudio: true,
    audioFormat: 'opus',
    audioQuality: '5',
    quiet: true,
    noWarnings: true,
    noPlaylist: true
  });
  process.stderr?.on('data', d => {
    const text = d.toString().trim();
    if (text) console.error(`[yt-dlp] ${text}`);
  });
  return { stream: process.stdout, type: 'opus' };
}

module.exports = { search, video_info, stream };
