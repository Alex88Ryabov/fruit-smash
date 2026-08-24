// герой собран из частей нарисованной картинки: тело с головой, нога, рукав с плечом и предплечье.
// позы считает код — руки гнутся в локтях, ноги в коленях, поэтому герой ходит, замахивается
// и бросает, а не ездит столбиком. точки крепления сняты с нарезки в её пикселях
// и переведены в пиксели игры одним коэффициентом
const HERO_SCALE = 0.147;
// нарезка уменьшена до 45% исходника (985 px от макушки до подошвы): столько пикселей игры в пикселе спрайта
const SPR = HERO_SCALE / 0.45;

// точка спрайта тела → точка игры относительно подошв героя
function bodyPoint(bx, by) {
  return { x: -27 + bx * SPR, y: -147 + by * SPR };
}

// строки спрайта ноги: верх бедра (первые строки — обрезок подола, их под шорты не берём), колено, подошва
const LEG_TOP_ROW = 3;
const KNEE_ROW = 40;
const SOLE_ROW = 120.5;

const HERO = {
  body: { x: -27, y: -147, w: 171 * SPR, h: 329 * SPR },
  // плечо бросающей руки — верх правого рукава; на теле его нет, он целиком уехал на спрайт руки
  shoulder: bodyPoint(134, 176),
  // дальний локоть — середина подола левого рукава, из-под него висит предплечье
  farElbow: bodyPoint(35, 219),
  hips: [bodyPoint(60, 303), bodyPoint(110, 303)],
  legTop: bodyPoint(0, 321).y,
  kneeY: -(SOLE_ROW - KNEE_ROW) * SPR,
  outline: '#271d33',
  // тёмный кружок под коленом закрывает щель в контуре, когда нога согнута
  kneeR: 18.5 * SPR,
};
// спрайт ноги начинается под шортами, а вращать её надо от бедра выше подола:
// бедро растягиваем по вертикали, а точку крепления выносим выше первой строки спрайта
HERO.thighStretch = (HERO.kneeY - HERO.legTop) / ((KNEE_ROW - LEG_TOP_ROW) * SPR);
HERO.thighPivotRow = LEG_TOP_ROW - (HERO.legTop - HERO.hips[0].y) / (SPR * HERO.thighStretch);
HERO.thighLen = HERO.kneeY - HERO.hips[0].y;

// рука: рукав вращается вокруг плеча, предплечье — вокруг локтя у подола рукава.
// у ближнего предплечья точка крепления утоплена глубже в спрайт: его верх прячется под рукавом
// при любом сгибе. у дальнего рукав нарисован на теле и не закроет лишнего — крепление у самого верха
const ARM = {
  sleevePivot: { x: 33, y: 27 },
  // куда смотрит рукав на спрайте: от плеча к локтю
  sleeveAxis: Math.atan2(68 - 27, 25 - 33),
  upperLen: Math.hypot(25 - 33, 68 - 27) * SPR,
  forePivot: { x: 17, y: 14 },
  // от локтя к середине кулака
  foreAxis: Math.atan2(66 - 14, 19 - 17),
  foreLen: Math.hypot(19 - 17, 66 - 14) * SPR,
  // снаряд лежит в кулаке, чуть дальше его середины
  gripLen: 68 * SPR,
  farPivot: { x: 17, y: 8 },
  farAxis: Math.atan2(66 - 8, 19 - 17),
};

// срез сустава: всё ниже точки крепления плюс полукруг над ней —
// при сгибе закруглённый верх прячется под соседней деталью, а не торчит углом
function jointClip(px, py, r) {
  return (ctx) => {
    ctx.moveTo(px - r, py);
    ctx.arc(px, py, r, Math.PI, 0);
    ctx.lineTo(px + 400, py);
    ctx.lineTo(px + 400, py + 400);
    ctx.lineTo(px - 400, py + 400);
    ctx.lineTo(px - 400, py);
    ctx.closePath();
  };
}

// рукав: срез держим перпендикулярно кости плеча, чуть ниже подола — при любом повороте
// конец рукава остаётся ровным, а не превращается в косой «плавник»
function sleeveClip(ctx) {
  const ax = Math.cos(ARM.sleeveAxis);
  const ay = Math.sin(ARM.sleeveAxis);
  ctx.moveTo(25 - ay * 80, 70 + ax * 80);
  ctx.lineTo(25 + ay * 80, 70 - ax * 80);
  ctx.lineTo(25 + ay * 80 - ax * 200, 70 - ax * 80 - ay * 200);
  ctx.lineTo(25 - ay * 80 - ax * 200, 70 + ax * 80 - ay * 200);
  ctx.closePath();
}

function thighClip(ctx) {
  ctx.rect(0, LEG_TOP_ROW, 60, KNEE_ROW - LEG_TOP_ROW);
}

const shinClip = jointClip(35, KNEE_ROW, 15);
const forearmClip = jointClip(ARM.forePivot.x, ARM.forePivot.y, 11);
const farForearmClip = jointClip(ARM.farPivot.x, ARM.farPivot.y, 11);

// кусок спрайта, повёрнутый вокруг своей точки крепления (px, py — в пикселях спрайта)
function drawPiece(ctx, img, px, py, x, y, angle, clip, flip = false, stretchY = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(flip ? -SPR : SPR, SPR * stretchY);
  ctx.translate(-px, -py);
  ctx.beginPath();
  clip(ctx);
  ctx.clip();
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

// двухзвенная рука: по положению кисти относительно плеча находим локоть.
// из двух зеркальных решений берём то, где локоть дальше от груди: у висящей руки
// он оказывается под плечом, у поднятой — наружу и вверх, как при замахе.
// кисть дальше вытянутой руки подтягиваем
function elbowFor(hx, hy, l1, l2) {
  const d = Math.hypot(hx, hy);
  if (d < 0.001) {
    return { ex: 0, ey: l1, hx: 0, hy: Math.abs(l1 - l2) + 0.5 };
  }
  const k = clamp(d, Math.abs(l1 - l2) + 0.5, l1 + l2 - 0.5) / d;
  const ux = hx / d;
  const uy = hy / d;
  const reach = d * k;
  const a = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const px = a * ux;
  const py = a * uy;
  const score = (x, y) => x + y * 0.35;
  const out = score(px - h * uy, py + h * ux) >= score(px + h * uy, py - h * ux) ? 1 : -1;
  return { ex: px - out * h * uy, ey: py + out * h * ux, hx: hx * k, hy: hy * k };
}

// лицо на спрайте тела: линзы очков, базовый сдвиг зрачка и рот — сняты с нарезки.
// мимика рисуется поверх этих точек, сами очки и румянец остаются спрайтовыми
const FACE = {
  eyes: [{ x: 66, y: 96 }, { x: 110.5, y: 96 }],
  lensR: 13.5,
  pupilR: 9.2,
  pupilOff: { x: 4.5, y: 1 },
  mouth: { x: 88, y: 126 },
  skin: '#fdc48c',
  dark: '#221a2f',
  mouthFill: '#7a2e24',
  mouthLine: '#92412e',
  tongue: '#e2808d',
  brow: '#3a2619',
};

const HERO_ART = { bodies: [], arms: [], forearm: null, leg: null, ready: false };

// картинки грузятся один раз при старте; пока их нет, герой просто не рисуется
(function loadHeroArt() {
  const files = [
    'art/hero-body-1.png',
    'art/hero-body-2.png',
    'art/hero-body-3.png',
    'art/hero-body-4.png',
    'art/hero-arm-1.png',
    'art/hero-arm-2.png',
    'art/hero-arm-3.png',
    'art/hero-arm-4.png',
    'art/hero-forearm.png',
    'art/hero-leg.png',
  ];
  let pending = files.length;
  const images = files.map((src) => {
    const image = new Image();
    image.onload = () => {
      pending -= 1;
      if (pending === 0) {
        HERO_ART.ready = true;
      }
    };
    image.src = src;
    return image;
  });
  HERO_ART.bodies = images.slice(0, 4);
  HERO_ART.arms = images.slice(4, 8);
  HERO_ART.forearm = images[8];
  HERO_ART.leg = images[9];
}());
