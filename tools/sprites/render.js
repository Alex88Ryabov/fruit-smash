// рендер спрайтов фруктов из GLB-моделей Kenney Food Kit: node render.js <папка с glb> [выход]
// нужны three и playwright: npm install three playwright (в этой папке) и распакованный
// kenney_food-kit.zip с https://kenney.nl/assets/food-kit — путь к Models/GLB format
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.png': 'image/png' };
const modelsDir = process.argv[2];
const outDir = process.argv[3] || path.join(__dirname, '..', '..', 'art', 'sprites');
if (!modelsDir) {
  console.error('укажи папку с glb-моделями: node render.js "<...>/Models/GLB format"');
  process.exit(1);
}
const specs = JSON.parse(fs.readFileSync(path.join(__dirname, 'specs.json'), 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

// страница и three.js отдаются из этой папки, модели — из переданной под /models/
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = url.startsWith('/models/') ? path.join(modelsDir, url.slice(8)) : path.join(__dirname, url);
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

(async () => {
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto('http://localhost:' + port + '/page.html');
  await page.waitForFunction(() => window.ready);
  for (const spec of specs) {
    const result = await page.evaluate((s) => window.renderModel(s), { ...spec, url: '/models/' + spec.model + '.glb' });
    const png = Buffer.from(result.dataUrl.split(',')[1], 'base64');
    fs.writeFileSync(path.join(outDir, spec.name + '.png'), png);
    console.log(spec.name, result.w + 'x' + result.h, Math.round(png.length / 1024) + ' КБ');
  }
  await browser.close();
  server.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
