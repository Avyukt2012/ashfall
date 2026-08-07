import { Battle, CONFIG, BOSS, MODES, INTENT_COPY } from './rules.js';
import { Arena, grainDataUrl } from './fx.js';
import { Sfx } from './audio.js';

const { gsap } = window;

gsap.ticker.lagSmoothing(0);
gsap.registerEase('brutal', p => 1 - Math.pow(1 - p, 5));
gsap.registerEase('thud', p => (p < 0.5 ? 8 * p * p * p * p : 1 - Math.pow(-2 * p + 2, 4) / 2));

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const root = document.documentElement;

const el = {
  shell: $('#shell'), arena: $('#arena'), flash: $('.flash'), blood: $('.bloodline'),
  grain: $('.grain'), numbers: $('#numbers'),
  title: $('#screenTitle'), battle: $('#screenBattle'), result: $('#screenResult'),
  begin: $('#beginBtn'), again: $('#againBtn'),
  bossName: $('#bossName'), bossTitle: $('#bossTitle'), phaseName: $('#phaseName'),
  phasePips: $('#phasePips'), bossHpNum: $('#bossHpNum'),
  bossFill: $('#bossFill'), bossLag: $('#bossLag'), bossTicks: $('#bossTicks'),
  bossManaWrap: $('#bossManaWrap'), bossManaVal: $('#bossManaVal'),
  playerFill: $('#playerFill'), playerLag: $('#playerLag'), playerHpNum: $('#playerHpNum'),
  guardTag: $('#guardTag'), manaCells: $('#manaCells'), manaVal: $('#manaVal'),
  manaWrap: $('#manaWrap'), manaCrit: $('#manaCrit'),
  intent: $('#intentCard'), intentIcon: $('#intentIcon'), intentLabel: $('#intentLabel'),
  intentHint: $('#intentHint'), intentThreat: $('#intentThreat'),
  log: $('#log'), actions: $('#actions'), deck: $('#deck'), mid: $('.mid'),
  banner: $('#banner'), bannerBg: $('.banner__bg'), bannerText: $('#bannerText'),
  resultWord: $('#resultWord'), resultLine: $('#resultLine'), resultEyebrow: $('#resultEyebrow'),
  scores: $('#scores'), themeToggle: $('#themeToggle'), muteToggle: $('#muteToggle'),
  record: $('#record'), streak: $('#streak'), dread: $('.dread'),
  shieldBar: $('#shieldBar'), shieldFill: $('#shieldFill'), shieldNum: $('#bossShieldNum'),
  bossHpMax: $('#bossHpMax'), modes: $('#modes')
};

let mode = 'normal';

const MANA_CELLS = 8;
const CELL = CONFIG.player.manaCap / MANA_CELLS;

const ICONS = {
  strike: ['M13 37 L35 11', 'M27 9 L39 9 L39 21', 'M11 25 L18 32'],
  sunder: ['M8 13 L24 27 L40 13', 'M8 25 L24 39 L40 25', 'M24 4 L24 10'],
  mend: ['M24 11 L24 37', 'M11 24 L37 24', 'M15 15 L33 33'],
  channel: ['M15 33 A13 13 0 0 1 33 33', 'M9 37 A21 21 0 0 1 39 37', 'M24 9 L24 21'],
  wait: ['M24 8 A16 16 0 1 1 23.9 8', 'M24 21 L24 27']
};

const sfx = new Sfx();
const arena = new Arena(el.arena);
let battle = null;
let busy = true;
let muted = false;
let pal = {};

/* ── palette ──────────────────────────────────────────── */

function readPalette() {
  const cs = getComputedStyle(root);
  const g = k => cs.getPropertyValue(k).trim();
  pal = {
    void: g('--void'), body: g('--body'), ink: g('--ink'), ember: g('--ember'),
    acid: g('--acid'), pale: g('--pale'), line: g('--line')
  };
  arena.setPalette(pal, root.dataset.theme === 'light');
}

/* ── boot ─────────────────────────────────────────────── */

root.style.setProperty('--grain-src', grainDataUrl(180, 26));
readPalette();
buildTicks();
buildManaCells();

let last = performance.now();
gsap.ticker.add(() => {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  arena.update(dt);
  arena.render();
});

let grainT = 0;
gsap.ticker.add(() => {
  grainT++;
  if (grainT % 5) return;
  gsap.set(el.grain, { x: (Math.random() * 60 - 30) | 0, y: (Math.random() * 60 - 30) | 0 });
});

window.addEventListener('resize', () => {
  arena.resize();
  syncFocus();
});

window.addEventListener('pointermove', e => {
  arena.setPointer(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
  gsap.to(root, {
    duration: 1.1, ease: 'power3.out',
    '--tilt-x': ((e.clientX / window.innerWidth - 0.5) * -14).toFixed(2) + 'px',
    '--tilt-y': ((e.clientY / window.innerHeight - 0.5) * -10).toFixed(2) + 'px'
  });
});

function syncFocus() {
  if (el.battle.getAttribute('aria-hidden') === 'true') { arena.setStage('title'); return; }
  arena.setStage('battle');
  const r = el.mid.getBoundingClientRect();
  arena.setFocus({ x: r.x, y: r.y, width: r.width, height: r.height });
}

function buildTicks() {
  el.bossTicks.innerHTML = '<i></i>'.repeat(18);
}

function buildManaCells() {
  el.manaCells.innerHTML = '';
  for (let i = 0; i < MANA_CELLS; i++) {
    const c = document.createElement('div');
    c.className = 'mana__cell';
    c.innerHTML = '<i></i>';
    el.manaCells.appendChild(c);
  }
}

/* ── helpers ──────────────────────────────────────────── */

const beat = d => gsap.to({}, { duration: d });

let stopTimer = null;
function hitstop(ms) {
  if (stopTimer) clearTimeout(stopTimer);
  gsap.globalTimeline.timeScale(0);
  arena.frozen = true;
  stopTimer = setTimeout(() => {
    gsap.globalTimeline.timeScale(1);
    arena.frozen = false;
    stopTimer = null;
  }, ms);
}

const DEV = new URLSearchParams(location.search).has('dev');
const RECORD_KEY = 'ashfall.record.v1';
const blankRecord = () => ({ runs: 0, wins: 0, losses: 0, bestTurns: 0, biggest: 0, streak: 0, bestStreak: 0, unboundWins: 0 });

function loadRecord() {
  try {
    const raw = localStorage.getItem(RECORD_KEY);
    return raw ? { ...blankRecord(), ...JSON.parse(raw) } : blankRecord();
  } catch (e) {
    return blankRecord();
  }
}

function saveRecord(r) {
  if (DEV) return;
  try { localStorage.setItem(RECORD_KEY, JSON.stringify(r)); } catch (e) { /* private mode */ }
}

let record = loadRecord();

function commitRecord(outcome, stats, modeKey) {
  const fresh = { turns: false, biggest: false, streak: false, unbound: false };
  record.runs++;
  if (outcome === 'victory') {
    record.wins++;
    if (modeKey === 'unbound') { record.unboundWins++; fresh.unbound = true; }
    record.streak++;
    if (record.streak > record.bestStreak) { record.bestStreak = record.streak; fresh.streak = true; }
    if (!record.bestTurns || stats.turns < record.bestTurns) { record.bestTurns = stats.turns; fresh.turns = true; }
  } else {
    if (outcome === 'defeat') record.losses++;
    record.streak = 0;
  }
  if (stats.biggest > record.biggest) { record.biggest = stats.biggest; fresh.biggest = true; }
  saveRecord(record);
  return fresh;
}

function paintRecord() {
  const wrap = el.record;
  if (!wrap) return;
  if (!record.runs) { wrap.hidden = true; return; }
  wrap.hidden = false;
  const rate = record.runs ? Math.round((record.wins / record.runs) * 100) : 0;
  wrap.innerHTML = [
    ['DUELS', record.runs],
    ['WON', record.wins],
    ['WIN RATE', rate + '%'],
    ['FASTEST KILL', record.bestTurns ? record.bestTurns + ' turns' : '—'],
    ['HEAVIEST BLOW', record.biggest || '—'],
    ['BEST STREAK', record.bestStreak],
    ...(unlocked ? [['UNBOUND KILLS', record.unboundWins]] : [])
  ].map(([k, v]) => `<div class="rec"><span class="rec__k">${k}</span><span class="rec__v">${v}</span></div>`).join('');
}

function show(screen, on) {
  screen.setAttribute('aria-hidden', on ? 'false' : 'true');
}

function flash(color, alpha = 0.85, dur = 0.5) {
  gsap.set(el.flash, { background: color });
  gsap.fromTo(el.flash, { opacity: alpha }, { opacity: 0, duration: dur, ease: 'expo.out' });
}

function bleed(strength = 1) {
  gsap.timeline()
    .fromTo(el.blood, { opacity: 0 }, { opacity: Math.min(0.9, 0.45 * strength), duration: 0.1, ease: 'power2.out' })
    .to(el.blood, { opacity: 0, duration: 0.9, ease: 'power2.in' });
}

function popNumber(text, kind, x, y, tag) {
  const n = document.createElement('div');
  n.className = `dmg dmg--${kind}`;
  n.innerHTML = text + (tag ? `<span class="dmg__tag">${tag}</span>` : '');
  n.style.left = x + 'px';
  n.style.top = y + 'px';
  el.numbers.appendChild(n);

  const drift = gsap.utils.random(-46, 46);
  const rot = gsap.utils.random(-7, 7);
  const big = kind === 'crit';

  gsap.timeline({ onComplete: () => n.remove() })
    .fromTo(n,
      { scale: big ? 0.2 : 0.45, opacity: 0, rotate: rot * 2.4 },
      { scale: big ? 1.22 : 1, opacity: 1, rotate: rot, duration: big ? 0.34 : 0.22, ease: 'back.out(3)' })
    .to(n, { scale: big ? 1 : 0.92, duration: 0.5, ease: 'power2.out' }, '>-0.05')
    .to(n, { y: -(big ? 190 : 130), x: drift, duration: 1.5, ease: 'power2.out' }, 0)
    .to(n, { opacity: 0, duration: 0.5, ease: 'power2.in' }, big ? 1.05 : 0.8);
  return n;
}

function centerOfBoss() {
  return { x: arena.cx, y: arena.cy };
}

function centerOfPlayer() {
  const r = el.deck.getBoundingClientRect();
  return { x: r.x + r.width * 0.28, y: r.y - 40 };
}

function logLine(html, who) {
  const row = document.createElement('div');
  row.className = `log__row log__row--${who}`;
  row.innerHTML = `<span class="log__n">${String(battle ? battle.turn : 0).padStart(2, '0')}</span><span>${html}</span>`;
  el.log.appendChild(row);
  const keep = window.innerWidth < 900 ? 4 : 7;
  while (el.log.children.length > keep) el.log.firstChild.remove();

  gsap.fromTo(row,
    { x: 26, opacity: 0, filter: 'blur(5px)' },
    { x: 0, opacity: 1, filter: 'blur(0px)', duration: 0.55, ease: 'power3.out' });
  gsap.to([...el.log.children].slice(0, -1), {
    opacity: (i, t, all) => 0.2 + (i / all.length) * 0.5,
    duration: 0.5, ease: 'power2.out'
  });
}

function countTo(node, to, dur = 0.5, prefix = '') {
  const obj = { v: Number(String(node.textContent).replace(/[^\d.-]/g, '')) || 0 };
  gsap.to(obj, {
    v: to, duration: dur, ease: 'power2.out',
    onUpdate: () => { node.textContent = prefix + Math.round(obj.v); }
  });
}

/* ── bars ─────────────────────────────────────────────── */

function setBar(fill, lag, frac, opts = {}) {
  gsap.to(fill, { scaleX: frac, duration: opts.snap ? 0.14 : 0.4, ease: opts.snap ? 'brutal' : 'power3.out' });
  gsap.to(lag, {
    scaleX: frac, duration: 0.75, delay: opts.delay ?? 0.32, ease: 'power4.inOut'
  });
}

function syncBossBar(snap) {
  const f = battle.boss.hp / battle.boss.maxHp;
  setBar(el.bossFill, el.bossLag, f, { snap });
  countTo(el.bossHpNum, battle.boss.hp, 0.55);
  arena.boss.hp = f;
  syncShield();
}

function syncShield() {
  const s = battle.boss.shield;
  const on = s > 0;
  gsap.to(el.shieldBar, { opacity: on ? 1 : 0, duration: 0.4, ease: 'power2.out' });
  gsap.to(el.shieldFill, {
    scaleX: Math.min(1, s / battle.mode.shieldCap),
    duration: 0.5, ease: 'power3.out'
  });
  gsap.to(el.shieldNum, {
    opacity: on ? 1 : 0, duration: 0.35,
    onComplete: () => { if (!on) el.shieldNum.textContent = ''; }
  });
  if (on) countTo(el.shieldNum, s, 0.5, '+');
  arena.boss.shield = Math.min(1, s / battle.mode.shieldCap);
}

function syncPlayerBar(snap) {
  const f = battle.player.hp / battle.player.maxHp;
  setBar(el.playerFill, el.playerLag, f, { snap });
  countTo(el.playerHpNum, battle.player.hp, 0.55);
  setDread(f);
}

let dreadTl = null;
function setDread(frac) {
  const low = frac > 0 && frac < 0.32;
  sfx.setDread(low ? 1 - frac / 0.32 : 0);
  document.body.classList.toggle('is-dying', low);
  if (low && !dreadTl) {
    dreadTl = gsap.timeline({ repeat: -1 })
      .call(() => sfx.pulse(true))
      .to(el.playerHpNum, { scale: 1.09, duration: 0.16, ease: 'power2.out' }, 0)
      .to(el.dread, { opacity: 0.5, duration: 0.16, ease: 'power2.out' }, 0)
      .to(el.playerHpNum, { scale: 1, duration: 0.6, ease: 'power2.out' })
      .to(el.dread, { opacity: 0.12, duration: 0.7, ease: 'power2.out' }, '<')
      .to({}, { duration: 0.42 });
  } else if (!low && dreadTl) {
    dreadTl.kill();
    dreadTl = null;
    gsap.to(el.playerHpNum, { scale: 1, duration: 0.3 });
    gsap.to(el.dread, { opacity: 0, duration: 0.6, ease: 'power2.out' });
  }
}

function syncMana(burst) {
  const m = battle.player.mana;
  const crit = m >= CONFIG.overchargeAt;
  countTo(el.manaVal, m, 0.4);
  [...el.manaCells.children].forEach((cell, i) => {
    const f = Math.max(0, Math.min(1, (m - i * CELL) / CELL));
    gsap.to(cell.firstElementChild, {
      scaleX: f, duration: 0.5, delay: burst ? i * 0.035 : 0, ease: 'power3.out'
    });
  });
  el.manaWrap.classList.toggle('is-crit', crit);
  gsap.to(el.manaCrit, { opacity: crit ? 1 : 0, duration: 0.4, ease: 'power2.out' });
  if (crit) {
    gsap.fromTo(el.manaCrit, { x: -8 }, { x: 0, duration: 0.5, ease: 'elastic.out(1,0.5)' });
  }
  const strikeBtn = el.actions.querySelector('[data-act="strike"]');
  strikeBtn.dataset.charged = crit ? '1' : '0';
  if (crit) {
    gsap.fromTo(strikeBtn.querySelector('.act__edge'),
      { scaleY: 0 }, { scaleY: 1, duration: 0.5, ease: 'power3.out' });
  } else {
    gsap.to(strikeBtn.querySelector('.act__edge'), { scaleY: 0, duration: 0.3 });
  }
}

function syncBossMana() {
  const m = battle.boss.mana;
  countTo(el.bossManaVal, m, 0.4);
  el.bossManaWrap.classList.toggle('is-live', m > 0);
  arena.boss.charge = m / CONFIG.boss.manaCap;
}

/* ── intent card ──────────────────────────────────────── */

function drawIcon(kind) {
  el.intentIcon.innerHTML = '';
  ICONS[kind].forEach((d, i) => {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    el.intentIcon.appendChild(p);
    const len = p.getTotalLength();
    gsap.fromTo(p,
      { strokeDasharray: len, strokeDashoffset: len },
      { strokeDashoffset: 0, duration: 0.55, delay: 0.07 + i * 0.09, ease: 'power2.inOut' });
  });
}

function setIntent(kind) {
  const c = INTENT_COPY[kind];
  const danger = kind === 'strike' || kind === 'sunder';
  const tl = gsap.timeline();

  tl.to([el.intentLabel, el.intentHint], {
    opacity: 0, x: -12, filter: 'blur(4px)', duration: 0.2, ease: 'power2.in', stagger: 0.04
  })
    .add(() => {
      el.intentLabel.textContent = c.label;
      el.intentHint.textContent = c.hint;
      el.intent.classList.toggle('is-danger', danger);
      el.intentThreat.textContent = kind === 'sunder'
        ? 'HEAVY — GUARD TO KEEP YOUR CHARGE'
        : danger ? 'INCOMING' : '';
      drawIcon(kind);
      gsap.set(el.intentIcon, { stroke: danger ? pal.ember : pal.acid });
    })
    .fromTo([el.intentLabel, el.intentHint],
      { opacity: 0, x: 14, filter: 'blur(4px)' },
      { opacity: 1, x: 0, filter: 'blur(0px)', duration: 0.45, ease: 'power3.out', stagger: 0.06 })
    .fromTo(el.intentThreat, { opacity: 0 }, { opacity: 1, duration: 0.4 }, '<')
    .fromTo(el.intent, { x: danger ? 7 : 3 }, { x: 0, duration: 0.6, ease: 'elastic.out(1,0.55)' }, '<');

  if (danger) {
    tl.fromTo(el.intent, { boxShadow: `0 0 0 1px ${pal.ember}, 0 0 60px ${pal.ember}` },
      { boxShadow: `0 0 0 1px transparent, 0 0 44px transparent`, duration: 0.9, ease: 'power2.out' }, '<');
  }
  return tl;
}

/* ── banner ───────────────────────────────────────────── */

function banner(text, color) {
  el.bannerText.textContent = text;
  gsap.set(el.bannerBg, { background: color || pal.ember });
  gsap.set(el.bannerText, { color: pal.void });
  gsap.set(el.banner, { visibility: 'visible' });

  return gsap.timeline({ onComplete: () => gsap.set(el.banner, { visibility: 'hidden' }) })
    .fromTo(el.bannerBg, { scaleY: 0 }, { scaleY: 1, duration: 0.32, ease: 'brutal' })
    .fromTo(el.bannerText,
      { opacity: 0, scale: 1.3, letterSpacing: '0.3em' },
      { opacity: 1, scale: 1, letterSpacing: '-0.03em', duration: 0.5, ease: 'power4.out' }, '-=0.1')
    .to(el.bannerText, { opacity: 0, scale: 0.94, duration: 0.3, ease: 'power2.in' }, '+=0.5')
    .to(el.bannerBg, { scaleY: 0, duration: 0.36, ease: 'power4.inOut' }, '-=0.14');
}

/* ── event choreography ───────────────────────────────── */

function play(events) {
  const tl = playEvents(events);
  const budget = Math.max(tl.duration(), 0.05) + 2.5;
  return new Promise(resolve => {
    let settled = false;
    const finish = () => { if (settled) return; settled = true; watchdog.kill(); resolve(); };
    tl.eventCallback('onComplete', finish);
    const watchdog = gsap.delayedCall(budget, () => {
      if (!settled) tl.progress(1, true);
      finish();
    });
    if (tl.progress() === 1) finish();
  });
}

function playEvents(events) {
  const tl = gsap.timeline();
  for (const ev of events) {
    switch (ev.t) {
      case 'strike': strikeBeat(tl, ev); break;
      case 'mend': mendBeat(tl, ev); break;
      case 'channel': channelBeat(tl, ev); break;
      case 'guard': guardBeat(tl, ev); break;
      case 'phase': phaseBeat(tl, ev); break;
      case 'bossStrike': bossStrikeBeat(tl, ev); break;
      case 'bossMend': bossMendBeat(tl, ev); break;
      case 'bossChannel': bossChannelBeat(tl, ev); break;
      case 'bossWait': bossWaitBeat(tl); break;
      case 'intent': tl.add(() => setIntent(ev.intent), '+=0.05'); break;
      case 'end': endBeat(tl, ev); break;
    }
  }
  return tl;
}

function strikeBeat(tl, ev) {
  const power = ev.amount / 55;
  tl.add(() => {
    arena.gather(Math.min(2, power));
    sfx.windUp(0.34);
    if (ev.overcharged) sfx.critical();
  })
    .to(el.shell, { duration: 0.34 })
    .add(() => {
      const c = centerOfBoss();
      arena.impact(power, ev.crit);
      sfx.hit(power, ev.crit);
      hitstop(ev.bossHp <= 0 ? 240 : ev.crit ? 140 : 60 + power * 24);
      flash(ev.crit ? pal.acid : pal.pale, ev.crit ? 0.75 : 0.3, ev.crit ? 0.7 : 0.36);
      popNumber(
        ev.amount, ev.crit ? 'crit' : 'out', c.x, c.y - 20,
        ev.crit ? 'CRITICAL' : ev.overcharged ? `OVERCHARGE ×${CONFIG.overchargeMult}` : null
      );
      if (ev.shielded > 0) {
        arena.shieldBreak(ev.shield === 0);
        sfx.block();
        popNumber('−' + ev.shielded, 'block', c.x + 120, c.y + 44,
          ev.shield === 0 ? 'WARD BROKEN' : 'WARD HOLDS');
      }
      syncBossBar(true);
      syncMana();
      logLine(
        ev.shielded > 0 && ev.shield > 0
          ? `Its ward drinks <b>${ev.shielded}</b> of <b>${ev.amount}</b>.`
          : ev.shielded > 0
            ? `You shatter the ward. <b>${ev.toHp}</b> lands.`
            : ev.crit ? `Clean through — <b>${ev.amount}</b>.`
              : ev.overcharged ? `You loose ${ev.manaSpent} charge. <b>${ev.amount}</b>.`
                : `You strike for <b>${ev.amount}</b>.`,
        'you'
      );
      if (ev.crit) shakeShell(22, 0.7);
      else shakeShell(9 + power * 6, 0.45);
    })
    .to(el.shell, { duration: ev.crit ? 0.65 : 0.4 });
}

function mendBeat(tl, ev) {
  tl.add(() => {
    arena.healPulse();
    sfx.heal();
  })
    .to(el.shell, { duration: 0.28 })
    .add(() => {
      const c = centerOfPlayer();
      popNumber('+' + ev.amount, 'heal', c.x, c.y, ev.wasted > 0 ? `${ev.wasted} SPILLED` : null);
      syncPlayerBar();
      syncMana();
      logLine(ev.amount === 0
        ? `Already whole. <b>${ev.raw}</b> spilled.`
        : `You knit yourself for <b>${ev.amount}</b>.`, 'you');
      flash(pal.pale, 0.16, 0.5);
    })
    .to(el.shell, { duration: 0.45 });
}

function channelBeat(tl, ev) {
  const wasCrit = el.manaWrap.classList.contains('is-crit');
  tl.add(() => {
    arena.channelPulse(ev.amount);
    sfx.charge(ev.mana);
    const c = centerOfPlayer();
    popNumber('+' + ev.amount, 'mana', c.x + 70, c.y, 'CHARGE');
    syncMana(true);
    logLine(`You draw <b>+${ev.amount}</b> charge.`, 'you');
  })
    .to(el.shell, { duration: 0.42 })
    .add(() => {
      if (!wasCrit && battle.player.mana >= CONFIG.overchargeAt) {
        sfx.critical();
        flash(pal.acid, 0.22, 0.6);
        arena.wave(arena.cx, arena.horizon - 8, { vr: 700, w: 3, color: pal.acid, max: 0.8, squash: 0.2 });
        logLine(`<b>CHARGE CRITICAL</b> — next strike ×${CONFIG.overchargeMult}`, 'sys');
        shakeShell(7, 0.4);
      }
    })
    .to(el.shell, { duration: 0.3 });
}

function guardBeat(tl, ev) {
  tl.add(() => {
    sfx.guard();
    arena.wave(arena.cx, arena.horizon - 8, { vr: 420, w: 2.4, color: pal.acid, max: 0.6, squash: 0.22 });
    gsap.to(el.guardTag, { opacity: 1, y: 0, duration: 0.4, ease: 'back.out(2.4)' });
    logLine(`You set your guard.`, 'you');
  }).to(el.shell, { duration: 0.5 });
}

function phaseBeat(tl, ev) {
  const phase = battle.phases[ev.to];
  tl.add(() => {
    arena.phaseBreak(ev.to);
    sfx.phase();
    sfx.setAmbientPhase(ev.to);
    hitstop(180);
    flash(pal.pale, 1, 0.9);
    shakeShell(30, 1.1);
    el.phaseName.textContent = phase.name;
    [...el.phasePips.children].forEach((p, i) => p.classList.toggle('is-on', i <= ev.to));
    gsap.fromTo(el.phaseName, { opacity: 0, letterSpacing: '1em' },
      { opacity: 1, letterSpacing: '0.4em', duration: 0.8, ease: 'power4.out' });
    gsap.fromTo([...el.phasePips.children], { scaleY: 3, opacity: 0.2 },
      { scaleY: 1, opacity: 1, duration: 0.6, stagger: 0.07, ease: 'back.out(3)' });
    logLine(`<b>${phase.name}</b>`, 'sys');
  })
    .to(el.shell, { duration: 0.15 })
    .call(() => banner(phase.name === 'ENRAGED' ? 'IT IS ENRAGED' : 'IT WAKES', pal.ember))
    .to(el.shell, { duration: 2.05 });
}

function bossStrikeBeat(tl, ev) {
  const power = Math.min(2, ev.raw / 60);
  tl.add(() => {
    arena.windup(ev.heavy);
    sfx.windUp(ev.heavy ? 0.62 : 0.4);
    gsap.to(el.intent, { scale: 1.04, duration: 0.4, ease: 'power2.out', yoyo: true, repeat: 1 });
  })
    .to(el.shell, { duration: ev.heavy ? 0.62 : 0.42 })
    .add(() => {
      const c = centerOfPlayer();
      arena.bossImpact(power, ev.heavy);
      hitstop(ev.playerHp <= 0 ? 220 : ev.heavy ? 120 : ev.guarded ? 90 : 55);
      if (ev.guarded) {
        sfx.block();
        arena.guarded();
        popNumber(ev.amount, 'in', c.x, c.y);
        popNumber('−' + ev.prevented, 'block', c.x + 130, c.y + 30, 'TURNED');
        flash(pal.acid, 0.3, 0.4);
      } else {
        ev.heavy ? sfx.heavy() : sfx.incoming(power);
        popNumber(ev.amount, 'in', c.x, c.y, ev.heavy ? 'SUNDER' : null);
        flash(pal.ember, ev.heavy ? 0.55 : 0.26, 0.5);
      }
      bleed(ev.heavy ? 2 : power);
      shakeShell(ev.heavy ? 34 : 12 + power * 8, ev.heavy ? 1 : 0.55);
      syncPlayerBar(true);
      syncBossMana();
      gsap.to(el.guardTag, { opacity: 0, y: 3, duration: 0.3 });

      if (ev.guarded) {
        logLine(`You turn ${ev.prevented} aside. <b>${ev.amount}</b> lands.`, 'boss');
      } else {
        logLine(ev.heavy
          ? `${BOSS.name} <b>sunders</b> you for <b>${ev.amount}</b>.`
          : `${BOSS.name} strikes you for <b>${ev.amount}</b>.`, 'boss');
      }
    })
    .to(el.shell, { duration: 0.35 })
    .add(() => {
      if (ev.converted > 0) {
        const c = centerOfPlayer();
        arena.motes(24, arena.cx, arena.horizon - 10, { r0: 80, r1: 340, pull: 12, color: pal.acid, life: 0.7 });
        popNumber('+' + ev.converted, 'mana', c.x + 90, c.y + 20, 'CONVERTED');
        sfx.charge(battle.player.mana);
        syncMana(true);
        logLine(`The blow feeds you <b>+${ev.converted}</b> charge.`, 'you');
      }
      if (ev.stripped > 0) {
        const c = centerOfPlayer();
        arena.manaBreak();
        sfx.burst({ dur: 0.5, freq: 2200, q: 1.2, gain: 0.4, sweep: -1900 });
        popNumber('−' + ev.stripped, 'block', c.x + 90, c.y + 20, 'CHARGE BROKEN');
        syncMana(true);
        shakeShell(11, 0.5);
        logLine(`Your charge <b>shatters</b> — ${ev.stripped} lost.`, 'boss');
      }
    })
    .to(el.shell, { duration: ev.converted || ev.stripped ? 0.45 : 0.05 });
}

function bossMendBeat(tl, ev) {
  tl.add(() => {
    const c = centerOfBoss();
    arena.motes(34, arena.cx, arena.cy, { r0: 120, r1: 420, pull: 11, color: pal.ember, life: 0.9 });
    sfx.tone({ f: 260, to: 350, dur: 0.6, gain: 0.16, type: 'sine' });
    sfx.tone({ f: 390, dur: 0.5, gain: 0.1, type: 'sine', delay: 0.09 });
    if (ev.amount > 0) popNumber('+' + ev.amount, 'heal', c.x, c.y - 20, 'WARDEN MENDS');
    if (ev.shieldGain > 0) {
      arena.boss.shieldHit = 1;
      arena.wave(arena.cx, arena.cy, { r0: arena.R * 2.2, vr: -420, w: 3, color: pal.pale, max: 0.8 });
      popNumber('+' + ev.shieldGain, 'heal', c.x, c.y + 54, 'WARD');
    }
    syncBossBar();
    syncBossMana();
    logLine(ev.shieldGain > 0 && ev.amount === 0
      ? `${BOSS.name} folds <b>${ev.shieldGain}</b> into a ward.`
      : ev.shieldGain > 0
        ? `${BOSS.name} mends <b>${ev.amount}</b> and wards <b>${ev.shieldGain}</b>.`
        : ev.amount === 0
          ? `${BOSS.name} is already whole.`
          : `${BOSS.name} closes its wounds for <b>${ev.amount}</b>.`, 'boss');
  }).to(el.shell, { duration: 0.75 });
}

function bossChannelBeat(tl, ev) {
  tl.add(() => {
    arena.motes(22, arena.cx, arena.cy, { r0: 150, r1: 430, pull: 10, color: pal.ember, life: 0.8 });
    arena.wave(arena.cx, arena.cy, { r0: arena.R * 3, vr: -300, w: 2, color: pal.ember, max: 0.7 });
    sfx.tone({ f: 150 + ev.mana * 4, to: 240 + ev.mana * 6, dur: 0.45, gain: 0.15, type: 'sawtooth' });
    syncBossMana();
    logLine(`${BOSS.name} gathers <b>+${ev.amount}</b>.`, 'boss');
  }).to(el.shell, { duration: 0.62 });
}

function bossWaitBeat(tl) {
  tl.add(() => {
    sfx.burst({ dur: 0.5, freq: 120, q: 0.7, gain: 0.1 });
    gsap.fromTo(el.intent, { opacity: 1 }, { opacity: 0.55, duration: 0.35, yoyo: true, repeat: 1 });
    logLine(`${BOSS.name} does not move.`, 'boss');
  }).to(el.shell, { duration: 0.5 });
}

function endBeat(tl, ev) {
  tl.add(() => {
    el.actions.classList.add('is-locked');
    setDread(1);
    sfx.stopAmbient();
    if (ev.outcome === 'defeat') {
      arena.fall();
      sfx.fall();
      flash(pal.ember, 0.6, 1.2);
    } else {
      arena.shatter();
      sfx.shatter();
      gsap.to(arena, { timeScale: 0.22, duration: 0.35, ease: 'power2.out' });
      flash(pal.pale, 1, 1.6);
    }
    shakeShell(38, 1.4);
  })
    .to(el.shell, { duration: 1.15 })
    .add(() => {
      if (ev.outcome !== 'defeat') gsap.to(arena, { timeScale: 1, duration: 1.4, ease: 'power2.inOut' });
    })
    .add(() => showResult(ev), '+=0.35');
}

function shakeShell(mag, dur) {
  gsap.killTweensOf(shakeProxy);
  shakeProxy.v = mag;
  gsap.to(shakeProxy, {
    v: 0, duration: dur, ease: 'power3.out',
    onUpdate: () => {
      const m = shakeProxy.v;
      root.style.setProperty('--shake-x', (Math.random() * 2 - 1) * m + 'px');
      root.style.setProperty('--shake-y', (Math.random() * 2 - 1) * m * 0.7 + 'px');
    },
    onComplete: () => {
      root.style.setProperty('--shake-x', '0px');
      root.style.setProperty('--shake-y', '0px');
    }
  });
}
const shakeProxy = { v: 0 };

/* ── turn loop ────────────────────────────────────────── */

async function takeTurn(action) {
  if (busy || !battle || battle.over) return;
  busy = true;
  el.actions.classList.add('is-locked');

  const pressed = el.actions.querySelector(`[data-act="${action}"]`);
  gsap.timeline()
    .to(pressed.querySelector('.act__sweep'), { y: '0%', duration: 0.24, ease: 'brutal' })
    .to(pressed.querySelector('.act__sweep'), { y: '-101%', duration: 0.34, ease: 'power3.in' }, '+=0.05')
    .set(pressed.querySelector('.act__sweep'), { y: '101%' });

  root.dataset.stage = 'player';
  await play(battle.playerTurn(action));
  if (battle.over) { root.dataset.stage = 'over'; return; }

  await beat(0.18);
  root.dataset.stage = 'boss';
  await play(battle.bossTurn());
  if (battle.over) { root.dataset.stage = 'over'; return; }

  await beat(0.1);
  root.dataset.stage = 'idle';
  busy = false;
  el.actions.classList.remove('is-locked');
  gsap.fromTo([...el.actions.children],
    { y: 6, opacity: 0.35 },
    { y: 0, opacity: 1, duration: 0.5, stagger: 0.05, ease: 'power3.out' });
}

/* ── screens ──────────────────────────────────────────── */

async function startBattle() {
  busy = true;
  el.actions.classList.add('is-locked');
  battle = new Battle(mode);
  arena.reset();
  el.log.innerHTML = '';
  el.phaseName.textContent = battle.phases[0].name;
  el.bossTitle.textContent = battle.mode.name;
  el.bossHpMax.textContent = '/' + battle.boss.maxHp;
  el.bossHpNum.textContent = battle.boss.maxHp;
  el.playerHpNum.textContent = battle.player.maxHp;
  el.manaVal.textContent = '0';
  el.bossManaVal.textContent = '0';
  [...el.phasePips.children].forEach((p, i) => p.classList.toggle('is-on', i === 0));
  gsap.set([el.bossFill, el.bossLag, el.playerFill, el.playerLag], { scaleX: 1 });
  gsap.set([...el.manaCells.children].map(c => c.firstElementChild), { scaleX: 0 });
  gsap.set(el.guardTag, { opacity: 0, y: 3 });
  gsap.set([el.shieldBar, el.shieldNum], { opacity: 0 });
  gsap.set(el.shieldFill, { scaleX: 0 });
  el.shieldNum.textContent = '';
  arena.boss.shield = 0;
  gsap.set(el.manaCrit, { opacity: 0 });
  el.manaWrap.classList.remove('is-crit');
  el.actions.querySelector('[data-act="strike"]').dataset.charged = '0';
  syncBossMana();

  show(el.title, false);
  show(el.result, false);
  show(el.battle, true);
  syncFocus();

  const tl = gsap.timeline();
  tl.fromTo('#bossPlate', { y: -34, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'power4.out' })
    .fromTo([el.bossFill, el.playerFill], { scaleX: 0 }, { scaleX: 1, duration: 1, ease: 'brutal', stagger: 0.1 }, 0.1)
    .fromTo(el.intent, { x: 44, opacity: 0 }, { x: 0, opacity: 1, duration: 0.75, ease: 'power4.out' }, 0.25)
    .fromTo('.deck__status', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'power4.out' }, 0.3)
    .fromTo([...el.actions.children], { y: 34, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.7, stagger: 0.07, ease: 'power4.out' }, 0.36);

  arena.boss.visible = true;
  gsap.fromTo(arena.boss, { hp: 0 }, { hp: 1, duration: 1 });

  await tl;
  await banner(`${BOSS.name} — ${battle.mode.name}`, pal.ember);
  logLine(`<b>${battle.mode.name}</b>`, 'sys');
  setIntent(battle.intent);
  await beat(0.4);

  busy = false;
  el.actions.classList.remove('is-locked');
}

function showResult(ev) {
  const s = ev.stats;
  const won = ev.outcome === 'victory';
  const draw = ev.outcome === 'draw';
  const word = draw ? 'MUTUAL RUIN' : won ? 'VICTORY' : 'FELLED';

  el.resultWord.innerHTML = [...word].map(c =>
    c === ' ' ? '<span class="glyph">&nbsp;</span>' : `<span class="glyph">${c}</span>`).join('');
  if (won) el.resultWord.children[0].style.color = pal.acid;
  else el.resultWord.children[0].style.color = pal.ember;

  el.resultLine.textContent = draw
    ? 'You broke it as it broke you. The ash settles over both.'
    : won
      ? (ev.mode === 'unbound'
          ? `${BOSS.name} unbound, and unmade anyway. Almost nobody does this.`
          : `${BOSS.name} is unmade. The embers go out one by one.`)
      : `The warden stands over you, still burning. It was never in a hurry.`;
  const trial = MODES[ev.mode] || MODES.normal;
  el.resultEyebrow.lastChild.textContent = ev.mode === 'unbound'
    ? (won ? 'THE UNBOUND TRIAL — CLEARED' : 'THE UNBOUND TRIAL')
    : (won ? 'THE WARDEN IS UNMADE' : 'THE DUEL IS ENDED');

  const acc = Math.round(s.dealt / Math.max(1, s.turns));
  const fresh = commitRecord(ev.outcome, s, ev.mode);
  paintRecord();

  el.streak.hidden = !(won && record.streak > 1);
  el.streak.textContent = `${record.streak} IN A ROW`;

  const cards = [
    ['TURNS', s.turns, false, fresh.turns],
    ['DAMAGE DEALT', s.dealt, false, false],
    ['HEAVIEST BLOW', s.biggest, true, fresh.biggest],
    ['DAMAGE TAKEN', s.taken, false, false],
    ['TURNED ASIDE', s.blocked, false, false],
    ['MENDED', s.healed, false, false],
    ['PER TURN', acc, false, false],
    ['CRITS', s.crits, s.crits > 0, false]
  ];
  el.scores.innerHTML = cards.map(([k, v, hi, isNew]) =>
    `<div class="score${hi ? ' score--hi' : ''}${isNew ? ' score--new' : ''}">
      <p class="score__k">${k}${isNew ? '<em>BEST</em>' : ''}</p>
      <p class="score__v">${v}</p>
    </div>`).join('');

  show(el.battle, false);
  show(el.result, true);
  syncFocus();

  gsap.timeline()
    .fromTo(el.resultEyebrow, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' })
    .fromTo('#resultEyebrow .eyebrow__tick', { scaleX: 0 }, { scaleX: 1, duration: 0.7, ease: 'brutal' }, '<')
    .fromTo(el.streak, { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 0.5, ease: 'back.out(2)' }, '-=0.3')
    .fromTo(el.resultWord.children,
      { y: '110%', opacity: 0, rotateX: -70 },
      { y: '0%', opacity: 1, rotateX: 0, duration: 1, stagger: 0.055, ease: 'power4.out' }, '-=0.35')
    .fromTo(el.resultLine, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power3.out' }, '-=0.6')
    .fromTo('.score', { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.05, ease: 'power4.out' }, '-=0.45')
    .fromTo(el.again, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out' }, '-=0.3');

  [...el.scores.querySelectorAll('.score__v')].forEach((n, i) => {
    const target = Number(n.textContent);
    n.textContent = '0';
    gsap.to({ v: 0 }, {
      v: target, duration: 0.9, delay: 0.7 + i * 0.05, ease: 'power2.out',
      onUpdate() { n.textContent = Math.round(this.targets()[0].v); }
    });
  });
}

/* ── intro ────────────────────────────────────────────── */

async function intro() {
  paintRecord();
  gsap.set(['.crop', '.wordmark .glyph', '[data-reveal]', '[data-primer]', el.begin, '.title-rule i'], { opacity: 0 });
  if (!el.record.hidden) gsap.set('.rec', { opacity: 0 });
  await document.fonts.ready;
  arena.boss.visible = true;
  arena.boss.phase = 1;
  syncFocus();

  gsap.timeline()
    .to('.crop', { opacity: 1, duration: 0.5, stagger: 0.08, ease: 'power2.out' })
    .fromTo('.crop', { scale: 2.4, rotate: 25 }, { scale: 1, rotate: 0, duration: 0.9, stagger: 0.08, ease: 'power4.out' }, '<')
    .to('.screen--title [data-reveal]', { opacity: 1, duration: 0.5 }, 0.3)
    .fromTo('.screen--title .eyebrow__tick', { scaleX: 0 }, { scaleX: 1, duration: 0.8, ease: 'brutal' }, 0.3)
    .fromTo('.wordmark .glyph',
      { y: '118%', opacity: 0, rotateX: -78, scaleY: 1.5 },
      { y: '0%', opacity: 1, rotateX: 0, scaleY: 1, duration: 1.15, stagger: 0.06, ease: 'power4.out' }, 0.42)
    .to('.title-rule i', { opacity: 1, scaleX: 1, duration: 1.1, ease: 'brutal' }, 0.95)
    .to('[data-primer]', { opacity: 1, duration: 0.5, stagger: 0.07 }, 1.05)
    .fromTo('[data-primer]', { x: -18 }, { x: 0, duration: 0.8, stagger: 0.07, ease: 'power4.out' }, 1.05)
    .to(el.begin, { opacity: 1, duration: 0.6, ease: 'power2.out' }, 1.35)
    .fromTo(el.begin, { y: 22 }, { y: 0, duration: 0.9, ease: 'power4.out' }, 1.35)
    .to('.rec', { opacity: 1, duration: 0.5, stagger: 0.05 }, 1.5)
    .fromTo('.rec', { y: 14 }, { y: 0, duration: 0.8, stagger: 0.05, ease: 'power4.out' }, 1.5);

  gsap.to('.wordmark .glyph', {
    y: i => -3 - (i % 3) * 2, duration: 2.4, ease: 'sine.inOut',
    repeat: -1, yoyo: true, stagger: { each: 0.12, from: 'center' }, delay: 1.8
  });
}

/* ── input ────────────────────────────────────────────── */

const KEYS = { '1': 'strike', '2': 'mend', '3': 'channel', '4': 'guard' };

window.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    if (el.title.getAttribute('aria-hidden') !== 'true') { e.preventDefault(); el.begin.click(); }
    else if (el.result.getAttribute('aria-hidden') !== 'true') { e.preventDefault(); el.again.click(); }
    return;
  }
  const act = KEYS[e.key];
  if (act && !busy) {
    const btn = el.actions.querySelector(`[data-act="${act}"]`);
    gsap.fromTo(btn, { scale: 0.96 }, { scale: 1, duration: 0.5, ease: 'elastic.out(1,0.5)' });
    takeTurn(act);
  }
});

el.actions.addEventListener('click', e => {
  const btn = e.target.closest('.act');
  if (btn) takeTurn(btn.dataset.act);
});

$$('.act, .cta').forEach(btn => {
  btn.addEventListener('pointerenter', () => sfx.hover());
  btn.addEventListener('pointermove', e => {
    const r = btn.getBoundingClientRect();
    gsap.to(btn, {
      x: (e.clientX - (r.x + r.width / 2)) * 0.16,
      y: (e.clientY - (r.y + r.height / 2)) * 0.22,
      duration: 0.6, ease: 'power3.out'
    });
  });
  btn.addEventListener('pointerleave', () => {
    gsap.to(btn, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1,0.4)' });
  });
});

el.begin.addEventListener('click', async () => {
  sfx.boot(); sfx.resume(); sfx.ui(); sfx.startAmbient();
  el.begin.blur();
  await gsap.timeline()
    .to('.wordmark .glyph', {
      y: '-118%', opacity: 0, rotateX: 70, duration: 0.7,
      stagger: { each: 0.045, from: 'end' }, ease: 'power4.in'
    })
    .to(['[data-reveal]', '[data-primer]', el.begin, '.title-rule', el.record],
      { opacity: 0, y: -20, duration: 0.45, stagger: 0.03, ease: 'power3.in' }, 0.1);
  startBattle();
});

el.again.addEventListener('click', async () => {
  sfx.ui(); sfx.resume(); sfx.startAmbient();
  el.again.blur();
  await gsap.timeline()
    .to(el.resultWord.children, {
      y: '-110%', opacity: 0, duration: 0.6,
      stagger: { each: 0.04, from: 'end' }, ease: 'power4.in'
    })
    .to([el.resultEyebrow, el.streak, el.resultLine, '.score', el.again],
      { opacity: 0, y: -18, duration: 0.4, stagger: 0.02, ease: 'power3.in' }, 0.05);
  startBattle();
});

el.themeToggle.addEventListener('click', () => {
  sfx.ui();
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  gsap.delayedCall(0.05, () => {
    readPalette();
    if (battle) {
      gsap.set(el.intentIcon, {
        stroke: (battle.intent === 'strike' || battle.intent === 'sunder') ? pal.ember : pal.acid
      });
    }
  });
  gsap.fromTo(el.flash, { opacity: 0.5, background: next === 'dark' ? '#000' : '#fff' },
    { opacity: 0, duration: 0.8, ease: 'power2.out' });
  gsap.fromTo(el.shell, { scale: 0.994 }, { scale: 1, duration: 1, ease: 'power4.out' });
});

el.muteToggle.addEventListener('click', () => {
  muted = !muted;
  sfx.boot();
  sfx.setMuted(muted);
  el.muteToggle.classList.toggle('is-off', muted);
  if (!muted) { sfx.resume(); sfx.ui(); }
});

/* ── konami: unlock the unbound trial ─────────────────── */

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
const UNLOCK_KEY = 'ashfall.unbound';
let konami = 0;
let unlocked = false;

try { unlocked = localStorage.getItem(UNLOCK_KEY) === '1'; } catch (e) { unlocked = false; }

function setMode(next) {
  mode = next;
  root.dataset.mode = next;
  [...el.modes.querySelectorAll('.mode')].forEach(b =>
    b.classList.toggle('is-on', b.dataset.mode === next));
  readPalette();
  sfx.ui();
}

function revealModes(fanfare) {
  el.modes.hidden = false;
  paintRecord();
  if (!fanfare) return;
  sfx.boot(); sfx.resume();
  sfx.phase();
  sfx.critical();
  flash(pal.ember, 0.9, 1.1);
  shakeShell(26, 1.1);
  arena.phaseBreak(2);
  banner('UNBOUND', pal.ember);
  gsap.fromTo('.wordmark .glyph',
    { x: () => gsap.utils.random(-26, 26), y: () => gsap.utils.random(-18, 18), opacity: 0.35 },
    { x: 0, y: 0, opacity: 1, duration: 0.9, stagger: { each: 0.04, from: 'random' }, ease: 'power4.out' });
  gsap.fromTo(el.modes,
    { opacity: 0, y: 24 },
    { opacity: 1, y: 0, duration: 0.8, delay: 0.5, ease: 'power4.out' });
  gsap.fromTo('.mode',
    { scaleY: 2.4, opacity: 0 },
    { scaleY: 1, opacity: 1, duration: 0.7, delay: 0.6, stagger: 0.08, ease: 'back.out(2.6)' });
}

window.addEventListener('keydown', e => {
  const want = KONAMI[konami];
  const got = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  konami = got === want ? konami + 1 : (got === KONAMI[0] ? 1 : 0);
  if (konami < KONAMI.length) return;
  konami = 0;
  if (unlocked) return;
  unlocked = true;
  try { localStorage.setItem(UNLOCK_KEY, '1'); } catch (err) { /* private mode */ }
  revealModes(true);
});

el.modes.addEventListener('click', e => {
  const btn = e.target.closest('.mode');
  if (btn) setMode(btn.dataset.mode);
});

if (unlocked) revealModes(false);

if (DEV) {
  window.ASHFALL = {
    get battle() { return battle; },
    arena, sfx, play, takeTurn,
    setBossHp(v) { battle.boss.hp = v; syncBossBar(true); },
    setPlayerHp(v) { battle.player.hp = v; syncPlayerBar(true); }
  };
}

gsap.to('.mute-toggle__bars i', {
  scaleY: () => 0.6 + Math.random() * 2.4,
  duration: 0.45, repeat: -1, yoyo: true, ease: 'sine.inOut',
  stagger: { each: 0.1, from: 'random' }
});

intro();
