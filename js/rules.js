export const CONFIG = {
  player: { maxHp: 250, manaCap: 40 },
  boss: { maxHp: 450, manaCap: 40 },
  strike: [25, 49],
  mend: [10, 19],
  channel: [5, 19],
  overchargeAt: 25,
  overchargeMult: 3.0,
  mendManaMult: 1.1,
  sunderStrip: 0.6,
  critChance: 0.12,
  critMult: 1.8,
  guardMult: 0.5,
  guardConversion: 0.4,
  shieldCap: 140
};

export const BOSS = {
  name: 'VYRETH',
  title: 'THE ASHEN WARDEN'
};

export const PHASES = [
  {
    id: 0,
    key: 'dormant',
    name: 'DORMANT',
    threshold: 0.66,
    strike: [15, 54],
    mend: [12, 18],
    channel: [2, 14],
    table: [['strike', 1], ['mend', 2], ['channel', 2], ['wait', 3]]
  },
  {
    id: 1,
    key: 'awakened',
    name: 'AWAKENED',
    threshold: 0.33,
    strike: [26, 62],
    mend: [15, 25],
    channel: [6, 18],
    table: [['strike', 4], ['mend', 2], ['channel', 2], ['wait', 1]]
  },
  {
    id: 2,
    key: 'enraged',
    name: 'ENRAGED',
    threshold: -1,
    strike: [32, 68],
    sunder: [56, 90],
    mend: [15, 24],
    channel: [6, 20],
    table: [['strike', 4], ['sunder', 3], ['channel', 2], ['mend', 2]]
  }
];

export const UNBOUND_PHASES = [
  {
    id: 0,
    key: 'awakened',
    name: 'AWAKENED',
    threshold: 0.62,
    strike: [26, 58],
    sunder: [48, 74],
    mend: [16, 26],
    channel: [8, 20],
    table: [['strike', 4], ['sunder', 2], ['mend', 2], ['channel', 2], ['eclipse', 2]]
  },
  {
    id: 1,
    key: 'enraged',
    name: 'ENRAGED',
    threshold: 0.28,
    strike: [30, 64],
    sunder: [56, 84],
    mend: [18, 28],
    channel: [9, 22],
    table: [['strike', 4], ['sunder', 3], ['mend', 1], ['channel', 1], ['eclipse', 3]]
  },
  {
    id: 2,
    key: 'unbound',
    name: 'UNBOUND',
    threshold: -1,
    strike: [34, 70],
    sunder: [62, 92],
    mend: [20, 30],
    channel: [10, 24],
    table: [['strike', 4], ['sunder', 4], ['mend', 1], ['channel', 1], ['eclipse', 3]]
  }
];

export const MODES = {
  normal: {
    key: 'normal',
    name: 'THE ASHEN WARDEN',
    label: 'ASHEN',
    bossHp: 600,
    playerHp: 250,
    shieldCap: 140,
    sunderStrip: 0.6,
    guardConversion: 0.4,
    guardMult: 0.5,
    phases: PHASES
  },
  unbound: {
    key: 'unbound',
    name: 'VYRETH UNBOUND',
    label: 'UNBOUND',
    bossHp: 1000,
    playerHp: 490,
    shieldCap: 150,
    sunderStrip: 1,
    guardConversion: 0.32,
    guardMult: 0.58,
    eclipseTurns: 3,
    eclipseBonus: 1.2,
    playerDmg: 1.8,
    playerMend: 1.7,
    phases: UNBOUND_PHASES
  }
};

export const INTENT_COPY = {
  strike: { label: 'STRIKE', hint: 'Winding up a blow' },
  sunder: { label: 'SUNDER', hint: 'Gathering a heavy break' },
  mend: { label: 'MEND', hint: 'Knitting its wounds shut' },
  channel: { label: 'CHANNEL', hint: 'Drawing power inward' },
  wait: { label: 'STILL', hint: 'Watching. Waiting.' },
  eclipse: { label: 'ECLIPSE', hint: 'Blotting itself from sight' },
  unseen: { label: 'UNSEEN', hint: 'You cannot read what is coming' }
};

export function makeRng(seed) {
  if (seed === undefined) return Math.random;
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export class Battle {
  constructor(modeKey = 'normal', seed) {
    this.mode = MODES[modeKey] || MODES.normal;
    this.phases = this.mode.phases;
    this.rng = makeRng(seed);
    this.player = { hp: this.mode.playerHp, maxHp: this.mode.playerHp, mana: 0, guarding: false };
    this.boss = { hp: this.mode.bossHp, maxHp: this.mode.bossHp, mana: 0, shield: 0 };
    this.phase = 0;
    this.turn = 0;
    this.over = false;
    this.outcome = null;
    this.stats = {
      turns: 0, dealt: 0, taken: 0, healed: 0, blocked: 0,
      biggest: 0, crits: 0, channels: 0, shieldBroken: 0
    };
    this.intent = null;
    this.eclipse = 0;
    this.rollIntent();
  }

  range([lo, hi]) {
    return lo + Math.floor(this.rng() * (hi - lo + 1));
  }

  get phaseData() {
    return this.phases[this.phase];
  }

  get overcharged() {
    return this.player.mana >= CONFIG.overchargeAt;
  }

  get lastPhase() {
    return this.phase === this.phases.length - 1;
  }

  absorb(amount) {
    const toShield = Math.min(this.boss.shield, amount);
    this.boss.shield -= toShield;
    const toHp = amount - toShield;
    this.boss.hp = Math.max(0, this.boss.hp - toHp);
    this.stats.shieldBroken += toShield;
    return { toShield, toHp };
  }

  syncPhase(events) {
    const frac = this.boss.hp / this.boss.maxHp;
    let next = this.phase;
    while (next < this.phases.length - 1 && frac <= this.phases[next].threshold) next++;
    if (next !== this.phase) {
      const from = this.phase;
      this.phase = next;
      events.push({ t: 'phase', from, to: next, name: this.phases[next].name });
      this.rollIntent();
      events.push({ t: 'intent', intent: this.intent, forced: true });
    }
  }

  rollIntent() {
    const all = this.phaseData.table;
    const table = this.eclipse > 0
      ? (all.filter(([m]) => m === 'strike' || m === 'sunder') || all)
      : all;
    const total = table.reduce((a, [, w]) => a + w, 0);
    let roll = this.rng() * total;
    for (const [move, weight] of table) {
      roll -= weight;
      if (roll <= 0) { this.intent = move; return; }
    }
    this.intent = table[table.length - 1][0];
  }

  checkEnd(events) {
    const dead = this.player.hp <= 0;
    const slain = this.boss.hp <= 0;
    if (!dead && !slain) return false;
    this.over = true;
    this.outcome = slain && dead ? 'draw' : slain ? 'victory' : 'defeat';
    events.push({ t: 'end', outcome: this.outcome, stats: this.stats, mode: this.mode.key });
    return true;
  }

  playerTurn(action) {
    if (this.over) return [];
    const events = [];
    this.turn++;
    this.stats.turns++;
    this.player.guarding = false;
    const mana = this.player.mana;

    if (action === 'strike') {
      const base = this.range(CONFIG.strike);
      const bonus = this.overcharged ? Math.round(mana * CONFIG.overchargeMult) : mana;
      const crit = this.rng() < CONFIG.critChance;
      const amount = Math.round((base + bonus) * (crit ? CONFIG.critMult : 1) * (this.mode.playerDmg || 1));
      const overcharged = this.overcharged && mana > 0;
      this.player.mana = 0;
      const hit = this.absorb(amount);
      this.stats.dealt += amount;
      this.stats.biggest = Math.max(this.stats.biggest, amount);
      if (crit) this.stats.crits++;
      events.push({
        t: 'strike', amount, base, bonus, crit, overcharged,
        manaSpent: mana, bossHp: this.boss.hp,
        shielded: hit.toShield, toHp: hit.toHp, shield: this.boss.shield
      });
      this.syncPhase(events);
    } else if (action === 'mend') {
      const base = this.range(CONFIG.mend);
      const raw = Math.round((base + Math.round(mana * CONFIG.mendManaMult)) * (this.mode.playerMend || 1));
      const amount = Math.min(raw, this.player.maxHp - this.player.hp);
      this.player.mana = 0;
      this.player.hp += amount;
      this.stats.healed += amount;
      events.push({ t: 'mend', amount, raw, wasted: raw - amount, manaSpent: mana, playerHp: this.player.hp });
    } else if (action === 'channel') {
      const gain = Math.min(this.range(CONFIG.channel), CONFIG.player.manaCap - this.player.mana);
      this.player.mana += gain;
      this.stats.channels++;
      events.push({ t: 'channel', amount: gain, mana: this.player.mana });
    } else if (action === 'guard') {
      this.player.guarding = true;
      events.push({ t: 'guard' });
    }

    this.checkEnd(events);
    return events;
  }

  bossTurn() {
    if (this.over) return [];
    const events = [];
    const phase = this.phaseData;
    const move = this.intent;
    const mana = this.boss.mana;

    if (move === 'strike' || move === 'sunder') {
      const heavy = move === 'sunder';
      const base = this.range(heavy ? phase.sunder : phase.strike);
      const veiled = this.eclipse > 0 ? (this.mode.eclipseBonus || 1) : 1;
      const raw = Math.round((base + Math.round(mana * (heavy ? 1.5 : 1))) * veiled);
      const dealt = this.player.guarding ? Math.round(raw * this.mode.guardMult) : raw;
      const prevented = raw - dealt;
      this.boss.mana = 0;
      this.player.hp = Math.max(0, this.player.hp - dealt);
      this.stats.taken += dealt;
      this.stats.blocked += prevented;
      let converted = 0;
      if (this.player.guarding && prevented > 0) {
        converted = Math.min(
          Math.round(prevented * this.mode.guardConversion),
          CONFIG.player.manaCap - this.player.mana
        );
        this.player.mana += converted;
      }
      let stripped = 0;
      if (heavy && !this.player.guarding && this.player.mana > 0) {
        stripped = Math.round(this.player.mana * this.mode.sunderStrip);
        this.player.mana -= stripped;
      }
      events.push({
        t: 'bossStrike', heavy, amount: dealt, raw, prevented, converted, stripped,
        guarded: this.player.guarding, manaSpent: mana, playerHp: this.player.hp,
        mana: this.player.mana, veiled: veiled > 1
      });
    } else if (move === 'mend') {
      const raw = this.range(phase.mend) + mana;
      const amount = Math.min(raw, this.boss.maxHp - this.boss.hp);
      const overflow = raw - amount;
      const shieldGain = Math.min(overflow, this.mode.shieldCap - this.boss.shield);
      this.boss.mana = 0;
      this.boss.hp += amount;
      this.boss.shield += shieldGain;
      events.push({
        t: 'bossMend', amount, raw, shieldGain, wasted: overflow - shieldGain,
        manaSpent: mana, bossHp: this.boss.hp, shield: this.boss.shield
      });
    } else if (move === 'eclipse') {
      this.eclipse = (this.mode.eclipseTurns || 3) + 1;
      events.push({ t: 'eclipse', turns: this.mode.eclipseTurns || 3 });
    } else if (move === 'channel') {
      const gain = Math.min(this.range(phase.channel), CONFIG.boss.manaCap - this.boss.mana);
      this.boss.mana += gain;
      events.push({ t: 'bossChannel', amount: gain, mana: this.boss.mana });
    } else {
      events.push({ t: 'bossWait' });
    }

    this.player.guarding = false;
    if (this.eclipse > 0) {
      this.eclipse--;
      if (this.eclipse === 0) events.push({ t: 'eclipseEnd' });
    }
    if (this.checkEnd(events)) return events;
    this.rollIntent();
    events.push({ t: 'intent', intent: this.intent, hidden: this.eclipse > 0 });
    return events;
  }
}

export function expectedIncoming(battle) {
  const phase = battle.phaseData;
  if (battle.eclipse > 0) {
    const s = phase.strike, u = phase.sunder || phase.strike;
    return ((s[0] + s[1]) / 2 + (u[0] + u[1]) / 2) / 2 * (battle.mode.eclipseBonus || 1);
  }
  const move = battle.intent;
  if (move !== 'strike' && move !== 'sunder') return 0;
  const heavy = move === 'sunder';
  const range = heavy ? phase.sunder : phase.strike;
  if (!range) return 0;
  return (range[0] + range[1]) / 2 + battle.boss.mana * (heavy ? 1.5 : 1);
}
