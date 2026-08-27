// записывает превью-ролик боя с автопилотом: node record-video.js landscape|portrait
// нужен ffmpeg в PATH (или путь в переменной FFMPEG)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { chromium } = require('playwright');
const { serveProject, ROOT } = require('./serve');

const MODES = {
  landscape: { width: 1920, height: 1080, file: 'preview-landscape.mp4' },
  portrait: { width: 1080, height: 1620, file: 'preview-portrait.mp4' },
};
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
// площадка принимает 15–20 секунд и режет всё, что длиннее: держимся ближе к девятнадцати
const COVER_HOLD = 1.2;
const PLAY_TIME = 18.6;

(async () => {
  const key = process.argv[2] || 'landscape';
  const mode = MODES[key];
  const raw = path.join(__dirname, 'video-raw-' + key);
  fs.rmSync(raw, { recursive: true, force: true });

  const { server, origin } = await serveProject();
  const browser = await chromium.launch();
  const started = Date.now();
  const context = await browser.newContext({
    viewport: { width: mode.width, height: mode.height },
    recordVideo: { dir: raw, size: { width: mode.width, height: mode.height } },
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto(origin + '/tools/store/video.html');
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 25000 });

  // держим обложку на экране, чтобы она попала в первые кадры
  await page.waitForTimeout(COVER_HOLD * 1000);
  const coverAt = (Date.now() - started) / 1000;
  await page.evaluate(() => window.__startRun());
  await page.waitForTimeout(PLAY_TIME * 1000);
  const stats = await page.evaluate(() => ({
    score: Math.round(game.score), killed: game.killed, wave: game.wave, hp: game.localPlayer.hp,
  }));
  const video = page.video();
  await context.close();
  await browser.close();
  server.close();
  const webm = await video.path();
  console.log('сыграно:', JSON.stringify(stats));

  // обрезаем разгон страницы: ролик стартует за полсекунды до первого кадра обложки
  const from = Math.max(0, coverAt - COVER_HOLD + 0.25);
  const out = path.join(ROOT, 'store', 'crazygames', mode.file);
  fs.rmSync(out, { force: true });
  const filter = 'fps=30,scale=' + mode.width + ':' + mode.height + ':flags=lanczos,format=yuv420p';
  execSync('"' + FFMPEG + '" -hide_banner -loglevel error -ss ' + from.toFixed(2)
    + ' -i "' + webm + '" -t ' + (COVER_HOLD - 0.25 + PLAY_TIME - 0.4).toFixed(2)
    + ' -an -vf "' + filter + '" -c:v libx264 -preset slow -crf 20 -movflags +faststart "' + out + '"',
    { stdio: 'inherit' });
  fs.rmSync(raw, { recursive: true, force: true });
  console.log('готово:', out, Math.round(fs.statSync(out).size / 1024), 'КБ');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
