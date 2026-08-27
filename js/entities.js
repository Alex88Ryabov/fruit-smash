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
    drawSprite(ctx, this.weapon.sprite, this.x, this.y, this.weapon.size, this.rot);
  }
}

// всё, чем фрукты отбиваются: косточка, брызги сока, прицельная семечка,
// кислотное облако, лужа и банановая кожура под ноги.
// drip — безвредная капля сока из сбитого фрукта: долетает до земли и растекается лужей
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
    } else if (kind === 'drip') {
      this.r = 13;
      this.life = 5;
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
    return this.kind === 'juice' || this.kind === 'drip' ? 0.6 : 0.55;
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
      drawSprite(ctx, 'banana', this.x, this.y - 8, 34, this.landed ? Math.PI * 0.92 : this.rot);
      return;
    }

    if (this.kind === 'juice') {
      drawDroplet(ctx, this.x, this.y, this.r, '#ff6b9d');
      return;
    }

    if (this.kind === 'drip') {
      drawDroplet(ctx, this.x, this.y, this.r, '#a8e063');
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

    if (this.type.weapon) {
      drawSprite(ctx, WEAPONS[this.type.weapon].sprite, this.x, y, 36);
    } else {
      drawBadge(ctx, this.type.icon, this.x, y, 17, this.type.color);
    }
  }
}

class Enemy {
  constructor(type, wave, difficulty) {
    this.id = 0;
    this.type = type;
    this.r = type.radius;
    this.size = type.size;
    this.sprite = type.sprite;
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
    if (type.key === 'berry' || type.key === 'pear') {
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

    if (this.type.key === 'pear' || this.isBoss) {
      const glow = ctx.createRadialGradient(this.x, this.y, this.r * 0.3, this.x, this.y, this.r * 1.9);
      glow.addColorStop(0, this.type.key === 'pear' ? 'rgba(255,215,0,.55)' : 'rgba(193,18,31,.45)');
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
      drawIcon(ctx, 'target', this.x - this.r * 0.9, this.y - this.r * 0.85, 22, '#ff4d6d', Math.sin(this.t * 5) * 0.2);
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.wobble);
    ctx.scale(squash, 2 - squash);
    drawSprite(ctx, this.sprite, 0, 0, this.size);
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
      drawIcon(ctx, this.type.marker, this.x + this.r * 0.9, this.y - this.r * 0.85, 22, '#ffd166', Math.sin(this.t * 5) * 0.2);
    }

    if (this.type.key === 'pear') {
      drawIcon(ctx, 'crown', this.x, this.y - this.r - 12, 26, '#ffd166', Math.sin(this.t * 4) * 0.2);
    }

    if (this.isBoss) {
      drawIcon(ctx, 'crown', this.x, this.y - this.r - 26, 52, '#ffd166', Math.sin(this.t * 3) * 0.15);
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

// четыре цвета футболки: игроков в комнате может быть до четырёх, у каждого своя нарезка тела
const PLAYER_SKINS = ['#4ecdc4', '#ff8fb1', '#ffd166', '#a98bdc'];
// цвет рукава из нарезки руки: им закрашивается плечо, когда рукав повёрнут замахом вверх
const SLEEVE_COLORS = ['#4ad1d4', '#ff1f63', '#ffbc1f', '#7f53cb'];

class Player {
  constructor(index = 0) {
    this.index = index;
    this.color = PLAYER_SKINS[index % PLAYER_SKINS.length];
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
    this.move = 0;
    this.vy = 0;
    this.onGround = true;
    this.throwAnim = 0;
    this.maxHp = CONFIG.maxHp;
    this.hp = this.maxHp;
    this.weapon = WEAPONS.potato;
    this.level = 1;
    this.ammo = 0;
    this.shield = false;
    this.moodName = 'calm';
    this.moodTimer = 0;
    this.scared = 0;
    // шкала ярости 0..1; полная превращается в таймер буйства
    this.rage = 0;
    this.rageTimer = 0;

    // состояние анимации: считается локально у хоста и у гостя из игрового состояния, по сети не ездит
    this.t = 0;
    this.bob = 0;
    this.run = 0;
    this.air = 0;
    this.wasOnGround = true;
    this.stretch = 0;
    this.wind = 0;
    this.lean = 0;
    this.farAng = Math.PI / 2;
    // кисть бросающей руки относительно плеча и сглаженный угол плечевого звена; герой смотрит вправо
    this.hand = polar(1.28, 31.5);
    this.upperAng = 1.28;
  }

  get alive() {
    return this.hp > 0;
  }

  get raging() {
    return this.rageTimer > 0;
  }

  // куда смотрит герой: бросок влево зеркалит всю фигуру
  get facing() {
    return Math.cos(this.aim) < 0 ? -1 : 1;
  }

  // точка, от которой считаем прицел и запускаем снаряд: уровень плеча по центру героя
  get aimOrigin() {
    return { x: this.x, y: this.y + HERO.shoulder.y };
  }

  // прицел в системе фигуры, смотрящей вправо. выше этого угла рука не поднимается:
  // иначе рукав ложится на лицо
  get facingAim() {
    let aim = this.facing < 0 ? Math.PI - this.aim : this.aim;
    if (aim > Math.PI) {
      aim -= TAU;
    }
    return clamp(aim, -1.32, 0.5);
  }

  jump() {
    if (this.onGround && this.slip <= 0 && this.alive) {
      this.vy = -CONFIG.jumpSpeed;
      this.onGround = false;
      return true;
    }
    return false;
  }

  throwPose() {
    this.throwAnim = 1;
  }

  setMood(name, time) {
    this.moodName = name;
    this.moodTimer = time;
  }

  // выражение лица собирается из состояния: что важнее, то и на морде
  faceMood() {
    if (this.slip > 0) {
      return 'dizzy';
    }
    if (this.raging) {
      return 'rage';
    }
    if (this.moodTimer > 0) {
      return this.moodName;
    }
    if (this.scared > 0) {
      return 'scared';
    }
    if (this.charging && !this.weapon.autoFire) {
      return 'focused';
    }
    if (!this.onGround) {
      return 'jump';
    }
    return 'calm';
  }

  update(dt, move) {
    if (this.slip > 0) {
      this.slip -= dt;
      move = 0;
    }
    this.move = move;
    this.x = clamp(this.x + move * CONFIG.playerSpeed * dt, 40, CONFIG.width - 40);
    if (!this.onGround) {
      this.vy += CONFIG.playerGravity * dt;
      this.y += this.vy * dt;
      if (this.y >= CONFIG.groundY) {
        this.y = CONFIG.groundY;
        this.vy = 0;
        this.onGround = true;
      }
    }
    if (this.cooldown > 0) {
      this.cooldown -= dt;
    }
    if (this.invuln > 0) {
      this.invuln -= dt;
    }
    if (this.charging && !this.weapon.autoFire && !this.raging) {
      this.charge = clamp(this.charge + dt / CONFIG.chargeTime, 0, 1);
    }
  }

  // движение частей тела: всё сглажено, чтобы рука и корпус не прыгали из позы в позу
  animate(dt) {
    this.t += dt;
    const moving = this.onGround && Math.abs(this.move) > 0.05;
    if (moving) {
      this.bob += Math.abs(this.move) * 12 * dt;
    } else {
      // остановился — шаг дошагивается до стойки «ноги вместе», а не замирает на полушаге
      this.bob = damp(this.bob, Math.round(this.bob / Math.PI) * Math.PI, 14, dt);
    }
    this.run = damp(this.run, moving ? 1 : 0, 10, dt);
    this.air = damp(this.air, this.onGround ? 0 : 1, 14, dt);
    if (this.onGround !== this.wasOnGround) {
      // отрыв вытягивает фигуру, приземление сплющивает, дальше форма пружинит обратно
      this.stretch = this.onGround ? -1 : 0.7;
      this.wasOnGround = this.onGround;
    }
    this.stretch = damp(this.stretch, 0, 9, dt);
    if (this.throwAnim > 0) {
      this.throwAnim = Math.max(0, this.throwAnim - dt / 0.3);
    }
    if (this.moodTimer > 0) {
      this.moodTimer -= dt;
    }
    if (this.scared > 0) {
      this.scared -= dt;
    }
    if (this.rageTimer > 0) {
      this.rageTimer -= dt;
      if (this.rageTimer <= 0) {
        this.rage = 0;
      }
    }
    const winding = this.charging && !this.weapon.autoFire && !this.raging;
    this.wind = damp(this.wind, winding ? 0.3 + 0.7 * this.charge : 0, 14, dt);

    // на броске кисть выстреливает к цели, в остальное время плавно плывёт за позой
    const target = this.handTarget();
    const rate = this.throwAnim > 0.45 ? 38 : 13;
    this.hand.x = damp(this.hand.x, target.x, rate, dt);
    this.hand.y = damp(this.hand.y, target.y, rate, dt);
    const ik = elbowFor(this.hand.x, this.hand.y, ARM.upperLen, ARM.foreLen);
    this.upperAng = damp(this.upperAng, Math.atan2(ik.ey, ik.ex), rate + 6, dt);

    // дальняя рука машет в шаге, уходит вперёд для равновесия на замахе и назад на броске
    const swing = Math.sin(this.bob) * this.run;
    const far = Math.PI / 2 + 0.35 * swing - 0.35 * this.wind + 0.3 * Math.max(0, this.throwAnim - 0.45);
    // сильнее не поднимаем: выше открывается голый срез предплечья, у левой руки рукава-куска нет
    this.farAng = damp(this.farAng, lerp(far, 0.9, this.air), 16, dt);

    // корпус отклоняется назад на замахе, подаётся вперёд на броске и по ходу бега
    const travel = Math.sign(this.move) * this.facing;
    const lean = -0.1 * this.wind + 0.16 * Math.max(0, this.throwAnim - 0.3) + 0.06 * travel * this.run;
    this.lean = damp(this.lean, lean, 20, dt);
  }

  // куда тянется кисть бросающей руки: в покое висит у бедра, на замахе идёт по дуге
  // вперёд-вверх и за голову, на броске выстреливает по прицелу, проносится вперёд-вниз и возвращается
  handTarget() {
    const aim = this.facingAim;
    const reach = ARM.upperLen + ARM.foreLen;
    if (this.throwAnim > 0.75) {
      return polar(aim, reach * 0.97);
    }
    if (this.throwAnim > 0.45) {
      return polar(aim + 0.9, reach * 0.85);
    }
    // очередь и ярость: рука вытянута по прицелу, снаряды вылетают из кулака
    if (this.charging && (this.weapon.autoFire || this.raging)) {
      return polar(aim, reach * 0.92);
    }
    const swing = Math.sin(this.bob) * this.run;
    const rest = 1.28 - 0.35 * swing - 0.55 * this.air;
    const cocked = -1.97 + 0.6 * (aim + 0.785);
    return polar(lerp(rest, cocked, this.wind), lerp(30, 24.5, this.wind));
  }

  // локоть и углы звеньев бросающей руки в координатах фигуры: локоть сидит на конце рукава,
  // предплечье дотягивается от него к кисти. поднятая кисть уходит за голову,
  // поэтому предплечье тогда рисуется за телом
  armPose() {
    const S = HERO.shoulder;
    const ex = S.x + Math.cos(this.upperAng) * ARM.upperLen;
    const ey = S.y + Math.sin(this.upperAng) * ARM.upperLen;
    return {
      ex,
      ey,
      upper: this.upperAng,
      fore: Math.atan2(S.y + this.hand.y - ey, S.x + this.hand.x - ex),
      behind: this.hand.y < -3,
    };
  }

  drawForearm(ctx, arm, mirror) {
    drawPiece(ctx, HERO_ART.forearm, ARM.forePivot.x, ARM.forePivot.y, arm.ex, arm.ey, arm.fore - ARM.foreAxis, forearmClip);
    // снаряд лежит в кулаке, пока рука не бросила; после броска кисть возвращается пустой и берёт следующий.
    // в зеркале разворачиваем его обратно, чтобы не читался вывернутым
    if (this.throwAnim < 0.25) {
      ctx.save();
      ctx.translate(arm.ex + Math.cos(arm.fore) * ARM.gripLen, arm.ey + Math.sin(arm.fore) * ARM.gripLen);
      if (mirror) {
        ctx.scale(-1, 1);
      }
      drawSprite(ctx, this.weapon.sprite, 0, 0, this.weapon.size * 0.62,
        mirror ? -(arm.fore + Math.PI / 2) : arm.fore + Math.PI / 2);
      ctx.restore();
    }
  }

  // ноги: левая шагает в фазе, правая в противофазе; колено сгибается у ноги, летящей вперёд по ходу,
  // так что стопа приподнимается сзади. в прыжке ноги поджаты, на кожуре разъезжаются
  drawLegs(ctx, travel) {
    const s = Math.sin(this.bob);
    const c = Math.cos(this.bob);
    const slipK = this.slip > 0 ? 1 : 0;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      let thigh = 0.42 * s * side * this.run;
      const bend = 0.75 * Math.max(0, travel * c * side) * this.run;
      let shin = thigh - Math.sign(travel) * bend;
      thigh = lerp(thigh, i === 0 ? 0.3 : 0.1, this.air) - side * 0.22 * slipK;
      shin = lerp(shin, i === 0 ? -0.4 : -0.45, this.air) - side * 0.22 * slipK;
      this.drawLeg(ctx, HERO.hips[i], thigh, shin, i === 1);
    }
  }

  // углы — отклонение от вертикали вниз в сторону взгляда. правую ногу зеркалим, чтобы пара была симметричной
  drawLeg(ctx, hip, thigh, shin, flip) {
    const kx = hip.x + Math.sin(thigh) * HERO.thighLen;
    const ky = hip.y + Math.cos(thigh) * HERO.thighLen;
    ctx.fillStyle = HERO.outline;
    ctx.beginPath();
    ctx.arc(kx, ky, HERO.kneeR, 0, TAU);
    ctx.fill();
    drawPiece(ctx, HERO_ART.leg, 35, KNEE_ROW, kx, ky, -shin, shinClip, flip);
    drawPiece(ctx, HERO_ART.leg, 35, HERO.thighPivotRow, hip.x, hip.y, -thigh, thighClip, flip, HERO.thighStretch);
  }

  // мимика поверх нарисованного лица: глаза перерисовываются всегда — так герой моргает
  // и косится в сторону прицела; рот и брови трогаем только когда выражение не спокойное
  drawFace(ctx, mood) {
    ctx.save();
    ctx.translate(HERO.body.x, HERO.body.y);
    ctx.scale(SPR, SPR);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const blink = (mood === 'calm' || mood === 'focused') && this.t % 3.9 < 0.11;
    for (const eye of FACE.eyes) {
      this.drawEye(ctx, eye, mood, blink);
    }
    if (mood === 'rage') {
      // сведённые брови ложатся поверх оправы очков
      ctx.strokeStyle = FACE.brow;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(50, 67);
      ctx.lineTo(79, 88);
      ctx.moveTo(126, 67);
      ctx.lineTo(97, 88);
      ctx.stroke();
    }
    if (mood !== 'calm') {
      this.drawMouth(ctx, mood);
    }
    ctx.restore();
  }

  drawEye(ctx, eye, mood, blink) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(eye.x, eye.y, FACE.lensR, 0, TAU);
    ctx.clip();
    if (blink) {
      ctx.fillStyle = FACE.skin;
      ctx.fillRect(eye.x - 14, eye.y - 14, 28, 28);
      ctx.strokeStyle = FACE.dark;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(eye.x, eye.y - 3.5, 7.5, TAU * 0.09, TAU * 0.41);
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(eye.x - 14, eye.y - 14, 28, 28);
    if (mood === 'happy') {
      // довольные глаза-дуги
      ctx.strokeStyle = FACE.dark;
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.arc(eye.x, eye.y + 2.5, 7, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
    } else if (mood === 'hurt') {
      ctx.strokeStyle = FACE.dark;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(eye.x - 5, eye.y - 5);
      ctx.lineTo(eye.x + 5, eye.y + 5);
      ctx.moveTo(eye.x + 5, eye.y - 5);
      ctx.lineTo(eye.x - 5, eye.y + 5);
      ctx.stroke();
    } else if (mood === 'dizzy') {
      ctx.strokeStyle = FACE.dark;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let a = 0; a < TAU * 1.6; a += 0.3) {
        const rr = 1.5 + a * 1.35;
        const sx = eye.x + Math.cos(a + this.t * 6) * rr;
        const sy = eye.y + Math.sin(a + this.t * 6) * rr;
        if (a === 0) {
          ctx.moveTo(sx, sy);
        } else {
          ctx.lineTo(sx, sy);
        }
      }
      ctx.stroke();
    } else {
      // обычный зрачок с бликами, слегка следит за прицелом
      const aim = this.facingAim;
      let r = FACE.pupilR;
      let ox = FACE.pupilOff.x + Math.cos(aim) * 1.5;
      let oy = FACE.pupilOff.y + Math.sin(aim) * 1.5;
      if (mood === 'scared') {
        r = 5.5;
        ox *= 0.4;
        oy *= 0.4;
      } else if (mood === 'jump') {
        r = 7.6;
      }
      ctx.fillStyle = FACE.dark;
      ctx.beginPath();
      ctx.arc(eye.x + ox, eye.y + oy, r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(eye.x + ox - r * 0.3, eye.y + oy - r * 0.34, r * 0.32, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(eye.x + ox + r * 0.38, eye.y + oy + r * 0.38, r * 0.16, 0, TAU);
      ctx.fill();
      if (mood === 'focused') {
        // прищур: верхнее веко прикрывает глаз
        ctx.fillStyle = FACE.skin;
        ctx.fillRect(eye.x - 14, eye.y - 14, 28, 10.5);
        ctx.strokeStyle = FACE.dark;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(eye.x - 10, eye.y - 3.5);
        ctx.lineTo(eye.x + 10, eye.y - 3.5);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawMouth(ctx, mood) {
    // родная улыбка закрашивается кожей, сверху рисуется рот по настроению
    ctx.fillStyle = FACE.skin;
    roundRect(ctx, 62, 113, 51, 22, 8);
    ctx.fill();
    const mx = FACE.mouth.x;
    const my = FACE.mouth.y;
    ctx.strokeStyle = FACE.dark;
    if (mood === 'happy') {
      ctx.beginPath();
      ctx.moveTo(mx - 16, my - 5);
      ctx.quadraticCurveTo(mx, my - 2, mx + 16, my - 5);
      ctx.quadraticCurveTo(mx + 13, my + 11, mx, my + 11);
      ctx.quadraticCurveTo(mx - 13, my + 11, mx - 16, my - 5);
      ctx.closePath();
      ctx.fillStyle = FACE.mouthFill;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = FACE.tongue;
      ctx.beginPath();
      ctx.ellipse(mx, my + 7, 8, 3.6, 0, 0, TAU);
      ctx.fill();
    } else if (mood === 'jump' || mood === 'scared' || mood === 'hurt') {
      const rx = mood === 'hurt' ? 8 : 5.5;
      const ry = mood === 'hurt' ? 6 : 7;
      ctx.fillStyle = FACE.mouthFill;
      ctx.beginPath();
      ctx.ellipse(mx, my + 1, rx, ry, 0, 0, TAU);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (mood === 'focused') {
      ctx.strokeStyle = FACE.mouthLine;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(mx - 11, my);
      ctx.lineTo(mx + 11, my);
      ctx.stroke();
    } else if (mood === 'dizzy') {
      ctx.strokeStyle = FACE.mouthLine;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(mx - 12, my);
      ctx.quadraticCurveTo(mx - 6, my + 5, mx, my);
      ctx.quadraticCurveTo(mx + 6, my - 5, mx + 12, my);
      ctx.stroke();
    } else if (mood === 'rage') {
      // стиснутые зубы
      ctx.fillStyle = '#5b2018';
      roundRect(ctx, mx - 18, my - 8, 36, 15, 5);
      ctx.fill();
      ctx.lineWidth = 2.2;
      roundRect(ctx, mx - 18, my - 8, 36, 15, 5);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, mx - 16, my - 6, 32, 6.5, 2.5);
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (const tx of [mx - 8, mx, mx + 8]) {
        ctx.moveTo(tx, my - 6);
        ctx.lineTo(tx, my + 0.5);
      }
      ctx.stroke();
    }
  }

  // огненная аура ярости: зарево и языки пламени, ползущие вверх по фигуре.
  // считается от t детерминированно, поэтому у хоста и гостя выглядит одинаково без синхронизации
  drawRageAura(ctx) {
    const pulse = 1 + Math.sin(this.t * 9) * 0.08;
    const glow = ctx.createRadialGradient(0, -74, 12, 0, -74, 78 * pulse);
    glow.addColorStop(0, 'rgba(255,140,40,.4)');
    glow.addColorStop(0.6, 'rgba(255,80,20,.18)');
    glow.addColorStop(1, 'rgba(255,60,10,0)');
    ctx.save();
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, -74, 78 * pulse, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const ph = (this.t * 0.85 + i * 0.143) % 1;
      const x = Math.sin(i * 2.6) * (26 - ph * 14) + Math.sin(this.t * 6 + i * 1.9) * 5;
      const y = lerp(-8, -158, ph);
      const size = (1 - ph) * 6.5 + 2;
      ctx.globalAlpha = (1 - ph) * 0.5;
      ctx.fillStyle = '#ff7b2d';
      ctx.beginPath();
      ctx.arc(x, y, size, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(x, y - size * 0.8, size * 0.55, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  draw(ctx, showName = false) {
    if (!this.alive) {
      drawIcon(ctx, 'heart-broken', this.x, this.y - 30, 30, '#ff4d6d', Math.sin(performance.now() / 400) * 0.2, 0.8);
      return;
    }

    const hop = Math.abs(Math.sin(this.bob)) * 4 * this.run;
    const baseY = this.y - hop;
    // при поскальзывании персонаж заваливается набок
    const tilt = this.slip > 0 ? Math.sin(this.slip * 18) * 0.35 : 0;

    // тень остаётся на земле, даже когда герой в прыжке
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath();
    ctx.ellipse(this.x, CONFIG.groundY + 6, this.onGround ? 28 : 19, 8, 0, 0, TAU);
    ctx.fill();

    if (!HERO_ART.ready) {
      return;
    }

    const blink = this.invuln > 0 && Math.floor(this.invuln * 14) % 2 === 0;
    ctx.save();
    ctx.globalAlpha = blink ? 0.35 : 1;

    // тело всегда рисуем «лицом вправо», а для броска влево зеркалим холст целиком —
    // тогда поза одинаково аккуратна в обе стороны
    const mirror = this.facing < 0;
    if (mirror) {
      ctx.translate(this.x, 0);
      ctx.scale(-1, 1);
      ctx.translate(-this.x, 0);
    }
    ctx.translate(this.x, baseY);
    ctx.rotate(tilt + this.lean);
    // дыхание в покое и пружина прыжка: фигура тянется и сплющивается от подошв
    const breath = Math.sin(this.t * 2.4) * 0.012 * (1 - this.run);
    ctx.scale(1 - 0.07 * this.stretch, 1 + 0.09 * this.stretch + breath);

    const travel = Math.sign(this.move) * this.facing;
    const arm = this.armPose();
    const body = HERO_ART.bodies[this.index % HERO_ART.bodies.length];
    const sleeve = HERO_ART.arms[this.index % HERO_ART.arms.length];

    if (this.raging) {
      this.drawRageAura(ctx);
    }
    this.drawLegs(ctx, travel);
    if (arm.behind) {
      this.drawForearm(ctx, arm, mirror);
    }
    ctx.drawImage(body, HERO.body.x, HERO.body.y, HERO.body.w, HERO.body.h);
    this.drawFace(ctx, this.faceMood());
    // дальняя рука: рукав нарисован на теле, из-под его подола висит предплечье
    drawPiece(ctx, HERO_ART.forearm, ARM.farPivot.x, ARM.farPivot.y,
      HERO.farElbow.x, HERO.farElbow.y, this.farAng - ARM.farAxis, farForearmClip);
    if (!arm.behind) {
      this.drawForearm(ctx, arm, mirror);
    }
    // заплатка на плече: когда рукав повёрнут замахом, она закрывает открывшуюся подмышку.
    // в покое целиком спрятана под рукавом
    ctx.fillStyle = SLEEVE_COLORS[this.index % SLEEVE_COLORS.length];
    ctx.beginPath();
    ctx.arc(HERO.shoulder.x, HERO.shoulder.y + 1, 12 * SPR, 0, TAU);
    ctx.fill();
    drawPiece(ctx, sleeve, ARM.sleevePivot.x, ARM.sleevePivot.y,
      HERO.shoulder.x, HERO.shoulder.y, arm.upper - ARM.sleeveAxis, sleeveClip);

    // короткий след за кистью — читается как мах, а не как круг вокруг героя
    if (this.throwAnim > 0.45) {
      const handAngle = Math.atan2(this.hand.y, this.hand.x);
      ctx.save();
      ctx.globalAlpha = this.throwAnim * 0.4;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(HERO.shoulder.x, HERO.shoulder.y, Math.hypot(this.hand.x, this.hand.y) * 0.95, handAngle - 0.9, handAngle - 0.1);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    if (this.shield) {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(performance.now() / 300) * 0.15;
      ctx.strokeStyle = '#4ecdc4';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.x, baseY - 72, 58, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // на кожуре над головой кружат звёздочки
    if (this.slip > 0) {
      for (let i = 0; i < 3; i++) {
        const a = this.slip * 9 + (i * TAU) / 3;
        drawIcon(ctx, 'star', this.x + Math.cos(a) * 24, baseY - 158 + Math.sin(a) * 7, 15, '#ffd166', a);
      }
    }

    if (showName) {
      ctx.save();
      ctx.font = '700 13px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = this.color;
      ctx.fillText(this.name, this.x, baseY - 154);
      ctx.restore();
    }

    if (this.charging && !this.weapon.autoFire && !this.raging) {
      const w = 60;
      const x = this.x - w / 2;
      const y = baseY - 172;
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      roundRect(ctx, x - 2, y - 2, w + 4, 12, 6);
      ctx.fill();
      ctx.fillStyle = this.charge > 0.85 ? '#ff4d6d' : '#ffd166';
      roundRect(ctx, x, y, w * this.charge, 8, 4);
      ctx.fill();
    }
  }
}
