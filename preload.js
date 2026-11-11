// preload.js — bridge aman untuk UI renderer (contextIsolation: true).
// Hanya memapar fungsi yang perlu dipakai renderer; tidak ada akses Node.
const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

contextBridge.exposeInMainWorld('browser', {
  // Path preload yang dipakai tiap <webview> (popup guard)
  webviewPreloadPath: path.join(__dirname, 'webview-preload.js'),
  // Halaman awal (lokal, tanpa iklan)
  startPage: pathToFileURL(path.join(__dirname, 'pages', 'start.html')).href,
  // Engine search untuk query yang bukan URL
  searchEngine: require('./config').searchEngine,

  // ── Perintah ke main ──
  openTab: (url) => ipcRenderer.send('ui:open-tab', url),
  updateLists: () => ipcRenderer.send('ui:update-lists'),
  setPaused: (paused) => ipcRenderer.send('ui:set-paused', paused),

  // ── Peristiwa dari main ──
  onNewTab: (cb) => {
    ipcRenderer.on('ui:new-tab', (_e, url) => cb(url));
  },
  onNavInfo: (cb) => {
    ipcRenderer.on('ui:nav-info', (_e, info) => cb(info));
  },
  onBlockedInfo: (cb) => {
    ipcRenderer.on('ui:blocked-info', (_e, info) => cb(info));
  },
  onUpdateResult: (cb) => {
    ipcRenderer.on('ui:update-result', (_e, info) => cb(info));
  },
});
