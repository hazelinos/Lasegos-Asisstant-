const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const LIBRARY_FILE = path.join(DATA_DIR, 'music-library.json');

function loadLibrary() {
  try { return JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8')); }
  catch { return {}; }
}
function saveLibrary(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LIBRARY_FILE, JSON.stringify(data, null, 2));
}
function userLibrary(userId) {
  const data = loadLibrary();
  data[userId] ||= { liked: [], playlists: {}, recent: [] };
  return { data, library: data[userId] };
}
function addRecent(userId, track) {
  const { data, library } = userLibrary(userId);
  library.recent = [track, ...library.recent.filter(t => t.url !== track.url)].slice(0, 20);
  saveLibrary(data);
}
function toggleLiked(userId, track) {
  const { data, library } = userLibrary(userId);
  const index = library.liked.findIndex(t => t.url === track.url);
  if (index >= 0) { library.liked.splice(index, 1); saveLibrary(data); return false; }
  library.liked.unshift(track); library.liked = library.liked.slice(0, 100); saveLibrary(data); return true;
}
function createPlaylist(userId, name) {
  const { data, library } = userLibrary(userId);
  if (library.playlists[name]) return false;
  library.playlists[name] = [];
  saveLibrary(data); return true;
}
function addToPlaylist(userId, name, track) {
  const { data, library } = userLibrary(userId);
  if (!library.playlists[name]) return false;
  if (!library.playlists[name].some(t => t.url === track.url)) library.playlists[name].push(track);
  saveLibrary(data); return true;
}
function getLibrary(userId) { return userLibrary(userId).library; }

module.exports = { loadLibrary, saveLibrary, getLibrary, addRecent, toggleLiked, createPlaylist, addToPlaylist };
