// webview-preload.js — berjalan di setiap <webview> (contextIsolation: false).
// Tugas: intersep window.open & lacak gesture user, lalu serahkan keputusan
// blokir/izinkan ke main process (yang punya blocklist).
//
// Catatan: ini lapisan KEDUA. Lapisan utama adalah setWindowOpenHandler di
// main.js (lebih sulit dibypass oleh iklan). Lapisan ini menegakkan aturan
// "hanya popup yang benar-benar inisiasi user".
const { ipcRenderer } = require('electron');

const GESTURE_MS = 900; // popup < 900ms setelah interaksi = user-initiated
let lastGesture = Date.now();
const mark = () => { lastGesture = Date.now(); };
['mousedown', 'pointerdown', 'keydown', 'touchstart', 'click'].forEach(ev =>
  document.addEventListener(ev, mark, { capture: true, passive: true })
);

// Simpan referensi asli SEBELUM ad script bisa menyimpan/mengganti
const originalOpen = window.open.bind(window);

// Window "palsu" yang aman supaya kode iklan tidak crash saat kita blokir
const FAKE_WINDOW = Object.freeze({
  focus() {}, close() {}, blur() {},
  addEventListener() {}, removeEventListener() {},
  postMessage() {}, closed: false, innerWidth: 0, innerHeight: 0,
  document: { write() {}, writeln() {}, open() {}, close() {}, createElement() { return {}; } },
  location: { href: '', assign() {}, replace() {}, reload() {} },
  window: { closed: false }
});

window.open = function open(url, target, features) {
  const userInitiated = (Date.now() - lastGesture) < GESTURE_MS;
  const href = (url === null || url === undefined) ? 'about:blank' : String(url);
  // Jangan buat window OS; main memutuskan (blokir / buka tab dalam aplikasi)
  ipcRenderer.send('adblock:open-request', { url: href, userInitiated, features: features || '' });
  return FAKE_WINDOW;
};

// Jika ad script mengganti window.open lagi, kembalikan ke versi kita
const guardInterval = setInterval(() => {
  if (window.open !== open) window.open = open;
}, 1000);
window.addEventListener('pagehide', () => clearInterval(guardInterval));
