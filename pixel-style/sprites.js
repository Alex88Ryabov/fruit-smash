// одна палитра на все спрайты: буква в строке = цвет пикселя, точка = прозрачно
const PIXELS = {
  R: '#d63d2e', r: '#8f2418', L: '#f0705c',
  G: '#4caf50', g: '#2e7d32', N: '#8bc34a',
  Y: '#f7d038', y: '#c9a227',
  O: '#f08a24', o: '#b25f10',
  P: '#8e44ad', p: '#5b2c6f',
  B: '#3f6fd8', b: '#28468f',
  S: '#7a4b1e', s: '#4a2c10',
  M: '#ffd166', m: '#c79b1e',
  D: '#9e9e9e', d: '#5e5e5e',
  K: '#2b2b2b', k: '#111111',
  W: '#ffffff', T: '#e8c39e', E: '#ff5c8a',
  C: '#00b3b3', c: '#00807f',
};

// каждый спрайт — просто набор строк одинаковой длины
const SPRITES = {
  apple: [
    '...s.....',
    '..gG.....',
    '.RRRRRR..',
    'RRLRRRRR.',
    'RRLRRRRr.',
    'RRRRRRRr.',
    '.RRRRRrr.',
    '..RRRrr..',
    '...RRr...',
  ],
  cherry: [
    '...ggg...',
    '..g.g.g..',
    '.g..g..g.',
    'RRR.g.RRR',
    'RLR.g.RLR',
    'RRr...RRr',
    '.rr....rr',
  ],
  grape: [
    '...s.....',
    '..gg.....',
    '.PPPPPP..',
    'PPpPPPPP.',
    '.PPPPPPp.',
    '..PPPPPp.',
    '..pPPPp..',
    '...PPp...',
    '....p....',
  ],
  watermelon: [
    '..GGGGG..',
    '.GgGGgGG.',
    'GGgGGgGGG',
    'GgGGGgGGg',
    'GgGGGgGGg',
    'GGgGGgGGG',
    '.GGgGgGG.',
    '..GGGGG..',
  ],
  lemon: [
    '...yY....',
    '.YYYYYY..',
    'YYYWYYYYy',
    'YYYYYYYYy',
    'YYYYYYYyy',
    '.YYYYYYy.',
    '...YYy...',
  ],
  banana: [
    '......ss.',
    '.....YYy.',
    '....YYYy.',
    '...YYYy..',
    'YY.YYYy..',
    'YYYYYYy..',
    '.YYYYy...',
    '..yyy....',
  ],
  kiwi: [
    '..sSSs...',
    '.SGGGGS..',
    'SGkGkGGS.',
    'SGWWWkGS.',
    'SGkWkGGS.',
    'SGGkGGGS.',
    '.SGGGGS..',
    '..sSSs...',
  ],
  orange: [
    '...s.....',
    '..gg.....',
    '.OOOOOO..',
    'OOMOOOOO.',
    'OOMOOOOo.',
    'OOOOOOOo.',
    '.OOOOOoo.',
    '..OOOoo..',
    '...OOo...',
  ],
  coconut: [
    '..SSSSS..',
    '.SsSSsSS.',
    'SSkSSkSSs',
    'SSSSSSSSs',
    'SkSSSSSSs',
    'SSSSSSSss',
    '.SSSSSss.',
    '..SSsss..',
  ],
  blueberry: [
    '...ggg...',
    '..gBBBg..',
    '.BBBBBBB.',
    'BBWBBBBBB',
    'BBBBBBBBb',
    '.BBBBBBb.',
    '..BBBBb..',
    '...BBb...',
  ],
  mango: [
    '....s....',
    '..MMMMM..',
    '.MMMMMMM.',
    'MMWMMMMMm',
    'MMMMMMMMm',
    'MMMMMMMmm',
    '.MMMMMmm.',
    '..MMmm...',
  ],
  strawberry: [
    '..gGgGg..',
    '.gGGGGGg.',
    '.RRWRRRR.',
    'RRRRRWRRR',
    'RWRRRRRWR',
    '.RRRWRRR.',
    '..RRRRR..',
    '...RRR...',
    '....R....',
  ],

  potato: [
    '..SSSS...',
    '.SsSSSSs.',
    'SSSsSSSSs',
    'SSSSSsSSs',
    '.SsSSSSs.',
    '..SSSSs..',
  ],
  nuts: [
    '.TTT.TTT.',
    'TTsTTTsTT',
    'TTTTTTTTT',
    'TTsTTTsTT',
    '.TTT.TTT.',
  ],
  corn: [
    '....g....',
    '...gGg...',
    '..YYMYY..',
    '..YMYMY..',
    '..YYMYY..',
    '..YMYMY..',
    '..YYMYY..',
    '...gGg...',
    '....g....',
  ],
  pineapple: [
    '..gGgGg..',
    '...gGg...',
    '.MYMYMYM.',
    'MYMYMYMYM',
    'YMYMYMYMY',
    'MYMYMYMYM',
    'YMYMYMYMY',
    '.MYMYMYM.',
    '..MYMYM..',
  ],
  carrot: [
    '..g.G.g..',
    '..gGGg...',
    '...OOO...',
    '...OoO...',
    '...OOO...',
    '....OO...',
    '....Oo...',
    '....O....',
  ],

  heart: [
    '.RLR...RR.'.slice(0, 9),
    'RRRR.RRRR',
    'RRRRRRRRR',
    'RRRRRRRRR',
    '.RRRRRRR.',
    '..RRRRR..',
    '...RRR...',
    '....R....',
  ],
  heartEmpty: [
    '.dd...dd.',
    'dddd.dddd',
    'ddddddddd',
    'ddddddddd',
    '.ddddddd.',
    '..ddddd..',
    '...ddd...',
    '....d....',
  ],
  shield: [
    '.DDDDDDD.',
    'DDBBBBBDD',
    'DBBBWBBBD',
    'DBBWWWBBD',
    'DBBBWBBBD',
    '.DBBBBBD.',
    '..DBBBD..',
    '...DDD...',
  ],
  hourglass: [
    '.SSSSSSS.',
    '.SYYYYYS.',
    '..SYYYS..',
    '...SYS...',
    '....S....',
    '...SYS...',
    '..SYYYS..',
    '.SYYYYYS.',
    '.SSSSSSS.',
  ],
  bomb: [
    '.......Y.',
    '......Y..',
    '..kkk.Y..',
    '.kkkkk...',
    'kkkDkkk..',
    'kkkkkkk..',
    'kkkkkkk..',
    '.kkkkk...',
    '..kkk....',
  ],
  wrench: [
    '.DD.DD...',
    '.DDDDD...',
    '..DDD....',
    '..DDD....',
    '...DDD...',
    '....DDD..',
    '.....DDD.',
    '.....DDD.',
    '......DD.',
  ],
  lightning: [
    '...YY..',
    '..YY...',
    '.YY....',
    'YYYYY..',
    '..YYY..',
    '...YY..',
    '..YY...',
    '.YY....',
    '.Y.....',
  ],
  gift: [
    '...R.R...',
    '..RRRRR..',
    'MMMMRMMMM',
    'MMMMRMMMM',
    'mMMMRMMMm',
    'mMMMRMMMm',
    'mmmmRmmmm',
  ],
  magnet: [
    '.RR...RR.',
    'RRRR.RRRR',
    'RRRR.RRRR',
    'RRRR.RRRR',
    'RRRRRRRRR',
    'RRRRRRRRR',
    'DDDD.DDDD',
    'DDDD.DDDD',
  ],
  seedling: [
    '..N.N..',
    '.NNGNN.',
    '..NGN..',
    '...G...',
    '...G...',
    '..sss..',
  ],
  star: [
    '....M....',
    '...MMM...',
    '...MMM...',
    'MMMMMMMMM',
    '.MMMMMMM.',
    '..MMMMM..',
    '..MM.MM..',
    '.M.....M.',
  ],
  starEmpty: [
    '....d....',
    '...ddd...',
    '...ddd...',
    'ddddddddd',
    '.ddddddd.',
    '..ddddd..',
    '..dd.dd..',
    '.d.....d.',
  ],
  lock: [
    '..MMMMM..',
    '.M.....M.',
    '.M.....M.',
    'mMMMMMMMm',
    'MMMkMMMMM',
    'MMMkkMMMM',
    'MMMMMMMMM',
    'mMMMMMMMm',
  ],
  crown: [
    'M.......M',
    'M...M...M',
    'MM.MMM.MM',
    'MMMMMMMMM',
    'MmMMMMMmM',
    'MMMMMMMMM',
  ],
  target: [
    '....R....',
    '..RRRRR..',
    '.R..R..R.',
    '.R.....R.',
    'RRRR.RRRR',
    '.R.....R.',
    '.R..R..R.',
    '..RRRRR..',
    '....R....',
  ],
  anger: [
    'R.R.R.R',
    '.RRRRR.',
    'RRRRRRR',
    '.RRRRR.',
    'R.R.R.R',
  ],
  pit: [
    '.sss.',
    'sSsss',
    'sSsss',
    'sssss',
    'sssss',
    '.sss.',
    '..s..',
  ],
  drop: [
    '..E..',
    '..E..',
    '.EEE.',
    'EEEEE',
    'EEEEE',
    '.EEE.',
    '..E..',
  ],
  peel: [
    '.y.....y.',
    '.Yy...yY.',
    '..YyyyY..',
    '..YYYYY..',
    '...yyy...',
  ],
};

// каждый спрайт рисуется один раз в свой канвас и дальше только копируется
const spriteCache = new Map();

function spriteCanvas(name, size) {
  const key = name + '|' + size;
  const cached = spriteCache.get(key);
  if (cached) {
    return cached;
  }
  const rows = SPRITES[name];
  const cols = rows[0].length;
  const cell = Math.max(1, Math.round(size / cols));
  const canvas = document.createElement('canvas');
  canvas.width = cols * cell;
  canvas.height = rows.length * cell;
  const ctx = canvas.getContext('2d');
  for (let row = 0; row < rows.length; row++) {
    for (let col = 0; col < cols; col++) {
      const color = PIXELS[rows[row][col]];
      if (!color) {
        continue;
      }
      ctx.fillStyle = color;
      ctx.fillRect(col * cell, row * cell, cell, cell);
    }
  }
  spriteCache.set(key, canvas);
  return canvas;
}

function drawSprite(ctx, name, x, y, size, rotation = 0, alpha = 1) {
  const canvas = spriteCanvas(name, Math.max(6, Math.round(size)));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.translate(Math.round(x), Math.round(y));
  if (rotation) {
    ctx.rotate(rotation);
  }
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  ctx.restore();
}

function spriteHeight(name, size) {
  const rows = SPRITES[name];
  return (size / rows[0].length) * rows.length;
}
