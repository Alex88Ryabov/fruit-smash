const SAVE_KEY = 'fruktolet.save';

// прогресс кампании и мета-прокачка живут одним объектом в CG.store():
// на CrazyGames это их облачный сейв, в остальных местах — localStorage
class Save {
  constructor() {
    this.data = this.read();
  }

  read() {
    const blank = { stars: {}, seeds: 0, upgrades: {}, best: 0, bestWave: 0, xp: 0, runs: [] };
    let stored = null;
    try {
      stored = JSON.parse(CG.store().getItem(SAVE_KEY));
    } catch (err) {
      stored = null;
    }
    const data = stored ? Object.assign(blank, stored) : blank;
    data.stars = data.stars || {};
    data.upgrades = data.upgrades || {};
    data.xp = data.xp || 0;
    data.runs = data.runs || [];

    // рекорд из старых версий лежал отдельным ключом
    const legacyBest = Number(CG.store().getItem('fruktolet.best') || 0);
    if (legacyBest > data.best) {
      data.best = legacyBest;
    }
    // рекорд, поставленный до появления таблицы, становится её первой строкой
    if (data.best > 0 && data.runs.length === 0) {
      data.runs.push({ s: data.best, w: data.bestWave || 1, d: Date.now() });
    }
    return data;
  }

  write() {
    CG.store().setItem(SAVE_KEY, JSON.stringify(this.data));
  }

  get seeds() {
    return this.data.seeds;
  }

  get best() {
    return this.data.best;
  }

  get xp() {
    return this.data.xp;
  }

  get runs() {
    return this.data.runs;
  }

  // ни пройденного уровня, ни забега: игру открыли впервые
  get fresh() {
    return this.totalStars() === 0 && this.data.runs.length === 0;
  }

  addXp(amount) {
    this.data.xp += amount;
    this.write();
  }

  rankIndex() {
    let index = 0;
    for (let i = 0; i < RANKS.length; i++) {
      if (this.data.xp >= RANKS[i].need) {
        index = i;
      }
    }
    return index;
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

  // забег попадает в таблицу топ-10; place — занятое место, 0 если не дотянул
  recordEndless(score, wave) {
    const seeds = Math.floor(score / 100);
    this.data.seeds += seeds;
    this.data.best = Math.max(this.data.best, Math.round(score));
    this.data.bestWave = Math.max(this.data.bestWave, wave);
    const entry = { s: Math.round(score), w: wave, d: Date.now() };
    this.data.runs.push(entry);
    this.data.runs.sort((a, b) => b.s - a.s);
    const place = this.data.runs.indexOf(entry) + 1;
    this.data.runs = this.data.runs.slice(0, 10);
    this.write();
    return { seeds, place: place <= 10 ? place : 0 };
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
