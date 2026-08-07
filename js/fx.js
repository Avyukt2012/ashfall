const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[(Math.random() * arr.length) | 0];

export function grainDataUrl(size = 180, alpha = 26) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = alpha;
  }
  ctx.putImageData(img, 0, 0);
  return `url(${c.toDataURL()})`;
}

class Pool {
  constructor(cap) {
    this.cap = cap;
    this.items = [];
    for (let i = 0; i < cap; i++) {
      this.items.push({
        x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, kind: 'spark',
        color: '#fff', rot: 0, vr: 0, drag: 0.96, grav: 0, glow: 1, seed: 0,
        tx: 0, ty: 0, pull: 0, alive: false
      });
    }
    this.n = 0;
  }
  spawn() {
    if (this.n >= this.cap) return null;
    const p = this.items[this.n++];
    p.alive = true;
    p.pull = 0; p.grav = 0; p.drag = 0.96; p.rot = 0; p.vr = 0; p.glow = 1;
    p.seed = Math.random() * TAU;
    return p;
  }
  compact() {
    for (let i = 0; i < this.n; i++) {
      if (this.items[i].life <= 0) {
        const tmp = this.items[i];
        this.items[i] = this.items[this.n - 1];
        this.items[this.n - 1] = tmp;
        this.n--; i--;
      }
    }
  }
}

export class Arena {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.pool = new Pool(1000);
    this.waves = [];
    this.pal = {};
    this.cx = 0; this.cy = 0; this.R = 120;
    this.focus = null;

    this.boss = {
      hp: 1, phase: 0, alive: true, visible: false,
      breath: 0, spin: 0, hit: 0, recoil: 0, recoilV: 0,
      charge: 0, tilt: 0, ghost: 0, wind: 0, drain: 0
    };
    this.cracks = [];
    this.shakeX = 0; this.shakeY = 0; this.shakeMag = 0;
    this.timeScale = 1;
    this.t = 0;
    this.horizon = 0;
    this.pointer = { x: 0.5, y: 0.5, ex: 0.5, ey: 0.5 };
    this.floorGlow = 0;
    this.intensity = 1;
    this.scale = 1;
    this.blend = 'lighter';
    this.frozen = false;
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.w = w; this.h = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cv.width = Math.round(w * this.dpr);
    this.cv.height = Math.round(h * this.dpr);
    this.cv.style.width = w + 'px';
    this.cv.style.height = h + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.applyFocus();
  }

  setFocus(rect) {
    this.focus = rect;
    this.applyFocus();
  }

  applyFocus() {
    const f = this.focus;
    if (f && f.height > 80) {
      this.cx = f.x + f.width / 2;
      this.cy = f.y + f.height * 0.5;
      this.R = Math.max(52, Math.min(f.height * 0.3, Math.min(this.w, this.h) * 0.165)) * this.scale;
    } else {
      this.cx = this.w / 2;
      this.cy = this.h * 0.45;
      this.R = Math.min(this.w, this.h) * 0.15 * this.scale;
    }
    this.horizon = this.cy + this.R * 2.15;
  }

  setStage(mode) {
    if (mode === 'title') {
      this.intensity = 0.45;
      this.scale = 0.62;
      this.setFocus({
        x: this.w * 0.42, y: this.h * 0.42,
        width: this.w * 0.58, height: this.h * 0.5
      });
    } else {
      this.intensity = 1;
      this.scale = 1;
    }
  }

  setPalette(p, light) { this.pal = p; this.blend = light ? 'multiply' : 'lighter'; }
  setPointer(x, y) { this.pointer.x = x; this.pointer.y = y; }

  reset() {
    this.pool.n = 0;
    this.waves.length = 0;
    this.cracks.length = 0;
    Object.assign(this.boss, {
      hp: 1, phase: 0, alive: true, visible: true,
      hit: 0, recoil: 0, recoilV: 0, charge: 0, tilt: 0, ghost: 0, wind: 0, drain: 0
    });
    this.shakeMag = 0;
    this.timeScale = 1;
    this.floorGlow = 0;
  }

  /* ── emitters ─────────────────────────────────────── */

  shake(mag) { this.shakeMag = Math.max(this.shakeMag, mag); }

  wave(x, y, opts = {}) {
    if (this.waves.length > 22) this.waves.shift();
    this.waves.push({
      x, y, r: opts.r0 || 4, vr: opts.vr || 620, life: 1, max: opts.max || 0.7,
      w: opts.w || 3, color: opts.color || this.pal.ember, squash: opts.squash || 1
    });
  }

  sparks(n, x, y, opts = {}) {
    for (let i = 0; i < n; i++) {
      const p = this.pool.spawn(); if (!p) return;
      const a = opts.angle !== undefined ? opts.angle + rand(-opts.spread, opts.spread) : rand(0, TAU);
      const sp = rand(opts.speed0 || 90, opts.speed1 || 480);
      p.kind = 'spark';
      p.x = x + Math.cos(a) * (opts.r0 || 0);
      p.y = y + Math.sin(a) * (opts.r0 || 0);
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      p.max = p.life = rand(0.3, opts.life || 0.9);
      p.size = rand(1, opts.size || 3.2);
      p.color = opts.color || this.pal.ember;
      p.drag = opts.drag || 0.93;
      p.grav = opts.grav !== undefined ? opts.grav : 420;
      p.glow = 1;
    }
  }

  shards(n, x, y, opts = {}) {
    for (let i = 0; i < n; i++) {
      const p = this.pool.spawn(); if (!p) return;
      const a = rand(0, TAU);
      const sp = rand(120, opts.speed || 560);
      p.kind = 'shard';
      p.x = x + Math.cos(a) * rand(0, this.R * 0.8);
      p.y = y + Math.sin(a) * rand(0, this.R * 0.8);
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - 60;
      p.max = p.life = rand(0.7, 1.7);
      p.size = rand(3, opts.size || 13);
      p.color = opts.color || this.pal.ember;
      p.drag = 0.975; p.grav = 620;
      p.rot = rand(0, TAU); p.vr = rand(-9, 9);
      p.glow = 0.6;
    }
  }

  motes(n, tx, ty, opts = {}) {
    for (let i = 0; i < n; i++) {
      const p = this.pool.spawn(); if (!p) return;
      const a = rand(0, TAU);
      const d = rand(opts.r0 || 160, opts.r1 || 420);
      p.kind = 'mote';
      p.x = tx + Math.cos(a) * d;
      p.y = ty + Math.sin(a) * d * 0.8;
      p.vx = rand(-40, 40); p.vy = rand(-40, 40);
      p.tx = tx; p.ty = ty;
      p.pull = opts.pull || 12;
      p.max = p.life = rand(0.5, opts.life || 1.0);
      p.size = rand(1.2, 3.4);
      p.color = opts.color || this.pal.acid;
      p.drag = 0.92; p.grav = 0;
    }
  }

  ambient(dt) {
    if (Math.random() < dt * (12 + this.boss.phase * 9) && this.boss.visible) {
      const p = this.pool.spawn(); if (!p) return;
      p.kind = 'ember';
      p.x = this.cx + rand(-this.R * 2.6, this.R * 2.6);
      p.y = this.horizon + rand(-14, 40);
      p.vx = rand(-16, 16); p.vy = rand(-70, -26);
      p.max = p.life = rand(1.6, 3.4);
      p.size = rand(0.7, 2.1);
      p.color = Math.random() < 0.14 ? this.pal.acid : this.pal.ember;
      p.drag = 0.995; p.grav = -12; p.glow = 0.8;
    }
    if (Math.random() < dt * 5) {
      const p = this.pool.spawn(); if (!p) return;
      p.kind = 'dust';
      p.x = rand(0, this.w); p.y = rand(0, this.h);
      p.vx = rand(-9, 9); p.vy = rand(-7, 4);
      p.max = p.life = rand(3, 7);
      p.size = rand(0.5, 1.5);
      p.color = this.pal.ink;
      p.drag = 1; p.grav = 0; p.glow = 0.25;
    }
  }

  /* ── beats ────────────────────────────────────────── */

  gather(power = 1) {
    this.motes(26 + power * 12, this.cx, this.cy, { r0: this.R * 2.2, r1: this.R * 5, pull: 15, color: this.pal.acid, life: 0.55 });
    this.boss.wind = 1;
  }

  impact(power = 1, crit = false) {
    const p = Math.min(2.2, power);
    this.boss.hit = 1;
    this.boss.recoilV += 26 * p * (crit ? 1.7 : 1);
    this.shake(9 * p * (crit ? 1.9 : 1));
    this.boss.ghost = crit ? 1 : 0.65;
    this.wave(this.cx, this.cy, { vr: 700 + p * 420, w: crit ? 6 : 3.4, color: crit ? this.pal.acid : this.pal.pale, max: 0.62 });
    if (crit) this.wave(this.cx, this.cy, { vr: 380, w: 2, color: this.pal.acid, max: 1.1, r0: 20 });
    this.sparks(crit ? 90 : 34 + p * 22, this.cx, this.cy, {
      speed0: 160, speed1: 300 + p * 460, color: crit ? this.pal.acid : this.pal.pale, size: crit ? 4.4 : 3, life: crit ? 1.3 : 0.85
    });
    this.sparks(20, this.cx, this.cy, { speed0: 60, speed1: 260, color: this.pal.ember, size: 2.4, life: 1.1 });
    if (p > 1.1 || crit) this.shards(crit ? 26 : 12, this.cx, this.cy, { speed: 460 });
    this.addCrack(p * (crit ? 1.6 : 1));
    this.floorGlow = Math.min(1, this.floorGlow + 0.5 * p);
  }

  addCrack(strength) {
    if (this.cracks.length > 16) return;
    const a = rand(0, TAU);
    const pts = [];
    let x = 0, y = 0, ang = a;
    const steps = 3 + (Math.random() * 4 | 0);
    for (let i = 0; i < steps; i++) {
      ang += rand(-0.65, 0.65);
      const step = rand(0.16, 0.34) * (0.6 + strength * 0.4);
      x += Math.cos(ang) * step; y += Math.sin(ang) * step;
      pts.push([x, y]);
    }
    this.cracks.push({ pts, grow: 0 });
  }

  windup(heavy) {
    this.boss.tilt = heavy ? -1 : -0.55;
    this.motes(heavy ? 34 : 18, this.cx, this.cy, {
      r0: this.R * 1.6, r1: this.R * 4, pull: heavy ? 18 : 12, color: this.pal.ember, life: 0.6
    });
    if (heavy) this.wave(this.cx, this.cy, { r0: this.R * 3.4, vr: -260, w: 2, color: this.pal.ember, max: 0.75 });
  }

  bossImpact(power = 1, heavy = false) {
    this.boss.tilt = heavy ? 1.5 : 0.9;
    this.shake(heavy ? 30 : 13 + power * 9);
    this.wave(this.cx, this.cy, { vr: heavy ? 1500 : 900, w: heavy ? 7 : 4, color: this.pal.ember, max: heavy ? 0.9 : 0.62 });
    for (let i = 0; i < (heavy ? 70 : 34); i++) {
      const p = this.pool.spawn(); if (!p) break;
      p.kind = 'spark';
      p.x = rand(0, this.w); p.y = rand(-60, 0);
      p.vx = rand(-70, 70); p.vy = rand(340, 900);
      p.max = p.life = rand(0.5, 1.2);
      p.size = rand(1.2, heavy ? 4 : 2.6);
      p.color = this.pal.ember;
      p.drag = 0.99; p.grav = 700;
    }
    this.sparks(heavy ? 46 : 22, this.cx, this.cy, { speed0: 200, speed1: 760, color: this.pal.ember, size: 3.4 });
  }

  guarded() {
    this.wave(this.cx, this.horizon - 8, { vr: 620, w: 3, color: this.pal.acid, max: 0.55, squash: 0.24 });
    this.sparks(30, this.cx, this.cy, { speed0: 120, speed1: 420, color: this.pal.acid, size: 2.6, life: 0.7 });
    this.shake(7);
  }

  healPulse() {
    this.motes(40, this.cx, this.horizon - 10, { r0: 60, r1: 460, pull: 9, color: this.pal.pale, life: 1.1 });
    this.wave(this.cx, this.horizon - 8, { vr: 300, w: 1.6, color: this.pal.pale, max: 1.1, squash: 0.22 });
  }

  channelPulse(level) {
    this.motes(20 + level, this.cx, this.horizon - 10, { r0: 90, r1: 380, pull: 10, color: this.pal.acid, life: 0.9 });
    this.wave(this.cx, this.horizon - 8, { vr: 240, w: 1.4, color: this.pal.acid, max: 0.9, squash: 0.2 });
  }

  manaBreak() {
    this.sparks(44, this.cx, this.horizon - 30, {
      speed0: 130, speed1: 520, color: this.pal.acid, size: 3, life: 1.2, grav: 700
    });
  }

  phaseBreak(n) {
    this.boss.phase = n;
    this.shake(26);
    this.wave(this.cx, this.cy, { vr: 1700, w: 8, color: this.pal.pale, max: 1.0 });
    this.wave(this.cx, this.cy, { vr: 1100, w: 3, color: this.pal.ember, max: 1.3 });
    this.shards(30, this.cx, this.cy, { speed: 620 });
    this.sparks(90, this.cx, this.cy, { speed0: 200, speed1: 900, color: this.pal.ember, size: 3.6, life: 1.5 });
  }

  shatter() {
    this.boss.alive = false;
    this.shake(40);
    this.wave(this.cx, this.cy, { vr: 2200, w: 12, color: this.pal.pale, max: 1.4 });
    this.wave(this.cx, this.cy, { vr: 1400, w: 4, color: this.pal.acid, max: 1.9 });
    this.shards(70, this.cx, this.cy, { speed: 820, size: 20 });
    this.sparks(200, this.cx, this.cy, { speed0: 120, speed1: 1200, color: this.pal.pale, size: 4, life: 2.4, drag: 0.975 });
    this.sparks(90, this.cx, this.cy, { speed0: 60, speed1: 700, color: this.pal.ember, size: 3, life: 2.8 });
  }

  fall() {
    this.boss.drain = 1;
    this.shake(24);
    for (let i = 0; i < 120; i++) {
      const p = this.pool.spawn(); if (!p) break;
      p.kind = 'spark';
      p.x = rand(0, this.w); p.y = rand(0, this.h);
      p.vx = rand(-30, 30); p.vy = rand(-260, -60);
      p.max = p.life = rand(1.4, 3);
      p.size = rand(1, 3);
      p.color = this.pal.ember;
      p.drag = 0.99; p.grav = -40;
    }
  }

  /* ── loop ─────────────────────────────────────────── */

  update(dtRaw) {
    if (this.frozen) return;
    const dt = Math.min(dtRaw, 0.05) * this.timeScale;
    this.t += dt;
    const b = this.boss;

    b.breath += dt * (1.1 + b.phase * 0.28);
    b.spin += dt * (0.16 + b.phase * 0.14);
    b.hit *= Math.pow(0.0016, dt);
    b.ghost *= Math.pow(0.0009, dt);
    b.wind *= Math.pow(0.02, dt);
    b.tilt += (0 - b.tilt) * Math.min(1, dt * 6);

    b.recoilV += (0 - b.recoil) * 210 * dt;
    b.recoilV *= Math.pow(0.02, dt);
    b.recoil += b.recoilV * dt;

    this.shakeMag *= Math.pow(0.0006, dt);
    this.shakeX = rand(-1, 1) * this.shakeMag;
    this.shakeY = rand(-1, 1) * this.shakeMag;
    this.floorGlow *= Math.pow(0.05, dt);

    this.pointer.ex += (this.pointer.x - this.pointer.ex) * Math.min(1, dt * 3.2);
    this.pointer.ey += (this.pointer.y - this.pointer.ey) * Math.min(1, dt * 3.2);

    for (const c of this.cracks) c.grow += (1 - c.grow) * Math.min(1, dt * 4);

    this.ambient(dt);

    const items = this.pool.items;
    for (let i = 0; i < this.pool.n; i++) {
      const p = items[i];
      if (p.pull) {
        const dx = p.tx - p.x, dy = p.ty - p.y;
        p.vx += dx * p.pull * dt;
        p.vy += dy * p.pull * dt;
      }
      p.vy += p.grav * dt;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.life -= dt;
    }
    this.pool.compact();

    for (let i = this.waves.length - 1; i >= 0; i--) {
      const wv = this.waves[i];
      wv.r += wv.vr * dt;
      wv.life -= dt / wv.max;
      if (wv.life <= 0 || wv.r < 0) this.waves.splice(i, 1);
    }
  }

  render() {
    const ctx = this.ctx, w = this.w, h = this.h;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const px = (this.pointer.ex - 0.5), py = (this.pointer.ey - 0.5);
    ctx.translate(this.shakeX + px * 22, this.shakeY + py * 16);

    this.drawFloor(ctx);
    if (this.boss.visible) this.drawEntity(ctx);
    this.drawWaves(ctx);
    this.drawParticles(ctx);
  }

  drawFloor(ctx) {
    const y = this.horizon;
    const b = this.boss;
    ctx.save();
    ctx.globalAlpha = (0.5 - b.drain * 0.4) * this.intensity;
    ctx.strokeStyle = this.pal.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.cx - this.R * 4.4, y);
    ctx.lineTo(this.cx + this.R * 4.4, y);
    ctx.stroke();

    ctx.globalAlpha = 0.3 * this.intensity;
    for (let i = -8; i <= 8; i++) {
      const t = i / 8;
      const x = this.cx + t * this.R * 4.2;
      const len = 5 + (1 - Math.abs(t)) * 9;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + len);
      ctx.stroke();
    }

    if (this.floorGlow > 0.01 || b.visible) {
      const g = ctx.createRadialGradient(this.cx, y, 0, this.cx, y, this.R * 3.6);
      const a = (0.1 + this.floorGlow * 0.4) * (b.alive ? 1 : 0.2) * this.intensity
        * (this.blend === 'multiply' ? 0.45 : 1);
      g.addColorStop(0, this.rgba(this.pal.ember, a));
      g.addColorStop(1, this.rgba(this.pal.ember, 0));
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = this.blend;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(this.cx, y, this.R * 3.6, this.R * 0.7, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawEntity(ctx) {
    const b = this.boss;
    const breathe = 1 + Math.sin(b.breath) * 0.035 + Math.sin(b.breath * 2.7) * 0.012;
    const hitScale = 1 + b.hit * 0.13;
    const R = this.R * breathe * hitScale * (b.alive ? 1 : 0.001);
    if (R < 1) return;

    const cx = this.cx + b.recoil + b.tilt * this.R * 0.16;
    const cy = this.cy + b.tilt * this.R * 0.07;
    const heat = 0.4 + b.phase * 0.3 + b.hit * 0.6 + b.charge * 0.35;

    const I = this.intensity;
    ctx.save();
    ctx.globalCompositeOperation = this.blend;
    const aR = R * (1.75 + b.charge * 0.7);
    const aI = I * (this.blend === 'multiply' ? 0.3 : 1);
    const aura = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, aR);
    aura.addColorStop(0, this.rgba(this.pal.ember, 0.2 * heat * aI));
    aura.addColorStop(0.5, this.rgba(this.pal.ember, 0.055 * heat * aI));
    aura.addColorStop(1, this.rgba(this.pal.ember, 0));
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(cx, cy, aR, 0, TAU); ctx.fill();
    ctx.restore();

    this.drawRings(ctx, cx, cy, R, heat);
    this.drawShards(ctx, cx, cy, R);
    this.drawCore(ctx, cx, cy, R, heat);

    if (b.ghost > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = b.ghost * 0.45;
      const off = b.ghost * 14;
      this.drawCore(ctx, cx - off, cy, R, heat, this.pal.ember);
      this.drawCore(ctx, cx + off, cy, R, heat, this.pal.acid);
      ctx.restore();
    }
  }

  drawRings(ctx, cx, cy, R, heat) {
    const b = this.boss;
    ctx.save();
    ctx.globalCompositeOperation = this.blend;
    const rings = 3 + b.phase;
    for (let i = 0; i < rings; i++) {
      const rr = R * (1.42 + i * 0.4 + Math.sin(b.breath * 0.7 + i) * 0.03);
      const dir = i % 2 ? -1 : 1;
      const rot = b.spin * (1.4 + i * 0.75) * dir + i * 0.6;
      const segs = 3 + i * 2 + b.phase;
      const arc = (TAU / segs) * (0.3 + Math.sin(b.breath * 0.5 + i * 2) * 0.12);
      ctx.strokeStyle = this.rgba(i === 1 ? this.pal.acid : this.pal.ember, (0.3 + heat * 0.26) * (1 - i * 0.13) * this.intensity);
      ctx.lineWidth = Math.max(1, R * (0.028 - i * 0.004));
      for (let s = 0; s < segs; s++) {
        const a0 = rot + (TAU / segs) * s;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, a0, a0 + arc);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawShards(ctx, cx, cy, R) {
    const b = this.boss;
    const n = 9 + b.phase * 6;
    ctx.save();
    ctx.globalCompositeOperation = this.blend;
    for (let i = 0; i < n; i++) {
      const seed = i * 2.399;
      const a = b.spin * (1.1 + (i % 3) * 0.5) * (i % 2 ? -1 : 1) + seed;
      const rr = R * (1.9 + Math.sin(b.breath * 0.9 + seed) * 0.34 + (i % 4) * 0.16);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr * 0.92;
      const s = R * (0.045 + (i % 3) * 0.022) * (1 + b.hit * 0.6);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + b.spin * 2.2);
      ctx.fillStyle = this.rgba(i % 5 === 0 ? this.pal.acid : this.pal.ember, (0.5 + b.hit * 0.4) * this.intensity);
      ctx.beginPath();
      ctx.moveTo(s * 1.9, 0); ctx.lineTo(-s, s * 0.8); ctx.lineTo(-s * 0.4, 0); ctx.lineTo(-s, -s * 0.8);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  corePoints(cx, cy, R) {
    const b = this.boss;
    const n = 7 + b.phase * 3;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (TAU / n) * i - Math.PI / 2 + b.spin * 0.4;
      const wob = 1
        + Math.sin(b.breath * 1.7 + i * 2.1) * (0.07 + b.phase * 0.04)
        + Math.sin(b.breath * 3.4 + i * 1.3) * 0.03
        + b.hit * Math.sin(i * 5.1) * 0.14;
      const rr = R * wob;
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
    return pts;
  }

  corePath(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }

  drawCore(ctx, cx, cy, R, heat, tint) {
    const b = this.boss;
    const I = this.intensity;
    const pts = this.corePoints(cx, cy, R);
    const hot = Math.min(1, heat + b.hit);

    ctx.save();
    this.corePath(ctx, pts);
    const g = ctx.createLinearGradient(cx, cy - R, cx, cy + R);
    g.addColorStop(0, this.rgba(tint || this.pal.body, 0.99));
    g.addColorStop(0.62, this.rgba(tint || this.pal.body, 0.985));
    g.addColorStop(1, this.rgba(tint || this.pal.ember, 0.34 + hot * 0.22));
    ctx.fillStyle = g;
    ctx.fill();

    ctx.save();
    ctx.clip();

    ctx.strokeStyle = this.rgba(this.pal.ink, 0.09 + b.hit * 0.2);
    ctx.lineWidth = 1;
    for (let i = 0; i < pts.length; i++) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = 'lighter';
    for (const c of this.cracks) {
      const lim = c.pts.length * c.grow;
      ctx.strokeStyle = this.rgba(this.pal.ember, (0.55 + b.hit * 0.45) * I);
      ctx.lineWidth = Math.max(1.4, R * 0.026);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      for (let i = 0; i < c.pts.length; i++) {
        if (i > lim) break;
        ctx.lineTo(cx + c.pts[i][0] * R, cy + c.pts[i][1] * R);
      }
      ctx.stroke();
      ctx.strokeStyle = this.rgba(this.pal.pale, 0.5 * I);
      ctx.lineWidth = Math.max(0.6, R * 0.008);
      ctx.stroke();
    }

    const eg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.75);
    const pulse = 0.42 + Math.sin(this.t * 5.5) * 0.12 + b.hit * 0.7 + b.charge * 0.3;
    eg.addColorStop(0, this.rgba(b.hit > 0.3 ? this.pal.pale : this.pal.ember, 0.95 * pulse * I));
    eg.addColorStop(0.45, this.rgba(this.pal.ember, 0.3 * pulse * I));
    eg.addColorStop(1, this.rgba(this.pal.ember, 0));
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.75, 0, TAU); ctx.fill();
    ctx.restore();

    ctx.strokeStyle = this.rgba(b.hit > 0.3 ? this.pal.pale : this.pal.ink, (0.42 + b.hit * 0.58));
    ctx.lineWidth = Math.max(1.1, R * 0.017);
    this.corePath(ctx, pts);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = this.rgba(this.pal.acid, (0.18 + b.charge * 0.55) * I);
    ctx.lineWidth = Math.max(1, R * 0.013);
    const n2 = 3 + b.phase;
    ctx.beginPath();
    for (let i = 0; i <= n2; i++) {
      const a = (TAU / n2) * i - b.spin * 1.6;
      const rr = R * 0.4;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.stroke();
    ctx.restore();
  }

  drawWaves(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = this.blend;
    for (const wv of this.waves) {
      const a = Math.max(0, wv.life);
      ctx.strokeStyle = this.rgba(wv.color, a * 0.75);
      ctx.lineWidth = Math.max(0.4, wv.w * a);
      ctx.beginPath();
      ctx.ellipse(wv.x, wv.y, wv.r, wv.r * wv.squash, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawParticles(ctx) {
    const items = this.pool.items;
    ctx.save();
    ctx.globalCompositeOperation = this.blend;
    for (let i = 0; i < this.pool.n; i++) {
      const p = items[i];
      const a = Math.max(0, p.life / p.max);
      if (p.kind === 'shard') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = this.rgba(p.color, a * 0.85);
        ctx.beginPath();
        ctx.moveTo(p.size, 0); ctx.lineTo(-p.size * 0.5, p.size * 0.6); ctx.lineTo(-p.size * 0.3, -p.size * 0.7);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (p.kind === 'spark') {
        const sp = Math.hypot(p.vx, p.vy);
        const tl = Math.min(26, sp * 0.028);
        ctx.strokeStyle = this.rgba(p.color, a * p.glow);
        ctx.lineWidth = p.size * a;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - (p.vx / (sp || 1)) * tl, p.y - (p.vy / (sp || 1)) * tl);
        ctx.stroke();
      } else {
        ctx.fillStyle = this.rgba(p.color, a * p.glow * (p.kind === 'dust' ? 0.5 : 1));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + a * 0.6), 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  rgba(hex, a) {
    if (!hex) return `rgba(255,255,255,${a})`;
    if (hex.startsWith('rgb')) return hex;
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
}
