const youtubedl = require('youtube-dl-exec');

// Search/metadata follows the approach used by YT-Music-Mod:
// YouTube Music InnerTube for search, yt-dlp only for Discord voice streaming.
const YTM = 'https://music.youtube.com/youtubei/v1';
const CONTEXT = {
  client: {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20240101.00.00',
    hl: 'id',
    gl: 'ID'
  }
};
const HEADERS = {
  'Content-Type': 'application/json',
  Origin: 'https://music.youtube.com',
  Referer: 'https://music.youtube.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
};
const SEARCH_PARAMS = 'EgWKAQIIAWoMEA4QChADEAQQCRAF';

async function yt(endpoint, body = {}) {
  const res = await fetch(`${YTM}/${endpoint}?prettyPrint=false`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ context: CONTEXT, ...body })
  });
  if (!res.ok) throw new Error(`YouTube Music ${endpoint} -> ${res.status}`);
  return res.json();
}

function text(o) {
  if (!o) return '';
  if (o.runs) return o.runs.map(r => r.text || '').join('');
  return o.simpleText || '';
}

function all(obj, key, out = []) {
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) { for (const v of obj) all(v, key, out); return out; }
  for (const k of Object.keys(obj)) {
    if (k === key) out.push(obj[k]);
    all(obj[k], key, out);
  }
  return out;
}

function first(obj, key) { return all(obj, key)[0]; }

function duration(value) {
  const s = String(value || '').trim();
  return s || '';
}

function thumbnail(obj) {
  const thumbs = all(obj, 'thumbnails').flat().filter(t => t && t.url);
  if (!thumbs.length) return null;
  const best = thumbs.reduce((a, b) => (Number(b.width || 0) >= Number(a.width || 0) ? b : a));
  return best.url;
}

function videoIdFromRenderer(r) {
  if (r.playlistItemData?.videoId) return r.playlistItemData.videoId;
  const endpoints = all(r, 'watchEndpoint');
  return endpoints.find(e => e && e.videoId)?.videoId || null;
}

function parseList(r) {
  const columns = (r.flexColumns || [])
    .map(c => c.musicResponsiveListItemFlexColumnRenderer?.text)
    .filter(Boolean);
  const title = text(columns[0]);
  const videoId = videoIdFromRenderer(r);
  if (!title || !videoId) return null;

  let channel = '';
  for (const col of columns.slice(1)) {
    const value = text(col);
    if (value) { channel = value.split(' • ')[0]; break; }
  }

  const fixed = first(r, 'musicResponsiveListItemFixedColumnRenderer');
  const durationRaw = fixed ? duration(text(fixed.text)) : '';

  return {
    title,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    durationRaw,
    durationInSec: 0,
    thumbnails: thumbnail(r.thumbnail),
    channel: { name: channel || 'YouTube Music' },
    videoId
  };
}

function parseTwoRow(r) {
  const videoId = videoIdFromRenderer(r);
  const title = text(r.title);
  if (!title || !videoId) return null;
  return {
    title,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    durationRaw: '',
    durationInSec: 0,
    thumbnails: thumbnail(r.thumbnailRenderer || r),
    channel: { name: text(r.subtitle) || 'YouTube Music' },
    videoId
  };
}

async function search(query, options = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const limit = Math.min(Math.max(Number(options.limit) || 5, 1), 10);
  const data = await yt('search', { query: q, params: SEARCH_PARAMS });
  const results = [];
  const seen = new Set();

  for (const shelf of all(data, 'musicShelfRenderer')) {
    for (const item of shelf.contents || []) {
      const r = item.musicResponsiveListItemRenderer;
      if (!r) continue;
      const parsed = parseList(r);
      if (parsed && !seen.has(parsed.videoId)) {
        seen.add(parsed.videoId);
        results.push(parsed);
      }
      if (results.length >= limit) return results;
    }
  }

  // Fallback for newer YouTube Music response layouts.
  for (const item of all(data, 'musicResponsiveListItemRenderer')) {
    const parsed = parseList(item);
    if (parsed && !seen.has(parsed.videoId)) {
      seen.add(parsed.videoId);
      results.push(parsed);
    }
    if (results.length >= limit) break;
  }

  if (!results.length) {
    for (const item of all(data, 'musicTwoRowItemRenderer')) {
      const parsed = parseTwoRow(item);
      if (parsed && !seen.has(parsed.videoId)) {
        seen.add(parsed.videoId);
        results.push(parsed);
      }
      if (results.length >= limit) break;
    }
  }

  return results;
}

async function video_info(url) {
  const parsed = new URL(url);
  const videoId = parsed.searchParams.get('v');
  if (!videoId) throw new Error('Invalid YouTube URL');

  try {
    const info = await yt('player', { videoId });
    const details = info.videoDetails || {};
    return {
      video_details: {
        title: details.title || 'Unknown',
        url,
        durationRaw: details.lengthSeconds ? `${Math.floor(Number(details.lengthSeconds) / 60)}:${String(Number(details.lengthSeconds) % 60).padStart(2, '0')}` : '',
        thumbnails: details.thumbnail?.thumbnails || []
      }
    };
  } catch {
    return { video_details: { title: 'Unknown', url, durationRaw: '', thumbnails: [] } };
  }
}

function stream(url) {
  const process = youtubedl.exec(url, {
    extractorArgs: 'youtube:player_client=android,web_safari',
    output: '-',
    extractAudio: true,
    audioFormat: 'opus',
    audioQuality: '5',
    quiet: true,
    noWarnings: true,
    noPlaylist: true
  });
  process.stderr?.on('data', d => {
    const message = d.toString().trim();
    if (message) console.error(`[yt-dlp] ${message}`);
  });
  return { stream: process.stdout, type: 'opus', process };
}

module.exports = { search, video_info, stream };
