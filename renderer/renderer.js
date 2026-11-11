// renderer.js — logika UI browser multi-tab
const { webviewPreloadPath, startPage } = window.browser;
const SEARCH = window.browser.searchEngine || 'https://duckduckgo.com/?q=';

const tabstrip = document.getElementById('tabstrip');
const content = document.getElementById('content');
const omnibox = document.getElementById('omnibox');
const backBtn = document.getElementById('backBtn');
const forwardBtn = document.getElementById('forwardBtn');
const reloadBtn = document.getElementById('reloadBtn');
const homeBtn = document.getElementById('homeBtn');
const pauseBtn = document.getElementById('pauseBtn');
const updateBtn = document.getElementById('updateBtn');
const statusEl = document.getElementById('status');
const blockedInfoEl = document.getElementById('blockedInfo');
const newtabBtn = document.getElementById('newtabBtn');

let tabs = [];        // {id, tabEl, webview, titleEl, title, url}
let activeId = null;
let nextId = 1;

function setStatus(msg) { statusEl.textContent = msg; }
function active() { return tabs.find(t => t.id === activeId); }

// Tentukan URL dari isi omnibox: URL langsung, domain, atau query pencarian
function resolveInput(raw) {
  raw = (raw || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  // terlihat seperti domain (ada titik, tanpa spasi)
  if (!/\s/.test(raw) && /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(raw)) {
    return 'https://' + raw;
  }
  return SEARCH + encodeURIComponent(raw);
}

// ── Webview per tab ─────────────────────────────────────────────────────────
function createWebview(url) {
  const wv = document.createElement('webview');
  wv.setAttribute('partition', 'persist:adblock');
  // contextIsolation=no agar guard window.open di preload menyentuh halaman
  wv.setAttribute('webpreferences', 'contextIsolation=no');
  wv.setAttribute('preload', webviewPreloadPath);
  wv.style.display = 'none';

  wv.addEventListener('page-title-updated', (e) => setTabTitle(wv, e.title));
  wv.addEventListener('did-navigate', (e) => onNavigated(wv, e.url));
  wv.addEventListener('did-navigate-in-page', (e) => onNavigated(wv, e.url));
  wv.addEventListener('did-start-navigation', (e) => setStatus('Memuat: ' + e.url));
  wv.addEventListener('did-finish-load', () => { setStatus('Selesai'); updateNavButtons(); });
  wv.addEventListener('did-fail-load', (e) => setStatus('Gagal memuat (' + e.errorCode + '): ' + e.url));
  // Setelah webview dom-ready, method navigasi bisa dipanggil → segarkan tombol
  wv.addEventListener('dom-ready', () => updateNavButtons());
  wv.setAttribute('src', url || startPage);
  content.appendChild(wv);
  return wv;
}

// ── Tab management ──────────────────────────────────────────────────────────
function createTab(url) {
  const id = nextId++;
  const tabEl = document.createElement('div');
  tabEl.className = 'tab';
  tabEl.dataset.id = id;

  const titleEl = document.createElement('span');
  titleEl.className = 'tab-title';
  titleEl.textContent = 'Tab Baru';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'tab-close';
  closeBtn.textContent = '×';
  closeBtn.title = 'Tutup tab';

  tabEl.append(titleEl, closeBtn);
  tabEl.addEventListener('click', (e) => { if (e.target !== closeBtn) activateTab(id); });
  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeTab(id); });

  const wv = createWebview(url || startPage);
  const tab = { id, tabEl, webview: wv, titleEl, title: 'Tab Baru', url: url || startPage };
  tabs.push(tab);
  tabstrip.insertBefore(tabEl, newtabBtn);
  activateTab(id);
  return tab;
}

function activateTab(id) {
  activeId = id;
  for (const t of tabs) {
    const on = t.id === id;
    t.tabEl.classList.toggle('active', on);
    t.webview.style.display = on ? 'flex' : 'none';
  }
  const t = active();
  if (t) {
    omnibox.value = t.url && t.url.startsWith('file://') ? '' : t.url;
    omnibox.focus();
    omnibox.select();
  }
  updateNavButtons();
}

function closeTab(id) {
  const idx = tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  const tab = tabs[idx];
  tab.tabEl.remove();
  tab.webview.remove();
  tabs.splice(idx, 1);
  if (tabs.length === 0) { createTab(); return; } // jangan biarkan kosong
  if (activeId === id) {
    const next = tabs[idx] || tabs[idx - 1];
    if (next) activateTab(next.id);
  }
}

function setTabTitle(wv, title) {
  const t = tabs.find(x => x.webview === wv);
  if (!t) return;
  t.title = title || 'Tab';
  t.titleEl.textContent = t.title.length > 22 ? t.title.slice(0, 22) + '…' : t.title;
}

function onNavigated(wv, url) {
  const t = tabs.find(x => x.webview === wv);
  if (!t) return;
  t.url = url;
  if (t.id === activeId && !url.startsWith('file://')) omnibox.value = url;
  updateNavButtons();
}

function updateNavButtons() {
  const t = active();
  if (!t) return;
  // Method navigasi (canGoBack/dll) baru bisa dipanggil SETELAH webview
  // attached + dom-ready. try/catch menyerap pemanggilan prematur.
  try {
    backBtn.disabled = !t.webview.canGoBack();
    forwardBtn.disabled = !t.webview.canGoForward();
  } catch (e) { /* webview belum siap — aman diabaikan */ }
}

// ── Omnibox ─────────────────────────────────────────────────────────────────
omnibox.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const url = resolveInput(omnibox.value);
    if (url) { const t = active(); if (t) t.webview.src = url; }
    e.preventDefault();
  }
});

// ── Tombol navigasi ─────────────────────────────────────────────────────────
backBtn.onclick = () => { const t = active(); if (t && t.webview.canGoBack()) t.webview.goBack(); };
forwardBtn.onclick = () => { const t = active(); if (t && t.webview.canGoForward()) t.webview.goForward(); };
reloadBtn.onclick = () => { const t = active(); if (t) t.webview.reload(); };
homeBtn.onclick = () => { const t = active(); if (t) t.webview.src = startPage; };
newtabBtn.onclick = () => createTab();

// ── Pause / update ──────────────────────────────────────────────────────────
let paused = false;
pauseBtn.onclick = () => {
  paused = !paused;
  pauseBtn.classList.toggle('paused', paused);
  pauseBtn.textContent = paused ? '▶' : '⏸';
  window.browser.setPaused(paused);
  setStatus(paused ? 'Blocking DIJEDA' : 'Blocking aktif');
};
updateBtn.onclick = () => { setStatus('Memperbarui daftar blokir…'); window.browser.updateLists(); };

// ── Perintah dari main (popup disetujui / info) ────────────────────────────
window.browser.onNewTab((url) => createTab(url));   // popup user-initiated → tab baru
window.browser.onBlockedInfo((info) => {
  blockedInfoEl.textContent =
    `List: ${info.domains} domain (${info.sources}) · Diblokir: ${info.blocked}` +
    (info.paused ? ' · DIJEDA' : '');
});
window.browser.onUpdateResult((info) => {
  setStatus(info.ok ? `Daftar diperbarui: ${info.domains} domain` : 'Update gagal (pakai list bawaan)');
});

// ── Init ────────────────────────────────────────────────────────────────────
createTab();
