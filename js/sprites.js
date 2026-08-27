// фрукты и оружие — рендеры моделей Kenney Food Kit (CC0) с тёмной обводкой под стиль героя,
// иконки — белые силуэты Kenney Game Icons и Board Game Icons (CC0), красятся при отрисовке.
// картинки грузятся один раз при старте; пока какой-то нет, её место просто пустое
const SPRITE_NAMES = [
  'apple', 'cherry', 'watermelon', 'grape', 'lemon', 'banana', 'avocado', 'orange', 'coconut',
  'blueberry', 'pear', 'strawberry', 'potato', 'mushroom', 'corn', 'pineapple', 'carrot',
];
const ICON_NAMES = [
  'heart', 'heart-broken', 'shield', 'hourglass', 'blast', 'wrench', 'fire', 'crown', 'lock', 'star',
  'target', 'warning', 'medal', 'trophy', 'pouch', 'hand', 'basket', 'fast-forward',
  'arrow-up', 'pause', 'play', 'sound-on', 'sound-off',
];

const ART = { sprites: {}, icons: {}, tinted: new Map() };

function loadImages(dir, names, into) {
  for (const name of names) {
    const image = new Image();
    image.src = dir + name + '.png';
    into[name] = image;
  }
}

loadImages('art/sprites/', SPRITE_NAMES, ART.sprites);
loadImages('art/icons/', ICON_NAMES, ART.icons);

function loaded(image) {
  return image && image.complete && image.naturalWidth > 0;
}

function drawImageCentered(ctx, image, x, y, size, rotation, alpha) {
  const k = size / Math.max(image.width, image.height);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.drawImage(image, -image.width * k / 2, -image.height * k / 2, image.width * k, image.height * k);
  ctx.restore();
}

// картинка вписана большей стороной в size, центр в (x, y) — как раньше эмодзи размером в кегль
function drawSprite(ctx, name, x, y, size, rotation = 0, alpha = 1) {
  const image = ART.sprites[name];
  if (!loaded(image)) {
    return;
  }
  drawImageCentered(ctx, image, x, y, size, rotation, alpha);
}

// белый силуэт, залитый цветом: перекрашенные копии кэшируются по имени и цвету.
// набор цветов в игре фиксированный, так что кэш не растёт бесконечно
function tintedIcon(name, color) {
  const image = ART.icons[name];
  if (!loaded(image)) {
    return null;
  }
  const key = name + '|' + color;
  let canvas = ART.tinted.get(key);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const g = canvas.getContext('2d');
    g.drawImage(image, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, canvas.width, canvas.height);
    ART.tinted.set(key, canvas);
  }
  return canvas;
}

function drawIcon(ctx, name, x, y, size, color = '#fff3d6', rotation = 0, alpha = 1) {
  const image = tintedIcon(name, color);
  if (!image) {
    return;
  }
  drawImageCentered(ctx, image, x, y, size, rotation, alpha);
}

// цветной кружок с обводкой и белой иконкой: так рисуются бонусы без своего предмета
function drawBadge(ctx, icon, x, y, r, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = '#271d33';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  drawIcon(ctx, icon, x, y, r * 1.15, '#ffffff');
}
