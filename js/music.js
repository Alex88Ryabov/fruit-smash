// фоновая музыка синтезируется так же, как эффекты: восьмитактовый цикл в до мажоре.
// на поле играет целиком — бас, ударные, мелодия; в меню, на паузе и в итогах остаётся
// мягкая подложка с мелодией. ноты планируются с опережением по часам AudioContext,
// поэтому не зависят от частоты кадров
const MUSIC = {
  bpm: 112,
  // аккорд на такт: C G Am F C G F G (MIDI-ноты в басовой октаве)
  chords: [[48, 52, 55], [43, 47, 50], [45, 48, 52], [41, 45, 48], [48, 52, 55], [43, 47, 50], [41, 45, 48], [43, 47, 50]],
  // рисунок баса по восьмым такта: сдвиг от основы аккорда в полутонах, null — пауза
  bass: [0, null, 7, null, 0, null, 7, 12],
  // мелодия по восьмым, 0 — пауза
  lead: [
    72, 74, 76, 0, 79, 0, 76, 74,
    67, 71, 74, 0, 79, 0, 74, 71,
    69, 72, 76, 0, 72, 0, 69, 0,
    65, 69, 72, 0, 77, 76, 72, 69,
    72, 76, 79, 0, 84, 0, 79, 76,
    74, 0, 71, 0, 67, 0, 71, 74,
    77, 0, 76, 0, 72, 0, 69, 0,
    71, 74, 79, 0, 74, 0, 71, 0,
  ],
  kick: [1, 0, 0, 0, 1, 0, 1, 0],
  snare: [0, 0, 1, 0, 0, 0, 1, 0],
  stepsPerBar: 8,
};

function midiToFreq(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

class Music {
  constructor(sound) {
    this.sound = sound;
    this.bus = null;
    this.noise = null;
    this.scene = 'calm';
    this.step = 0;
    this.nextTime = 0;
  }

  get stepLength() {
    return 60 / MUSIC.bpm / 2;
  }

  // вызывается после создания AudioContext (первый жест игрока)
  start() {
    const ctx = this.sound.ctx;
    if (this.bus || !ctx) {
      return;
    }
    this.bus = ctx.createGain();
    this.bus.gain.value = this.sceneGain();
    this.bus.connect(this.sound.master);
    // одна секунда шума на все ударные
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.nextTime = ctx.currentTime + 0.1;
    setInterval(() => this.schedule(), 80);
    document.addEventListener('visibilitychange', () => this.applyGain());
  }

  sceneGain() {
    if (document.hidden) {
      return 0;
    }
    return this.scene === 'play' ? 1 : 0.55;
  }

  applyGain() {
    if (this.bus) {
      this.bus.gain.setTargetAtTime(this.sceneGain(), this.sound.ctx.currentTime, 0.25);
    }
  }

  setScene(scene) {
    if (scene === this.scene) {
      return;
    }
    this.scene = scene;
    this.applyGain();
  }

  schedule() {
    const ctx = this.sound.ctx;
    // после сна вкладки часы убежали вперёд: не догоняем пропущенные шаги, а продолжаем с текущего
    if (this.nextTime < ctx.currentTime - 0.5) {
      this.nextTime = ctx.currentTime + 0.05;
    }
    while (this.nextTime < ctx.currentTime + 0.3) {
      if (!this.sound.silent && !document.hidden) {
        this.playStep(this.step, this.nextTime);
      }
      this.step = (this.step + 1) % MUSIC.lead.length;
      this.nextTime += this.stepLength;
    }
  }

  playStep(step, t) {
    const bar = Math.floor(step / MUSIC.stepsPerBar);
    const beat = step % MUSIC.stepsPerBar;
    const chord = MUSIC.chords[bar];
    const full = this.scene === 'play';
    if (beat === 0) {
      this.pad(chord, t);
    }
    const note = MUSIC.lead[step];
    if (note) {
      this.tone(midiToFreq(note), t, { type: 'square', dur: 0.24, gain: full ? 0.055 : 0.04, cutoff: 1800 });
    }
    if (!full) {
      return;
    }
    const bass = MUSIC.bass[beat];
    if (bass !== null) {
      this.tone(midiToFreq(chord[0] + bass), t, { type: 'triangle', dur: 0.22, gain: 0.17, cutoff: 700 });
    }
    if (MUSIC.kick[beat]) {
      this.kick(t);
    }
    if (MUSIC.snare[beat]) {
      this.snare(t);
    }
    this.hat(t, beat % 2 === 0 ? 0.06 : 0.035);
  }

  // два слегка расстроенных осциллятора через фильтр: звук теплее одиночного
  tone(freq, t, { type, dur, gain, cutoff }) {
    const ctx = this.sound.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    filter.connect(env).connect(this.bus);
    for (const detune of [-5, 5]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  }

  // аккорд октавой выше баса тянется весь такт с мягкой атакой и отпусканием
  pad(chord, t) {
    const ctx = this.sound.ctx;
    const barLength = this.stepLength * MUSIC.stepsPerBar;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.03, t + 0.35);
    env.gain.setValueAtTime(0.03, t + barLength - 0.4);
    env.gain.exponentialRampToValueAtTime(0.0001, t + barLength + 0.1);
    filter.connect(env).connect(this.bus);
    for (const note of chord) {
      for (const detune of [-6, 6]) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = midiToFreq(note + 12);
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start(t);
        osc.stop(t + barLength + 0.2);
      }
    }
  }

  kick(t) {
    const ctx = this.sound.ctx;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.15);
    env.gain.setValueAtTime(0.5, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(env).connect(this.bus);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  burst(t, { dur, gain, filterType, freq }) {
    const ctx = this.sound.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(env).connect(this.bus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  snare(t) {
    this.burst(t, { dur: 0.14, gain: 0.22, filterType: 'bandpass', freq: 1800 });
    this.tone(190, t, { type: 'triangle', dur: 0.1, gain: 0.12, cutoff: 1200 });
  }

  hat(t, gain) {
    this.burst(t, { dur: 0.045, gain, filterType: 'highpass', freq: 7000 });
  }
}
