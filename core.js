// ===== storage =====
const KEY = 'countryClash.v1';
const DEF = { best: 0, games: 0, correct: 0, answered: 0, highScore: 0, sound: true, theme: 'dark' };
const load = () => { try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return { ...DEF }; } };
const save = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };

// ===== scoring =====
const MAX_TIME = 45, BASE = 100;
const BONUS = [[5, 100], [10, 80], [15, 60], [20, 40], [30, 20]];
const speedBonus = t => { for (const [lim, b] of BONUS) if (t < lim) return b; return 0; };
const pointsFor = t => BASE + speedBonus(t);
const tierFor = streak => (streak < 5 ? 'easy' : streak < 10 ? 'medium' : streak < 20 ? 'hard' : 'expert');

// ===== audio =====
let ctx;
function play(kind, on) {
  if (!on) return;
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    const notes = kind === 'ok' ? [[660, 0], [880, 0.11]] : [[240, 0], [150, 0.2]];
    for (const [f, d] of notes) {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + d;
      o.type = kind === 'ok' ? 'sine' : 'sawtooth'; o.frequency.value = f;
      g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.26);
    }
  } catch {}
}

// ===== formatting =====
const compact = v => { const a = Math.abs(v);
  for (const [n, s] of [[1e12, ' trillion'], [1e9, ' billion'], [1e6, ' million']]) if (a >= n) return (v / n).toFixed(2) + s;
  return v.toLocaleString('en-US', { maximumFractionDigits: 1 }); };
function fmt(stat, v) {
  const u = stat.unit ? ' ' + stat.unit : '';
  if (stat.kind === 'usd') return '$' + compact(v);
  if (stat.kind === 'pct') return v.toFixed(1) + '%';
  if (stat.kind === 'dec') return v.toLocaleString('en-US', { maximumFractionDigits: 2 }) + u;
  return compact(v) + u;
}
