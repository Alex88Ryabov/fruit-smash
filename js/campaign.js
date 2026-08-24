const LEVELS_PER_GARDEN = 12;

// сады кампании: своя палитра, свой набор фруктов, свой модификатор среды и свой босс
const GARDENS = [
  {
    key: 'apple',
    icon: '🍎',
    pool: ['apple', 'cherry', 'grape'],
    modifier: 'breeze',
    boss: { emoji: '🍎' },
    palette: {
      skyTop: '#4a8fd4', skyBottom: '#ffe6a7', hillFar: '#6fb872',
      hillNear: '#3f7d4c', ground: '#2f5c3c', groundTop: '#5fa168',
    },
  },
  {
    key: 'citrus',
    icon: '🍊',
    pool: ['lemon', 'orange', 'kiwi', 'apple'],
    modifier: 'puddles',
    boss: { emoji: '🍊' },
    palette: {
      skyTop: '#3b2f7a', skyBottom: '#f0a3c0', hillFar: '#4a3a86',
      hillNear: '#2f2560', ground: '#3d2a52', groundTop: '#6b4a86',
    },
  },
  {
    key: 'tropic',
    icon: '🥥',
    pool: ['banana', 'coconut', 'watermelon', 'cherry'],
    modifier: 'rain',
    boss: { emoji: '🥥' },
    palette: {
      skyTop: '#12343b', skyBottom: '#5b8f8f', hillFar: '#1d5450',
      hillNear: '#123a38', ground: '#0f2c2e', groundTop: '#2c6b63',
    },
  },
  {
    key: 'berry',
    icon: '🫐',
    pool: ['blueberry', 'cherry', 'kiwi', 'grape'],
    modifier: 'night',
    boss: { emoji: '🍓' },
    palette: {
      skyTop: '#0b0f2b', skyBottom: '#33215c', hillFar: '#281c52',
      hillNear: '#170f36', ground: '#120c2a', groundTop: '#3a2a63',
    },
  },
  {
    key: 'royal',
    icon: '👑',
    pool: ['apple', 'lemon', 'orange', 'banana', 'coconut', 'blueberry', 'watermelon', 'kiwi'],
    modifier: 'rotten',
    boss: { emoji: '🍉' },
    palette: {
      skyTop: '#4a1f4d', skyBottom: '#ffb86b', hillFar: '#7a3b6b',
      hillNear: '#4d2347', ground: '#3a1a38', groundTop: '#8a4a6b',
    },
  },
];

// время суток: каждый следующий уровень (и каждая волна в бесконечном) выглядит иначе
const DAY_PHASES = [
  { key: 'dawn', tint: '#ffb37a', strength: 0.34 },
  { key: 'day', tint: '#cfe9ff', strength: 0.3 },
  { key: 'sunset', tint: '#ff7a4d', strength: 0.42 },
  { key: 'night', tint: '#0b1030', strength: 0.66 },
];

function phaseFor(index) {
  return DAY_PHASES[((index % DAY_PHASES.length) + DAY_PHASES.length) % DAY_PHASES.length];
}

// палитра сада, подкрашенная под время суток: небо забирает тон сильнее, земля слабее
function tintedPalette(base, phase) {
  const k = phase.strength;
  return {
    skyTop: mixColor(base.skyTop, phase.tint, k),
    skyBottom: mixColor(base.skyBottom, phase.tint, k * 0.8),
    hillFar: mixColor(base.hillFar, phase.tint, k * 0.5),
    hillNear: mixColor(base.hillNear, phase.tint, k * 0.42),
    ground: mixColor(base.ground, phase.tint, k * 0.3),
    groundTop: mixColor(base.groundTop, phase.tint, k * 0.34),
    hud: base.hud || '#fff3d6',
    phase: phase.key,
    dark: phase.key === 'night',
  };
}

// порядок целей внутри сада: одиннадцать обычных уровней, двенадцатый всегда босс
const OBJECTIVE_ORDER = [
  'clear', 'clear', 'defend', 'clear', 'survive',
  'hunt', 'clear', 'defend', 'survive', 'hunt', 'clear',
];

// звания: очки капают за пройденные уровни и забеги бесконечного режима, звание навсегда
const RANKS = [
  { key: 'seed', emoji: '🌱', need: 0 },
  { key: 'thrower', emoji: '🪃', need: 150 },
  { key: 'sniper', emoji: '🎯', need: 400 },
  { key: 'ace', emoji: '🥇', need: 800 },
  { key: 'storm', emoji: '🌪️', need: 1400 },
  { key: 'legend', emoji: '👑', need: 2200 },
];

const UPGRADES = {
  heart: { key: 'heart', emoji: '❤️', costs: [60, 150, 320] },
  reload: { key: 'reload', emoji: '⚡', costs: [50, 130, 280] },
  drop: { key: 'drop', emoji: '🎁', costs: [70, 170, 350] },
  magnet: { key: 'magnet', emoji: '🧲', costs: [40, 110, 240] },
  start: { key: 'start', emoji: '🎒', costs: [90, 220, 460] },
};

const START_WEAPONS = ['potato', 'nuts', 'corn', 'pineapple'];

function levelId(gardenIndex, levelIndex) {
  return (gardenIndex + 1) + '-' + (levelIndex + 1);
}

function levelNumber(gardenIndex, levelIndex) {
  return gardenIndex * LEVELS_PER_GARDEN + levelIndex + 1;
}

// кривая кампании мягче бесконечного режима: 60 уровней растянуты плавно
function campaignDifficulty(number) {
  const t = (number - 1) / (GARDENS.length * LEVELS_PER_GARDEN - 1);
  return {
    speedMul: 1 + t * 1.45,
    attackMul: 0.85 + t * 1.35,
    hpBonus: Math.floor(number / 15),
    spawnInterval: clamp(1.7 - t * 1.2, 0.45, 1.7),
    stars: clamp(1 + Math.floor(number / 13), 1, 5),
  };
}

function levelPlan(gardenIndex, levelIndex) {
  const garden = GARDENS[gardenIndex];
  const number = levelNumber(gardenIndex, levelIndex);
  const boss = levelIndex === LEVELS_PER_GARDEN - 1;
  const objective = boss ? 'boss' : OBJECTIVE_ORDER[levelIndex % OBJECTIVE_ORDER.length];

  return {
    id: levelId(gardenIndex, levelIndex),
    gardenIndex,
    levelIndex,
    number,
    garden,
    boss,
    objective,
    difficulty: campaignDifficulty(number),
    count: boss ? 5 + levelIndex : Math.round(6 + number * 0.5),
    seconds: 30 + levelIndex * 2,
    hunted: 3 + Math.floor(levelIndex / 4),
  };
}

// очередь уровня: обычные фрукты сада, помеченные цели для охоты и босс на двенадцатом
function buildLevelQueue(plan) {
  const queue = [];
  for (let i = 0; i < plan.count; i++) {
    queue.push({ type: ENEMY_TYPES[pick(plan.garden.pool)], hunted: false });
  }

  if (plan.objective === 'hunt') {
    const slots = [];
    for (let i = 0; i < queue.length; i++) {
      slots.push(i);
    }
    for (let i = 0; i < Math.min(plan.hunted, queue.length); i++) {
      const slot = slots.splice(randInt(0, slots.length - 1), 1)[0];
      queue[slot].hunted = true;
    }
  }

  if (plan.boss) {
    queue.unshift({ type: ENEMY_TYPES.boss, hunted: false, skin: plan.garden.boss });
  } else if (Math.random() < 0.25) {
    queue.splice(randInt(0, queue.length), 0, { type: ENEMY_TYPES.mango, hunted: false });
  }
  return queue;
}
