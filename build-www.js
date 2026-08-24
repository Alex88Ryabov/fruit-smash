// собирает папку www для мобильной обёртки: только то, что нужно игре внутри приложения.
// service worker не копируем — в приложении файлы и так локальные
const fs = require('fs');
const path = require('path');

const OUT = 'www';
const FILES = ['index.html', 'style.css', 'manifest.json'];
const DIRS = ['js', 'art', 'icons'];

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(src, dst);
    } else {
      fs.copyFileSync(src, dst);
    }
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const file of FILES) {
  fs.copyFileSync(file, path.join(OUT, file));
}
for (const dir of DIRS) {
  copyDir(dir, path.join(OUT, dir));
}
console.log('www собрана');
