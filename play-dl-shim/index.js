const youtubedl = require('youtube-dl-exec');

const YTM = 'https://music.youtube.com/youtubei/v1';
const CONTEXT = {
  client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.00.00', hl: 'id', gl: 'ID' }
};
const HEADERS = {
  'Content-Type': 'application/json',
  Origin: 'https://music.youtube.com',
  Referer: 'https://music.youtube.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36'
};
const SEARCH_PARAMS = 'EgWKAQIIAWoMEA4QChADEAQQCRAF';
const REQUEST_TIMEOUT = 7000;

async function yt(endpoint, body = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const res = await fetch(`${YTM}/${endpoint}?prettyPrint=false`, {
      method: 'POST', headers: HEADERS, signal: controller.signal,
      body: JSON.stringify({ context: CONTEXT, ...body })
    });
    if (!res.ok) throw new Error(`YouTube Music ${endpoint} -> ${res.status}`);
    return await res.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`YouTube Music ${endpoint} timed out after ${REQUEST_TIMEOUT}ms`);
    throw error;
  } finally { clearTimeout(timer); }
}

function text(o) {
  if (!o) return '';
  if (Array.isArray(o.runs)) return o.runs.map(r => r.text || '').join('');
  return o.simpleText || '';
}
function all(obj, key, out = []) {
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) { for (const v of obj) all(v, key, out); return out; }
  for (const k of Object.keys(obj)) { if (k === key) out.push(obj[k]); all(obj[k], key, out); }
  return out;
}
function first(obj, key) { return all(obj, key)[0]; }
function thumbnail(obj) {
  const thumbs = all(obj, 'thumbnails').flat().filter(t => t?.url);
  if (!thumbs.length) return null;
  return thumbs.reduce((a, b) => Number(b.width || 0) >= Number(a.width || 0) ? b : a).url;
}
function videoIdFromRenderer(r) {
  if (r.playlistItemData?.videoId) return r.playlistItemData.videoId;
  return all(r, 'watchEndpoint').find(e => e?.videoId)?.videoId || null;
}
function parseList(r) {
  const columns = (r.flexColumns || []).map(c => c.musicResponsiveListItemFlexColumnRenderer?.text).filter(Boolean);
  const title = text(columns[0]);
  const videoId = videoIdFromRenderer(r);
  if (!title || !videoId) return null;
  const channel = text(columns[1]) || 'YouTube Music';
  const fixed = first(r, 'musicResponsiveListItemFixedColumnRenderer');
  return {
    title,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    durationRaw: fixed ? text(fixed.text) : '',
    durationInSec: 0,
    thumbnails: thumbnail(r.thumbnail) ? [{ url: thumbnail(r.thumbnail) }] : [],
    channel: { name: channel.split(' • ')[0] },
    videoId
  };
}

async function search(query, options = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const limit = Math.min(Math.max(Number(options.limit) || 8, 1), 10);
  const data = await yt('search', { query: q, params: SEARCH_PARAMS });
  const results = [], seen = new Set();
  for (const renderer of all(data, 'musicResponsiveListItemRenderer')) {
    const item = parseList(renderer);
    if (!item || seen.has(item.videoId)) continue;
    seen.add(item.videoId); results.push(item);
    if (results.length >= limit) break;
  }
  return results;
}

async function video_info(url) {
  const parsed = new URL(url);
  const videoId = parsed.searchParams.get('v');
  if (!videoId) throw new Error('Invalid YouTube URL');
  const data = await yt('player', { videoId });
  const details = data.videoDetails || {};
  const seconds = Number(details.lengthSeconds || 0);
  return { video_details: {
    title: details.title || 'Unknown', url,
    durationRaw: seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '',
    thumbnails: details.thumbnail?.thumbnails || []
  }};
}

function stream(url) {
  const process = youtubedl.exec(url, {
    extractorArgs: 'youtube:player_client=web_safari',
    output: '-', extractAudio: true, audioFormat: 'opus', audioQuality: '5',
    quiet: true, noWarnings: true, noPlaylist: true
  });
  process.stderr?.on('data', d => {
    const message = d.toString().trim();
    if (message) console.error(`[yt-dlp] ${message}`);
  });
  return { stream: process.stdout, type: 'opus', process };
}
module.exports = { search, video_info, stream };
