// пустой ввод для слотов, от которых пока ничего не пришло
const IDLE_INPUT = { m: 0, a: -0.8, c: false, tx: null, p: null, j: false };

const MODE = {
  menu: 'menu',
  map: 'map',
  upgrades: 'upgrades',
  records: 'records',
  playing: 'playing',
  banner: 'banner',
  paused: 'paused',
  result: 'result',
  over: 'over',
};

// кривая сложности: с каждой волной быстрее, злее и живучее
function difficultyFor(wave, playerCount) {
  return {
    speedMul: 1 + (wave - 1) * 0.09,
    attackMul: 1 + (wave - 1) * 0.08,
    hpBonus: Math.floor((wave - 1) / 4),
    spawnInterval: clamp(1.5 - (wave - 1) * 0.09, 0.32, 1.5),
    count: Math.round((4 + wave * 2) * (1 + (playerCount - 1) * 0.45)),
    stars: clamp(1 + Math.floor((wave - 1) / 2), 1, 5),
  };
}

// состав волны: новые фрукты подключаются по мере роста номера волны
function buildWave(wave, difficulty) {
  const pool = [];
  const add = (type, n) => {
    for (let i = 0; i < n; i++) {
      pool.push(type);
    }
  };

  add(ENEMY_TYPES.apple, wave >= 6 ? 2 : 4);
  add(ENEMY_TYPES.cherry, wave >= 2 ? 3 : 2);
  if (wave >= 2) {
    add(ENEMY_TYPES.grape, 3);
    add(ENEMY_TYPES.watermelon, 2);
  }
  if (wave >= 3) {
    add(ENEMY_TYPES.lemon, 2);
    add(ENEMY_TYPES.banana, 2);
  }
  if (wave >= 4) {
    add(ENEMY_TYPES.avocado, 2);
    add(ENEMY_TYPES.orange, 2);
  }
  if (wave >= 5) {
    add(ENEMY_TYPES.coconut, 2);
    add(ENEMY_TYPES.blueberry, 2);
  }

  const queue = [];
  for (let i = 0; i < difficulty.count; i++) {
    queue.push({ type: pick(pool), hunted: false });
  }
  if (Math.random() < 0.3 + wave * 0.03) {
    queue.splice(randInt(0, queue.length), 0, { type: ENEMY_TYPES.pear, hunted: false });
  }
  if (wave % CONFIG.bossEvery === 0) {
    queue.unshift({ type: ENEMY_TYPES.boss, hunted: false });
  }
  return queue;
}

// что выпадет из сбитого фрукта: лечение не роняем, пока все живые игроки целы
function rollPickup(players) {
  const options = Object.values(PICKUP_TYPES)
    .filter((type) => type.key !== 'heal' || players.some((p) => p.alive && p.hp < p.maxHp));
  const total = options.reduce((sum, type) => sum + type.weight, 0);
  let roll = Math.random() * total;
  for (const type of options) {
    roll -= type.weight;
    if (roll <= 0) {
      return type;
    }
  }
  return options[0];
}

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sound = new SoundBox();
    CG.watchSettings((muted) => this.sound.setPortalMute(muted));
    applyLayout(this.preferredLayout());
    this.save = new Save();
    this.best = this.save.best;
    this.ui = [];
    this.gardenView = 0;
    this.keys = new Set();
    this.pointer = { x: CONFIG.width / 2, y: 200 };
    this.pressed = false;
    this.touch = { active: false, mode: null, id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.touchRelease = null;
    this.touchUsed = false;
    this.throwHint = false;
    this.jumpQueued = false;
    this.clouds = Array.from({ length: 7 }, () => ({
      x: rand(0, CONFIG.width),
      y: rand(40, 300),
      s: rand(0.5, 1.4),
      v: rand(6, 22),
    }));

    this.role = 'solo';
    this.localIndex = 0;
    // события площадки: следим за сменой режима и докладываем начало и конец геймплея
    this.cgPlaying = false;
    this.cgLoaded = false;
    this.netStatus = 'offline';
    this.netMessage = '';
    this.invite = '';
    this.remoteInputs = [];
    this.events = [];
    this.newTexts = [];
    this.snapshotTimer = 0;
    this.aliveTimer = 1;
    this.inputTimer = 0;
    this.nextId = 1;
    this.net = new Net({
      onStatus: (status, text) => this.onNetStatus(status, text),
      onInvite: (invite) => this.onNetInvite(invite),
      onOpen: (role, slot) => this.onNetOpen(role, slot),
      onData: (data, slot) => this.onNetData(data, slot),
      onGuestJoin: (slot) => this.onGuestJoin(slot),
      onGuestLeave: (slot) => this.onGuestLeave(slot),
      onClose: () => this.onNetClose(),
    });

    this.reset();
    this.bindInput();
    this.bindLobby();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // новичок попадает сразу в первый уровень, меню — через паузу.
    // вход по приглашению и мгновенный мультиплеер уже заняли роль — им не мешаем
    if (this.save.fresh && this.net.role === 'solo') {
      this.startLevel(0, 0);
    }

    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  reset() {
    this.mode = MODE.menu;
    this.players = [new Player(0)];
    this.enemies = [];
    this.shots = [];
    this.hazards = [];
    this.pickups = [];
    this.waves = [];
    this.particles = [];
    this.texts = [];
    this.score = 0;
    this.wave = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.killed = 0;
    this.queue = [];
    this.spawnTimer = 0;
    this.difficulty = difficultyFor(1, 1);
    this.wind = 0;
    this.baseWind = 0;
    this.slowTimer = 0;
    this.bannerTimer = 0;
    this.bannerText = '';
    this.bannerSub = '';
    this.levelKills = 0;
    this.shake = 0;
    this.time = 0;

    this.level = null;
    this.objective = null;
    this.result = null;
    this.earnedSeeds = 0;
    this.earnedXp = 0;
    this.lastPlace = 0;
    this.rankUp = null;
    this.tookDamage = false;
    this.perks = this.save.perks();
    this.palette = PALETTE;
  }

  get modifier() {
    return this.level ? this.level.garden.modifier : null;
  }

  get activePlayers() {
    return this.players.filter((player) => player.active);
  }

  get localPlayer() {
    return this.players[this.localIndex] || this.players[0];
  }

  get multiplier() {
    return clamp(1 + Math.floor(this.combo / CONFIG.comboStep), 1, CONFIG.maxMultiplier);
  }

  get slowFactor() {
    return this.slowTimer > 0 ? CONFIG.slowFactor : 1;
  }

  // ---------- сеть ----------

  bindLobby() {
    applyDomStrings();
    this.lobby = document.getElementById('lobby');
    this.lobbyStatus = document.getElementById('net-status');
    this.inviteBox = document.getElementById('invite-box');
    this.inviteValue = document.getElementById('invite-value');
    const joinInput = document.getElementById('join-input');

    document.getElementById('btn-invite').addEventListener('click', () => {
      this.sound.unlock();
      this.net.invite();
    });
    document.getElementById('btn-join').addEventListener('click', () => {
      this.sound.unlock();
      this.net.join(joinInput.value);
    });
    document.getElementById('btn-copy').addEventListener('click', () => this.copyInvite());
    document.getElementById('btn-cancel').addEventListener('click', () => this.leaveCoop(t('net.cancelled')));

    // системное «поделиться» есть на телефоне и по https, на остальном остаётся копирование
    const shareBtn = document.getElementById('btn-share');
    if (navigator.share) {
      shareBtn.addEventListener('click', () => this.shareInvite());
    } else {
      shareBtn.classList.add('hidden');
    }
    joinInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        this.net.join(joinInput.value);
      }
    });

    // ссылку с приглашением можно просто открыть — подключаемся сразу.
    // hashchange нужен на случай, когда игра уже открыта и ссылку вставили в адрес
    const joinFromHash = () => {
      const fromLink = location.hash.match(/r=([a-z0-9]+)/i);
      if (fromLink && this.net.role === 'solo') {
        this.net.join(fromLink[1]);
      }
    };
    window.addEventListener('hashchange', joinFromHash);
    joinFromHash();

    // приглашение с площадки CrazyGames приходит не в hash, а параметром их ссылки
    const cgRoom = CG.inviteParam('r');
    if (cgRoom && this.net.role === 'solo') {
      this.net.join(cgRoom);
    }
    // друг позвал уже открытую игру — подключаемся без перезагрузки страницы
    CG.onJoinRoom((token) => {
      if (this.net.token !== token) {
        this.net.join(token);
      }
    });
    // пати-лидер мгновенного мультиплеера сразу открывает комнату, к нему можно входить
    if (!cgRoom && CG.instantMultiplayer) {
      this.net.invite();
    }
  }

  onNetStatus(status, text) {
    this.netStatus = status;
    this.netMessage = text;
    this.lobbyStatus.textContent = text;
    this.lobbyStatus.dataset.status = status;
  }

  onNetInvite(invite) {
    this.invite = invite;
    this.inviteValue.value = invite;
    this.inviteBox.classList.remove('hidden');
    this.inviteValue.select();
    // комната открыта, но партия ждёт: сначала ссылку надо скопировать и отправить другу
    this.role = 'host';
    this.localIndex = 0;
  }

  onGuestJoin(slot) {
    // первый гость запускает партию, следующие подсаживаются в идущую волну
    if (this.mode !== MODE.playing && this.mode !== MODE.banner) {
      this.startGame();
    }
    const player = this.ensurePlayer(slot);
    this.rescaleDifficulty();
    this.say(player.x, player.y - 130, t('fx.joined', { name: player.name }), player.color, 24);
    this.fx('join', player.x, player.y - 40, player.color);
  }

  onGuestLeave(slot) {
    const player = this.players[slot];
    if (!player) {
      return;
    }
    player.active = false;
    player.charging = false;
    this.rescaleDifficulty();
    this.say(player.x, player.y - 130, t('fx.leftGame', { name: player.name }), '#b0a7d6', 22);
    this.fx('leave', player.x, player.y - 40);
  }

  // подключился ещё один — врагов должно стать больше уже в текущей волне
  rescaleDifficulty() {
    if (this.level) {
      return;
    }
    const before = this.difficulty.count;
    this.difficulty = difficultyFor(this.wave, this.activePlayers.length);
    const extra = this.difficulty.count - before;
    for (let i = 0; i < extra; i++) {
      this.queue.push({ type: pick(buildWave(this.wave, this.difficulty)).type, hunted: false });
    }
  }

  // игрок появляется в бою в момент подключения, а не с начала волны
  ensurePlayer(slot) {
    while (this.players.length <= slot) {
      const player = new Player(this.players.length);
      this.applyPerks(player);
      this.players.push(player);
    }
    const player = this.players[slot];
    player.active = true;
    player.hp = Math.max(player.hp, 2);
    player.invuln = CONFIG.invulnTime;
    return player;
  }

  copyInvite() {
    this.inviteValue.select();
    const done = () => this.onNetStatus('waiting', t('net.copied'));
    if (navigator.clipboard && location.protocol !== 'file:') {
      navigator.clipboard.writeText(this.invite).then(done, () => {});
      return;
    }
    // из file:// буфер обмена недоступен, остаётся выделить текст
    this.onNetStatus('waiting', t('net.copyManual'));
  }

  shareInvite() {
    navigator.share({ text: t('net.shareText'), url: this.invite })
      .then(() => this.onNetStatus('waiting', t('net.shared')), () => {});
  }

  // возврат в обычное меню: комната закрывается, роль снова одиночная
  leaveCoop(text) {
    this.net.close();
    this.inviteBox.classList.add('hidden');
    this.role = 'solo';
    this.localIndex = 0;
    this.onNetStatus('offline', text);
  }

  retryCoop() {
    if (this.net.role === 'host') {
      this.net.invite(this.net.token);
      return;
    }
    this.net.join(this.net.token);
  }

  onNetOpen(role, slot) {
    this.role = role;
    this.localIndex = role === 'host' ? 0 : slot;
    this.inviteBox.classList.add('hidden');
    this.lobby.classList.add('hidden');
    // звук подключения гость услышит из события хоста, дважды играть не надо
  }

  onNetClose() {
    if (this.role !== 'solo') {
      this.sound.playerLeave();
    }
    if (this.role === 'guest') {
      this.reset();
    }
    this.role = 'solo';
    this.localIndex = 0;
    this.lobby.classList.remove('hidden');
  }

  onNetData(data, slot) {
    if (data.t === 'i' && this.role === 'host') {
      this.remoteInputs[slot] = { m: data.m, a: data.a, c: data.c, tx: data.tx, p: data.p, j: Boolean(data.j) };
      return;
    }
    if (data.t === 's' && this.role === 'guest') {
      this.applySnapshot(data);
    }
  }

  // ---------- ввод ----------

  bindInput() {
    const canvas = this.canvas;

    canvas.addEventListener('pointermove', (e) => {
      const p = this.toCanvas(e);
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      if (this.touch.active && this.touch.id === e.pointerId) {
        this.touch.x = p.x;
        this.touch.y = p.y;
      }
    });

    canvas.addEventListener('pointerdown', (e) => {
      // захват указателя нужен, чтобы палец не «терялся» за краем поля
      if (canvas.setPointerCapture) {
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch (err) {
          // некоторые указатели захват не поддерживают — не критично
        }
      }
      const p = this.toCanvas(e);
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      this.sound.unlock();
      if (e.pointerType !== 'mouse') {
        this.touchUsed = true;
      }
      if (this.tapUi(p) || this.tapButton(p)) {
        return;
      }
      if (this.mode !== MODE.playing && this.mode !== MODE.banner) {
        return;
      }
      if (e.pointerType === 'mouse') {
        this.press();
        return;
      }
      // низ экрана — полоса бега, всё остальное — оттяжка и бросок
      const mode = p.y > CONFIG.height - CONFIG.moveBand ? 'move' : 'aim';
      this.touch = { active: true, mode, id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
    });

    const endTouch = (e) => {
      if (this.touch.active && this.touch.id === e.pointerId) {
        // угол и силу броска запоминаем на момент отрыва пальца
        if (this.touch.mode === 'aim') {
          const pull = this.pull();
          this.touchRelease = pull.ready ? { a: Math.atan2(pull.dy, pull.dx), p: pull.power } : null;
        }
        this.touch.active = false;
        return;
      }
      this.release();
    };
    canvas.addEventListener('pointerup', endTouch);
    canvas.addEventListener('pointercancel', endTouch);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // iOS Safari тащит страницу за пальцем и зумит по двойному тапу, из-за чего целиться невозможно.
    // touch-action в CSS он уважает не всегда, поэтому глушим сами жесты; игру ведут pointer-события
    for (const kind of ['touchstart', 'touchmove']) {
      canvas.addEventListener(kind, (e) => e.preventDefault(), { passive: false });
    }

    window.addEventListener('keydown', (e) => {
      if (e.repeat) {
        return;
      }
      this.keys.add(e.code);
      // пробел — прыжок, бросок остался на мыши
      if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
        e.preventDefault();
        this.sound.unlock();
        this.jumpQueued = true;
      }
      // Esc не трогаем: на площадке он выводит из полноэкранного режима
      if (e.code === 'KeyP') {
        this.togglePause();
      }
      if (e.code === 'KeyM') {
        const muted = this.sound.toggleMute();
        this.say(CONFIG.width - 90, 150, t(muted ? 'hud.soundOff' : 'hud.soundOn'), '#fff3d6', 20);
      }
      if (e.code === 'KeyR') {
        if (this.mode === MODE.over && this.role !== 'guest') {
          this.startGame();
        } else if (this.mode === MODE.result) {
          this.restartLevel();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pressed = false;
      if (this.mode === MODE.playing && this.role === 'solo') {
        this.mode = MODE.paused;
      }
    });
  }

  toCanvas(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CONFIG.width,
      y: ((e.clientY - rect.top) / rect.height) * CONFIG.height,
    };
  }

  press() {
    if (this.mode !== MODE.playing && this.mode !== MODE.banner) {
      return;
    }
    this.pressed = true;
    if (!this.localPlayer.weapon.autoFire && !this.localPlayer.charging) {
      this.sound.charge();
    }
  }

  release() {
    this.pressed = false;
  }

  togglePause() {
    if (this.role !== 'solo') {
      return;
    }
    if (this.mode === MODE.playing || this.mode === MODE.banner) {
      this.mode = MODE.paused;
      this.pressed = false;
    } else if (this.mode === MODE.paused) {
      this.mode = MODE.playing;
    }
  }

  // общая часть старта: сброс, роли, мета-прокачка, спрятанное лобби
  prepareRun() {
    const role = this.role;
    const localIndex = this.localIndex;
    this.reset();
    this.role = role;
    this.localIndex = localIndex;
    // хост держит слоты для уже подключённых гостей
    if (role === 'host') {
      for (const guest of this.net.openGuests) {
        while (this.players.length <= guest.slot) {
          this.players.push(new Player(this.players.length));
        }
      }
    }
    for (const player of this.players) {
      this.applyPerks(player);
    }
    // новичку показываем, как бросать, пока он не бросит сам
    this.throwHint = this.save.fresh;
    // во время партии лобби только мешает, особенно на телефоне
    this.lobby.classList.add('hidden');
  }

  applyPerks(player) {
    player.maxHp = this.perks.maxHp;
    player.hp = player.maxHp;
    player.weapon = this.perks.weapon;
    player.ammo = this.perks.weapon.ammo;
  }

  startGame() {
    this.prepareRun();
    this.mode = MODE.playing;
    this.nextWave();
  }

  startLevel(gardenIndex, levelIndex) {
    this.prepareRun();
    const plan = levelPlan(gardenIndex, levelIndex);
    this.level = plan;
    // каждый уровень внутри сада — своё время суток, чтобы фон не повторялся
    this.palette = tintedPalette(plan.garden.palette, phaseFor(plan.levelIndex));
    this.difficulty = plan.difficulty;
    this.queue = buildLevelQueue(plan);
    this.spawnTimer = 0.5;
    this.wave = plan.number;
    this.baseWind = clamp(rand(-40, 40) * (1 + plan.number * 0.05), -170, 170);
    if (plan.garden.modifier === 'breeze') {
      this.baseWind *= 0.55;
    }
    this.wind = this.baseWind;
    this.levelKills = 0;
    this.objective = {
      kind: plan.objective,
      timeLeft: plan.seconds,
      huntedLeft: this.queue.filter((entry) => entry.hunted).length,
      escaped: 0,
      done: false,
    };
    this.bannerText = plan.boss ? t('boss.' + plan.garden.key) : t('objTitle.' + plan.objective);
    this.bannerSub = t('banner.stars', { goal: this.masteryGoal(plan).label });
    this.bannerTimer = CONFIG.bannerTime;
    this.mode = MODE.banner;
    this.fx('wave', CONFIG.width / 2, 200);
  }

  restartLevel() {
    if (this.level) {
      this.startLevel(this.level.gardenIndex, this.level.levelIndex);
    }
  }

  nextLevel() {
    if (!this.level) {
      return;
    }
    const next = this.level.levelIndex + 1;
    if (next < LEVELS_PER_GARDEN) {
      this.startLevel(this.level.gardenIndex, next);
      return;
    }
    const garden = this.level.gardenIndex + 1;
    if (garden < GARDENS.length) {
      this.gardenView = garden;
      this.startLevel(garden, 0);
      return;
    }
    this.openMap();
  }

  openMap() {
    this.mode = MODE.map;
    this.level = null;
    this.objective = null;
    this.palette = PALETTE;
    this.perks = this.save.perks();
    this.lobby.classList.add('hidden');
  }

  openMenu() {
    this.reset();
    this.best = this.save.best;
    this.mode = MODE.menu;
    if (this.role === 'solo') {
      this.lobby.classList.remove('hidden');
    }
  }

  // третья звезда своя у каждого типа уровня, иначе на охоте её просто не взять
  masteryGoal(plan) {
    if (plan.objective === 'survive') {
      return { key: 'kills', need: 6 + plan.levelIndex, label: t('goal.kills', { n: 6 + plan.levelIndex }) };
    }
    if (plan.objective === 'clear' || plan.objective === 'hunt') {
      return { key: 'noescape', label: t('goal.noEscape') };
    }
    return { key: 'combo', label: t('goal.combo') };
  }

  levelGoals(plan) {
    const mastery = this.masteryGoal(plan);
    const escaped = this.objective ? this.objective.escaped : 0;
    let done = false;
    if (mastery.key === 'kills') {
      done = this.levelKills >= mastery.need;
    } else if (mastery.key === 'noescape') {
      done = escaped === 0;
    } else {
      done = this.bestCombo >= CONFIG.comboStep;
    }
    return [
      { label: t('goal.done'), done: true },
      { label: t('goal.noDamage'), done: !this.tookDamage },
      { label: mastery.key === 'kills' ? t('goal.killsProgress', { n: this.levelKills, need: mastery.need }) : mastery.label, done },
    ];
  }

  // очки звания принимает сохранение; повышение отмечаем фанфарами, экраны покажут строку
  grantXp(amount) {
    const before = this.save.rankIndex();
    this.save.addXp(amount);
    if (this.save.rankIndex() > before) {
      this.rankUp = RANKS[this.save.rankIndex()];
      this.sound.rankUp();
    }
    return amount;
  }

  // уровень пройден: считаем звёзды, семечки и очки звания, кладём в сохранение
  finishLevel(success, reason = '') {
    const plan = this.level;
    if (!plan || this.mode === MODE.result) {
      return;
    }
    const goals = this.levelGoals(plan);
    const stars = success ? goals.filter((goal) => goal.done).length : 0;
    const replay = this.save.done(plan.id);
    const seeds = success ? Math.round((15 + stars * 10) * (replay ? 0.3 : 1)) : 0;

    let xp = 0;
    if (success) {
      this.save.recordLevel(plan.id, stars, seeds);
      xp = this.grantXp(stars * 20 + this.levelKills);
      this.perks = this.save.perks();
      CG.happytime();
    }
    this.result = { success, stars, seeds, xp, rankUp: this.rankUp, reason, plan, goals };
    this.mode = MODE.result;
    this.fx(success ? 'wave' : 'over', CONFIG.width / 2, CONFIG.height / 2);
  }

  aimAngleFor(player) {
    const origin = player.aimOrigin;
    return Math.atan2(this.pointer.y - origin.y, this.pointer.x - origin.x);
  }

  // оттяжка пальцем: вектор от текущей точки к точке касания задаёт угол и силу
  pull() {
    const dx = this.touch.ox - this.touch.x;
    const dy = this.touch.oy - this.touch.y;
    const length = Math.hypot(dx, dy);
    return { dx, dy, length, power: clamp(length / CONFIG.maxPull, 0, 1), ready: length > CONFIG.minPull };
  }

  localInput() {
    const player = this.localPlayer;

    const jump = this.jumpQueued;

    if (this.touch.active && this.mode !== MODE.paused) {
      if (this.touch.mode === 'move') {
        return { m: 0, tx: this.touch.x, a: player.aim, c: false, p: null, j: jump };
      }
      const pull = this.pull();
      return {
        m: 0,
        tx: null,
        a: pull.ready ? Math.atan2(pull.dy, pull.dx) : player.aim,
        c: pull.ready,
        p: pull.power,
        j: jump,
      };
    }

    // кадр отрыва пальца: бросок уходит по запомненной оттяжке, а не по курсору
    if (this.touchRelease) {
      return { m: 0, tx: null, a: this.touchRelease.a, c: false, p: this.touchRelease.p, j: jump };
    }

    const move = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0)
      - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    return { m: move, tx: null, a: this.aimAngleFor(player), c: this.pressed, p: null, j: jump };
  }

  consumeInput() {
    const input = this.localInput();
    this.touchRelease = null;
    this.jumpQueued = false;
    return input;
  }

  // прыжок, пауза и звук прямо на поле: без них на телефоне до них не добраться.
  // раскладка идёт от правого края влево, между кнопками всегда один и тот же зазор
  buttonRects() {
    const size = 46;
    const pad = 12;
    const jumpWidth = size + 12;
    const y = CONFIG.height - size - pad;
    const rects = {};
    let right = CONFIG.width - pad;
    // в коопе партия идёт у всех сразу, остановить её нельзя — и кнопки паузы там нет
    if (this.role === 'solo') {
      rects.pause = { x: right - size, y, w: size, h: size };
      right -= size + pad;
    }
    rects.mute = { x: right - size, y, w: size, h: size };
    right -= size + pad;
    rects.jump = { x: right - jumpWidth, y, w: jumpWidth, h: size };
    return rects;
  }

  tapButton(p) {
    if (!this.isField()) {
      return false;
    }
    const rects = this.buttonRects();
    const inside = (r) => r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
    if (inside(rects.jump)) {
      this.jumpQueued = true;
      return true;
    }
    if (inside(rects.pause)) {
      this.togglePause();
      return true;
    }
    if (inside(rects.mute)) {
      this.sound.toggleMute();
      return true;
    }
    return false;
  }

  // ---------- оружие ----------

  throwShot(player, charge) {
    const weapon = player.weapon;
    const speed = lerp(CONFIG.minThrowSpeed, CONFIG.maxThrowSpeed, easeOutCubic(charge))
      * weapon.speedMul * (1 + (player.level - 1) * 0.06);

    const origin = player.aimOrigin;
    for (let i = 0; i < weapon.shots; i++) {
      const offset = weapon.shots === 1
        ? rand(-weapon.spread, weapon.spread)
        : (i - (weapon.shots - 1) / 2) * weapon.spread;
      const a = player.aim + offset;
      const shot = new Projectile(
        origin.x + Math.cos(a) * 36,
        origin.y + Math.sin(a) * 36,
        Math.cos(a) * speed,
        Math.sin(a) * speed,
        weapon,
        player.level,
        player.index,
      );
      shot.id = this.nextId++;
      this.shots.push(shot);
    }

    player.cooldown = weapon.cooldown * (1 - (player.level - 1) * 0.15) * this.perks.reloadMul;
    player.throwPose();
    this.fx('throw', player.x, player.y - 60);
    if (player === this.localPlayer) {
      this.throwHint = false;
    }

    if (weapon.ammo > 0) {
      player.ammo -= 1;
      if (player.ammo <= 0) {
        player.weapon = WEAPONS.potato;
        player.ammo = 0;
        this.say(player.x, player.y - 120, t('fx.outOfAmmo'), '#b0a7d6', 22);
      }
    }
  }

  nearestEnemy(x, y) {
    let best = null;
    let bestDist = Infinity;
    for (const enemy of this.enemies) {
      const d = (enemy.x - x) ** 2 + (enemy.y - y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = enemy;
      }
    }
    return best;
  }

  // урон по площади: взрыв ананаса и бомба-бонус
  blast(x, y, radius, damage, skip = null, owner = null) {
    this.fx('explode', x, y);
    this.waves.push(new Shockwave(x, y, radius));
    for (const enemy of this.enemies) {
      if (enemy === skip || enemy.dead) {
        continue;
      }
      if (circlesHit(x, y, radius, enemy.x, enemy.y, enemy.r) && enemy.hit(damage) === 'killed') {
        this.killEnemy(enemy, owner);
      }
    }
    for (const hazard of this.hazards) {
      if (hazard.kind !== 'peel' && circlesHit(x, y, radius, hazard.x, hazard.y, hazard.r)) {
        hazard.dead = true;
      }
    }
  }

  // ---------- атаки врагов ----------

  spawnHazard(kind, x, y, vx = 0, vy = 0) {
    const hazard = new Hazard(kind, x, y, vx, vy);
    hazard.id = this.nextId++;
    this.hazards.push(hazard);
    return hazard;
  }

  enemyAttack(enemy) {
    const kind = enemy.type.attack.kind === 'boss'
      ? pick(['splash', 'acid', 'seed', 'dive', 'pit'])
      : enemy.type.attack.kind;
    const x = enemy.x;
    const y = enemy.y + enemy.r * 0.6;

    if (kind === 'pit') {
      this.spawnHazard('pit', x, y, rand(-30, 30), 40);
      this.fx('pit', x, y);
      return;
    }

    if (kind === 'splash') {
      for (let i = -1; i <= 1; i++) {
        this.spawnHazard('juice', x, y, i * 130 + rand(-20, 20), 60);
      }
      this.fx('pit', x, y);
      return;
    }

    if (kind === 'seed') {
      const target = this.aliveTarget(enemy);
      const angle = Math.atan2(target.y - 46 - y, target.x - x);
      const speed = 400;
      this.spawnHazard('seed', x, y, Math.cos(angle) * speed, Math.sin(angle) * speed);
      this.fx('seed', x, y);
      return;
    }

    if (kind === 'acid') {
      this.spawnHazard('acid', x, y);
      this.fx('acid', x, y);
      return;
    }

    if (kind === 'peel') {
      this.spawnHazard('peel', x, y, rand(-40, 40), 30);
      this.fx('peel', x, y);
      return;
    }

    if (kind === 'dive') {
      const target = this.aliveTarget(enemy);
      enemy.startDive(target.x, target.y - 40);
      this.fx('dive', x, y);
    }
  }

  // враг целится в ближайшего живого игрока
  aliveTarget(enemy) {
    const alive = this.players.filter((p) => p.active && p.alive);
    if (alive.length === 0) {
      return this.players[0];
    }
    return alive.reduce((best, p) => (Math.abs(p.x - enemy.x) < Math.abs(best.x - enemy.x) ? p : best));
  }

  // ---------- бонусы ----------

  dropPickups(enemy) {
    const chance = enemy.type.dropChance * this.perks.dropMul;
    const count = chance >= 1 ? Math.floor(chance) : (Math.random() < chance ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const pickup = new Pickup(rollPickup(this.activePlayers), enemy.x + rand(-20, 20), enemy.y);
      pickup.id = this.nextId++;
      this.pickups.push(pickup);
    }
  }

  applyPickup(pickup, player) {
    const type = pickup.type;
    player.setMood('happy', 0.8);
    this.say(pickup.x, pickup.y - 30, t('pickup.' + type.key), type.color, 26);

    if (type.weapon) {
      const weapon = WEAPONS[type.weapon];
      if (player.weapon.key === weapon.key) {
        player.ammo += weapon.ammo;
      } else {
        player.weapon = weapon;
        player.ammo = weapon.ammo;
      }
      this.fx('upgrade', pickup.x, pickup.y, type.color);
      return;
    }

    if (type.key === 'heal') {
      if (player.hp < player.maxHp) {
        player.hp += 1;
      } else {
        this.score += 150;
      }
      this.fx('pickup', pickup.x, pickup.y, type.color);
      return;
    }

    if (type.key === 'shield') {
      player.shield = true;
      this.fx('pickup', pickup.x, pickup.y, type.color);
      return;
    }

    if (type.key === 'slow') {
      this.slowTimer = CONFIG.slowTime;
      this.fx('pickup', pickup.x, pickup.y, type.color);
      return;
    }

    if (type.key === 'bomb') {
      this.blast(CONFIG.width / 2, CONFIG.height / 2, 900, CONFIG.bombDamage, null, player);
      return;
    }

    if (type.key === 'wrench') {
      if (player.level < CONFIG.maxWeaponLevel) {
        player.level += 1;
        this.say(pickup.x, pickup.y - 60, t('fx.weaponLevel', { n: player.level }), '#c0f36b', 22);
      } else {
        this.score += 250;
      }
      this.fx('upgrade', pickup.x, pickup.y, type.color);
    }
  }

  // ---------- события, урон, очки ----------

  // звук + частицы в одном месте: хост пересылает событие гостю, чтобы картинка совпадала
  fx(kind, x, y, color = '#ffd166') {
    switch (kind) {
      case 'kill':
        this.sound.splat();
        this.burst(x, y, color, 20);
        break;
      case 'gold':
        this.sound.gold();
        this.burst(x, y, '#ffd700', 26);
        break;
      case 'hit':
        this.sound.pop();
        this.burst(x, y, '#c0f36b', 8);
        break;
      case 'blocked':
        this.sound.blocked();
        this.burst(x, y, '#ffb703', 10);
        break;
      case 'hurt':
        this.sound.hurt();
        this.burst(x, y, '#ff4d6d', 18);
        this.shake = 16;
        break;
      case 'save':
        this.sound.pop();
        this.burst(x, y, '#4ecdc4', 18);
        break;
      case 'slip':
        this.sound.slip();
        this.burst(x, y, '#ffd43b', 14);
        break;
      case 'explode':
        this.sound.explode();
        this.burst(x, y, '#ffd166', 26);
        this.shake = Math.max(this.shake, 14);
        break;
      case 'pickup':
        this.sound.pickup();
        this.burst(x, y, color, 14);
        break;
      case 'upgrade':
        this.sound.upgrade();
        this.burst(x, y, color, 14);
        break;
      case 'rage':
        this.sound.rage();
        this.burst(x, y, '#ff7b2d', 26);
        this.shake = Math.max(this.shake, 10);
        break;
      case 'throw':
        this.sound.throwShot(0.6);
        break;
      case 'jump':
        this.sound.jump();
        break;
      case 'join':
        this.sound.playerJoin();
        this.burst(x, y, color, 18);
        break;
      case 'leave':
        this.sound.playerLeave();
        this.burst(x, y, '#b0a7d6', 12);
        break;
      case 'pit':
        this.sound.pit();
        break;
      case 'seed':
        this.sound.seedShot();
        break;
      case 'acid':
        this.sound.acid();
        break;
      case 'peel':
        this.sound.peel();
        break;
      case 'dive':
        this.sound.dive();
        break;
      case 'wave':
        this.sound.waveUp();
        break;
      case 'over':
        this.sound.gameOver();
        break;
      default:
        break;
    }
    if (this.role === 'host') {
      this.events.push([kind, Math.round(x), Math.round(y), color]);
    }
  }

  say(x, y, text, color = '#fff3d6', size = 26) {
    this.texts.push(new FloatText(x, y, text, color, size));
    if (this.role === 'host') {
      this.newTexts.push([Math.round(x), Math.round(y), text, color, size]);
    }
  }

  burst(x, y, color, count = 14) {
    for (let i = 0; i < count; i++) {
      this.particles.push(new Particle(x, y, { color, r: rand(3, 9) }));
    }
  }

  damagePlayer(player, x, y) {
    if (player.invuln > 0 || !player.alive) {
      return;
    }
    if (player.shield) {
      player.shield = false;
      player.invuln = CONFIG.shieldInvulnTime;
      player.setMood('scared', 0.7);
      this.fx('save', x, y);
      this.say(x, y - 40, t('fx.shieldSaved'), '#4ecdc4', 26);
      return;
    }

    player.hp -= 1;
    player.invuln = CONFIG.invulnTime;
    player.setMood('hurt', 1);
    if (!player.raging) {
      // удар выбивает половину накопленной злости
      player.rage *= 0.5;
    }
    this.tookDamage = true;
    this.combo = 0;
    this.fx('hurt', x, y);
    this.say(x, y - 40, t('fx.damage'), '#ff4d6d', 30);

    if (player.hp <= 0) {
      player.hp = 0;
      player.charging = false;
      this.say(x, y - 70, t('fx.down', { name: player.name }), '#ff4d6d', 24);
      if (this.activePlayers.every((p) => !p.alive)) {
        this.endGame();
      }
    }
  }

  slipPlayer(player, x) {
    if (player.slip > 0 || !player.alive) {
      return;
    }
    player.slip = CONFIG.slipTime;
    player.charging = false;
    this.fx('slip', x, CONFIG.groundY - 20);
    this.say(x, CONFIG.groundY - 90, t('fx.slipped'), '#ffd43b', 24);
  }

  endGame() {
    // в кампании смерть — это провал уровня, а не конец игры
    if (this.level) {
      this.finishLevel(false, t('fail.dead'));
      return;
    }
    this.mode = MODE.over;
    if (this.role === 'solo') {
      this.lobby.classList.remove('hidden');
    }
    this.fx('over', CONFIG.width / 2, CONFIG.height / 2);
    const record = this.save.recordEndless(this.score, this.wave);
    this.earnedSeeds = record.seeds;
    this.lastPlace = record.place;
    this.earnedXp = this.grantXp(this.wave * 12 + Math.round(this.score / 50));
    this.best = this.save.best;
    this.perks = this.save.perks();
  }

  spawnEnemy(type, entry = {}) {
    const enemy = new Enemy(type, this.wave, this.difficulty);
    enemy.id = this.nextId++;
    enemy.hunted = Boolean(entry.hunted);
    if (entry.skin) {
      enemy.sprite = entry.skin.sprite;
    }
    this.enemies.push(enemy);
    return enemy;
  }

  // сбитый фрукт наполняет шкалу ярости того, кто его сбил
  addRage(player, amount) {
    if (!player || !player.active || !player.alive || player.raging) {
      return;
    }
    player.rage = Math.min(1, player.rage + amount);
    if (player.rage >= 1) {
      player.rageTimer = CONFIG.rageTime;
      this.fx('rage', player.x, player.y - 80);
      this.say(player.x, player.y - 130, t('fx.rage'), '#ff7b2d', 30);
    }
  }

  killEnemy(enemy, owner = null) {
    const gained = enemy.type.score * this.multiplier;
    this.score += gained;
    this.killed += 1;
    this.levelKills += 1;
    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.shake = enemy.isBoss ? 22 : 8;
    // добитый босс бесконечного режима — удачный момент; в кампании его отметит пройденный уровень
    if (enemy.isBoss && !this.level) {
      CG.happytime();
    }
    this.fx(enemy.type.key === 'pear' ? 'gold' : 'kill', enemy.x, enemy.y, enemy.type.tint);
    this.say(enemy.x, enemy.y, '+' + formatScore(gained), enemy.type.tint, enemy.isBoss ? 40 : 26);
    this.dropPickups(enemy);
    if (owner) {
      owner.setMood('happy', 0.7);
      this.addRage(owner, enemy.isBoss ? 0.3 : CONFIG.ragePerKill);
    }

    if (enemy.hunted && this.objective) {
      this.objective.huntedLeft -= 1;
      this.say(enemy.x, enemy.y - 44, t('fx.targetDown'), '#ff4d6d', 24);
    }

    // модификаторы сада: сок сбитого фрукта капает вниз и растекается лужей, гнильё брызжет в стороны
    if (this.modifier === 'puddles' && !enemy.isBoss) {
      this.spawnHazard('drip', enemy.x, Math.min(enemy.y, CONFIG.groundY - 60), rand(-25, 25), 40);
    }
    if (this.modifier === 'rotten') {
      for (let i = -1; i <= 1; i++) {
        this.spawnHazard('juice', enemy.x, enemy.y, i * 150 + rand(-30, 30), rand(-60, 40));
      }
    }

    // черника рассыпается на мелкие ягоды — добивать придётся отдельно
    if (enemy.type.splitsInto) {
      for (let i = 0; i < enemy.type.splitsInto.count; i++) {
        const berry = this.spawnEnemy(ENEMY_TYPES[enemy.type.splitsInto.type]);
        berry.x = enemy.x + rand(-30, 30);
        berry.baseY = clamp(enemy.y + rand(-20, 20), CONFIG.enemyBand[0], CONFIG.enemyBand[1]);
        berry.y = berry.baseY;
        berry.dir = Math.random() < 0.5 ? 1 : -1;
      }
    }

    if (this.multiplier > 1) {
      this.say(enemy.x, enemy.y + 30, 'x' + this.multiplier, '#ffd166', 22);
    }
  }

  nextWave() {
    this.wave += 1;
    this.difficulty = difficultyFor(this.wave, this.activePlayers.length);
    // в бесконечном режиме каждая волна — новый сад и новое время суток
    const garden = GARDENS[(this.wave - 1) % GARDENS.length];
    this.palette = tintedPalette(garden.palette, phaseFor(this.wave - 1));
    this.queue = buildWave(this.wave, this.difficulty);
    this.spawnTimer = 0.4;
    this.wind = clamp(rand(-45, 45) * (1 + this.wave * 0.12), -190, 190);
    this.bannerText = t(this.wave % CONFIG.bossEvery === 0 ? 'banner.waveBoss' : 'banner.wave', { n: this.wave });
    this.bannerTimer = CONFIG.bannerTime;
    this.mode = MODE.banner;
    this.fx('wave', CONFIG.width / 2, 200);

    // выбывший напарник возвращается в строй на новой волне
    for (const player of this.activePlayers) {
      if (!player.alive) {
        player.hp = 2;
        player.invuln = CONFIG.invulnTime;
        this.say(player.x, player.y - 90, t('fx.revived', { name: player.name }), '#8ef6c5', 24);
      }
    }
  }

  // условия победы у каждого типа уровня свои
  updateObjective(dt) {
    const objective = this.objective;
    if (!objective || objective.done) {
      return;
    }

    if (objective.kind === 'survive') {
      objective.timeLeft -= dt;
      // поток не иссякает: подсыпаем фрукты, пока не выйдет время
      if (this.queue.length < 3) {
        for (let i = 0; i < 4; i++) {
          this.queue.push({ type: ENEMY_TYPES[pick(this.level.garden.pool)], hunted: false });
        }
      }
      if (objective.timeLeft <= 0) {
        objective.done = true;
        this.finishLevel(true);
      }
      return;
    }

    if (objective.kind === 'hunt' && objective.huntedLeft <= 0) {
      objective.done = true;
      this.finishLevel(true);
      return;
    }

    if (this.queue.length === 0 && this.enemies.length === 0) {
      objective.done = true;
      this.finishLevel(true);
    }
  }

  // ---------- обновление ----------

  updatePlayer(player, input, dt) {
    if (!player.alive) {
      player.charging = false;
      return;
    }
    player.aim = input.a;

    // прыжок одноразовый: гасим флаг сразу, иначе он сработает ещё раз при посадке
    if (input.j) {
      input.j = false;
      if (player.jump()) {
        this.fx('jump', player.x, player.y);
      }
    }

    if (input.c && !player.charging && player.cooldown <= 0) {
      player.charging = true;
      player.charge = input.p != null ? input.p : 0;
    }
    if (!input.c && player.charging) {
      player.charging = false;
      if (!player.weapon.autoFire && !player.raging) {
        this.throwShot(player, player.charge);
      }
      player.charge = 0;
    }

    // палец на полосе бега задаёт точку, к которой игрок идёт сам
    let move = input.m;
    if (input.tx != null) {
      move = clamp((input.tx - player.x) / 18, -1, 1);
    }
    player.update(dt, move);

    // сила оттяжки приходит готовой, накапливать её по времени не нужно
    if (input.p != null && player.charging) {
      player.charge = clamp(input.p, 0, 1);
    }

    // скорострельное оружие лупит очередью, пока держат кнопку; в ярости так работает всё
    if (player.charging && (player.weapon.autoFire || player.raging) && player.cooldown <= 0) {
      this.throwShot(player, player.raging ? 1 : 0.85);
    }
  }

  update(dt) {
    this.time += dt;

    for (const cloud of this.clouds) {
      cloud.x += cloud.v * dt * 0.4;
      if (cloud.x - 90 * cloud.s > CONFIG.width) {
        cloud.x = -90 * cloud.s;
        cloud.y = rand(40, 300);
      }
    }

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 40);
    }

    for (const list of [this.particles, this.texts, this.waves]) {
      for (const item of list) {
        item.update(dt);
      }
    }
    this.particles = this.particles.filter((p) => !p.dead);
    this.texts = this.texts.filter((t) => !t.dead);
    this.waves = this.waves.filter((w) => !w.dead);

    if (this.role === 'guest') {
      this.updateGuest(dt);
      return;
    }

    if (this.mode !== MODE.playing && this.mode !== MODE.banner) {
      return;
    }

    if (this.mode === MODE.banner) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) {
        this.mode = MODE.playing;
      }
    }

    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
    }
    const slowDt = dt * this.slowFactor;

    // свой игрок берёт локальный ввод, остальные — присланный по сети
    this.players.forEach((player, i) => {
      if (!player.active) {
        return;
      }
      const input = i === this.localIndex ? this.consumeInput() : (this.remoteInputs[i] || IDLE_INPUT);
      this.updatePlayer(player, input, dt);
      player.animate(dt);
    });

    // ливень гоняет ветер туда-сюда прямо посреди уровня
    if (this.modifier === 'rain') {
      this.wind = this.baseWind + Math.sin(this.time * 0.55) * 110;
    }

    if (this.queue.length > 0) {
      this.spawnTimer -= slowDt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = this.difficulty.spawnInterval * rand(0.75, 1.25);
        const entry = this.queue.shift();
        this.spawnEnemy(entry.type, entry);
        // с шестого уровня фрукты начинают лететь парами
        if (this.wave >= 6 && this.queue.length > 0 && Math.random() < 0.35) {
          const extra = this.queue.shift();
          this.spawnEnemy(extra.type, extra);
        }
      }
    } else if (!this.level && this.enemies.length === 0 && this.mode === MODE.playing) {
      this.say(CONFIG.width / 2, 200, t('fx.waveClear'), '#8ef6c5', 34);
      this.score += 50 * this.wave;
      this.nextWave();
    }

    if (this.level && this.mode === MODE.playing) {
      this.updateObjective(dt);
    }

    for (const enemy of this.enemies) {
      enemy.update(slowDt, this);
      if (enemy.escaped) {
        this.combo = 0;
        this.score = Math.max(0, this.score - CONFIG.escapePenalty);
        this.say(clamp(enemy.x, 90, CONFIG.width - 90), enemy.y, t('fx.escaped'), '#b0a7d6', 22);
        if (this.objective && !this.objective.done) {
          this.objective.escaped += 1;
          if (enemy.hunted) {
            this.finishLevel(false, t('fail.hunted'));
          } else if (this.objective.kind === 'defend') {
            this.finishLevel(false, t('fail.escape'));
          }
        }
      }
      for (const player of this.players) {
        if (enemy.mode !== 'dive' || enemy.dead || !player.active || !player.alive) {
          continue;
        }
        if (!circlesHit(enemy.x, enemy.y, enemy.r * 0.85, player.x, player.y - 40, player.r)) {
          continue;
        }
        this.damagePlayer(player, player.x, player.y - 40);
        // босс о героя не разбивается: таран стоит ему одной жизни, как попадание, и он уходит наверх
        if (!enemy.isBoss) {
          this.burst(enemy.x, enemy.y, enemy.type.tint, 22);
          enemy.dead = true;
          continue;
        }
        if (enemy.hit(1) === 'killed') {
          this.killEnemy(enemy, player);
        } else {
          this.fx('hit', enemy.x, enemy.y);
          enemy.mode = 'recover';
        }
      }
    }

    for (const shot of this.shots) {
      const target = shot.weapon.homing ? this.nearestEnemy(shot.x, shot.y) : null;
      shot.update(dt, this.wind, target);
      for (const enemy of this.enemies) {
        if (enemy.dead || shot.dead) {
          continue;
        }
        if (circlesHit(shot.x, shot.y, shot.r, enemy.x, enemy.y, enemy.r)) {
          shot.dead = true;
          shot.hitSomething = true;
          const result = enemy.hit(shot.damage);
          if (result === 'blocked') {
            this.fx('blocked', shot.x, shot.y);
            this.say(enemy.x, enemy.y - enemy.r - 10, t('fx.blocked'), '#ffb703', 20);
            continue;
          }
          if (shot.weapon.blast) {
            this.blast(shot.x, shot.y, shot.weapon.blast, shot.damage, enemy, this.players[shot.owner]);
          }
          if (result === 'killed') {
            this.killEnemy(enemy, this.players[shot.owner]);
          } else {
            this.fx('hit', shot.x, shot.y);
          }
        }
      }
      if (shot.dead && !shot.hitSomething) {
        if (shot.weapon.blast) {
          this.blast(shot.x, clamp(shot.y, 0, CONFIG.groundY), shot.weapon.blast, shot.damage, null, this.players[shot.owner]);
        }
        this.burst(shot.x, clamp(shot.y, 0, CONFIG.groundY), '#6b4a86', 8);
        this.combo = 0;
      }
    }

    const landedDrips = [];
    for (const hazard of this.hazards) {
      hazard.update(slowDt, this.wind);
      // капля долетела до земли — на её месте растекается лужа
      if (hazard.kind === 'drip') {
        if (hazard.dead && hazard.landed) {
          landedDrips.push(hazard.x);
        }
        continue;
      }
      for (const player of this.players) {
        if (hazard.dead || !player.active || !player.alive) {
          continue;
        }
        if (!circlesHit(hazard.x, hazard.y, hazard.r, player.x, player.y - 40, player.r)) {
          continue;
        }
        // кожура не бьёт, а роняет игрока
        if (hazard.kind === 'peel') {
          if (hazard.landed) {
            hazard.dead = true;
            this.slipPlayer(player, hazard.x);
          }
          continue;
        }
        if (hazard.kind !== 'acid') {
          hazard.dead = true;
        }
        this.damagePlayer(player, player.x, player.y - 40);
      }
    }
    for (const x of landedDrips) {
      this.spawnHazard('puddle', x, CONFIG.groundY - 6);
    }

    // герой пугается того, что летит ему на голову
    for (const player of this.players) {
      if (!player.active || !player.alive) {
        continue;
      }
      let danger = this.enemies.some((enemy) => enemy.mode === 'dive'
        && Math.abs(enemy.x - player.x) < 170 && enemy.y < player.y - 20);
      if (!danger) {
        danger = this.hazards.some((hazard) => hazard.kind !== 'peel' && hazard.kind !== 'drip'
          && Math.abs(hazard.x - player.x) < 90 && hazard.y > player.y - 340 && hazard.y < player.y - 30);
      }
      if (danger) {
        player.scared = 0.4;
      }
    }

    for (const pickup of this.pickups) {
      pickup.update(dt, this.wind);
      for (const player of this.players) {
        if (pickup.dead || !player.active || !player.alive) {
          continue;
        }
        if (circlesHit(pickup.x, pickup.y, pickup.r, player.x, player.y - 40, player.r + this.perks.pickupRadius)) {
          pickup.dead = true;
          this.applyPickup(pickup, player);
        }
      }
    }

    this.enemies = this.enemies.filter((e) => !e.dead);
    this.shots = this.shots.filter((s) => !s.dead);
    this.hazards = this.hazards.filter((h) => !h.dead);
    this.pickups = this.pickups.filter((p) => !p.dead);

    if (this.role === 'host') {
      this.snapshotTimer -= dt;
      if (this.snapshotTimer <= 0) {
        this.snapshotTimer = 0.05;
        this.sendSnapshot();
      }
      this.aliveTimer -= dt;
      if (this.aliveTimer <= 0) {
        this.aliveTimer = 1;
        this.net.checkAlive();
      }
    }
  }

  // ---------- сетевой обмен ----------

  sendSnapshot() {
    this.net.broadcast({
      t: 's',
      ly: CONFIG.layout,
      m: this.mode,
      w: this.wave,
      sc: Math.round(this.score),
      bs: this.best,
      cb: this.combo,
      kl: this.killed,
      bc: this.bestCombo,
      wd: Math.round(this.wind),
      sl: round1(this.slowTimer),
      bn: this.bannerText,
      bt: round1(this.bannerTimer),
      st: this.difficulty.stars,
      q: this.queue.length,
      p: this.players.map((p) => [
        Math.round(p.x), round1(p.aim), p.charging ? 1 : 0, round1(p.charge), p.hp,
        p.shield ? 1 : 0, round1(p.slip), round1(p.invuln), round1(p.move),
        p.weapon.key, p.ammo, p.level, p.maxHp, Math.round(p.y), round1(p.throwAnim), p.active ? 1 : 0,
        round1(p.rage), round1(p.rageTimer), p.faceMood(),
      ]),
      e: this.enemies.map((e) => [e.id, e.type.key, Math.round(e.x), Math.round(e.y), e.hp, e.maxHp, round1(e.t), e.mode, e.shieldOn ? 1 : 0]),
      s: this.shots.map((s) => [s.id, s.weapon.key, Math.round(s.x), Math.round(s.y), Math.round(s.vx), Math.round(s.vy)]),
      h: this.hazards.map((h) => [h.id, h.kind, Math.round(h.x), Math.round(h.y), Math.round(h.r), round1(h.age), h.landed ? 1 : 0, Math.round(h.vx), Math.round(h.vy)]),
      k: this.pickups.map((k) => [k.id, k.type.key, Math.round(k.x), Math.round(k.y), round1(k.age), k.landed ? 1 : 0]),
      ev: this.events.splice(0, this.events.length),
      tx: this.newTexts.splice(0, this.newTexts.length),
    });
  }

  applySnapshot(snap) {
    if (snap.ly && snap.ly !== CONFIG.layout) {
      this.switchLayout(snap.ly);
      this.resize();
    }
    this.mode = snap.m;
    this.wave = snap.w;
    this.score = snap.sc;
    this.best = snap.bs;
    this.combo = snap.cb;
    this.killed = snap.kl;
    this.bestCombo = snap.bc;
    this.wind = snap.wd;
    this.slowTimer = snap.sl;
    this.bannerText = snap.bn;
    this.bannerTimer = snap.bt;
    this.difficulty = { ...this.difficulty, stars: snap.st };
    this.queue = new Array(snap.q);

    while (this.players.length < snap.p.length) {
      this.players.push(new Player(this.players.length));
    }
    snap.p.forEach((row, i) => {
      const p = this.players[i];
      p.tx = row[0];
      p.aim = row[1];
      p.charging = Boolean(row[2]);
      p.charge = row[3];
      p.hp = row[4];
      p.shield = Boolean(row[5]);
      p.slip = row[6];
      p.invuln = row[7];
      p.move = row[8];
      p.weapon = WEAPONS[row[9]];
      p.ammo = row[10];
      p.level = row[11];
      p.maxHp = row[12];
      p.ty = row[13];
      // фазу броска присылает хост: между снимками гость докручивает её сам в animate()
      p.throwAnim = row[14];
      p.active = Boolean(row[15]);
      p.rage = row[16];
      p.rageTimer = row[17];
      // лицо тоже присылает хост: у гостя нет чужих событий вроде подбора бонуса
      p.setMood(row[18], 0.25);
    });

    this.enemies = this.syncById(this.enemies, snap.e, (row) => {
      const enemy = new Enemy(ENEMY_TYPES[row[1]], 1, { speedMul: 1, attackMul: 1, hpBonus: 0 });
      enemy.id = row[0];
      enemy.x = row[2];
      enemy.y = row[3];
      return enemy;
    }, (enemy, row) => {
      enemy.tx = row[2];
      enemy.ty = row[3];
      enemy.hp = row[4];
      enemy.maxHp = row[5];
      enemy.t = row[6];
      enemy.mode = row[7];
      enemy.shieldOn = Boolean(row[8]);
    });

    this.shots = this.syncById(this.shots, snap.s, (row) => {
      const shot = new Projectile(row[2], row[3], row[4], row[5], WEAPONS[row[1]], 1);
      shot.id = row[0];
      return shot;
    }, (shot, row) => {
      shot.tx = row[2];
      shot.ty = row[3];
      shot.vx = row[4];
      shot.vy = row[5];
    });

    this.hazards = this.syncById(this.hazards, snap.h, (row) => {
      const hazard = new Hazard(row[1], row[2], row[3], row[7], row[8]);
      hazard.id = row[0];
      return hazard;
    }, (hazard, row) => {
      hazard.tx = row[2];
      hazard.ty = row[3];
      hazard.r = row[4];
      hazard.age = row[5];
      hazard.landed = Boolean(row[6]);
      hazard.vx = row[7];
      hazard.vy = row[8];
    });

    this.pickups = this.syncById(this.pickups, snap.k, (row) => {
      const pickup = new Pickup(PICKUP_TYPES[row[1]], row[2], row[3]);
      pickup.id = row[0];
      return pickup;
    }, (pickup, row) => {
      pickup.tx = row[2];
      pickup.ty = row[3];
      pickup.age = row[4];
      pickup.landed = Boolean(row[5]);
    });

    for (const [kind, x, y, color] of snap.ev) {
      this.fx(kind, x, y, color);
    }
    for (const [x, y, text, color, size] of snap.tx) {
      this.texts.push(new FloatText(x, y, text, color, size));
    }
  }

  // сопоставляем присланный список с локальными объектами по id
  syncById(current, rows, create, apply) {
    const byId = new Map(current.map((item) => [item.id, item]));
    return rows.map((row) => {
      const item = byId.get(row[0]) || create(row);
      apply(item, row);
      return item;
    });
  }

  updateGuest(dt) {
    const input = this.localInput();
    this.inputTimer -= dt;
    if (this.inputTimer <= 0) {
      this.inputTimer = 0.03;
      this.net.send({
        t: 'i',
        m: input.m,
        a: round1(input.a),
        c: input.c,
        tx: input.tx == null ? null : Math.round(input.tx),
        p: input.p == null ? null : round1(input.p),
        j: input.j,
      });
      this.touchRelease = null;
      // прыжок одноразовый: без сброса гость слал бы его в каждом пакете и скакал без остановки
      this.jumpQueued = false;
    }

    // между снимками сглаживаем и досчитываем движение сами
    for (const player of this.players) {
      if (player.tx !== undefined) {
        player.x = damp(player.x, player.tx, 18, dt);
        player.y = damp(player.y, player.ty, 20, dt);
        player.onGround = Math.abs(player.y - CONFIG.groundY) < 4;
      }
    }
    const local = this.localPlayer;
    if (local) {
      local.aim = input.a;
    }
    for (const player of this.players) {
      player.animate(dt);
    }
    for (const enemy of this.enemies) {
      enemy.x = damp(enemy.x, enemy.tx, 14, dt);
      enemy.y = damp(enemy.y, enemy.ty, 14, dt);
      enemy.t += dt;
    }
    for (const shot of this.shots) {
      shot.x = damp(shot.x + shot.vx * dt, shot.tx, 6, dt);
      shot.y = damp(shot.y + shot.vy * dt, shot.ty, 6, dt);
      shot.rot = Math.atan2(shot.vy, shot.vx) + Math.PI / 2;
    }
    for (const hazard of this.hazards) {
      if (hazard.kind !== 'acid' && !hazard.landed) {
        hazard.x += hazard.vx * dt;
        hazard.y += hazard.vy * dt;
      }
      hazard.x = damp(hazard.x, hazard.tx, 8, dt);
      hazard.y = damp(hazard.y, hazard.ty, 8, dt);
      hazard.age += dt;
    }
    for (const pickup of this.pickups) {
      pickup.x = damp(pickup.x, pickup.tx, 12, dt);
      pickup.y = damp(pickup.y, pickup.ty, 12, dt);
    }
  }

  // ---------- отрисовка ----------

  drawBackground(ctx) {
    const palette = this.palette;
    const sky = ctx.createLinearGradient(0, 0, 0, CONFIG.groundY);
    sky.addColorStop(0, palette.skyTop);
    sky.addColorStop(1, palette.skyBottom);
    ctx.fillStyle = sky;
    // с запасом за края: при тряске холст сдвинут, и точная заливка оставила бы полосу прошлого кадра
    ctx.fillRect(-24, -24, CONFIG.width + 48, CONFIG.height + 48);

    const night = this.modifier === 'night' || palette.dark;
    ctx.fillStyle = night ? 'rgba(230,235,255,.8)' : 'rgba(255,236,170,.85)';
    ctx.beginPath();
    ctx.arc(CONFIG.width - 150, 120, 54, 0, TAU);
    ctx.fill();

    // ночью небо в звёздах: положение считается от индекса, поэтому не мерцает
    if (night) {
      ctx.save();
      for (let i = 0; i < 46; i++) {
        const x = ((i * 137.5) % CONFIG.width);
        const y = ((i * 91.7) % (CONFIG.groundY * 0.55));
        ctx.globalAlpha = 0.35 + ((i * 37) % 10) / 20;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, 1 + ((i * 13) % 3) * 0.6, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    for (const cloud of this.clouds) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cloud.x, cloud.y, 26 * cloud.s, 0, TAU);
      ctx.arc(cloud.x + 28 * cloud.s, cloud.y + 6 * cloud.s, 20 * cloud.s, 0, TAU);
      ctx.arc(cloud.x - 26 * cloud.s, cloud.y + 8 * cloud.s, 17 * cloud.s, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    for (const layer of [{ c: palette.hillFar, h: 120, o: 0 }, { c: palette.hillNear, h: 80, o: 140 }]) {
      ctx.fillStyle = layer.c;
      ctx.beginPath();
      ctx.moveTo(0, CONFIG.groundY);
      for (let x = 0; x <= CONFIG.width; x += 40) {
        const y = CONFIG.groundY - layer.h - Math.sin((x + layer.o) * 0.006) * 40;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(CONFIG.width, CONFIG.groundY);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = palette.ground;
    ctx.fillRect(0, CONFIG.groundY, CONFIG.width, CONFIG.height - CONFIG.groundY);
    ctx.fillStyle = palette.groundTop;
    ctx.fillRect(0, CONFIG.groundY, CONFIG.width, 6);
  }

  // ночь и ливень — самые заметные модификаторы садов, рисуем их поверх сцены
  drawModifierOverlay(ctx) {
    if (this.modifier === 'night') {
      if (!this.nightCanvas) {
        this.nightCanvas = document.createElement('canvas');
      }
      const night = this.nightCanvas;
      if (night.width !== CONFIG.width || night.height !== CONFIG.height) {
        night.width = CONFIG.width;
        night.height = CONFIG.height;
      }
      const dark = night.getContext('2d');
      dark.setTransform(1, 0, 0, 1, 0, 0);
      dark.clearRect(0, 0, night.width, night.height);
      dark.fillStyle = 'rgba(4,3,18,.9)';
      dark.fillRect(0, 0, night.width, night.height);
      dark.globalCompositeOperation = 'destination-out';

      const hole = (x, y, radius) => {
        const glow = dark.createRadialGradient(x, y, radius * 0.12, x, y, radius);
        glow.addColorStop(0, 'rgba(0,0,0,1)');
        glow.addColorStop(0.55, 'rgba(0,0,0,.8)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        dark.fillStyle = glow;
        dark.beginPath();
        dark.arc(x, y, radius, 0, TAU);
        dark.fill();
      };
      for (const player of this.players) {
        if (player.alive) {
          hole(player.x, player.y - 70, CONFIG.layout === 'portrait' ? 380 : 300);
        }
      }
      for (const pickup of this.pickups) {
        hole(pickup.x, pickup.y, 80);
      }
      for (const shot of this.shots) {
        hole(shot.x, shot.y, 90);
      }
      dark.globalCompositeOperation = 'source-over';
      ctx.drawImage(night, 0, 0);
    }

    if (this.modifier === 'rain') {
      ctx.save();
      ctx.strokeStyle = 'rgba(190,220,255,.32)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 70; i++) {
        const seed = i * 97.13;
        const x = ((seed * 7 + this.time * 140 + this.wind * 1.4) % (CONFIG.width + 240)) - 120;
        const y = ((seed * 13 + this.time * (760 + (i % 7) * 90)) % (CONFIG.height + 120)) - 60;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - this.wind * 0.05 - 3, y + 24);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // пунктирный прогноз полёта — считаем той же физикой, что и настоящий бросок
  // полоса бега и кнопки — только для пальца, мышь их не трогает
  drawTouchControls(ctx) {
    if (!this.isField()) {
      return;
    }

    if (CONFIG.layout === 'portrait' || this.touchUsed) {
      const bandY = CONFIG.height - CONFIG.moveBand;
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,.05)';
      ctx.fillRect(0, bandY, CONFIG.width, CONFIG.moveBand);
      ctx.strokeStyle = 'rgba(255,255,255,.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, bandY);
      ctx.lineTo(CONFIG.width, bandY);
      ctx.stroke();
      if (!this.touchUsed) {
        ctx.fillStyle = 'rgba(255,243,214,.5)';
        ctx.font = '600 15px "Segoe UI", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t('hud.runBand'), CONFIG.width / 2, bandY + CONFIG.moveBand / 2);
      }
      ctx.restore();
    }

    const rects = this.buttonRects();
    ctx.save();
    for (const [key, rect] of Object.entries(rects)) {
      ctx.fillStyle = key === 'jump' ? 'rgba(78,205,196,.35)' : 'rgba(10,8,23,.45)';
      roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 12);
      ctx.fill();
      const icon = key === 'jump'
        ? 'arrow-up'
        : key === 'pause'
          ? (this.mode === MODE.paused ? 'play' : 'pause')
          : (this.sound.muted ? 'sound-off' : 'sound-on');
      drawIcon(ctx, icon, rect.x + rect.w / 2, rect.y + rect.h / 2, 24, PALETTE.hud);
    }
    ctx.restore();
  }

  // подсказка первого броска: на тач-экране от кисти героя раз за разом уходит назад «палец»
  // с резинкой, на десктопе к ближайшему фрукту бежит пунктир; над головой — одна строка
  drawThrowHint(ctx) {
    if (!this.throwHint || this.role === 'guest' || !this.isField() || this.mode === MODE.paused
      || this.touch.active || this.pressed) {
      return;
    }
    const player = this.localPlayer;
    const origin = player.aimOrigin;
    const touch = CONFIG.layout === 'portrait' || this.touchUsed;
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,209,102,.75)';
    ctx.setLineDash([8, 8]);
    if (touch) {
      // цикл 1.6 с: палец оттягивается назад-вниз, замирает и растворяется
      const k = (this.time % 1.6) / 1.6;
      const reach = 30 + 110 * easeOutCubic(Math.min(1, k / 0.6));
      const tip = { x: origin.x - reach * 0.94, y: origin.y + reach * 0.34 };
      ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 12, 0, TAU);
      ctx.fill();
    } else {
      const target = this.nearestEnemy(origin.x, origin.y);
      const a = target ? Math.atan2(target.y - origin.y, target.x - origin.x) : -Math.PI / 4;
      ctx.lineDashOffset = -this.time * 60;
      ctx.beginPath();
      ctx.moveTo(origin.x + Math.cos(a) * 40, origin.y + Math.sin(a) * 40);
      ctx.lineTo(origin.x + Math.cos(a) * 160, origin.y + Math.sin(a) * 160);
      ctx.stroke();
    }

    const label = t(touch ? 'hint.throwTouch' : 'hint.throwMouse');
    const size = CONFIG.layout === 'portrait' ? 18 : 20;
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.font = '700 ' + size + 'px "Segoe UI", system-ui, sans-serif';
    const width = ctx.measureText(label).width + 28;
    const cx = clamp(origin.x, width / 2 + 10, CONFIG.width - width / 2 - 10);
    const cy = player.y - 190;
    ctx.fillStyle = 'rgba(10,8,23,.6)';
    roundRect(ctx, cx - width / 2, cy - 19, width, 38, 12);
    ctx.fill();
    ctx.restore();
    this.text(ctx, label, cx, cy, { size, color: '#ffd166' });
  }

  // резинка рогатки: линия от игрока к пальцу и метка точки касания
  drawPull(ctx) {
    if (!this.touch.active || this.touch.mode !== 'aim') {
      return;
    }
    const player = this.localPlayer;
    const pull = this.pull();
    ctx.save();
    ctx.strokeStyle = pull.ready ? 'rgba(255,209,102,.75)' : 'rgba(255,255,255,.3)';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    const origin = player.aimOrigin;
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(this.touch.x, this.touch.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(this.touch.ox, this.touch.oy, 26, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = pull.ready ? '#ffd166' : 'rgba(255,255,255,.4)';
    ctx.beginPath();
    ctx.arc(this.touch.x, this.touch.y, 10, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawTrajectory(ctx) {
    const player = this.localPlayer;
    const aiming = player && (player.charging || this.pressed || (this.touch.active && this.touch.mode === 'aim'));
    if (!player || !player.alive || !aiming) {
      return;
    }
    const weapon = player.weapon;
    const touching = this.touch.active && this.touch.mode === 'aim';
    const pull = touching ? this.pull() : null;
    const charge = player.raging ? 1 : weapon.autoFire ? 0.85 : (touching ? pull.power : player.charge);
    const speed = lerp(CONFIG.minThrowSpeed, CONFIG.maxThrowSpeed, easeOutCubic(charge))
      * weapon.speedMul * (1 + (player.level - 1) * 0.06);
    const angle = touching ? (pull.ready ? Math.atan2(pull.dy, pull.dx) : player.aim) : this.aimAngleFor(player);
    const origin = player.aimOrigin;
    let x = origin.x + Math.cos(angle) * 36;
    let y = origin.y + Math.sin(angle) * 36;
    let vx = Math.cos(angle) * speed;
    let vy = Math.sin(angle) * speed;
    const dt = 1 / 60;

    for (let i = 0; i < 70; i++) {
      vy += CONFIG.gravity * weapon.gravityMul * dt;
      vx += this.wind * dt;
      x += vx * dt;
      y += vy * dt;
      if (y > CONFIG.groundY || x < 0 || x > CONFIG.width) {
        break;
      }
      if (i % 4 === 0) {
        ctx.save();
        ctx.globalAlpha = 0.55 * (1 - i / 70);
        ctx.fillStyle = '#fff3d6';
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  drawWeaponHud(ctx) {
    const player = this.localPlayer;
    const x = 24;
    const y = CONFIG.height - 74;
    ctx.save();
    ctx.fillStyle = 'rgba(10,8,23,.45)';
    roundRect(ctx, x, y, 250, 54, 12);
    ctx.fill();

    drawSprite(ctx, player.weapon.sprite, x + 30, y + 27, 36);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '700 18px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = PALETTE.hud;
    ctx.fillText(t('weapon.' + player.weapon.key), x + 56, y + 24);

    ctx.font = '600 15px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,243,214,.75)';
    const ammo = player.weapon.ammo > 0 ? '×' + player.ammo : '∞';
    ctx.fillText(t('hud.ammo', { n: ammo }), x + 56, y + 44);

    ctx.textAlign = 'right';
    ctx.fillStyle = player.level > 1 ? '#c0f36b' : 'rgba(255,243,214,.5)';
    ctx.font = '700 17px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(t('hud.weaponLevel', { n: player.level }), x + 236, y + 34);
    ctx.restore();
  }

  objectiveText() {
    const objective = this.objective;
    if (objective.kind === 'survive') {
      return t('obj.survive', { n: Math.max(0, Math.ceil(objective.timeLeft)) });
    }
    if (objective.kind === 'hunt') {
      return t('obj.hunt', { n: Math.max(0, objective.huntedLeft) });
    }
    if (objective.kind === 'defend') {
      return t('obj.defend');
    }
    return t(objective.kind === 'boss' ? 'obj.boss' : 'obj.clear');
  }

  drawHud(ctx) {
    ctx.save();
    ctx.font = '700 28px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = PALETTE.hud;
    ctx.fillText(formatScore(this.score), 24, 20);

    ctx.font = '600 16px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,243,214,.7)';
    ctx.fillText(t('ui.best', { n: formatScore(this.best) }), 24, 54);

    const roster = this.activePlayers;
    const rowStep = roster.length > 2 ? 24 : 30;
    roster.forEach((player, i) => {
      const y = 96 + i * rowStep;
      if (roster.length > 1) {
        ctx.font = '700 14px "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = player.color;
        ctx.textBaseline = 'middle';
        ctx.fillText(player.name, 24, y);
      }
      const offset = roster.length > 1 ? 52 : 36;
      const heart = roster.length > 2 ? 17 : 21;
      for (let h = 0; h < player.maxHp; h++) {
        drawIcon(ctx, 'heart', offset + h * (heart + 4), y, heart, h < player.hp ? '#ff4d6d' : 'rgba(255,255,255,.25)');
      }
    });

    // правая колонка: строки собираем заранее, чтобы подложить под них плашку —
    // без неё текст терялся на солнце и облаках
    const big = '700 22px "Segoe UI", system-ui, sans-serif';
    const small = '600 16px "Segoe UI", system-ui, sans-serif';
    const dim = 'rgba(255,243,214,.7)';
    const dir = this.wind > 8 ? '→' : this.wind < -8 ? '←' : '·';
    const rows = [
      {
        text: this.level ? t('hud.level', { g: this.level.gardenIndex + 1, l: this.level.levelIndex + 1 }) : t('hud.wave', { n: this.wave }),
        font: big, y: 22, color: PALETTE.hud,
      },
      { text: t('hud.wind', { dir, n: Math.abs(Math.round(this.wind)) }), font: small, y: 52, color: dim },
      { text: t('hud.left', { n: this.queue.length + this.enemies.length }), font: small, y: 74, color: dim },
    ];
    if (this.objective) {
      rows.push({ text: this.objectiveText(), font: small, y: 118, color: '#8ef6c5' });
    }
    if (this.role !== 'solo') {
      rows.push({
        text: t(this.role === 'host' ? 'hud.host' : 'hud.guest'),
        font: small, y: this.objective ? 140 : 118, color: this.net.connected ? '#8ef6c5' : '#ff4d6d',
      });
    }

    // звёзды сложности: погасшие рисуем отдельным цветом, иначе они неотличимы;
    // в узком кадре подпись не влезает — оставляем одни звёзды
    const filled = '★'.repeat(this.difficulty.stars);
    const empty = '★'.repeat(5 - this.difficulty.stars);
    const label = CONFIG.layout === 'portrait' ? '' : t('hud.difficulty') + ' ';
    ctx.font = small;
    const emptyWidth = ctx.measureText(empty).width;
    const filledWidth = ctx.measureText(filled).width;
    let panelWidth = ctx.measureText(label).width + filledWidth + emptyWidth;
    for (const row of rows) {
      ctx.font = row.font;
      panelWidth = Math.max(panelWidth, ctx.measureText(row.text).width);
    }
    const bottom = Math.max(96, rows[rows.length - 1].y) + 30;
    ctx.fillStyle = 'rgba(10,8,23,.45)';
    roundRect(ctx, CONFIG.width - 38 - panelWidth, 12, panelWidth + 28, bottom - 12, 12);
    ctx.fill();

    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    for (const row of rows) {
      ctx.font = row.font;
      ctx.fillStyle = row.color;
      ctx.fillText(row.text, CONFIG.width - 24, row.y);
    }
    ctx.font = small;
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.fillText(empty, CONFIG.width - 24, 96);
    ctx.fillStyle = '#ffd166';
    ctx.fillText(filled, CONFIG.width - 24 - emptyWidth, 96);
    ctx.fillStyle = dim;
    ctx.fillText(label, CONFIG.width - 24 - emptyWidth - filledWidth, 96);

    if (this.combo >= CONFIG.comboStep) {
      ctx.textAlign = 'center';
      ctx.font = '800 30px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#ffd166';
      const pulse = 1 + Math.sin(this.time * 10) * 0.05;
      ctx.save();
      ctx.translate(CONFIG.width / 2, 34);
      ctx.scale(pulse, pulse);
      ctx.fillText(t('hud.combo', { n: this.multiplier }), 0, 0);
      ctx.restore();
    }
    ctx.restore();

    // шкала ярости: наполняется сбитыми фруктами, полная — идёт время буйства
    const ragePlayer = this.localPlayer;
    const rageY = 96 + roster.length * rowStep + 2;
    const rageK = ragePlayer.raging ? ragePlayer.rageTimer / CONFIG.rageTime : ragePlayer.rage;
    ctx.save();
    drawIcon(ctx, 'fire', 33, rageY + 5, ragePlayer.raging ? 21 : 17, ragePlayer.raging ? '#ffd166' : '#ff7b2d');
    ctx.fillStyle = 'rgba(10,8,23,.45)';
    roundRect(ctx, 46, rageY, 110, 10, 5);
    ctx.fill();
    if (rageK > 0) {
      ctx.fillStyle = ragePlayer.raging
        ? (Math.sin(this.time * 12) > 0 ? '#ffd166' : '#ff5a1f')
        : mixColor('#ff8c42', '#ff4d2d', rageK);
      roundRect(ctx, 46, rageY, 110 * clamp(rageK, 0, 1), 10, 5);
      ctx.fill();
    }
    ctx.restore();

    const effects = [];
    if (this.localPlayer.shield) {
      effects.push({ icon: 'shield', color: '#4ecdc4', text: t('hud.shield') });
    }
    if (this.slowTimer > 0) {
      effects.push({ icon: 'hourglass', color: '#8ecbff', text: this.slowTimer.toFixed(1) + 's' });
    }
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '600 16px "Segoe UI", system-ui, sans-serif';
    effects.forEach((effect, i) => {
      const y = rageY + 24 + i * 28;
      drawIcon(ctx, effect.icon, 36, y, 22, effect.color);
      ctx.fillStyle = PALETTE.hud;
      ctx.fillText(effect.text, 54, y + 1);
    });
    ctx.restore();

    this.drawWeaponHud(ctx);
  }

  isField() {
    return this.mode === MODE.playing || this.mode === MODE.banner || this.mode === MODE.paused;
  }

  // ---------- экранный интерфейс ----------

  dim(ctx, alpha = 0.72) {
    ctx.save();
    ctx.fillStyle = 'rgba(10,8,23,' + alpha + ')';
    ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
    ctx.restore();
  }

  text(ctx, value, x, y, opts = {}) {
    ctx.save();
    ctx.font = (opts.weight || 700) + ' ' + (opts.size || 20) + 'px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = opts.color || PALETTE.hud;
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = opts.baseline || 'middle';
    ctx.fillText(value, x, y);
    ctx.restore();
  }

  textWidth(ctx, value, size, weight = 700) {
    ctx.save();
    ctx.font = weight + ' ' + size + 'px "Segoe UI", system-ui, sans-serif';
    const width = ctx.measureText(value).width;
    ctx.restore();
    return width;
  }

  // кнопка рисуется и тут же попадает в список кликабельных зон текущего кадра
  uiButton(ctx, rect, opts) {
    const disabled = Boolean(opts.disabled);
    const primary = opts.tone === 'primary';
    ctx.save();
    // кнопки непрозрачные: сквозь полупрозрачные просвечивал герой, стоящий за меню
    ctx.fillStyle = disabled ? '#1c1834' : (primary ? '#4ecdc4' : '#110e24');
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 14);
    ctx.fill();
    if (!primary) {
      ctx.strokeStyle = disabled ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.22)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    const color = disabled ? 'rgba(255,243,214,.35)' : (primary ? '#10202a' : PALETTE.hud);
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    this.text(ctx, opts.label, cx, opts.sub ? cy - 10 : cy, { size: opts.size || 19, color });
    if (opts.sub) {
      this.text(ctx, opts.sub, cx, cy + 13, { size: 13, weight: 600, color: primary ? 'rgba(16,32,42,.75)' : 'rgba(255,243,214,.6)' });
    }
    ctx.restore();
    if (!disabled && opts.action) {
      this.ui.push({ rect, action: opts.action });
    }
  }

  tapUi(point) {
    for (const item of this.ui) {
      const r = item.rect;
      if (point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h) {
        this.sound.pop();
        item.action();
        return true;
      }
    }
    return false;
  }

  // переключатель языка живёт на главном экране
  drawLangSwitch(ctx, cx, cy) {
    const bw = 78;
    const gap = 8;
    const total = LANGS.length * bw + (LANGS.length - 1) * gap;
    LANGS.forEach((lang, i) => {
      this.uiButton(ctx, { x: cx - total / 2 + i * (bw + gap), y: cy - 19, w: bw, h: 38 }, {
        label: LANG_LABELS[lang],
        size: 15,
        tone: getLang() === lang ? 'primary' : 'normal',
        action: () => setLang(lang),
      });
    });
  }

  drawStars(ctx, x, y, stars, size) {
    for (let i = 0; i < 3; i++) {
      this.text(ctx, '★', x + (i - 1) * size * 1.1, y, {
        size,
        color: i < stars ? '#ffd166' : 'rgba(255,255,255,.2)',
      });
    }
  }

  drawMenuScreen(ctx) {
    const w = CONFIG.width;
    const h = CONFIG.height;
    const portrait = CONFIG.layout === 'portrait';
    this.dim(ctx);
    const titleSize = portrait ? 40 : 58;
    this.text(ctx, t('ui.title'), w / 2, h * 0.2, { size: titleSize, color: '#ffd166' });
    // по бокам заголовка — картошка, которой бросают, и арбуз, которого сбивают
    const titleHalf = this.textWidth(ctx, t('ui.title'), titleSize) / 2 + titleSize * 0.8;
    drawSprite(ctx, 'potato', w / 2 - titleHalf, h * 0.2, titleSize * 1.1, -0.35);
    drawSprite(ctx, 'watermelon', w / 2 + titleHalf, h * 0.2, titleSize * 1.1, 0.25);
    this.text(ctx, t('ui.tagline'), w / 2, h * 0.27, { size: portrait ? 17 : 22, weight: 600 });

    const stage = this.coopStage();
    if (stage) {
      this.drawCoopScreen(ctx, stage);
      this.drawLangSwitch(ctx, w / 2, h * 0.94);
      return;
    }

    this.text(ctx, t(portrait ? 'ui.hintTouch' : 'ui.hintMouse'),
      w / 2, h * 0.32, { size: portrait ? 16 : 19, weight: 600, color: 'rgba(255,243,214,.75)' });
    this.drawRankLine(ctx, w / 2, h * 0.36);

    const bw = Math.min(400, w * 0.76);
    const bh = 64;
    const bx = w / 2 - bw / 2;
    this.uiButton(ctx, { x: bx, y: h * 0.42, w: bw, h: bh }, {
      label: t('ui.campaign'),
      sub: t('ui.campaignSub', { n: this.save.totalStars(), max: GARDENS.length * LEVELS_PER_GARDEN * 3 }),
      tone: 'primary',
      action: () => this.openMap(),
    });
    this.uiButton(ctx, { x: bx, y: h * 0.42 + bh + 16, w: bw, h: bh }, {
      label: t('ui.endless'),
      sub: t('ui.best', { n: formatScore(this.save.best) }),
      action: () => this.startGame(),
    });
    const half = (bw - 12) / 2;
    this.uiButton(ctx, { x: bx, y: h * 0.42 + (bh + 16) * 2, w: half, h: bh }, {
      label: t('ui.upgrades'),
      sub: t('ui.seeds', { n: this.save.seeds }),
      action: () => { this.mode = MODE.upgrades; },
    });
    this.uiButton(ctx, { x: bx + half + 12, y: h * 0.42 + (bh + 16) * 2, w: half, h: bh }, {
      label: t('ui.records'),
      sub: t('rank.' + RANKS[this.save.rankIndex()].key),
      action: () => { this.mode = MODE.records; },
    });
    // на площадке HTML-лобби скрыто, приглашение создаётся кнопкой на поле
    if (CG.onPortal) {
      this.uiButton(ctx, { x: bx, y: h * 0.42 + (bh + 16) * 3, w: bw, h: 48 }, {
        label: t('dom.invite'),
        size: 17,
        action: () => this.net.invite(),
      });
    } else {
      this.text(ctx, t('ui.coopHint'), w / 2, h * 0.87, { size: 15, weight: 600, color: '#8ef6c5' });
    }
    this.drawLangSwitch(ctx, w / 2, h * 0.94);
  }

  // звание и прогресс до следующего: очки капают за уровни и забеги
  drawRankLine(ctx, cx, cy) {
    const index = this.save.rankIndex();
    const rank = RANKS[index];
    const next = RANKS[index + 1];
    this.text(ctx, t('rank.' + rank.key), cx, cy, { size: 20, color: '#ffd166' });
    if (!next) {
      return;
    }
    const w = 180;
    const y = cy + 15;
    const k = clamp((this.save.xp - rank.need) / (next.need - rank.need), 0, 1);
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.14)';
    roundRect(ctx, cx - w / 2, y, w, 6, 3);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    roundRect(ctx, cx - w / 2, y, w * k, 6, 3);
    ctx.fill();
    ctx.restore();
    this.text(ctx, t('ui.toNextRank', { n: next.need - this.save.xp }), cx, y + 16,
      { size: 12, weight: 600, color: 'rgba(255,243,214,.55)' });
  }

  // пока комната открыта или идёт подключение, играть не с чего — вместо кнопок меню видно, чего ждать
  coopStage() {
    if (this.netStatus === 'connecting') {
      return 'connect';
    }
    if (this.netStatus === 'error') {
      return 'error';
    }
    if (this.netStatus === 'waiting' && this.role === 'host') {
      return 'wait';
    }
    return '';
  }

  drawCoopScreen(ctx, stage) {
    const w = CONFIG.width;
    const h = CONFIG.height;
    const portrait = CONFIG.layout === 'portrait';
    const titles = { wait: 'ui.coopWait', connect: 'ui.coopConnecting', error: 'ui.coopFailed' };
    this.text(ctx, t(titles[stage]), w / 2, h * 0.42, {
      size: portrait ? 28 : 36,
      color: stage === 'error' ? '#ff4d6d' : '#8ef6c5',
    });
    this.text(ctx, this.netMessage, w / 2, h * 0.49, { size: portrait ? 16 : 19, weight: 600 });
    if (stage === 'wait') {
      if (!CG.onPortal) {
        this.text(ctx, t(navigator.share ? 'ui.coopWaitHint' : 'ui.coopWaitHintCopy'), w / 2, h * 0.545,
          { size: portrait ? 15 : 18, weight: 600, color: 'rgba(255,243,214,.75)' });
      }
      this.text(ctx, t('ui.coopKeepOpen'), w / 2, h * 0.585,
        { size: portrait ? 13 : 15, weight: 600, color: 'rgba(255,243,214,.5)' });
    }
    if (stage === 'connect') {
      this.text(ctx, t('ui.coopConnectHint'), w / 2, h * 0.545,
        { size: portrait ? 15 : 18, weight: 600, color: 'rgba(255,243,214,.75)' });
    }
    // соединение идёт через чужой сервер, и он видит IP — игрок должен знать об этом до входа
    if (stage !== 'error') {
      this.text(ctx, t('ui.coopPrivacy'), w / 2, h * 0.625,
        { size: portrait ? 11 : 13, weight: 600, color: 'rgba(255,243,214,.45)' });
    }

    const bw = Math.min(400, w * 0.76);
    const bh = 64;
    const bx = w / 2 - bw / 2;
    let y = h * 0.66;
    if (stage === 'wait') {
      const solo = { label: t('ui.coopSolo'), action: () => this.startGame() };
      const cancel = { label: t('dom.cancel'), action: () => this.leaveCoop(t('net.cancelled')) };
      if (CG.onPortal) {
        // на площадке HTML-лобби скрыто: ссылка отправляется и копируется кнопками на поле
        const half = (bw - 12) / 2;
        if (navigator.share) {
          this.uiButton(ctx, { x: bx, y, w: half, h: bh }, { label: t('dom.share'), tone: 'primary', action: () => this.shareInvite() });
          this.uiButton(ctx, { x: bx + half + 12, y, w: half, h: bh }, { label: t('dom.copy'), action: () => this.copyInvite() });
        } else {
          this.uiButton(ctx, { x: bx, y, w: bw, h: bh }, { label: t('dom.copy'), tone: 'primary', action: () => this.copyInvite() });
        }
        y += bh + 16;
        this.uiButton(ctx, { x: bx, y, w: half, h: bh }, solo);
        this.uiButton(ctx, { x: bx + half + 12, y, w: half, h: bh }, cancel);
      } else {
        this.uiButton(ctx, { x: bx, y, w: bw, h: bh }, solo);
        y += bh + 16;
        this.uiButton(ctx, { x: bx, y, w: bw, h: bh }, cancel);
      }
    }
    if (stage === 'error') {
      // токен жив, только если комната не ответила: после отказа хоста ломиться туда же незачем
      if (this.net.token) {
        this.uiButton(ctx, { x: bx, y, w: bw, h: bh }, { label: t('ui.coopRetry'), tone: 'primary', action: () => this.retryCoop() });
        y += bh + 16;
      }
      this.uiButton(ctx, { x: bx, y, w: bw, h: bh }, { label: t('ui.menu'), action: () => this.leaveCoop(t('dom.netIdle')) });
    }
  }

  drawMapScreen(ctx) {
    const w = CONFIG.width;
    const h = CONFIG.height;
    const portrait = CONFIG.layout === 'portrait';
    const gardenIndex = this.gardenView;
    const garden = GARDENS[gardenIndex];
    const open = this.save.gardenOpen(gardenIndex);
    this.dim(ctx, 0.55);

    const title = t('garden.' + garden.key);
    const titleSize = portrait ? 28 : 36;
    this.text(ctx, title, w / 2, h * 0.11, { size: titleSize, color: '#ffd166' });
    drawSprite(ctx, garden.boss.sprite, w / 2 - this.textWidth(ctx, title, titleSize) / 2 - titleSize * 0.8, h * 0.11, titleSize * 1.2);
    this.text(ctx, open ? t('ui.modifier', { name: t('mod.' + garden.key) }) : t('ui.gardenLocked'),
      w / 2, h * 0.16, { size: portrait ? 15 : 18, weight: 600, color: open ? 'rgba(255,243,214,.75)' : '#ff7591' });
    this.text(ctx, t('ui.starsOf', { n: this.save.gardenStars(gardenIndex), max: LEVELS_PER_GARDEN * 3 }),
      w / 2, h * 0.2, { size: 16, weight: 600, color: '#ffd166' });

    const arrow = { w: 52, h: 52 };
    this.uiButton(ctx, { x: w * 0.06, y: h * 0.09, w: arrow.w, h: arrow.h }, {
      label: '‹',
      size: 26,
      disabled: gardenIndex === 0,
      action: () => { this.gardenView -= 1; },
    });
    this.uiButton(ctx, { x: w * 0.94 - arrow.w, y: h * 0.09, w: arrow.w, h: arrow.h }, {
      label: '›',
      size: 26,
      disabled: gardenIndex === GARDENS.length - 1,
      action: () => { this.gardenView += 1; },
    });

    const cols = portrait ? 3 : 4;
    const rows = Math.ceil(LEVELS_PER_GARDEN / cols);
    const cell = Math.min((w * 0.78) / cols, (h * (portrait ? 0.5 : 0.42)) / rows);
    const size = cell * 0.66;
    const startX = w / 2 - ((cols - 1) * cell) / 2;
    const startY = h * 0.29;

    for (let i = 0; i < LEVELS_PER_GARDEN; i++) {
      const cx = startX + (i % cols) * cell;
      const cy = startY + Math.floor(i / cols) * cell;
      const unlocked = this.save.levelOpen(gardenIndex, i);
      const stars = this.save.stars(levelId(gardenIndex, i));
      const boss = i === LEVELS_PER_GARDEN - 1;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, size / 2, 0, TAU);
      ctx.fillStyle = !unlocked ? 'rgba(255,255,255,.07)' : (stars > 0 ? 'rgba(78,205,196,.25)' : 'rgba(10,8,23,.6)');
      ctx.fill();
      ctx.lineWidth = boss ? 3 : 1.5;
      ctx.strokeStyle = !unlocked ? 'rgba(255,255,255,.12)' : (boss ? '#ff4d6d' : 'rgba(255,255,255,.28)');
      ctx.stroke();
      ctx.restore();

      if (!unlocked) {
        drawIcon(ctx, 'lock', cx, cy, size * 0.4, 'rgba(255,243,214,.45)');
      } else {
        if (boss) {
          drawIcon(ctx, 'crown', cx, cy - size * 0.06, size * 0.42, '#ffd166');
        } else {
          this.text(ctx, String(i + 1), cx, cy - size * 0.06, { size: size * 0.36 });
        }
        this.drawStars(ctx, cx, cy + size * 0.34, stars, size * 0.17);
        this.ui.push({
          rect: { x: cx - size / 2, y: cy - size / 2, w: size, h: size },
          action: () => this.startLevel(gardenIndex, i),
        });
      }
    }

    const bw = Math.min(230, w * 0.42);
    const bh = 54;
    // футер считаем от низа поля, иначе в альбомном кадре кнопки уезжают за край
    const footerY = h - (portrait ? 200 : 130);
    this.uiButton(ctx, { x: w / 2 - bw - 8, y: footerY, w: bw, h: bh }, {
      label: t('ui.upgrades'),
      sub: t('ui.seeds', { n: this.save.seeds }),
      action: () => { this.mode = MODE.upgrades; },
    });
    this.uiButton(ctx, { x: w / 2 + 8, y: footerY, w: bw, h: bh }, {
      label: t('ui.endlessShort'),
      sub: t('ui.best', { n: formatScore(this.save.best) }),
      action: () => this.startGame(),
    });
    this.uiButton(ctx, { x: w / 2 - 70, y: footerY + bh + 12, w: 140, h: 44 }, {
      label: t('ui.menu'),
      size: 16,
      action: () => this.openMenu(),
    });
  }

  drawUpgradesScreen(ctx) {
    const w = CONFIG.width;
    const h = CONFIG.height;
    const portrait = CONFIG.layout === 'portrait';
    this.dim(ctx);
    this.text(ctx, t('ui.upgrades'), w / 2, h * 0.11, { size: portrait ? 30 : 38, color: '#ffd166' });
    this.text(ctx, t('ui.seeds', { n: this.save.seeds }), w / 2, h * 0.16, { size: 18, weight: 600, color: '#c0f36b' });

    const keys = Object.keys(UPGRADES);
    const rowH = Math.min(76, (h * 0.55) / keys.length);
    const rowW = Math.min(560, w * 0.88);
    const x = w / 2 - rowW / 2;

    keys.forEach((key, i) => {
      const upgrade = UPGRADES[key];
      const y = h * 0.22 + i * (rowH + 8);
      const level = this.save.level(key);
      const cost = this.save.cost(key);

      ctx.save();
      ctx.fillStyle = 'rgba(10,8,23,.5)';
      roundRect(ctx, x, y, rowW, rowH, 12);
      ctx.fill();
      ctx.restore();

      drawIcon(ctx, upgrade.icon, x + 34, y + rowH / 2, 28, '#ffd166');
      this.text(ctx, t('upg.' + key), x + 62, y + rowH * 0.34, { size: 16, align: 'left' });
      this.text(ctx, t('upgDesc.' + key), x + 62, y + rowH * 0.66, { size: 13, weight: 600, align: 'left', color: 'rgba(255,243,214,.6)' });

      for (let p = 0; p < upgrade.costs.length; p++) {
        ctx.save();
        ctx.fillStyle = p < level ? '#c0f36b' : 'rgba(255,255,255,.18)';
        ctx.beginPath();
        ctx.arc(x + rowW - 150 + p * 16, y + rowH / 2, 5, 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      const affordable = cost !== null && this.save.seeds >= cost;
      this.uiButton(ctx, { x: x + rowW - 108, y: y + rowH / 2 - 20, w: 96, h: 40 }, {
        label: cost === null ? t('ui.max') : String(cost),
        size: 15,
        tone: affordable ? 'primary' : 'normal',
        disabled: !affordable,
        action: () => {
          if (this.save.buy(key)) {
            this.perks = this.save.perks();
            this.sound.upgrade();
          }
        },
      });
    });

    this.uiButton(ctx, { x: w / 2 - 80, y: h * 0.86, w: 160, h: 48 }, {
      label: t('ui.back'),
      action: () => { this.mode = this.level || this.save.totalStars() > 0 ? MODE.map : MODE.menu; },
    });
  }

  drawResultScreen(ctx) {
    const w = CONFIG.width;
    const h = CONFIG.height;
    const result = this.result;
    if (!result) {
      return;
    }
    this.dim(ctx);
    const success = result.success;
    this.text(ctx, t(success ? 'ui.levelDone' : 'ui.levelFail'), w / 2, h * 0.24, {
      size: CONFIG.layout === 'portrait' ? 36 : 50,
      color: success ? '#8ef6c5' : '#ff4d6d',
    });
    this.text(ctx, t('ui.levelLabel', { garden: t('garden.' + result.plan.garden.key), n: result.plan.levelIndex + 1 }), w / 2, h * 0.3, { size: 17, weight: 600 });
    if (!success && result.reason) {
      this.text(ctx, result.reason, w / 2, h * 0.35, { size: 18, weight: 600, color: '#ff7591' });
    }
    if (success && result.rankUp) {
      this.text(ctx, t('ui.newRank', { name: t('rank.' + result.rankUp.key) }),
        w / 2, h * 0.34, { size: 17, color: '#ffd166' });
    }

    if (success) {
      this.drawStars(ctx, w / 2, h * 0.38, result.stars, 42);
    }

    // показываем все три условия: видно, какая звезда не взята и почему
    let goalY = h * (success ? 0.45 : 0.42);
    for (const goal of result.goals) {
      this.text(ctx, (goal.done ? '✔ ' : '✘ ') + goal.label, w / 2, goalY, {
        size: 17,
        weight: 600,
        color: goal.done ? '#8ef6c5' : 'rgba(255,243,214,.5)',
      });
      goalY += 26;
    }

    if (success) {
      this.text(ctx, t('ui.seedsGained', { n: result.seeds }) + ' · ' + t('ui.xpGained', { n: result.xp }),
        w / 2, goalY + 8, { size: 19, color: '#c0f36b' });
    }

    const bw = Math.min(340, w * 0.7);
    const bh = 56;
    const bx = w / 2 - bw / 2;
    let y = h * 0.63;
    if (success) {
      this.uiButton(ctx, { x: bx, y, w: bw, h: bh }, { label: t('ui.next'), tone: 'primary', action: () => this.nextLevel() });
      y += bh + 12;
    }
    this.uiButton(ctx, { x: bx, y, w: bw, h: bh }, { label: t('ui.again'), action: () => this.restartLevel() });
    y += bh + 12;
    this.uiButton(ctx, { x: bx, y, w: bw, h: bh }, { label: t('ui.toMap'), action: () => this.openMap() });
  }

  drawOverScreen(ctx) {
    const w = CONFIG.width;
    const h = CONFIG.height;
    this.dim(ctx);
    this.text(ctx, t('ui.gameOver'), w / 2, h * 0.26, { size: CONFIG.layout === 'portrait' ? 34 : 48, color: '#ff4d6d' });
    this.text(ctx, t('ui.score', { n: formatScore(this.score) }), w / 2, h * 0.34, { size: 28 });
    this.text(ctx, t('ui.record', { n: formatScore(this.best) }), w / 2, h * 0.39, { size: 20, color: '#ffd166' });
    this.text(ctx, t('ui.runStats', { w: this.wave, k: this.killed, c: this.bestCombo }),
      w / 2, h * 0.44, { size: 16, weight: 600, color: 'rgba(255,243,214,.8)' });
    if (this.earnedSeeds > 0) {
      this.text(ctx, t('ui.seedsGained', { n: this.earnedSeeds }) + ' · ' + t('ui.xpGained', { n: this.earnedXp }),
        w / 2, h * 0.49, { size: 19, color: '#c0f36b' });
    }
    if (this.lastPlace > 0) {
      this.text(ctx, t('ui.tablePlace', { n: this.lastPlace }), w / 2, h * 0.53, { size: 17, color: '#8ef6c5' });
    }
    if (this.rankUp) {
      this.text(ctx, t('ui.newRank', { name: t('rank.' + this.rankUp.key) }),
        w / 2, h * 0.565, { size: 17, color: '#ffd166' });
    }

    if (this.role === 'guest') {
      this.text(ctx, t('ui.waitHost'), w / 2, h * 0.6, { size: 19, color: '#8ef6c5' });
      return;
    }

    const bw = Math.min(340, w * 0.7);
    const bh = 56;
    const bx = w / 2 - bw / 2;
    this.uiButton(ctx, { x: bx, y: h * 0.6, w: bw, h: bh }, { label: t('ui.again'), tone: 'primary', action: () => this.startGame() });
    if (this.role === 'solo') {
      this.uiButton(ctx, { x: bx, y: h * 0.6 + bh + 12, w: bw, h: bh }, { label: t('ui.records'), action: () => { this.mode = MODE.records; } });
      this.uiButton(ctx, { x: bx, y: h * 0.6 + (bh + 12) * 2, w: bw, h: bh }, { label: t('ui.menu'), action: () => this.openMenu() });
    }
  }

  drawRecordsScreen(ctx) {
    const w = CONFIG.width;
    const h = CONFIG.height;
    const portrait = CONFIG.layout === 'portrait';
    this.dim(ctx);
    this.text(ctx, t('ui.recordsTitle'), w / 2, h * 0.11, { size: portrait ? 28 : 34, color: '#ffd166' });
    this.drawRankLine(ctx, w / 2, h * 0.18);

    const runs = this.save.runs;
    if (runs.length === 0) {
      this.text(ctx, t('ui.recordsEmpty'), w / 2, h * 0.45, { size: 18, weight: 600, color: 'rgba(255,243,214,.7)' });
    }
    const rowH = Math.min(portrait ? 44 : 34, (h * 0.52) / 10);
    const left = w / 2 - Math.min(260, w * 0.38);
    const right = w / 2 + Math.min(260, w * 0.38);
    runs.forEach((run, i) => {
      const y = h * 0.27 + i * rowH;
      const fresh = this.lastPlace > 0 && i === this.lastPlace - 1;
      const color = fresh ? '#8ef6c5' : PALETTE.hud;
      if (i < 3) {
        drawIcon(ctx, 'medal', left + 14, y, 24, ['#ffd166', '#c9d1d9', '#d69a63'][i]);
      } else {
        this.text(ctx, String(i + 1), left + 14, y, { size: 16, color: 'rgba(255,243,214,.6)' });
      }
      this.text(ctx, formatScore(run.s), left + 46, y, { size: 19, align: 'left', color });
      this.text(ctx, t('ui.waveShort', { n: run.w }), w / 2 + 30, y, { size: 15, weight: 600, color: fresh ? color : 'rgba(255,243,214,.7)' });
      const date = new Date(run.d);
      const label = String(date.getDate()).padStart(2, '0') + '.'
        + String(date.getMonth() + 1).padStart(2, '0') + '.'
        + String(date.getFullYear()).slice(2);
      this.text(ctx, label, right, y, { size: 14, weight: 600, align: 'right', color: 'rgba(255,243,214,.5)' });
    });

    this.uiButton(ctx, { x: w / 2 - 80, y: h * 0.88, w: 160, h: 48 }, {
      label: t('ui.back'),
      action: () => this.openMenu(),
    });
  }

  // переключатель звука для экранов без игрового поля: на поле есть своя кнопка
  drawSoundButton(ctx) {
    const size = 46;
    const rect = { x: 12, y: CONFIG.height - size - 12, w: size, h: size };
    ctx.save();
    ctx.fillStyle = 'rgba(10,8,23,.45)';
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 12);
    ctx.fill();
    ctx.restore();
    drawIcon(ctx, this.sound.muted ? 'sound-off' : 'sound-on', rect.x + size / 2, rect.y + size / 2, 24, PALETTE.hud);
    this.ui.push({
      rect,
      action: () => {
        // после включения звука подтверждаем его щелчком — при выключении тишина и есть ответ
        if (!this.sound.toggleMute()) {
          this.sound.pop();
        }
      },
    });
  }

  drawPauseScreen(ctx) {
    const w = CONFIG.width;
    const h = CONFIG.height;
    this.dim(ctx);
    this.text(ctx, t('ui.pause'), w / 2, h * 0.32, { size: 46, color: '#ffd166' });
    const bw = Math.min(320, w * 0.68);
    const bh = 56;
    const bx = w / 2 - bw / 2;
    this.uiButton(ctx, { x: bx, y: h * 0.44, w: bw, h: bh }, {
      label: t('ui.resume'),
      tone: 'primary',
      action: () => { this.mode = MODE.playing; },
    });
    this.uiButton(ctx, { x: bx, y: h * 0.44 + bh + 12, w: bw, h: bh }, {
      label: t(this.level ? 'ui.quitLevel' : 'ui.menu'),
      action: () => (this.level ? this.openMap() : this.openMenu()),
    });
    if (this.level) {
      this.uiButton(ctx, { x: bx, y: h * 0.44 + (bh + 12) * 2, w: bw, h: bh }, { label: t('ui.menu'), action: () => this.openMenu() });
    }
  }

  draw() {
    const ctx = this.ctx;
    // кликабельные зоны собираются заново каждый кадр вместе с кнопками
    this.ui = [];
    if (this.mode === MODE.map) {
      this.palette = GARDENS[this.gardenView].palette;
    }

    ctx.save();
    if (this.shake > 0) {
      ctx.translate(rand(-this.shake, this.shake) * 0.4, rand(-this.shake, this.shake) * 0.4);
    }

    this.drawBackground(ctx);

    for (const p of this.particles) {
      p.draw(ctx);
    }
    for (const enemy of this.enemies) {
      enemy.draw(ctx);
    }
    for (const hazard of this.hazards) {
      hazard.draw(ctx);
    }
    for (const pickup of this.pickups) {
      pickup.draw(ctx);
    }
    for (const shot of this.shots) {
      shot.draw(ctx);
    }
    for (const wave of this.waves) {
      wave.draw(ctx);
    }

    this.drawTrajectory(ctx);
    this.drawPull(ctx);
    this.drawThrowHint(ctx);
    for (const player of this.activePlayers) {
      player.draw(ctx, this.activePlayers.length > 1);
    }

    for (const t of this.texts) {
      t.draw(ctx);
    }

    if (this.slowTimer > 0) {
      ctx.save();
      ctx.globalAlpha = 0.12 * clamp(this.slowTimer, 0, 1);
      ctx.fillStyle = '#8ecbff';
      ctx.fillRect(0, 0, CONFIG.width, CONFIG.height);
      ctx.restore();
    }

    this.drawModifierOverlay(ctx);

    if (this.isField() || this.mode === MODE.over || this.mode === MODE.result) {
      this.drawTouchControls(ctx);
      this.drawHud(ctx);
    }

    if (this.mode === MODE.banner && this.bannerTimer > 0) {
      const k = clamp(this.bannerTimer / CONFIG.bannerTime, 0, 1);
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.textAlign = 'center';
      ctx.font = '800 56px "Segoe UI", system-ui, sans-serif';
      ctx.lineWidth = 8;
      ctx.strokeStyle = 'rgba(0,0,0,.5)';
      ctx.strokeText(this.bannerText, CONFIG.width / 2, 190);
      ctx.fillStyle = '#ffd166';
      ctx.fillText(this.bannerText, CONFIG.width / 2, 190);
      if (this.bannerSub) {
        ctx.font = '600 18px "Segoe UI", system-ui, sans-serif';
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(0,0,0,.5)';
        ctx.strokeText(this.bannerSub, CONFIG.width / 2, 228);
        ctx.fillStyle = '#8ef6c5';
        ctx.fillText(this.bannerSub, CONFIG.width / 2, 228);
      }
      ctx.restore();
    }

    if (this.mode === MODE.menu) {
      this.drawMenuScreen(ctx);
    }
    if (this.mode === MODE.map) {
      this.drawMapScreen(ctx);
    }
    if (this.mode === MODE.upgrades) {
      this.drawUpgradesScreen(ctx);
    }
    if (this.mode === MODE.records) {
      this.drawRecordsScreen(ctx);
    }
    if (this.mode === MODE.menu || this.mode === MODE.map || this.mode === MODE.upgrades || this.mode === MODE.records) {
      this.drawSoundButton(ctx);
    }
    if (this.mode === MODE.paused) {
      this.drawPauseScreen(ctx);
    }
    if (this.mode === MODE.result) {
      this.drawResultScreen(ctx);
    }
    if (this.mode === MODE.over) {
      this.drawOverScreen(ctx);
    }

    ctx.restore();
  }

  // вертикальное окно — портретный кадр, горизонтальное — альбомный
  preferredLayout() {
    return window.innerHeight > window.innerWidth * 1.05 ? 'portrait' : 'landscape';
  }

  switchLayout(name) {
    const oldWidth = CONFIG.width;
    applyLayout(name);
    const scale = CONFIG.width / oldWidth;

    for (const player of this.players) {
      player.x = clamp(player.x * scale, 40, CONFIG.width - 40);
      player.y = CONFIG.groundY;
    }
    for (const enemy of this.enemies) {
      enemy.x *= scale;
      enemy.baseY = clamp(enemy.baseY, CONFIG.enemyBand[0], CONFIG.enemyBand[1]);
      enemy.y = clamp(enemy.y, 40, CONFIG.groundY - 80);
    }
    for (const list of [this.shots, this.hazards, this.pickups]) {
      for (const item of list) {
        item.x *= scale;
        item.y = clamp(item.y, 0, CONFIG.groundY);
      }
    }
  }

  resize() {
    // гость живёт в кадре хоста, иначе координаты не сойдутся
    const wanted = this.role === 'guest' ? CONFIG.layout : this.preferredLayout();
    if (wanted !== CONFIG.layout) {
      this.switchLayout(wanted);
    }

    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    this.canvas.width = CONFIG.width * dpr;
    this.canvas.height = CONFIG.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.canvas.style.aspectRatio = CONFIG.width + ' / ' + CONFIG.height;
    // на площадке поле во весь iframe, в приложении почти во весь экран, на сайте место под подсказки
    const body = document.body.classList;
    const frame = body.contains('portal') ? 100 : body.contains('app') ? 92 : 74;
    this.canvas.style.width = 'min(100%, ' + ((CONFIG.width / CONFIG.height) * frame).toFixed(1) + 'vh)';
  }

  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.update(dt);
    this.draw();
    if (!this.cgLoaded && HERO_ART.ready) {
      this.cgLoaded = true;
      CG.loadingStop();
    }
    // геймплей для площадки — бой и заставка волны; меню, пауза и итоги — перерыв.
    // музыка живёт по тому же делению: в бою полный состав, иначе тихая подложка
    const playing = this.mode === MODE.playing || this.mode === MODE.banner;
    this.sound.music.setScene(playing ? 'play' : 'calm');
    if (playing !== this.cgPlaying) {
      this.cgPlaying = playing;
      if (playing) {
        CG.gameplayStart();
      } else {
        CG.gameplayStop();
      }
    }
    requestAnimationFrame((t) => this.loop(t));
  }
}

// инстанс наружу: удобно ковырять баланс прямо из консоли браузера.
// на CrazyGames игра стартует после инициализации их SDK, иначе — сразу.
// язык передетекчиваем: до инициализации облачное сохранение было недоступно
CG.boot(() => {
  setLang(detectLang());
  console.info('Fruit Smash v' + GAME_VERSION);
  window.game = new Game(document.getElementById('game'));
});
