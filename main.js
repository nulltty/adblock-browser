// main.js — proses utama Electron: setup window, blokir ads/redirect/popup,
// dan isolasi session.
const { app, BrowserWindow, session, shell, ipcMain, Menu } = require('electron');
const path = require('path');
const CONFIG = require('./config');
const blocklist = require('./blocklist');

let mainWindow = null;
let paused = false;          // user bisa jeda blocking sementara
let blockedCount = 0;        // jumlah request yang diblokir (sejak mulai)

// ── Setup blocking di PARTISI terisolasi (dipakai semua <webview>) ──────────
function setupBlocking() {
  const ses = session.fromPartition(CONFIG.appPartition);

  // Blokir request ke domain ads/tracker. main_frame/sub_frame ke domain
  // terblokir dialihkan ke halaman "diblokir" (bukan halaman kosong).
  ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, cb) => {
    if (paused) return cb({});
    if (!blocklist.isBlocked(details.url)) return cb({});
    if (details.resourceType === 'main_frame' || details.resourceType === 'sub_frame') {
      const reason = encodeURIComponent('domain terblokir');
      const target = `file://${CONFIG.blockedPage}?reason=${reason}&url=${encodeURIComponent(details.url)}`;
      return cb({ redirectURL: target });
    }
    blockedCount++;
    return cb({ cancel: true });
  });

  // Catatan: redirect 3xx ke domain iklan otomatis tertangani onBeforeRequest
  // di atas — target redirect menjadi request baru yang ikut dicek domain-nya.
  // (onBeforeRedirect TIDAK punya callback, jadi tidak bisa membatalkan apa pun.)

  // Isolasi: tolak semua permintaan izin (kamera, mikrofon, notifikasi, dsb)
  ses.setPermissionRequestHandler((wc, permission, cb) => cb(false));
  ses.setPermissionCheckHandler(() => false);

  return ses;
}

// ── Buka URL di tab baru DALAM aplikasi (bukan window OS) ──────────────────
function openInAppTab(url) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('ui:new-tab', url);
}

// ── Kirim info (blocked / ukuran list) ke UI tiap beberapa detik ────────────
function pushBlockedInfo() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('ui:blocked-info', {
    blocked: blockedCount,
    domains: blocklist.size,
    sources: blocklist.sources,
    paused,
    lastUpdate: blocklist.lastUpdate
  });
}

// ── Buat window utama (UI browser) ──────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 640,
    minHeight: 400,
    backgroundColor: '#0f0f0f',
    title: 'Adblock Browser',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true   // wajib agar <webview> (tab) berfungsi di Electron baru
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Gate popup: setiap <webview> yang terpasang (termasuk tab baru) mendapat
  // setWindowOpenHandler. Domain iklan = ditolak; sisanya dibuka di tab dalam
  // aplikasi (diisolasi, bukan window OS terpisah).
  // Catatan: argumen ke-2 event ini adalah WebContents guest secara LANGSUNG.
  mainWindow.webContents.on('did-attach-webview', (event, webContents) => {
    if (!webContents) return;
    webContents.setWindowOpenHandler(({ url }) => {
      if (blocklist.isBlocked(url)) return { action: 'deny' };
      openInAppTab(url);
      return { action: 'deny' };
    });
  });

  // Tautan luar (target=_blank dari UI, kalau ada) tetap di tab dalam aplikasi
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openInAppTab(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── IPC: renderer <-> main ──────────────────────────────────────────────────
function setupIpc() {
  // Renderer minta buka tab (mis. hasil search di halaman awal)
  ipcMain.on('ui:open-tab', (_e, url) => openInAppTab(url));

  // Perintah jeda/lanjutkan blocking
  ipcMain.on('ui:set-paused', (_e, pausedFlag) => {
    paused = !!pausedFlag;
    pushBlockedInfo();
  });

  // Perbarui blocklist dari jaringan (offline fallback ke list bawaan)
  ipcMain.on('ui:update-lists', async () => {
    const res = await blocklist.update();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('ui:update-result', {
        ok: res.sources > 0,
        domains: res.size,
        sources: res.sources,
        lastUpdate: res.lastUpdate
      });
    }
    pushBlockedInfo();
  });
}

// ── App lifecycle ───────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // 1) Muat list lokal dulu (instan, bisa offline)
  blocklist.load();
  console.log(`[main] blocklist aktif: ${blocklist.size} domain (${blocklist.sources} sumber)`);

  // 2) Setup blocking di partition terisolasi
  setupBlocking();

  // 3) Refresh dari jaringan di latar belakang (tak memblokir startup)
  if (CONFIG.updateOnStart) blocklist.update().catch(e => console.warn('[main] update gagal:', e.message));

  // Menu minimal. WAJIB sertakan editMenu — di macOS menu Edit-lah yang
  // menyediakan shortcut clipboard (Cmd+C/V/X/A). Tanpa itu, paste/copy
  // di omnibox & input lain tidak berfungsi.
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: process.platform === 'darwin' ? 'appMenu' : 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]));

  // 5) Buat window & IPC
  createWindow();
  setupIpc();

  // 6) Info berkala ke UI
  setInterval(pushBlockedInfo, 1500);
  pushBlockedInfo();

  // 7) Auto-refresh list tiap interval
  setInterval(() => blocklist.update().catch(e => console.warn('[main] auto-update gagal:', e.message)),
    CONFIG.updateIntervalMs);

  // --screenshot <path>: tangkap UI lalu keluar (untuk README/dokumentasi)
  const shotIdx = process.argv.indexOf('--screenshot');
  if (shotIdx !== -1 && process.argv[shotIdx + 1]) {
    const shotPath = path.resolve(process.argv[shotIdx + 1]);
    setTimeout(async () => {
      try {
        const image = await mainWindow.webContents.capturePage();
        require('fs').writeFileSync(shotPath, image.toPNG());
        console.log('[main] screenshot tersimpan:', shotPath);
      } catch (e) {
        console.error('[main] screenshot gagal:', e.message);
      }
      app.exit(0);
    }, 5000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
