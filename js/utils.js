const TAU = Math.PI * 2;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function pick(list) {
  return list[randInt(0, list.length - 1)];
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// сглаживание, не зависящее от длины кадра
function damp(a, b, rate, dt) {
  return lerp(a, b, 1 - Math.exp(-rate * dt));
}

function circlesHit(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const r = ar + br;
  return dx * dx + dy * dy <= r * r;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function formatScore(value) {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

// эмодзи рисуем как обычный текст: так работает на любой машине без спрайтов
function drawEmoji(ctx, emoji, x, y, size, rotation = 0, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.font = size + 'px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 0, 0);
  ctx.restore();
}

function drawSeed(ctx, x, y, r, rotation, color = '#5b3a1e') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.62, r, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(-r * 0.2, -r * 0.3, r * 0.18, r * 0.3, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawDroplet(ctx, x, y, r, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.5);
  ctx.quadraticCurveTo(r, -r * 0.2, r * 0.75, r * 0.4);
  ctx.arc(0, r * 0.4, r * 0.75, 0, Math.PI);
  ctx.quadraticCurveTo(-r, -r * 0.2, 0, -r * 1.5);
  ctx.fill();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(-r * 0.25, r * 0.15, r * 0.2, r * 0.3, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// смешивание двух #rrggbb — из него собираются палитры времени суток
function mixColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const to2 = (v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return '#'
    + to2(lerp((pa >> 16) & 255, (pb >> 16) & 255, t))
    + to2(lerp((pa >> 8) & 255, (pb >> 8) & 255, t))
    + to2(lerp(pa & 255, pb & 255, t));
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
