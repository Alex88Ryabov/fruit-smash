// снимает три обложки со стенда covers.html в store/crazygames/: node shoot-covers.js
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { serveProject, ROOT } = require('./serve');

(async () => {
  const { server, origin } = await serveProject();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 2000, height: 3300 } });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto(origin + '/tools/store/covers.html');
  await page.waitForFunction(() => window.__done === true, null, { timeout: 20000 });
  const out = path.join(ROOT, 'store', 'crazygames');
  fs.mkdirSync(out, { recursive: true });
  for (const [id, name] of [['land', 'cover-1920x1080.png'], ['port', 'cover-800x1200.png'], ['sq', 'cover-800x800.png']]) {
    await (await page.$('#' + id)).screenshot({ path: path.join(out, name) });
    console.log(name);
  }
  await browser.close();
  server.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
