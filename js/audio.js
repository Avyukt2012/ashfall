export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.noise = null;
  }

  boot() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buf;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(v) {
    this.muted = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0 : 0.5, this.ctx.currentTime, 0.02);
  }

  get t() { return this.ctx.currentTime; }

  burst({ dur = 0.3, freq = 900, q = 1.2, gain = 0.5, type = 'bandpass', sweep = 0 }) {
    if (!this.ctx || this.muted) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(freq, this.t);
    filt.Q.value = q;
    if (sweep) filt.frequency.exponentialRampToValueAtTime(Math.max(60, freq + sweep), this.t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, this.t);
    g.gain.exponentialRampToValueAtTime(0.0001, this.t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start();
    src.stop(this.t + dur + 0.02);
  }

  tone({ f = 220, to = null, dur = 0.3, gain = 0.25, type = 'sine', delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.t + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  windUp(dur = 0.42) {
    this.tone({ f: 90, to: 420, dur, gain: 0.1, type: 'sawtooth' });
    this.burst({ dur, freq: 400, sweep: 2600, q: 3, gain: 0.16 });
  }

  hit(power = 1, crit = false) {
    const p = Math.min(2, power);
    this.burst({ dur: 0.16 + p * 0.09, freq: 1700, q: 0.7, gain: 0.5, sweep: -1400 });
    this.tone({ f: 150 * (crit ? 1.2 : 1), to: 34, dur: 0.3 + p * 0.14, gain: 0.42, type: 'sine' });
    this.tone({ f: 76, to: 30, dur: 0.5, gain: 0.3, type: 'triangle' });
    if (crit) {
      this.tone({ f: 1250, to: 300, dur: 0.5, gain: 0.16, type: 'square', delay: 0.02 });
      this.burst({ dur: 0.7, freq: 3200, q: 0.4, gain: 0.24, sweep: -2900, delay: 0.03 });
    }
  }

  heavy() {
    this.tone({ f: 200, to: 26, dur: 0.85, gain: 0.5, type: 'sine' });
    this.tone({ f: 58, to: 22, dur: 1.0, gain: 0.4, type: 'triangle' });
    this.burst({ dur: 0.6, freq: 900, q: 0.5, gain: 0.5, sweep: -800 });
  }

  incoming(power = 1) {
    this.burst({ dur: 0.24, freq: 700, q: 0.9, gain: 0.42, sweep: -560 });
    this.tone({ f: 110, to: 32, dur: 0.36 + power * 0.1, gain: 0.4, type: 'sine' });
  }

  charge(level = 0) {
    const base = 300 + level * 12;
    this.tone({ f: base, to: base * 1.8, dur: 0.34, gain: 0.16, type: 'triangle' });
    this.tone({ f: base * 1.5, to: base * 2.7, dur: 0.28, gain: 0.09, type: 'sine', delay: 0.05 });
  }

  critical() {
    this.tone({ f: 440, to: 1320, dur: 0.55, gain: 0.2, type: 'triangle' });
    this.tone({ f: 660, to: 1980, dur: 0.5, gain: 0.12, type: 'sine', delay: 0.06 });
  }

  heal() {
    this.tone({ f: 392, dur: 0.5, gain: 0.16, type: 'sine' });
    this.tone({ f: 587, dur: 0.44, gain: 0.11, type: 'sine', delay: 0.07 });
    this.tone({ f: 784, dur: 0.4, gain: 0.07, type: 'sine', delay: 0.14 });
  }

  guard() {
    this.burst({ dur: 0.1, freq: 2600, q: 2, gain: 0.28 });
    this.tone({ f: 300, to: 190, dur: 0.34, gain: 0.2, type: 'square' });
    this.tone({ f: 452, to: 300, dur: 0.3, gain: 0.1, type: 'square', delay: 0.01 });
  }

  block() {
    this.burst({ dur: 0.2, freq: 1500, q: 1.4, gain: 0.42, sweep: -1000 });
    this.tone({ f: 210, to: 120, dur: 0.24, gain: 0.24, type: 'square' });
  }

  phase() {
    this.tone({ f: 48, to: 30, dur: 1.6, gain: 0.5, type: 'sine' });
    this.tone({ f: 130, to: 620, dur: 1.1, gain: 0.14, type: 'sawtooth' });
    this.burst({ dur: 1.3, freq: 220, q: 0.6, gain: 0.3, sweep: 3000 });
  }

  shatter() {
    this.burst({ dur: 1.9, freq: 2600, q: 0.3, gain: 0.6, sweep: -2450 });
    this.tone({ f: 320, to: 22, dur: 2.1, gain: 0.5, type: 'sine' });
    this.tone({ f: 96, to: 20, dur: 2.4, gain: 0.36, type: 'triangle' });
  }

  fall() {
    this.tone({ f: 240, to: 24, dur: 2.2, gain: 0.42, type: 'sine' });
    this.burst({ dur: 1.6, freq: 500, q: 0.5, gain: 0.3, sweep: -430 });
  }

  ui() {
    this.burst({ dur: 0.05, freq: 3200, q: 3, gain: 0.14 });
  }

  hover() {
    this.burst({ dur: 0.03, freq: 5200, q: 4, gain: 0.05 });
  }
}
