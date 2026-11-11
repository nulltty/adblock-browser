// blocklist.js — muat, parse, dan cocokkan domain/path ads & tracker.
// Mendukung format ADBlock (||domain^, ||domain/path^, @@allow), hosts-style,
// dan aturan path-spesifik (hanya blokir path tertentu, bukan seluruh domain).
const fs = require('fs');
const path = require('path');
const http = require('https');
const CONFIG = require('./config');

// ── Helpers ────────────────────────────────────────────────────────────────
function hostPathOf(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return { host: u.hostname.toLowerCase(), path: u.pathname };
  } catch (e) {
    const m = String(url).match(/^[a-z]+:\/\/([^\/?#:]+)([\/?#].*)?/i);
    if (!m) return null;
    const pathname = ((m[2] || '/').split(/[?#]/)[0]) || '/';
    return { host: m[1].toLowerCase(), path: pathname };
  }
}

function normalizeHost(h) {
  if (!h) return null;
  h = h.trim().toLowerCase().replace(/\.$/, '');
  if (h.includes('*')) return null;
  if (!/^[a-z0-9.\-]+$/.test(h)) return null;
  return h;
}

function push(map, key, val) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(val);
}

// ── Manager blocklist ──────────────────────────────────────────────────────
class Blocklist {
  constructor() {
    this.blockedDomains = new Set();   // host -> blok seluruh domain + subdomain
    this.blockedPaths = new Map();     // host -> [path, ...] (hanya path tsb)
    this.allowDomains = new Set();     // host -> izinkan seluruh domain
    this.allowPaths = new Map();       // host -> [path, ...]
    this.size = 0;
    this.sources = 0;
    this.lastUpdate = 0;
    this._updating = false;
  }

  _addRule(host, rulePath, allow) {
    host = normalizeHost(host);
    if (!host) return;
    if (allow) {
      if (rulePath) push(this.allowPaths, host, rulePath);
      else this.allowDomains.add(host);
    } else {
      if (rulePath) push(this.blockedPaths, host, rulePath);
      else this.blockedDomains.add(host);
    }
  }

  _parseLine(line) {
    let l = line.trim();
    if (!l || l[0] === '!' || l[0] === '#' || l[0] === '/') return; // komentar/kosong/path-only

    // hosts-style: "0.0.0.0 domain.com"
    const hosts = l.match(/^(?:0\.0\.0\.0|127\.0\.0\.1)\s+([a-z0-9.\-]+)$/i);
    if (hosts) { this._addRule(hosts[1], null, false); return; }

    // allow rule (whitelist): @@||domain^
    const allow = l[0] === '@';
    if (allow) l = l.replace(/^@+/, '');
    // deteksi kondisi $domain= SEBELUM opsi di-strip: allow dengan kondisi
    // domain hanya berlaku dari situs tertentu; kita tak bisa mengevaluasinya,
    // jadi lewati agar tidak jadi allow global (over-allow).
    const conditionalAllow = allow && /\$domain=/.test(l);

    // buang prefiks ADBlock (|| atau |), lalu skema http(s)://
    l = l.replace(/^\|+/, '').replace(/^[a-z]+:\/\//i, '').replace(/^\/\//, '');
    // buang opsi $... (third-party, domain=, dsb) — v1 abaikan opsi
    l = l.replace(/\$.*$/, '');

    if (conditionalAllow) return; // jangan global-allow aturan kondisional

    // pisahkan host dan path:  host[/path...]  atau  host^
    const m = l.match(/^([^\/^]+)(.*)$/);
    if (!m) return;
    const host = m[1];
    const rest = m[2];
    let rulePath = null;
    if (rest.startsWith('/')) {
      rulePath = rest.replace(/\^+$/, '');
      if (rulePath === '/' || rulePath === '') rulePath = null;
    }
    // rest '^' atau kosong → domain-level (rulePath = null)
    this._addRule(host, rulePath, allow);
  }

  // Allowlist: tiap baris = satu domain yang SELALU diizinkan.
  _parseAllowFile(f) {
    const text = fs.readFileSync(f, 'utf-8');
    for (const raw of text.split(/\r?\n/)) {
      let l = raw.trim();
      if (!l || l[0] === '!' || l[0] === '#') continue;
      l = l.replace(/^@+/, '').replace(/^\|+/, '').replace(/^[a-z]+:\/\//i, '').replace(/^\/\//, '');
      const host = l.split(/[\/?#^]/)[0];
      this._addRule(host, null, true);
    }
  }

  // Muat dari file lokal (allowlist dulu, lalu bundled + easylist + easyprivacy).
  load() {
    this.blockedDomains = new Set();
    this.blockedPaths = new Map();
    this.allowDomains = new Set();
    this.allowPaths = new Map();
    this.sources = 0;

    if (fs.existsSync(CONFIG.allowList)) {
      try { this._parseAllowFile(CONFIG.allowList); } catch (e) { console.warn('[blocklist] allowlist gagal:', e.message); }
    }

    for (const f of [CONFIG.bundledList, CONFIG.easyList, CONFIG.easyPrivacy]) {
      if (!fs.existsSync(f)) continue;
      try { this._parseFile(f); this.sources++; }
      catch (e) { console.warn(`[blocklist] gagal memuat ${f}: ${e.message}`); }
    }

    this.size = this.blockedDomains.size + this.blockedPaths.size;
    return this;
  }

  _parseFile(f) {
    const text = fs.readFileSync(f, 'utf-8');
    for (const line of text.split(/\r?\n/)) this._parseLine(line);
  }

  // Cocokkan URL: allow (domain/path) menang atas block; path-spesifik hanya
  // blokir kalau path URL diawali path aturannya.
  isBlocked(url) {
    const hp = hostPathOf(url);
    if (!hp) return false;
    const { host, path } = hp;
    const parts = host.split('.');
    for (let i = 0; i < parts.length; i++) {
      const seg = parts.slice(i).join('.');
      // allow menang lebih dulu
      if (this.allowDomains.has(seg)) return false;
      const ap = this.allowPaths.get(seg);
      if (ap) for (const p of ap) if (path.startsWith(p)) return false;
      // block
      if (this.blockedDomains.has(seg)) return true;
      const bp = this.blockedPaths.get(seg);
      if (bp) for (const p of bp) if (path.startsWith(p)) return true;
    }
    return false;
  }

  // Ambil file dari jaringan (https) → teks.
  _download(url, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const req = http.get(url, {
        headers: { 'User-Agent': 'adblock-browser/1.0', 'Accept-Encoding': 'identity' }
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return this._download(new URL(res.headers.location, url).toString(), timeoutMs).then(resolve, reject);
        }
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} untuk ${url}`)); }
        let data = '';
        res.setEncoding('utf-8');
        res.on('data', c => data += c);
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout')); });
    });
  }

  async update() {
    if (this._updating) return this;
    this._updating = true;
    try {
      fs.mkdirSync(CONFIG.blocklistDir, { recursive: true });
      let ok = 0;
      for (const [url, out] of [[CONFIG.easylistUrl, CONFIG.easyList], [CONFIG.easyPrivacyUrl, CONFIG.easyPrivacy]]) {
        try {
          const text = await this._download(url);
          fs.writeFileSync(out, text);
          ok++;
        } catch (e) {
          console.warn(`[blocklist] update ${url} gagal: ${e.message} (pakai cache lama)`);
        }
      }
      if (ok > 0) {
        this.load();
        this.lastUpdate = Date.now();
        fs.writeFileSync(CONFIG.lastUpdateFile, String(this.lastUpdate));
        console.log(`[blocklist] diperbarui: ${this.size} host dari ${this.sources} sumber`);
      } else {
        console.warn('[blocklist] tidak ada update dari jaringan — pakai list bawaan');
      }
    } finally {
      this._updating = false;
    }
    return this;
  }
}

// Instance global (dipakai main.js & test).
module.exports = new Blocklist();
