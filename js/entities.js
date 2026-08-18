class Particle {
  constructor(x, y, opts = {}) {
    this.x = x;
    this.y = y;
    this.vx = opts.vx !== undefined ? opts.vx : rand(-220, 220);
    this.vy = opts.vy !== undefined ? opts.vy : rand(-320, -60);
    this.r = opts.r !== undefined ? opts.r : rand(3, 8);
    this.color = opts.color || '#ff9db1';
    this.life = opts.life !== undefined ? opts.life : rand(0.4, 0.9);
    this.age = 0;
    this.gravity = opts.gravity !== undefined ? opts.gravity : 900;
    this.dead = false;
  }

  update(dt) {
    this.age += dt;
    this.vy += this.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.age >= this.life) {
      this.dead = true;
    }
  }

  draw(ctx) {
    const alpha = clamp(1 - this.age / this.life, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * alpha, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

class Shockwave {
  constructor(x, y, maxR, color = '#ffd166') {
    this.x = x;
    this.y = y;
    this.maxR = maxR;
    this.color = color;
    this.age = 0;
    this.life = 0.45;
    this.dead = false;
  }

  update(dt) {
    this.age += dt;
    if (this.age >= this.life) {
      this.dead = true;
    }
  }

  draw(ctx) {
    const t = this.age / this.life;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 8 * (1 - t) + 2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.maxR * easeOutCubic(t), 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

class FloatText {
  constructor(x, y, text, color = '#fff3d6', size = 26) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.size = size;
    this.life = 1.1;
    this.age = 0;
    this.dead = false;
  }

  update(dt) {
    this.age += dt;
    this.y -= 46 * dt;
    if (this.age >= this.life) {
      this.dead = true;
    }
  }

  draw(ctx) {
    const t = this.age / this.life;
    ctx.save();
    ctx.globalAlpha = 1 - t * t;
    ctx.font = '700 ' + this.size + 'px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.strokeText(this.text, this.x, this.y);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}

class Projectile {
  constructor(x, y, vx, vy, weapon, level, owner = 0) {
    this.id = 0;
    this.owner = owner;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.weapon = weapon;
    this.damage = weapon.damage + (level - 1);
    this.r = weapon.size * 0.36;
    this.rot = Math.atan2(vy, vx);
    this.trail = [];
    this.dead = false;
    this.hitSomething = false;
  }

  update(dt, wind, target) {
    // самонаводящийся снаряд доворачивает вектор скорости к ближайшей цели
    if (this.weapon.homing && target) {
      const speed = Math.hypot(this.vx, this.vy);
      const want = Math.atan2(target.y - this.y, target.x - this.x);
      let diff = want - Math.atan2(this.vy, this.vx);
      while (diff > Math.PI) {
        diff -= TAU;
      }
      while (diff < -Math.PI) {
        diff += TAU;
      }
      const turn = clamp(diff, -this.weapon.homing * dt, this.weapon.homing * dt);
      const angle = Math.atan2(this.vy, this.vx) + turn;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
    }

    this.vy += CONFIG.gravity * this.weapon.gravityMul * dt;
    this.vx += wind * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot = Math.atan2(this.vy, this.vx) + Math.PI / 2;
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 12) {
      this.trail.shift();
    }
    if (this.y > CONFIG.groundY + 10 || this.x < -80 || this.x > CONFIG.width + 80 || this.y < -400) {
      this.dead = true;
    }
  }

  draw(ctx) {
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i];
      const k = i / this.trail.length;
      ctx.save();
      ctx.globalAlpha = k * 0.35;
      ctx.fillStyle = this.weapon.blast ? '#ffb703' : '#c0f36b';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6 * k, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    drawEmoji(ctx, this.weapon.emoji, this.x, this.y, this.weapon.size, this.rot);
  }
}

// всё, чем фрукты отбиваются: косточка, брызги сока, прицельная семечка,
// кислотное облако, лужа и банановая кожура под ноги
class Hazard {
  constructor(kind, x, y, vx = 0, vy = 0) {
    this.id = 0;
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.age = 0;
    this.rot = rand(0, TAU);
    this.landed = false;
    this.dead = false;

    if (kind === 'acid') {
      this.r = 16;
      this.maxR = 70;
      this.life = 4.2;
    } else if (kind === 'puddle') {
      this.r = 12;
      this.maxR = 46;
      this.life = 3.4;
      this.landed = true;
    } else if (kind === 'seed') {
      this.r = 11;
      this.life = 6;
    } else if (kind === 'peel') {
      this.r = 22;
      this.life = 9;
    } else {
      this.r = kind === 'juice' ? 13 : 15;
      this.life = 8;
    }
  }

  get gravityMul() {
    if (this.kind === 'seed') {
      return 0.12;
    }
    if (this.kind === 'acid') {
      return 0;
    }
    return this.kind === 'juice' ? 0.6 : 0.55;
  }

  update(dt, wind) {
    this.age += dt;

    // лужа никуда не летит: растекается и тает на месте
    if (this.kind === 'puddle') {
      this.r = lerp(12, this.maxR, clamp(this.age / 0.5, 0, 1));
      if (this.age >= this.life) {
        this.dead = true;
      }
      return;
    }

    if (this.kind === 'acid') {
      this.r = lerp(16, this.maxR, clamp(this.age / 1.2, 0, 1));
      this.y += 22 * dt;
      this.x += wind * 0.25 * dt;
      if (this.age >= this.life) {
        this.dead = true;
      }
      return;
    }

    // кожура долетает до земли и остаётся лежать ловушкой
    if (this.landed) {
      if (this.age >= this.life) {
        this.dead = true;
      }
      return;
    }

    this.vy += CONFIG.gravity * this.gravityMul * dt;
    this.vx += wind * 0.4 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += 3 * dt;
    if (this.y > CONFIG.groundY) {
      this.y = CONFIG.groundY;
      this.landed = true;
      if (this.kind !== 'peel') {
        this.dead = true;
      }
    }
    if (this.x < -60 || this.x > CONFIG.width + 60 || this.age >= this.life) {
      this.dead = true;
    }
  }

  draw(ctx) {
    if (this.kind === 'puddle') {
      const fade = clamp((this.life - this.age) / 1.2, 0.2, 1);
      ctx.save();
      ctx.globalAlpha = 0.55 * fade;
      ctx.fillStyle = '#a8e063';
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.r, this.r * 0.3, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.85 * fade;
      ctx.strokeStyle = '#7a9c2e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.r, this.r * 0.3, 0, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const a = this.age * 2 + (i * TAU) / 3;
        ctx.globalAlpha = 0.4 * fade;
        ctx.beginPath();
        ctx.arc(this.x + Math.cos(a) * this.r * 0.5, this.y - 6 - (this.age * 12) % 20, 3, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    if (this.kind === 'acid') {
      const fade = clamp(1 - (this.age - (this.life - 1.4)) / 1.4, 0.15, 1);
      ctx.save();
      ctx.globalAlpha = 0.42 * fade;
      ctx.fillStyle = '#c5f36b';
      for (let i = 0; i < 4; i++) {
        const a = this.age * 1.4 + (i * TAU) / 4;
        ctx.beginPath();
        ctx.arc(this.x + Math.cos(a) * this.r * 0.4, this.y + Math.sin(a) * this.r * 0.3, this.r * 0.72, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 0.75 * fade;
      ctx.fillStyle = '#7a9c2e';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 0.22, 0, TAU);
      ctx.fill();
      ctx.restore();
      return;
    }

    if (this.kind === 'peel') {
      drawEmoji(ctx, '🍌', this.x, this.y - 8, 34, this.landed ? Math.PI * 0.92 : this.rot);
      return;
    }

    if (this.kind === 'juice') {
      drawDroplet(ctx, this.x, this.y, this.r, '#ff6b9d');
      return;
    }

    if (this.kind === 'seed') {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = '#5b3a1e';
      ctx.beginPath();
      ctx.arc(this.x - this.vx * 0.02, this.y - this.vy * 0.02, this.r * 0.6, 0, TAU);
      ctx.fill();
      ctx.restore();
      drawSeed(ctx, this.x, this.y, this.r, Math.atan2(this.vy, this.vx) + Math.PI / 2);
      return;
    }

    drawSeed(ctx, this.x, this.y, this.r, this.rot, '#3f2a12');
  }
}

class Pickup {
  constructor(type, x, y) {
    this.id = 0;
    this.type = type;
    this.x = x;
    this.y = y;
    this.vx = rand(-70, 70);
    this.vy = -140;
    this.r = 22;
    this.age = 0;
    this.life = CONFIG.pickupLife;
    this.landed = false;
    this.dead = false;
  }

  update(dt, wind) {
    this.age += dt;
    if (!this.landed) {
      this.vy += CONFIG.pickupGravity * dt;
      this.vx += wind * 0.15 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.y >= CONFIG.groundY - 16) {
        this.y = CONFIG.groundY - 16;
        this.landed = true;
        this.vx = 0;
        this.vy = 0;
      }
    }
    this.x = clamp(this.x, 26, CONFIG.width - 26);
    if (this.age >= this.life) {
      this.dead = true;
    }
  }

  draw(ctx) {
    const left = this.life - this.age;
    if (left < 2.5 && Math.floor(left * 8) % 2 === 0) {
      return;
    }
    const bob = this.landed ? Math.sin(this.age * 5) * 4 : 0;
    const y = this.y + bob;

    const glow = ctx.createRadialGradient(this.x, y, 4, this.x, y, 34);
    glow.addColorStop(0, this.type.color);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(this.x, y, 34, 0, TAU);
    ctx.fill();
    ctx.restore();

    drawEmoji(ctx, this.type.emoji, this.x, y, 34);
  }
}

class Enemy {
  constructor(type, wave, difficulty) {
    this.id = 0;
    this.type = type;
    this.r = type.radius;
    this.size = type.size;
    this.emoji = type.emoji;
    this.hunted = false;
    this.hp = type.hp + this.bonusHp(type, wave, difficulty);
    this.maxHp = this.hp;
    this.dir = Math.random() < 0.5 ? 1 : -1;
    this.x = this.dir === 1 ? -this.r - 20 : CONFIG.width + this.r + 20;
    const band = type.key === 'boss' ? CONFIG.bossBand : CONFIG.enemyBand;
    this.baseY = rand(band[0], band[1]);
    this.amp = rand(type.amp[0], type.amp[1]);
    this.freq = rand(0.35, 0.8);
    this.phase = rand(0, TAU);
    this.t = 0;
    this.speed = type.speed * difficulty.speedMul * rand(0.9, 1.1);
    this.y = this.baseY;
    this.wobble = 0;
    this.flash = 0;
    this.mode = 'fly';
    this.dvx = 0;
    this.dvy = 0;
    this.shieldOn = false;
    this.shieldTimer = type.shield ? rand(0.8, type.shield.down) : 0;
    this.attackCooldown = type.attack
      ? rand(type.attack.cooldown[0], type.attack.cooldown[1]) / difficulty.attackMul
      : 0;
    this.attackMul = difficulty.attackMul;
    this.escaped = false;
    this.dead = false;
  }

  bonusHp(type, wave, difficulty) {
    if (type.key === 'boss') {
      return Math.floor(wave / CONFIG.bossEvery - 1) * 8 + difficulty.hpBonus * 2;
    }
    if (type.key === 'berry' || type.key === 'mango') {
      return 0;
    }
    return difficulty.hpBonus;
  }

  get isBoss() {
    return this.type.key === 'boss';
  }

  startDive(targetX, targetY) {
    const angle = Math.atan2(targetY - this.y, targetX - this.x);
    const speed = 520;
    this.dvx = Math.cos(angle) * speed;
    this.dvy = Math.sin(angle) * speed;
    this.mode = 'dive';
  }

  update(dt, game) {
    this.t += dt;
    if (this.flash > 0) {
      this.flash -= dt;
    }

    if (this.type.shield) {
      this.shieldTimer -= dt;
      if (this.shieldTimer <= 0) {
        this.shieldOn = !this.shieldOn;
        this.shieldTimer = this.shieldOn ? this.type.shield.up : this.type.shield.down;
      }
    }

    if (this.mode === 'dive') {
      this.x += this.dvx * dt;
      this.y += this.dvy * dt;
      this.wobble = Math.sin(this.t * 26) * 0.18;
      if (this.y > CONFIG.groundY - 40) {
        this.mode = 'recover';
      }
    } else {
      this.x += this.dir * this.speed * dt;
      this.wobble = Math.sin(this.t * 9) * 0.06;
      const wave = this.baseY + Math.sin(this.t * this.freq * TAU + this.phase) * this.amp;
      if (this.mode === 'recover') {
        this.y = damp(this.y, wave, 2.5, dt);
        if (Math.abs(this.y - wave) < 5) {
          this.mode = 'fly';
        }
      } else {
        this.y = wave;
      }
    }

    if (this.type.attack && this.mode !== 'dive') {
      this.attackCooldown -= dt;
      if (this.attackCooldown <= 0) {
        const range = this.type.attack.cooldown;
        this.attackCooldown = rand(range[0], range[1]) / this.attackMul;
        game.enemyAttack(this);
      }
    }

    const margin = this.r + 60;
    if (this.x < -margin || this.x > CONFIG.width + margin) {
      // босс не убегает, а разворачивается и продолжает атаковать
      if (this.isBoss) {
        this.dir *= -1;
      } else {
        this.escaped = true;
        this.dead = true;
      }
    }
  }

  hit(damage) {
    if (this.shieldOn) {
      return 'blocked';
    }
    this.hp -= damage;
    this.flash = 0.12;
    if (this.hp <= 0) {
      this.dead = true;
      return 'killed';
    }
    return 'hit';
  }

  draw(ctx) {
    const squash = 1 + Math.sin(this.t * 9) * 0.05;

    if (this.type.key === 'mango' || this.isBoss) {
      const glow = ctx.createRadialGradient(this.x, this.y, this.r * 0.3, this.x, this.y, this.r * 1.9);
      glow.addColorStop(0, this.type.key === 'mango' ? 'rgba(255,215,0,.55)' : 'rgba(193,18,31,.45)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r * 1.9, 0, TAU);
      ctx.fill();
    }

    // крылышки, чтобы фрукт выглядел летающим
    const flap = Math.sin(this.t * (this.mode === 'dive' ? 26 : 14)) * 0.5;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.scale(side, 1);
      ctx.rotate(-0.5 + flap * 0.4);
      ctx.beginPath();
      ctx.ellipse(this.r * 0.95, -this.r * 0.15, this.r * 0.75, this.r * 0.3, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // помеченная цель охоты: пульсирующее кольцо и прицел, чтобы не спутать
    if (this.hunted) {
      ctx.save();
      ctx.strokeStyle = '#ff4d6d';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.55 + Math.sin(this.t * 8) * 0.35;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 14 + Math.sin(this.t * 6) * 3, 0, TAU);
      ctx.stroke();
      ctx.restore();
      drawEmoji(ctx, '🎯', this.x - this.r * 0.9, this.y - this.r * 0.85, 22, Math.sin(this.t * 5) * 0.2);
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.wobble);
    ctx.scale(squash, 2 - squash);
    drawEmoji(ctx, this.emoji, 0, 0, this.size);
    if (this.flash > 0) {
      ctx.globalAlpha = (this.flash / 0.12) * 0.7;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, this.r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    if (this.shieldOn) {
      ctx.save();
      ctx.strokeStyle = '#ffb703';
      ctx.lineWidth = 4;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 9, this.t * 3, this.t * 3 + Math.PI * 1.6);
      ctx.stroke();
      ctx.restore();
    }

    if (this.type.marker && !this.hunted) {
      drawEmoji(ctx, this.type.marker, this.x + this.r * 0.9, this.y - this.r * 0.85, 22, Math.sin(this.t * 5) * 0.2);
    }

    if (this.type.key === 'mango') {
      drawEmoji(ctx, '👑', this.x, this.y - this.r - 12, 26, Math.sin(this.t * 4) * 0.2);
    }

    if (this.isBoss) {
      drawEmoji(ctx, '👑', this.x, this.y - this.r - 26, 52, Math.sin(this.t * 3) * 0.15);
      const w = 160;
      const h = 12;
      const x = this.x - w / 2;
      const y = this.y + this.r + 18;
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      roundRect(ctx, x - 2, y - 2, w + 4, h + 4, 8);
      ctx.fill();
      ctx.fillStyle = '#ff4d6d';
      roundRect(ctx, x, y, w * clamp(this.hp / this.maxHp, 0, 1), h, 6);
      ctx.fill();
    } else if (this.maxHp > 1) {
      for (let i = 0; i < this.maxHp; i++) {
        ctx.fillStyle = i < this.hp ? '#ff4d6d' : 'rgba(255,255,255,.25)';
        ctx.beginPath();
        ctx.arc(this.x - (this.maxHp - 1) * 6 + i * 12, this.y + this.r + 14, 4, 0, TAU);
        ctx.fill();
      }
    }
  }
}

// внешность героя: кожа, волосы и мелочи лица в одном месте
const LOOK = {
  skin: '#ffcd94',
  skinShade: '#e8ab7c',
  line: '#2a1b3d',
  eye: '#2a1b3d',
  brow: '#4a2f1c',
  mouth: '#a8402f',
  tongue: '#e0607a',
  blush: 'rgba(255,120,120,.4)',
  pants: '#33509e',
  pantsDark: '#263d7d',
  bag: '#2f4a8f',
  bagStrap: '#3f5fae',
  shoe: '#f2f2f7',
  shoeDark: '#d63d5e',
};

// заливка с обводкой: контур делает персонажа рисованным, а не сгенерированным
function inked(ctx, path, fill, width = 3) {
  ctx.beginPath();
  path();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = LOOK.line;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

// четыре набора цветов: игроков в комнате может быть до четырёх
const PLAYER_SKINS = [
  { shirt: '#4ecdc4', hair: '#7a4a24', hairLight: '#a06a34' },
  { shirt: '#ff8fb1', hair: '#b0702c', hairLight: '#d09045' },
  { shirt: '#ffd166', hair: '#4a2c14', hairLight: '#6b4226' },
  { shirt: '#a98bdc', hair: '#8a3a1e', hairLight: '#b05a34' },
];

class Player {
  constructor(index = 0) {
    const skin = PLAYER_SKINS[index % PLAYER_SKINS.length];
    this.index = index;
    this.color = skin.shirt;
    this.hair = skin.hair;
    this.hairLight = skin.hairLight;
    this.name = 'P' + (index + 1);
    this.active = true;
    this.x = clamp(CONFIG.width / 2 + [0, 90, -90, 180][index % 4], 60, CONFIG.width - 60);
    this.y = CONFIG.groundY;
    this.r = CONFIG.playerRadius;
    this.aim = -Math.PI / 4;
    this.charge = 0;
    this.charging = false;
    this.cooldown = 0;
    this.invuln = 0;
    this.slip = 0;
    this.bob = 0;
    this.facing = 1;
    this.vy = 0;
    this.onGround = true;
    this.throwAnim = 0;
    this.moodName = 'calm';
    this.moodTimer = 0;
    this.scared = 0;
    this.rage = false;
    this.maxHp = CONFIG.maxHp;
    this.hp = this.maxHp;
    this.weapon = WEAPONS.potato;
    this.level = 1;
    this.ammo = 0;
    this.shield = false;
  }

  get alive() {
    return this.hp > 0;
  }

  jump() {
    if (this.onGround && this.slip <= 0 && this.alive) {
      this.vy = -CONFIG.jumpSpeed;
      this.onGround = false;
      return true;
    }
    return false;
  }

  setMood(name, time) {
    this.moodName = name;
    this.moodTimer = time;
  }

  throwPose() {
    this.throwAnim = 1;
  }

  // выражение лица собирается из состояния: что важнее, то и на морде
  faceMood() {
    if (this.slip > 0) {
      return 'dizzy';
    }
    if (this.moodTimer > 0) {
      return this.moodName;
    }
    if (this.scared > 0) {
      return 'scared';
    }
    if (this.charging) {
      return 'focused';
    }
    if (!this.onGround) {
      return 'jump';
    }
    if (this.rage) {
      return 'angry';
    }
    return 'calm';
  }

  update(dt, move) {
    if (this.slip > 0) {
      this.slip -= dt;
      move = 0;
    }
    this.x = clamp(this.x + move * CONFIG.playerSpeed * dt, 40, CONFIG.width - 40);
    if (this.onGround) {
      this.bob += Math.abs(move) * dt * 12;
    } else {
      this.vy += CONFIG.playerGravity * dt;
      this.y += this.vy * dt;
      if (this.y >= CONFIG.groundY) {
        this.y = CONFIG.groundY;
        this.vy = 0;
        this.onGround = true;
      }
    }
    if (move !== 0) {
      this.facing = move;
    }
    if (this.cooldown > 0) {
      this.cooldown -= dt;
    }
    if (this.invuln > 0) {
      this.invuln -= dt;
    }
    if (this.moodTimer > 0) {
      this.moodTimer -= dt;
    }
    if (this.scared > 0) {
      this.scared -= dt;
    }
    if (this.throwAnim > 0) {
      this.throwAnim = Math.max(0, this.throwAnim - dt / 0.26);
    }
    if (this.charging && !this.weapon.autoFire) {
      this.charge = clamp(this.charge + dt / CONFIG.chargeTime, 0, 1);
    }
  }

  drawHead(ctx, hx, hy, r, mood) {
    inked(ctx, () => {
      ctx.arc(hx - r + 2, hy + 5, 5.5, 0, TAU);
    }, LOOK.skinShade, 2.5);
    inked(ctx, () => {
      ctx.arc(hx + r - 2, hy + 5, 5.5, 0, TAU);
    }, LOOK.skinShade, 2.5);

    inked(ctx, () => {
      ctx.ellipse(hx, hy, r, r * 1.06, 0, 0, TAU);
    }, LOOK.skin, 3);

    this.drawFace(ctx, hx, hy, r, mood);
    this.drawHair(ctx, hx, hy, r);
    // брови рисуем поверх чёлки, иначе всё выражение прячется под волосами
    this.drawBrows(ctx, hx, hy, mood);
  }

  // причёска: шапка волос закрывает лоб и виски, сверху лежит косая прядь
  drawHair(ctx, hx, hy, r) {
    inked(ctx, () => {
      ctx.moveTo(hx - r - 2, hy + 7);
      ctx.quadraticCurveTo(hx - r - 4, hy - r * 1.08, hx - r * 0.15, hy - r * 1.24);
      ctx.quadraticCurveTo(hx + r * 1.05, hy - r * 1.18, hx + r + 2, hy + 4);
      ctx.lineTo(hx + r * 0.74, hy + 2);
      ctx.quadraticCurveTo(hx + r * 0.62, hy - r * 0.5, hx - r * 0.05, hy - r * 0.44);
      ctx.quadraticCurveTo(hx - r * 0.74, hy - r * 0.38, hx - r * 0.82, hy + 7);
      ctx.closePath();
    }, this.hair, 3);

    // прядь лежит на голове, а не торчит рогом
    inked(ctx, () => {
      ctx.moveTo(hx - r * 0.25, hy - r * 1.2);
      ctx.quadraticCurveTo(hx + r * 0.55, hy - r * 1.44, hx + r * 0.95, hy - r * 1.0);
      ctx.quadraticCurveTo(hx + r * 0.45, hy - r * 1.1, hx + r * 0.05, hy - r * 1.13);
      ctx.closePath();
    }, this.hair, 3);

    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = this.hairLight;
    ctx.beginPath();
    ctx.ellipse(hx - r * 0.38, hy - r * 0.86, r * 0.4, r * 0.15, -0.45, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawBrows(ctx, hx, hy, mood) {
    const angles = {
      calm: [-13, -12.5],
      focused: [-10, -14.5],
      angry: [-7.5, -15.5],
      scared: [-16.5, -11],
      jump: [-16, -14],
    };
    const pair = angles[mood];
    if (!pair) {
      return;
    }
    const lx = hx - 9;
    const rx = hx + 9;
    const ey = hy + 1;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = LOOK.brow;
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(lx - 6, ey + pair[1]);
    ctx.lineTo(lx + 5, ey + pair[0]);
    ctx.moveTo(rx - 5, ey + pair[0]);
    ctx.lineTo(rx + 6, ey + pair[1]);
    ctx.stroke();
    ctx.restore();
  }

  drawFace(ctx, hx, hy, r, mood) {
    const lx = hx - 9;
    const rx = hx + 9;
    const ey = hy + 1;
    const mouthY = hy + 12;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.fillStyle = LOOK.blush;
    ctx.beginPath();
    ctx.ellipse(lx - 7, ey + 8, 5, 3.2, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(rx + 7, ey + 8, 5, 3.2, 0, 0, TAU);
    ctx.fill();

    // белок без обводки: с ней глаза читались как очки, а очки у героя настоящие
    const eye = (x, w, h) => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(x, ey, w, h, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = LOOK.eye;
      ctx.beginPath();
      ctx.ellipse(x + 1, ey + h * 0.08, w * 0.66, h * 0.76, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x - w * 0.25, ey - h * 0.34, w * 0.3, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + w * 0.4, ey + h * 0.34, w * 0.15, 0, TAU);
      ctx.fill();
    };

    const arcEye = (x) => {
      ctx.strokeStyle = LOOK.eye;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, ey + 3, 6, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
    };

    const crossEye = (x) => {
      ctx.strokeStyle = LOOK.eye;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 4.5, ey - 4.5);
      ctx.lineTo(x + 4.5, ey + 4.5);
      ctx.moveTo(x + 4.5, ey - 4.5);
      ctx.lineTo(x - 4.5, ey + 4.5);
      ctx.stroke();
    };

    const spiralEye = (x) => {
      ctx.strokeStyle = LOOK.eye;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      for (let a = 0; a < TAU * 1.7; a += 0.28) {
        const rr = 1 + a * 1.15;
        const px = x + Math.cos(a + this.slip * 4) * rr;
        const py = ey + Math.sin(a + this.slip * 4) * rr;
        if (a === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
    };

    const smile = (w, depth) => {
      ctx.strokeStyle = LOOK.mouth;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(hx - w, mouthY - depth * 0.3);
      ctx.quadraticCurveTo(hx, mouthY + depth, hx + w, mouthY - depth * 0.3);
      ctx.stroke();
    };

    const openMouth = (w, h) => {
      inked(ctx, () => {
        ctx.ellipse(hx, mouthY + 1, w, h, 0, 0, TAU);
      }, '#8a2f2a', 2.5);
      ctx.fillStyle = LOOK.tongue;
      ctx.beginPath();
      ctx.ellipse(hx, mouthY + h * 0.55, w * 0.55, h * 0.35, 0, 0, TAU);
      ctx.fill();
    };

    const flatMouth = (w) => {
      ctx.strokeStyle = LOOK.mouth;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(hx - w, mouthY);
      ctx.lineTo(hx + w, mouthY);
      ctx.stroke();
    };

    const grit = (w) => {
      ctx.strokeStyle = LOOK.mouth;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(hx - w, mouthY);
      for (let i = 1; i <= 4; i++) {
        ctx.lineTo(hx - w + (i * w) / 2, mouthY + (i % 2 === 0 ? 0 : 3.2));
      }
      ctx.stroke();
    };

    switch (mood) {
      case 'angry':
        eye(lx, 6.4, 4.8);
        eye(rx, 6.4, 4.8);
        grit(7.5);
        ctx.strokeStyle = '#ff4d6d';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(hx + 14, hy - 16);
        ctx.lineTo(hx + 20, hy - 10);
        ctx.moveTo(hx + 20, hy - 16);
        ctx.lineTo(hx + 14, hy - 10);
        ctx.stroke();
        break;
      case 'scared':
        eye(lx, 7, 7.4);
        eye(rx, 7, 7.4);
        openMouth(4.2, 4.8);
        inked(ctx, () => {
          ctx.moveTo(hx - 16, hy - 15);
          ctx.quadraticCurveTo(hx - 20, hy - 8, hx - 16, hy - 5);
          ctx.quadraticCurveTo(hx - 12, hy - 8, hx - 16, hy - 15);
        }, '#9fe0ff', 2);
        break;
      case 'hurt':
        crossEye(lx);
        crossEye(rx);
        openMouth(6, 5.2);
        break;
      case 'happy':
        arcEye(lx);
        arcEye(rx);
        smile(8, 5.5);
        break;
      case 'dizzy':
        spiralEye(lx);
        spiralEye(rx);
        ctx.strokeStyle = LOOK.mouth;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(hx - 6, mouthY);
        ctx.quadraticCurveTo(hx - 2, mouthY + 3.5, hx, mouthY);
        ctx.quadraticCurveTo(hx + 3, mouthY - 3.5, hx + 6, mouthY);
        ctx.stroke();
        break;
      case 'focused':
        eye(lx, 6.4, 4.2);
        eye(rx, 6.4, 4.2);
        flatMouth(5.5);
        break;
      case 'jump':
        eye(lx, 6.6, 6.8);
        eye(rx, 6.6, 6.8);
        openMouth(4, 4.4);
        break;
      default:
        eye(lx, 6.6, 6.4);
        eye(rx, 6.6, 6.4);
        smile(6.5, 4.2);
        break;
    }

    // круглые очки поверх глаз — как на референсе
    ctx.strokeStyle = LOOK.line;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.arc(lx, ey, 9.6, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(rx, ey, 9.6, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(lx + 9.6, ey);
    ctx.lineTo(rx - 9.6, ey);
    ctx.moveTo(lx - 9.6, ey - 1);
    ctx.lineTo(hx - r + 1, ey - 4);
    ctx.moveTo(rx + 9.6, ey - 1);
    ctx.lineTo(hx + r - 1, ey - 4);
    ctx.stroke();

    ctx.restore();
  }

  draw(ctx, showName = false) {
    if (!this.alive) {
      drawEmoji(ctx, '💤', this.x, this.y - 30, 34, Math.sin(performance.now() / 400) * 0.2, 0.8);
      return;
    }

    const mood = this.faceMood();
    const blink = this.invuln > 0 && Math.floor(this.invuln * 14) % 2 === 0;
    ctx.save();
    ctx.globalAlpha = blink ? 0.35 : 1;
    const hop = this.onGround ? Math.abs(Math.sin(this.bob)) * 4 : 0;
    const baseY = this.y - hop;
    // при поскальзывании персонаж заваливается набок
    const tilt = this.slip > 0 ? Math.sin(this.slip * 18) * 0.35 : 0;

    // тень остаётся на земле, даже когда герой в прыжке
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath();
    ctx.ellipse(this.x, CONFIG.groundY + 6, this.onGround ? 28 : 19, 8, 0, 0, TAU);
    ctx.fill();

    // тело всегда рисуем «лицом вправо», а для броска влево зеркалим холст целиком —
    // тогда поза одинаково аккуратна в обе стороны
    const mirror = Math.cos(this.aim) < 0;
    const aim = mirror ? Math.PI - this.aim : this.aim;
    const windK = this.charging ? 0.25 + this.charge * 0.6 : 0;
    const lean = this.throwAnim * 0.16 - windK * 0.16;

    if (mirror) {
      ctx.translate(this.x, 0);
      ctx.scale(-1, 1);
      ctx.translate(-this.x, 0);
    }
    ctx.translate(this.x, baseY);
    ctx.rotate(tilt + lean);
    ctx.translate(-this.x, -baseY);

    const step = this.onGround ? Math.sin(this.bob) * 5 : -3;
    const legL = this.x - 15 - step * 0.5;
    const legR = this.x + 2 + step * 0.5;

    // ноги, носки и кроссовки
    for (const lx of [legL, legR]) {
      inked(ctx, () => {
        roundRect(ctx, lx, baseY - 42, 13, 26, 6);
      }, LOOK.skin, 3);
      inked(ctx, () => {
        roundRect(ctx, lx - 0.5, baseY - 22, 14, 12, 4);
      }, '#ffffff', 3);
      inked(ctx, () => {
        roundRect(ctx, lx - 2, baseY - 13, 19, 13, 5);
      }, LOOK.shoe, 3);
      ctx.fillStyle = LOOK.shoeDark;
      roundRect(ctx, lx, baseY - 6, 15, 4, 2);
      ctx.fill();
    }

    // шорты
    inked(ctx, () => {
      roundRect(ctx, this.x - 19, baseY - 60, 38, 26, 9);
    }, LOOK.pants, 3);
    ctx.fillStyle = LOOK.pantsDark;
    roundRect(ctx, this.x - 1.5, baseY - 58, 3, 22, 1.5);
    ctx.fill();

    // рюкзак за спиной
    inked(ctx, () => {
      roundRect(ctx, this.x - 30, baseY - 84, 18, 40, 8);
    }, LOOK.bag, 3);

    // футболка
    inked(ctx, () => {
      roundRect(ctx, this.x - 20, baseY - 88, 40, 34, 12);
    }, this.color, 3);
    // белый воротник
    inked(ctx, () => {
      ctx.moveTo(this.x - 8, baseY - 88);
      ctx.quadraticCurveTo(this.x, baseY - 78, this.x + 8, baseY - 88);
      ctx.closePath();
    }, '#ffffff', 2.5);

    // лямки рюкзака поверх футболки
    for (const sx2 of [this.x - 15, this.x + 7]) {
      inked(ctx, () => {
        roundRect(ctx, sx2, baseY - 88, 8, 30, 4);
      }, LOOK.bagStrap, 2.5);
    }

    // дальняя рука висит вдоль корпуса снаружи футболки, иначе её не видно
    ctx.lineCap = 'round';
    ctx.strokeStyle = LOOK.line;
    ctx.lineWidth = 17;
    ctx.beginPath();
    ctx.moveTo(this.x - 19, baseY - 82);
    ctx.quadraticCurveTo(this.x - 28, baseY - 72, this.x - 27, baseY - 52);
    ctx.stroke();
    ctx.strokeStyle = LOOK.skin;
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(this.x - 19, baseY - 82);
    ctx.quadraticCurveTo(this.x - 28, baseY - 72, this.x - 27, baseY - 52);
    ctx.stroke();
    inked(ctx, () => {
      ctx.arc(this.x - 27, baseY - 48, 6.5, 0, TAU);
    }, LOOK.skin, 3);
    // короткий рукав на дальнем плече
    inked(ctx, () => {
      roundRect(ctx, this.x - 26, baseY - 88, 14, 17, 7);
    }, this.color, 3);

    this.drawHead(ctx, this.x, baseY - 108, 21, mood);

    // ближняя рука: замах уводит её назад к бедру, бросок проносит вперёд по дуге
    const backAngle = Math.PI * 0.82;
    let toBack = backAngle - aim;
    while (toBack > Math.PI) {
      toBack -= TAU;
    }
    while (toBack < -Math.PI) {
      toBack += TAU;
    }
    const armAngle = aim + toBack * windK + this.throwAnim * 0.55;
    const armLen = 40 - 4 * (this.charging ? this.charge : 0);
    const sx = this.x + 12;
    const sy = baseY - 80;
    const hx = sx + Math.cos(armAngle) * armLen;
    const hy = sy + Math.sin(armAngle) * armLen;
    // локоть уходит наружу от корпуса: рука не выглядит палкой и не режет лицо
    const bend = armAngle + Math.PI / 2;
    const ex = (sx + hx) / 2 + Math.cos(bend) * 8;
    const ey2 = (sy + hy) / 2 + Math.sin(bend) * 8;

    // короткий след за кистью — читается как мах, а не как круг вокруг героя
    if (this.throwAnim > 0) {
      ctx.save();
      ctx.globalAlpha = this.throwAnim * 0.4;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(sx, sy, armLen * 0.95, armAngle - 0.85, armAngle - 0.08);
      ctx.stroke();
      ctx.restore();
    }

    // плечо и предплечье — два отрезка; контур и заливка идут по одной и той же кривой,
    // иначе тёмная обводка съезжает и рука выглядит чёрной трубой
    const segments = [
      { from: [sx, sy], ctrl: [lerp(sx, ex, 0.75), lerp(sy, ey2, 0.75)], to: [ex, ey2], w: 11, color: LOOK.skin },
      { from: [ex, ey2], ctrl: [lerp(ex, hx, 0.55), lerp(ey2, hy, 0.55)], to: [hx, hy], w: 10, color: LOOK.skin },
    ];
    const strokeArm = (seg, width, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(seg.from[0], seg.from[1]);
      ctx.quadraticCurveTo(seg.ctrl[0], seg.ctrl[1], seg.to[0], seg.to[1]);
      ctx.stroke();
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const seg of segments) {
      strokeArm(seg, seg.w + 6, LOOK.line);
    }
    for (const seg of segments) {
      strokeArm(seg, seg.w, seg.color);
    }
    // короткий рукав на бросающем плече
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(armAngle);
    inked(ctx, () => {
      roundRect(ctx, -7, -9, 17, 18, 7);
    }, this.color, 3);
    ctx.restore();

    inked(ctx, () => {
      ctx.arc(hx, hy, 6.5, 0, TAU);
    }, LOOK.skin, 3);

    // снаряд в кисти разворачиваем обратно, чтобы в зеркале он не читался вывернутым
    if (this.cooldown <= 0) {
      ctx.save();
      ctx.translate(hx + Math.cos(armAngle) * 5, hy + Math.sin(armAngle) * 5);
      if (mirror) {
        ctx.scale(-1, 1);
      }
      drawEmoji(ctx, this.weapon.emoji, 0, 0, this.weapon.size * 0.6,
        mirror ? -(armAngle + Math.PI / 2) : armAngle + Math.PI / 2);
      ctx.restore();
    }
    ctx.restore();

    if (this.shield) {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(performance.now() / 300) * 0.15;
      ctx.strokeStyle = '#4ecdc4';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.x, baseY - 68, 62, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    if (this.slip > 0) {
      drawEmoji(ctx, '💫', this.x, baseY - 142, 26, Math.sin(this.slip * 10) * 0.4);
    }

    if (showName) {
      ctx.save();
      ctx.font = '700 13px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = this.color;
      ctx.fillText(this.name, this.x, baseY - 140);
      ctx.restore();
    }

    if (this.charging && !this.weapon.autoFire) {
      const w = 60;
      const x = this.x - w / 2;
      const y = baseY - 158;
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      roundRect(ctx, x - 2, y - 2, w + 4, 12, 6);
      ctx.fill();
      ctx.fillStyle = this.charge > 0.85 ? '#ff4d6d' : '#ffd166';
      roundRect(ctx, x, y, w * this.charge, 8, 4);
      ctx.fill();
    }
  }
}
