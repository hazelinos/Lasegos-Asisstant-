const youtubedl = require('youtube-dl-exec');

// Keep the extractor configuration conservative. The previous version forced
// Deno/EJS, which can make yt-dlp fail completely on Railway before search.
const BASE = {
  extractorArgs: 'youtube:player_client=android,web_safari',
  noWarnings: true,
  noCheckCertificates: true,
  noPlaylist: true
};

async function search(query, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 5, 1), 10);
  const result = await youtubedl(`ytsearch${limit}:${query}`, {
    ...BASE,
    dumpSingleJson: true,
    flatPlaylist: true,
    skipDownload: true,
    quiet: true
  });
  return (result?.entries || []).map(v => ({
    title: v.title || 'Unknown title',
    url: v.webpage_url || v.original_url || (v.id ? `https://www.youtube.com/watch?v=${v.id}` : null),
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
    quiet: true
  });
  process.stderr?.on('data', d => {
    const text = d.toString().trim();
    if (text) console.error(`[yt-dlp] ${text}`);
  });
  return { stream: process.stdout, type: 'opus', process };
}

module.exports = { search, video_info, stream };
