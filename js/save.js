const SAVE_KEY = 'fruktolet.save';

// прогресс кампании и мета-прокачка живут в localStorage одним объектом
class Save {
  constructor() {
    this.data = this.read();
  }

  read() {
    const blank = { stars: {}, seeds: 0, upgrades: {}, best: 0, bestWave: 0 };
    let stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(SAVE_KEY));
    } catch (err) {
      stored = null;
    }
    const data = stored ? Object.assign(blank, stored) : blank;
    data.stars = data.stars || {};
    data.upgrades = data.upgrades || {};

    // рекорд из старых версий лежал отдельным ключом
    const legacyBest = Number(localStorage.getItem('fruktolet.best') || 0);
    if (legacyBest > data.best) {
      data.best = legacyBest;
    }
    return data;
  }

  write() {
    localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
  }

  get seeds() {
    return this.data.seeds;
  }

  get best() {
    return this.data.best;
  }

  stars(id) {
    return this.data.stars[id] || 0;
  }

  totalStars() {
    return Object.values(this.data.stars).reduce((sum, n) => sum + n, 0);
  }

  gardenStars(gardenIndex) {
    let sum = 0;
    for (let i = 0; i < LEVELS_PER_GARDEN; i++) {
      sum += this.stars(levelId(gardenIndex, i));
    }
    return sum;
  }

  done(id) {
    return this.stars(id) > 0;
  }

  // уровень открыт, если пройден предыдущий; сад — если добит его босс
  levelOpen(gardenIndex, levelIndex) {
    if (!this.gardenOpen(gardenIndex)) {
      return false;
    }
    return levelIndex === 0 || this.done(levelId(gardenIndex, levelIndex - 1));
  }

  gardenOpen(gardenIndex) {
    if (gardenIndex === 0) {
      return true;
    }
    return this.done(levelId(gardenIndex - 1, LEVELS_PER_GARDEN - 1));
  }

  recordLevel(id, stars, seeds) {
    this.data.stars[id] = Math.max(this.stars(id), stars);
    this.data.seeds += seeds;
    this.write();
  }

  recordEndless(score, wave) {
    const seeds = Math.floor(score / 100);
    this.data.seeds += seeds;
    this.data.best = Math.max(this.data.best, Math.round(score));
    this.data.bestWave = Math.max(this.data.bestWave, wave);
    this.write();
    return seeds;
  }

  level(key) {
    return this.data.upgrades[key] || 0;
  }

  cost(key) {
    const costs = UPGRADES[key].costs;
    const level = this.level(key);
    return level >= costs.length ? null : costs[level];
  }

  buy(key) {
    const cost = this.cost(key);
    if (cost === null || this.data.seeds < cost) {
      return false;
    }
    this.data.seeds -= cost;
    this.data.upgrades[key] = this.level(key) + 1;
    this.write();
    return true;
  }

  // всё, что мета-прокачка меняет в самой игре
  perks() {
    return {
      maxHp: CONFIG.maxHp + this.level('heart'),
      reloadMul: 1 - 0.1 * this.level('reload'),
      dropMul: 1 + 0.25 * this.level('drop'),
      pickupRadius: 12 + 14 * this.level('magnet'),
      weapon: WEAPONS[START_WEAPONS[this.level('start')]],
    };
  }

  wipe() {
    this.data = { stars: {}, seeds: 0, upgrades: {}, best: this.data.best, bestWave: this.data.bestWave };
    this.write();
  }
}
