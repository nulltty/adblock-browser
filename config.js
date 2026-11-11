// config.js — konstanta & path aplikasi
const path = require('path');

const CONFIG = {
  // Session/partition terisolasi: cookie, cache, dan penyimpanan web
  // dipisah total dari aplikasi lain & sistem.
  appPartition: 'persist:adblock',

  // ── Blocklist ──
  blocklistDir:   path.join(__dirname, 'blocklist'),
  bundledList:    path.join(__dirname, 'blocklist', 'default.list'),
  easyList:       path.join(__dirname, 'blocklist', 'easylist.list'),
  easyPrivacy:    path.join(__dirname, 'blocklist', 'easyprivacy.list'),
  allowList:      path.join(__dirname, 'blocklist', 'allowlist.txt'),
  lastUpdateFile: path.join(__dirname, 'blocklist', '.last-update'),

  // Refresh dari jaringan tiap 24 jam (fallback offline ke list bawaan)
  updateIntervalMs: 24 * 60 * 60 * 1000,
  updateOnStart:    true,

  // Sumber (mudah diganti). Gunakan mirror resmi easylist.to.
  easylistUrl:    'https://easylist.to/easylist/easylist.txt',
  easyPrivacyUrl: 'https://easylist.to/easylist/easyprivacy.txt',

  // Semua resource type diblokir kalau domain-nya ada di list
  blockResourceTypes: [
    'main_frame', 'sub_frame', 'script', 'stylesheet', 'image',
    'font', 'media', 'xhr', 'ping', 'websocket', 'csp_report', 'other'
  ],

  // ── Popup / redirect ──
  // Popup yang muncul < N ms setelah interaksi user (klik/tekan) dianggap
  // user-initiated dan diizinkan (dibuka di tab baru). Sisanya diblokir.
  gestureWindowMs: 900,

  // Engine search untuk query tanpa URL lengkap
  searchEngine: 'https://duckduckgo.com/?q=',

  // Halaman internal
  startPage:  path.join(__dirname, 'pages', 'start.html'),
  blockedPage: path.join(__dirname, 'pages', 'blocked.html'),
};

module.exports = CONFIG;
