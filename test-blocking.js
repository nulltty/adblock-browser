// test-blocking.js — smoke test non-intrusif (tanpa membuka jendela).
// Jalankan:  npm run smoke   (= electron test-blocking.js)
const { app, session } = require('electron');
const CONFIG = require('./config');
const blocklist = require('./blocklist');

app.whenReady().then(async () => {
  let ok = true;
  try {
    blocklist.load();
    console.log(`[smoke] blocklist: ${blocklist.size} domain, ${blocklist.sources} sumber`);

    // Pasang blocking yang SAMA seperti main.js (partition terisolasi)
    const ses = session.fromPartition(CONFIG.appPartition);
    ses.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (d, cb) => {
      if (blocklist.isBlocked(d.url)) return cb({ cancel: true });
      cb({});
    });

    // ── 1) Uji matcher (deterministik, tanpa jaringan) ──
    const mustBlock = [
      'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
      'https://ads.doubleclick.net/pixel?id=1',
      'https://www.google-analytics.com/collect',
      'https://a.b.c.ads.doubleclick.net/x'
    ];
    const mustPass = [
      'https://example.com',
      'https://github.com/nousresearch',
      'https://en.wikipedia.org/wiki/Electron'
    ];
    for (const u of mustBlock) {
      if (!blocklist.isBlocked(u)) { console.log('  ✗ GAGAL memblokir:', u); ok = false; }
      else console.log('  ✓ diblokir:', u);
    }
    for (const u of mustPass) {
      if (blocklist.isBlocked(u)) { console.log('  ✗ GAGAL (harus lolos):', u); ok = false; }
      else console.log('  ✓ lolos:', u);
    }
    console.log(ok ? '\n[smoke] MATCHER PASS' : '\n[smoke] MATCHER FAIL');

    // ── 2) Uji live (best-effort): request ke domain iklan lewat session ──
    console.log('\n[smoke] uji live request ke domain iklan…');
    try {
      const resp = await ses.fetch('https://ads.doubleclick.net/pixel');
      console.log('  (info) live: dapat respons status', resp.status, '(webRequest mungkin tidak terlibat di ses.fetch)');
    } catch (e) {
      console.log('  ✓ live request diblok:', e.message);
    }
  } catch (e) {
    console.error('[smoke] ERROR tak terduga:', e);
    ok = false;
  }

  console.log('[smoke] selesai, exit', ok ? 0 : 1);
  app.exit(ok ? 0 : 1);
});
