const youtubedl = require('youtube-dl-exec');

const YTM_ENDPOINTS = [
  'https://music.youtube.com/youtubei/v1/search?prettyPrint=false',
  'https://www.youtube.com/youtubei/v1/search?prettyPrint=false'
];
const CONTEXT = { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.00.00', hl: 'id', gl: 'ID' } };
const HEADERS = {
  'Content-Type': 'application/json', Origin: 'https://music.youtube.com',
  Referer: 'https://music.youtube.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
};
const SEARCH_PARAMS = 'EgWKAQIIAWoMEA4QChADEAQQCRAF';

function text(o) { return !o ? '' : (o.runs ? o.runs.map(r => r.text || '').join('') : (o.simpleText || '')); }
function all(obj, key, out = []) {
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) { for (const v of obj) all(v, key, out); return out; }
  for (const [k, v] of Object.entries(obj)) { if (k === key) out.push(v); all(v, key, out); }
  return out;
}
function first(obj, key) { return all(obj, key)[0]; }
function thumbnail(obj) {
  const t = all(obj, 'thumbnails').flat().filter(x => x?.url);
  return t.length ? t.reduce((a, b) => Number(b.width || 0) >= Number(a.width || 0) ? b : a).url : null;
}
function videoId(r) {
  if (r.playlistItemData?.videoId) return r.playlistItemData.videoId;
  return all(r, 'watchEndpoint').find(x => x?.videoId)?.videoId || null;
}
function parseList(r) {
  const cols = (r.flexColumns || []).map(c => c.musicResponsiveListItemFlexColumnRenderer?.text).filter(Boolean);
  const title = text(cols[0]);
  const id = videoId(r);
  if (!title || !id) return null;
  const fixed = first(r, 'musicResponsiveListItemFixedColumnRenderer');
  const channel = cols.slice(1).map(text).find(Boolean)?.split(' • ')[0] || 'YouTube Music';
  return { title, url: `https://www.youtube.com/watch?v=${id}`, durationRaw: text(fixed?.text), durationInSec: 0, thumbnails: thumbnail(r.thumbnail) ? [{ url: thumbnail(r.thumbnail) }] : [], channel: { name: channel }, videoId: id };
}
function parseVideoRenderer(r) {
  const id = r.videoId;
  const title = text(r.title);
  if (!id || !title) return null;
  return { title, url: `https://www.youtube.com/watch?v=${id}`, durationRaw: text(r.lengthText), durationInSec: 0, thumbnails: r.thumbnail?.thumbnails || [], channel: { name: text(r.ownerText) || 'YouTube' }, videoId: id };
}
async function requestSearch(endpoint, q) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(endpoint, { method: 'POST', headers: HEADERS, signal: controller.signal, body: JSON.stringify({ context: CONTEXT, query: q, params: SEARCH_PARAMS }) });
    if (!res.ok) throw new Error(`YouTube search HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}
async function search(query, options = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const limit = Math.min(Math.max(Number(options.limit) || 8, 1), 10);
  let data = null;
  let lastError = null;
  for (const endpoint of YTM_ENDPOINTS) {
    try { data = await requestSearch(endpoint, q); break; } catch (e) { lastError = e; console.error(`[music-search] ${e.message}`); }
  }
  if (!data) throw lastError || new Error('Search unavailable');
  const results = [], seen = new Set();
  const push = item => { if (!item || !item.videoId || seen.has(item.videoId)) return false; seen.add(item.videoId); results.push(item); return results.length >= limit; };
  for (const r of all(data, 'musicResponsiveListItemRenderer')) if (push(parseList(r))) break;
  if (results.length < limit) for (const r of all(data, 'videoRenderer')) if (push(parseVideoRenderer(r))) break;
  return results;
}
async function video_info(url) {
  const parsed = new URL(url);
  const id = parsed.searchParams.get('v');
  if (!id) throw new Error('Invalid YouTube URL');
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', { method: 'POST', headers: { ...HEADERS, Origin: 'https://www.youtube.com', Referer: 'https://www.youtube.com/' }, signal: controller.signal, body: JSON.stringify({ context: CONTEXT, videoId: id }) });
      if (!res.ok) throw new Error(`YouTube player HTTP ${res.status}`);
      const data = await res.json();
      const d = data.videoDetails || {};
      return { video_details: { title: d.title || 'Unknown', url, durationRaw: d.lengthSeconds ? `${Math.floor(Number(d.lengthSeconds)/60)}:${String(Number(d.lengthSeconds)%60).padStart(2,'0')}` : '', thumbnails: d.thumbnail?.thumbnails || [] } };
    } finally { clearTimeout(timer); }
  } catch { return { video_details: { title: 'Unknown', url, durationRaw: '', thumbnails: [] } }; }
}
function stream(url) {
  const process = youtubedl.exec(url, { extractorArgs: 'youtube:player_client=android,web_safari', output: '-', extractAudio: true, audioFormat: 'opus', audioQuality: '5', quiet: true, noWarnings: true, noPlaylist: true });
  process.stderr?.on('data', d => { const s = d.toString().trim(); if (s) console.error(`[yt-dlp] ${s}`); });
  return { stream: process.stdout, type: 'opus', process };
}
module.exports = { search, video_info, stream };
