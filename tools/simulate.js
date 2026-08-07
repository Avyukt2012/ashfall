import { Battle, CONFIG, expectedIncoming } from '../js/rules.js';

function skilledPolicy(b) {
  const incoming = expectedIncoming(b);
  const hp = b.player.hp;
  const mana = b.player.mana;
  const lethal = incoming >= hp * 0.9;
  const guarded = incoming * b.mode.guardMult;

  if (lethal) return guarded < hp * 0.6 ? 'guard' : 'mend';
  if (hp < b.player.maxHp * 0.3) return 'mend';
  if (mana >= CONFIG.overchargeAt) return 'strike';
  if (incoming >= 34) return 'guard';
  if (incoming === 0 && mana < CONFIG.overchargeAt) return 'channel';
  if (mana < CONFIG.overchargeAt && b.boss.hp + b.boss.shield > 120) return 'channel';
  return 'strike';
}

function greedyPolicy() {
  return 'strike';
}

function naivePolicy(b) {
  if (b.player.hp < 90) return 'mend';
  if (b.player.mana < 15) return 'channel';
  return 'strike';
}

function run(policy, n, mode) {
  let wins = 0, losses = 0, draws = 0, turns = 0, closeWins = 0, shield = 0;
  const hpLeft = [];
  for (let i = 0; i < n; i++) {
    const b = new Battle(mode);
    let guard = 0;
    while (!b.over && guard++ < 400) {
      b.playerTurn(policy(b));
      if (!b.over) b.bossTurn();
    }
    turns += b.stats.turns;
    shield += b.stats.shieldBroken;
    if (b.outcome === 'victory') {
      wins++;
      hpLeft.push(b.player.hp / b.player.maxHp);
      if (b.player.hp < b.player.maxHp * 0.25) closeWins++;
    } else if (b.outcome === 'defeat') losses++;
    else draws++;
  }
  const avgHp = hpLeft.reduce((a, v) => a + v, 0) / (hpLeft.length || 1);
  return {
    win: (wins / n * 100).toFixed(1) + '%',
    loss: (losses / n * 100).toFixed(1) + '%',
    avgTurns: (turns / n).toFixed(1),
    avgHpOnWin: (avgHp * 100).toFixed(0) + '%',
    shieldEaten: Math.round(shield / n),
    nailbiters: (closeWins / (wins || 1) * 100).toFixed(0) + '%'
  };
}

const N = Number(process.argv[2] || 30000);
for (const mode of ['normal', 'unbound']) {
  console.log(`\nASHFALL — ${mode.toUpperCase()} — ${N} battles per policy`);
  console.table({
    'skilled (reads intents)': run(skilledPolicy, N, mode),
    'greedy (strike every turn)': run(greedyPolicy, N, mode),
    'naive (heal at 90)': run(naivePolicy, N, mode)
  });
}
