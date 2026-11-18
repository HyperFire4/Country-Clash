// ===== questions =====
// allowed relative gap |a-b|/max(|a|,|b|) per tier
const REL = { easy: [0.75, 1], medium: [0.4, 0.85], hard: [0.15, 0.5], expert: [0.04, 0.25] };

class QuestionGenerator {
  constructor(data, rnd = Math.random) {
    this.rnd = rnd; this.blocked = new Set((typeof prefs !== 'undefined' && prefs.reported) || []);
    this.c = data.countries;
    this.stats = Object.values(data.stats).map(s => ({ ...s, keys: Object.keys(s.values).filter(k => this.c[k]) }))
      .map(s => ({ ...s, fam: s.keys.filter(k => this.c[k].famous) }));
    this.reset();
  }
  pick(a) { return a[Math.floor(this.rnd() * a.length)]; }
  reset() { this.pairs = new Set(); this.lastIds = []; this.lastStat = null; this.lastCat = null; this.cont = {}; this.wins = {}; }

  weighted(keys) { // favour continents shown less often this session
    const w = keys.map(k => 1 / (1 + (this.cont[this.c[k].continent] || 0)));
    let r = this.rnd() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < keys.length; i++) if ((r -= w[i]) <= 0) return keys[i];
    return keys[keys.length - 1];
  }
  attempt(tier, relax) {
    const pool = this.stats.filter(s => s.id !== this.lastStat && (relax >= 3 || s.category !== this.lastCat));
    const s = this.pick(pool); if (!s || s.keys.length < 2) return null;
    const famA = tier === 'easy' || tier === 'medium', famB = tier === 'easy';
    const A = (famA && relax < 2 && s.fam.length > 5) ? s.fam : s.keys;
    const B = (famB && relax < 2 && s.fam.length > 5) ? s.fam : s.keys;
    const a = this.weighted(A), b = this.pick(B);
    if (a === b || this.blocked.has(s.id + ':' + a) || this.blocked.has(s.id + ':' + b) || this.lastIds.includes(a) || this.lastIds.includes(b) || this.pairs.has([a, b].sort().join())) return null;
    const [va, ya] = s.values[a], [vb, yb] = s.values[b];
    if (Math.abs(ya - yb) > (relax >= 3 ? 4 : 2)) return null;
    const rel = Math.abs(va - vb) / Math.max(Math.abs(va), Math.abs(vb));
    const [lo, hi] = REL[tier];
    if (!(rel > 0) || rel < Math.max(0.03, lo / (1 + relax)) || rel > Math.min(1, hi * (1 + relax * 0.5))) return null;
    if (relax < 2 && ((this.wins[va > vb ? a : b] || 0) >= 2)) return null; // don't let one country always be right
    const flip = this.rnd() < 0.5, x = { id: a, v: va, y: ya }, y = { id: b, v: vb, y: yb };
    const [L, R] = flip ? [y, x] : [x, y];
    return { stat: s, a: L, b: R, tier, correct: L.v > R.v ? 'a' : 'b' };
  }
  next(streak) {
    const tier = tierFor(streak);
    for (let relax = 0; relax < 5; relax++) for (let i = 0; i < 500; i++) {
      const q = this.attempt(tier, relax);
      if (q) { this.commit(q); return q; }
    }
    return null;
  }
  commit(q) {
    this.pairs.add([q.a.id, q.b.id].sort().join()); this.lastIds = [q.a.id, q.b.id];
    this.lastStat = q.stat.id; this.lastCat = q.stat.category;
    for (const k of this.lastIds) this.cont[this.c[k].continent] = (this.cont[this.c[k].continent] || 0) + 1;
    const w = q.correct === 'a' ? q.a.id : q.b.id; this.wins[w] = (this.wins[w] || 0) + 1;
  }
}
