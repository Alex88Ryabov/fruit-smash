// сборка архива для CrazyGames: та же папка www, index.html — в корне архива.
// пакует системный bsdtar Windows (он пишет в zip прямые слэши, а PowerShell
// Compress-Archive кладёт обратные, о которые спотыкаются распаковщики).
// путь явный: в Git Bash под именем tar живёт GNU tar, который zip не умеет
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

execSync('node build-www.js', { stdio: 'inherit' });
fs.mkdirSync('dist', { recursive: true });
const version = require('./package.json').version;
const out = 'dist/fruit-smash-crazygames-' + version + '.zip';
fs.rmSync(out, { force: true });
const bsdtar = path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe');
execSync('"' + bsdtar + '" --format zip -cf "' + out + '" -C www ' + fs.readdirSync('www').join(' '), { stdio: 'inherit' });
console.log('готово: ' + out + ' (' + Math.round(fs.statSync(out).size / 1024) + ' КБ)');
