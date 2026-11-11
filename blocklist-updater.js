// blocklist-updater.js — perbarui daftar blokir dari jaringan (standalone CLI).
// Pakai:  npm run update-lists   (atau)  node blocklist-updater.js
const blocklist = require('./blocklist');

blocklist.load();
console.log(`Sebelum: ${blocklist.size} domain dari ${blocklist.sources} sumber lokal`);
console.log('Mengunduh EasyList + EasyPrivacy…');

blocklist.update()
  .then(b => {
    console.log(`Setelah : ${b.size} domain dari ${b.sources} sumber`);
    process.exit(0);
  })
  .catch(e => {
    console.error('Update gagal:', e.message);
    process.exit(1);
  });
