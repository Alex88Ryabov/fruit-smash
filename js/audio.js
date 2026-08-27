// вся озвучка синтезируется на лету, файлов со звуками нет
class SoundBox {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = CG.store().getItem('fruktolet.muted') === '1';
    // площадка (CrazyGames) может глушить звук своим тумблером; он сильнее внутриигрового
    this.portalMuted = false;
    this.music = new Music(this);
  }

  get silent() {
    return this.muted || this.portalMuted;
  }

  applyVolume() {
    if (this.master) {
      this.master.gain.value = this.silent ? 0 : 0.5;
    }
  }

  // AudioContext создаём только после первого жеста пользователя
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) {
      return;
    }
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.applyVolume();
    this.music.start();
  }

  toggleMute() {
    this.muted = !this.muted;
    CG.store().setItem('fruktolet.muted', this.muted ? '1' : '0');
    this.applyVolume();
    return this.muted;
  }

  setPortalMute(on) {
    this.portalMuted = on;
    this.applyVolume();
  }

  tone({ freq, toFreq = freq, type = 'sine', dur = 0.2, gain = 0.3, delay = 0 }) {
    if (!this.ctx || this.silent) {
      return;
    }
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, toFreq), t0 + dur);
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(env).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  noise({ dur = 0.2, gain = 0.3, cutoff = 1800, sweepTo = null, delay = 0 }) {
    if (!this.ctx || this.silent) {
      return;
    }
    const t0 = this.ctx.currentTime + delay;
    const frames = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t0);
    if (sweepTo) {
      filter.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    }
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t0);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(env).connect(this.master);
    src.start(t0);
  }

  charge() {
    this.tone({ freq: 180, toFreq: 520, type: 'triangle', dur: CONFIG.chargeTime, gain: 0.12 });
  }

  throwShot(power) {
    this.noise({ dur: 0.22, gain: 0.18, cutoff: 900 + power * 2200, sweepTo: 400 });
    this.tone({ freq: 300 + power * 260, toFreq: 120, type: 'sine', dur: 0.18, gain: 0.14 });
  }

  splat() {
    this.noise({ dur: 0.26, gain: 0.4, cutoff: 2600, sweepTo: 220 });
    this.tone({ freq: 240, toFreq: 60, type: 'square', dur: 0.16, gain: 0.16 });
  }

  pop() {
    this.tone({ freq: 700, toFreq: 1400, type: 'square', dur: 0.09, gain: 0.12 });
  }

  blocked() {
    this.tone({ freq: 1200, toFreq: 900, type: 'square', dur: 0.12, gain: 0.14 });
    this.noise({ dur: 0.1, gain: 0.12, cutoff: 5000, sweepTo: 2000 });
  }

  playerJoin() {
    [523, 659, 880, 1047].forEach((f, i) => {
      this.tone({ freq: f, toFreq: f, type: 'triangle', dur: 0.16, gain: 0.2, delay: i * 0.08 });
    });
  }

  playerLeave() {
    [784, 587, 392].forEach((f, i) => {
      this.tone({ freq: f, toFreq: f, type: 'triangle', dur: 0.18, gain: 0.18, delay: i * 0.09 });
    });
  }

  jump() {
    this.tone({ freq: 320, toFreq: 620, type: 'square', dur: 0.12, gain: 0.1 });
  }

  pit() {
    this.tone({ freq: 300, toFreq: 140, type: 'triangle', dur: 0.22, gain: 0.16 });
  }

  seedShot() {
    this.noise({ dur: 0.14, gain: 0.2, cutoff: 3200, sweepTo: 800 });
    this.tone({ freq: 620, toFreq: 220, type: 'sawtooth', dur: 0.12, gain: 0.12 });
  }

  acid() {
    this.noise({ dur: 0.7, gain: 0.16, cutoff: 900, sweepTo: 260 });
  }

  peel() {
    this.tone({ freq: 420, toFreq: 180, type: 'sine', dur: 0.24, gain: 0.14 });
  }

  slip() {
    this.tone({ freq: 900, toFreq: 180, type: 'sine', dur: 0.5, gain: 0.2 });
  }

  dive() {
    this.tone({ freq: 220, toFreq: 900, type: 'sawtooth', dur: 0.45, gain: 0.16 });
  }

  hurt() {
    this.tone({ freq: 420, toFreq: 90, type: 'sawtooth', dur: 0.35, gain: 0.28 });
  }

  pickup() {
    [659, 988, 1319].forEach((f, i) => {
      this.tone({ freq: f, toFreq: f, type: 'triangle', dur: 0.12, gain: 0.18, delay: i * 0.06 });
    });
  }

  upgrade() {
    [523, 698, 880, 1047, 1319].forEach((f, i) => {
      this.tone({ freq: f, toFreq: f, type: 'square', dur: 0.14, gain: 0.16, delay: i * 0.06 });
    });
  }

  gold() {
    [880, 1175, 1568, 2093].forEach((f, i) => {
      this.tone({ freq: f, toFreq: f, type: 'triangle', dur: 0.16, gain: 0.2, delay: i * 0.07 });
    });
  }

  rankUp() {
    [523, 659, 784, 1047, 784, 1319].forEach((f, i) => {
      this.tone({ freq: f, toFreq: f, type: 'triangle', dur: 0.2, gain: 0.2, delay: i * 0.09 });
    });
  }

  rage() {
    this.tone({ freq: 90, toFreq: 260, type: 'sawtooth', dur: 0.5, gain: 0.28 });
    this.noise({ dur: 0.65, gain: 0.26, cutoff: 700, sweepTo: 2600 });
    this.tone({ freq: 55, toFreq: 42, type: 'square', dur: 0.5, gain: 0.2, delay: 0.06 });
  }

  explode() {
    this.noise({ dur: 0.55, gain: 0.45, cutoff: 1400, sweepTo: 90 });
    this.tone({ freq: 160, toFreq: 40, type: 'sawtooth', dur: 0.4, gain: 0.24 });
  }

  waveUp() {
    [523, 659, 784].forEach((f, i) => {
      this.tone({ freq: f, toFreq: f, type: 'square', dur: 0.18, gain: 0.16, delay: i * 0.1 });
    });
  }

  gameOver() {
    [392, 330, 262, 196].forEach((f, i) => {
      this.tone({ freq: f, toFreq: f * 0.98, type: 'sawtooth', dur: 0.35, gain: 0.2, delay: i * 0.18 });
    });
  }
}
