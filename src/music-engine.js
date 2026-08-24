const youtubedl = require('youtube-dl-exec');

const YT_OPTIONS = {
  jsRuntimes: 'deno',
  remoteComponents: 'ejs:npm',
  extractorArgs: 'youtube:player_client=tv,web_safari',
  noWarnings: true,
  noCheckCertificates: true,
  noPlaylist: true
};

async function search(query, options = {}) {
  const result = await youtubedl(`ytsearch${options.limit || 5}:${query}`, {
    ...YT_OPTIONS,
    dumpSingleJson: true,
    flatPlaylist: true,
    skipDownload: true,
    quiet: true
  });
  const entries = Array.isArray(result?.entries) ? result.entries : [];
  return entries.map((v) => ({
    title: v.title || 'Unknown title',
    url: v.webpage_url || v.original_url || (v.id ? `https://www.youtube.com/watch?v=${v.id}` : null),
    durationRaw: v.duration_string || '',
    durationInSec: v.duration || 0,
    thumbnails: v.thumbnails || (v.thumbnail ? [{ url: v.thumbnail }] : []),
    channel: v.channel || v.uploader || ''
  })).filter(v => v.url);
}

function stream(url) {
  const process = youtubedl.exec(url, {
    ...YT_OPTIONS,
    output: '-',
    extractAudio: true,
    audioFormat: 'opus',
    audioQuality: '5',
    quiet: true,
    noWarnings: true
  });
  process.stderr?.on('data', (data) => {
    const text = data.toString().trim();
    if (text) console.error(`[yt-dlp] ${text}`);
  });
  return { stream: process.stdout, type: 'opus', process };
}

module.exports = { search, stream };
