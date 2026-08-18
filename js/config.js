// два кадра игры: альбомный для мыши и портретный для телефона.
// поля отсюда подмешиваются в CONFIG функцией applyLayout()
const LAYOUTS = {
  landscape: {
    width: 960,
    height: 600,
    groundY: 545,
    gravity: 950,
    minThrowSpeed: 430,
    maxThrowSpeed: 1180,
    jumpSpeed: 560,
    playerGravity: 1700,
    enemyBand: [90, 360],
    bossBand: [90, 250],
    moveBand: 90,
    maxPull: 190,
  },
  portrait: {
    width: 720,
    height: 1280,
    groundY: 1180,
    gravity: 1150,
    minThrowSpeed: 620,
    maxThrowSpeed: 1750,
    jumpSpeed: 900,
    playerGravity: 2400,
    enemyBand: [140, 880],
    bossBand: [140, 600],
    moveBand: 150,
    maxPull: 260,
  },
};

// весь баланс игры в одном месте
const CONFIG = {
  layout: 'landscape',
  chargeTime: 0.7,
  playerSpeed: 340,
  playerRadius: 26,
  maxHp: 5,
  comboStep: 3,
  maxMultiplier: 5,
  invulnTime: 1.2,
  shieldInvulnTime: 0.8,
  slipTime: 1.2,
  bannerTime: 2.2,
  bossEvery: 5,
  escapePenalty: 5,
  maxWeaponLevel: 4,
  pickupLife: 9,
  pickupGravity: 620,
  slowTime: 6,
  slowFactor: 0.42,
  bombDamage: 4,
  minPull: 14,
  maxPlayers: 4,
  // не пускать второго игрока с того же публичного IP: закрывает вход по своей же ссылке,
  // но заодно запрещает играть вдвоём из одной квартиры — поставь false, если это нужно
  blockSameNetwork: true,
};

function applyLayout(name) {
  Object.assign(CONFIG, LAYOUTS[name]);
  CONFIG.layout = name;
}

applyLayout('landscape');

// оружие: ammo 0 — бесконечное, blast — радиус взрыва, homing — скорость доворота в рад/с
const WEAPONS = {
  potato: {
    key: 'potato', emoji: '🥔', damage: 1, cooldown: 0.2,
    shots: 1, spread: 0, gravityMul: 1, speedMul: 1, size: 38, ammo: 0,
  },
  nuts: {
    key: 'nuts', emoji: '🥜', damage: 1, cooldown: 0.36,
    shots: 3, spread: 0.17, gravityMul: 1, speedMul: 1, size: 30, ammo: 20,
  },
  corn: {
    key: 'corn', emoji: '🌽', damage: 1, cooldown: 0.11,
    shots: 1, spread: 0.05, gravityMul: 0.14, speedMul: 1.45, size: 30, ammo: 60, autoFire: true,
  },
  pineapple: {
    key: 'pineapple', emoji: '🍍', damage: 3, cooldown: 0.65,
    shots: 1, spread: 0, gravityMul: 1, speedMul: 0.95, size: 44, ammo: 10, blast: 115,
  },
  carrot: {
    key: 'carrot', emoji: '🥕', damage: 2, cooldown: 0.32,
    shots: 1, spread: 0, gravityMul: 0.22, speedMul: 0.92, size: 34, ammo: 18, homing: 3.4,
  },
};

// атаки врагов: kind разбирается в Game.enemyAttack
const ATTACKS = {
  none: null,
  pit: { kind: 'pit', cooldown: [1.8, 2.8] },
  splash: { kind: 'splash', cooldown: [3.2, 4.6] },
  seed: { kind: 'seed', cooldown: [2.4, 3.4] },
  acid: { kind: 'acid', cooldown: [2.8, 4.0] },
  peel: { kind: 'peel', cooldown: [3.0, 4.2] },
  dive: { kind: 'dive', cooldown: [2.8, 3.6] },
  boss: { kind: 'boss', cooldown: [1.3, 2.0] },
};

const ENEMY_TYPES = {
  apple: {
    key: 'apple', emoji: '🍎', size: 56, radius: 26, hp: 1, speed: 105, score: 10,
    amp: [20, 60], attack: ATTACKS.none, marker: null, dropChance: 0.1, tint: '#ff5d5d',
  },
  cherry: {
    key: 'cherry', emoji: '🍒', size: 40, radius: 19, hp: 1, speed: 235, score: 20,
    amp: [45, 95], attack: ATTACKS.none, marker: null, dropChance: 0.12, tint: '#ff2e63',
  },
  watermelon: {
    key: 'watermelon', emoji: '🍉', size: 92, radius: 44, hp: 3, speed: 65, score: 35,
    amp: [8, 26], attack: ATTACKS.splash, marker: null, dropChance: 0.3, tint: '#4ade80',
  },
  grape: {
    key: 'grape', emoji: '🍇', size: 62, radius: 29, hp: 2, speed: 125, score: 25,
    amp: [15, 45], attack: ATTACKS.pit, marker: null, dropChance: 0.22, tint: '#a06bff',
  },
  lemon: {
    key: 'lemon', emoji: '🍋', size: 62, radius: 29, hp: 2, speed: 92, score: 30,
    amp: [15, 40], attack: ATTACKS.acid, marker: null, dropChance: 0.3, tint: '#ffe066',
  },
  banana: {
    key: 'banana', emoji: '🍌', size: 64, radius: 28, hp: 2, speed: 115, score: 30,
    amp: [20, 50], attack: ATTACKS.peel, marker: null, dropChance: 0.28, tint: '#ffd43b',
  },
  kiwi: {
    key: 'kiwi', emoji: '🥝', size: 54, radius: 25, hp: 1, speed: 98, score: 30,
    amp: [25, 55], attack: ATTACKS.seed, marker: '🎯', dropChance: 0.28, tint: '#8ecb4a',
  },
  orange: {
    key: 'orange', emoji: '🍊', size: 60, radius: 28, hp: 3, speed: 100, score: 45,
    amp: [20, 50], attack: ATTACKS.pit, marker: null, dropChance: 0.32, tint: '#ff922b',
    // корка периодически превращается в броню: пока щит поднят, снаряды отскакивают
    shield: { up: 1.5, down: 3.2 },
  },
  coconut: {
    key: 'coconut', emoji: '🥥', size: 52, radius: 25, hp: 2, speed: 155, score: 40,
    amp: [30, 70], attack: ATTACKS.dive, marker: '💥', dropChance: 0.32, tint: '#c9956b',
  },
  blueberry: {
    key: 'blueberry', emoji: '🫐', size: 58, radius: 27, hp: 2, speed: 110, score: 35,
    amp: [20, 55], attack: ATTACKS.none, marker: null, dropChance: 0.3, tint: '#5c7cfa',
    // при гибели рассыпается на мелкие ягоды
    splitsInto: { type: 'berry', count: 3 },
  },
  berry: {
    key: 'berry', emoji: '🫐', size: 30, radius: 14, hp: 1, speed: 200, score: 8,
    amp: [30, 70], attack: ATTACKS.none, marker: null, dropChance: 0.06, tint: '#748ffc',
  },
  mango: {
    key: 'mango', emoji: '🥭', size: 56, radius: 27, hp: 1, speed: 290, score: 150,
    amp: [60, 110], attack: ATTACKS.none, marker: null, dropChance: 1, tint: '#ffd700',
  },
  boss: {
    key: 'boss', emoji: '🍉', size: 175, radius: 82, hp: 22, speed: 52, score: 400,
    amp: [25, 55], attack: ATTACKS.boss, marker: null, dropChance: 3, tint: '#c1121f',
  },
};

// бонусы: weapon — выдаёт оружие вместо разового эффекта
const PICKUP_TYPES = {
  heal: { key: 'heal', emoji: '❤️', color: '#ff4d6d', weight: 10 },
  shield: { key: 'shield', emoji: '🛡️', color: '#4ecdc4', weight: 12 },
  slow: { key: 'slow', emoji: '⏳', color: '#8ecbff', weight: 10 },
  bomb: { key: 'bomb', emoji: '💣', color: '#ffd166', weight: 8 },
  wrench: { key: 'wrench', emoji: '🔧', color: '#c0f36b', weight: 10 },
  nuts: { key: 'nuts', emoji: '🥜', color: '#d9a066', weapon: 'nuts', weight: 12 },
  corn: { key: 'corn', emoji: '🌽', color: '#ffe066', weapon: 'corn', weight: 12 },
  pineapple: { key: 'pineapple', emoji: '🍍', color: '#ffb703', weapon: 'pineapple', weight: 10 },
  carrot: { key: 'carrot', emoji: '🥕', color: '#fb8500', weapon: 'carrot', weight: 10 },
};

const PALETTE = {
  skyTop: '#3b2f7a',
  skyBottom: '#f0a3c0',
  hillFar: '#4a3a86',
  hillNear: '#2f2560',
  ground: '#3d2a52',
  groundTop: '#6b4a86',
  hud: '#fff3d6',
};
