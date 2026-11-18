// ===== command-center UI layer =====
const ICP = {"classic": "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 2v3M12 19v3M2 12h3M19 12h3", "daily": "M5 5h14v15H5zM5 10h14M9 3v4M15 3v4", "blitz": "M13 2L4 14h7l-1 8 9-12h-7z", "hardcore": "M12 3l10 18H2zM12 10v5M12 18h.01", "practice": "M4 12a8 8 0 0 1 14-5l2 2M20 4v5h-5M20 12a8 8 0 0 1-14 5l-2-2M4 20v-5h5", "hint": "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z", "flag": "M5 21V4M5 4h11l-2 4 2 4H5", "shield": "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z", "pause": "M8 5v14M16 5v14", "on": "M4 9v6h4l5 4V5L8 9zM16.5 9a4 4 0 0 1 0 6", "off": "M4 9v6h4l5 4V5L8 9zM17 9l4 6M21 9l-4 6", "moon": "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z", "menu": "M4 7h16M4 12h16M4 17h16", "star": "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"};
const IC = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICP[n]}"/></svg>`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dt = t => { const d = new Date(+t); return isNaN(d) ? '' : d.toISOString().slice(0, 10); };
let pendingAch = [], lbTab = 'daily';

// career ranks unlock from the best streak reached in any ranked mode
const CAREER = [[30, 'World Champion'], [20, 'Commander'], [10, 'Strategist'], [5, 'Explorer'], [0, 'Recruit']];
const careerBest = () => Math.max(0, ...Object.entries(prefs.bests).filter(([k]) => k !== 'practice').map(([, v]) => +v || 0));
const careerRank = () => CAREER.find(([m]) => careerBest() >= m);
const nextRank = () => [...CAREER].reverse().find(([m]) => m > careerBest());
function careerUI() {
  const b = careerBest(), r = careerRank(), n = nextRank();
  $('#career').innerHTML = `Career rank <b>${r[1]}</b>` + (n ? ` · best streak ${b} of ${n[0]} for ${n[1]}` : ' · top rank reached');
}

function dayStreak() {
  const set = new Set(prefs.days); let n = 0; const d = new Date();
  if (!set.has(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() - 1);
  while (set.has(d.toISOString().slice(0, 10))) { n++; d.setUTCDate(d.getUTCDate() - 1); }
  return n;
}
const ACH = [
  ['first', 'First Victory', 'Finish a ranked run with 3 or more in a row', r => r.streak >= 3],
  ['ten', 'Perfect Ten', 'Get 10 in a row in one run', r => r.streak >= 10],
  ['expert', 'Geography Expert', 'Get 20 in a row in one run', r => r.streak >= 20],
  ['speed', 'Speed Demon', 'Answer correctly in under 2 seconds', r => r.fast != null && r.fast < 2],
  ['week', 'Seven-Day Streak', 'Play a ranked run on 7 days in a row', () => dayStreak() >= 7],
  ['champ', 'World Champion', 'Get 30 in a row in one run', r => r.streak >= 30],
];

function record(msg) {                       // called once per finished ranked run
  const wrong = S.saved + (msg ? 0 : 1), att = S.correct + wrong, acc = att ? Math.round(100 * S.correct / att) : 0;
  const r = { streak: S.streak, score: S.score, fast: S.times.length ? Math.min(...S.times) : null };
  if (!prefs.days.includes(today())) prefs.days.push(today());
  prefs.days = prefs.days.slice(-60);
  prefs.hist = [{ d: today(), m: mode, s: S.score, k: S.streak, a: acc }, ...prefs.hist].slice(0, 15);
  if (S.correct >= 5) prefs.bestAcc = Math.max(prefs.bestAcc || 0, acc);
  prefs.lb = [{ n: prefs.name, s: S.score, a: acc, d: today(), m: mode }, ...prefs.lb].sort((x, y) => y.s - x.s).slice(0, 50);
  pendingAch = [];
  for (const [id, nm, , test] of ACH) if (!prefs.ach[id] && test(r)) { prefs.ach[id] = Date.now(); pendingAch.push(nm); }
}

function countUp(el, to, ms = 1100) {
  if (prefs.calm || matchMedia('(prefers-reduced-motion: reduce)').matches || !to) { el.textContent = to; return; }
  const t0 = performance.now(), step = t => { const k = Math.min(1, (t - t0) / ms); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function resultsUI(prev, msg) {
  const wrong = S.saved + (msg ? 0 : 1), att = S.correct + wrong, acc = att ? Math.round(100 * S.correct / att) + '%' : '–';
  const avg = S.times.length ? (S.times.reduce((a, b) => a + b, 0) / S.times.length).toFixed(1) + 's' : '–';
  const fast = S.times.length ? Math.min(...S.times).toFixed(1) + 's' : '–';
  $('#overStats').innerHTML = stat('Correct', S.correct) + stat('Incorrect', wrong) + stat('Accuracy', acc) + stat('Best streak', S.streak) + stat('Avg response', avg) + stat('Fastest', fast);
  $('#pbCmp').textContent = MODES[mode].practice ? 'Practice run: records are not tracked.' : `${MODE_NAME[mode]} record: ${Math.max(prev, S.streak)} (previous ${prev}, this run ${S.streak}).`;
  const rows = Object.entries(S.cats), weak = rows.filter(([, [n, k]]) => k < n).map(([c]) => c);
  $('#brk').innerHTML = rows.length ? '<h3>Performance by category' + (weak.length ? ` <small>· struggled with ${esc(weak.join(', '))}</small>` : '') + '</h3>'
    + rows.map(([c, [n, k]]) => `<div class="brow"><span>${esc(c)}</span><i><u style="width:${Math.round(100 * k / n)}%"></u></i><em>${k}/${n}</em></div>`).join('') : '';
  $('#bigScore').textContent = '0'; setTimeout(() => countUp($('#bigScore'), S.score), 1500);
  pendingAch.forEach((nm, i) => setTimeout(() => { toast('Achievement unlocked: ' + nm); burst(innerWidth / 2, 150); }, 2700 + i * 2900));
  pendingAch = [];
}

// Local leaderboard. Swap this object for a server-backed one later; the UI only calls top().
const Board = { top(scope) {
  return prefs.lb.filter(e => e && typeof e.s === 'number' && (scope === 'all' || (e.m === 'daily' && e.d === today()))).sort((a, b) => b.s - a.s).slice(0, 10);
} };
function drawBoard() {
  const rows = Board.top(lbTab);
  $('#lbList').innerHTML = rows.length ? rows.map((e, i) => `<div class="lrow"><b>#${i + 1}</b><span>${esc(e.n)}</span><em>${esc(MODE_NAME[e.m] || '')}</em><span>${+e.a || 0}%</span><strong>${e.s}</strong></div>`).join('')
    : '<p class="modenote">No scores yet. Finish a run to appear here.</p>';
  document.querySelectorAll('[data-lb]').forEach(b => b.classList.toggle('on', b.dataset.lb === lbTab));
}
function renderProfile() {
  const el = $('#pf'); if (!el) return;
  const r = careerRank(), n = nextRank(), b = careerBest(), p = n ? Math.round(100 * (b - r[0]) / (n[0] - r[0])) : 100;
  const life = prefs.answered ? Math.round(100 * prefs.correct / prefs.answered) + '%' : '–', got = ACH.filter(a => prefs.ach[a[0]]).length;
  el.innerHTML = `<div class="box id"><div><label for="nameIn">Username</label><input id="nameIn" maxlength="16" value="${esc(prefs.name)}" autocomplete="off"></div>
    <div class="rk"><small>Career rank</small><b>${r[1]}</b><span class="meter"><u style="width:${p}%"></u></span><em>${n ? `Best streak ${b} of ${n[0]} for ${n[1]}` : 'Top rank reached'}</em></div></div>
    <div class="box"><h3>Statistics</h3><div class="grid">${stat('Total games', prefs.games) + stat('Highest score', prefs.highScore) + stat('Best accuracy', prefs.bestAcc ? prefs.bestAcc + '%' : '–') + stat('Lifetime accuracy', life) + stat('Day streak', dayStreak()) + stat('Best answer streak', b)}</div></div>
    <div class="box"><h3>Achievements <small>${got} of ${ACH.length} unlocked</small></h3><div class="ach">${ACH.map(([id, nm, how]) => { const t = prefs.ach[id]; return `<div class="medal${t ? ' on' : ''}"><i>${IC('star')}</i><div><b>${nm}</b><span>${how}</span><em>${t ? 'Unlocked ' + dt(t) : 'Locked'}</em></div></div>`; }).join('')}</div></div>
    <div class="box"><h3>Local leaderboard</h3><p class="modenote">Scores from this device only. Online rankings need a server, which this version does not have.</p>
    <div class="tabs"><button data-lb="daily">Today’s daily</button><button data-lb="all">All-time</button></div><div id="lbList"></div></div>
    <div class="box"><h3>Recent games</h3>${prefs.hist.length ? prefs.hist.map(h => `<div class="lrow hrow"><span>${esc(h.d)}</span><span>${esc(MODE_NAME[h.m] || '')}</span><span>${+h.k || 0} streak</span><strong>${+h.s || 0}</strong><span>${+h.a || 0}%</span></div>`).join('') : '<p class="modenote">No games yet. Start a challenge to build your history.</p>'}</div>`;
  drawBoard();
}
$('#pf').addEventListener('click', e => { const b = e.target.closest('[data-lb]'); if (b) { lbTab = b.dataset.lb; drawBoard(); } });
$('#pf').addEventListener('input', e => { if (e.target.id === 'nameIn') { const v = e.target.value.trim().slice(0, 16); if (v) { prefs.name = v; save(prefs); } } });

// navigation
function markNav(v) { document.body.dataset.view = v; document.querySelectorAll('#menu button').forEach(b => { if (b.dataset.view === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }); }
function showView(v) {
  $('#start').hidden = v !== 'home'; $('#profile').hidden = v !== 'profile'; $('#settings').hidden = v !== 'settings';
  markNav(v); $('#menu').classList.remove('open'); $('#burger').setAttribute('aria-expanded', 'false'); scrollTo(0, 0);
  if (v === 'home') globeStart(); if (v === 'profile') renderProfile();
}
document.querySelectorAll('#menu button').forEach(b => { b.onclick = () => {
  const v = b.dataset.view;
  if (v === 'play' || v === 'daily') {
    if (!data) { $('#menu').classList.remove('open'); return toast('Still loading game data…'); }
    if (v === 'daily' && prefs.daily?.date === today()) { showView('home'); return showDailyState(); }
    return start(v === 'play' ? 'classic' : 'daily');
  }
  showView(v);
}; });
$('#burger').onclick = () => { const o = $('#menu').classList.toggle('open'); $('#burger').setAttribute('aria-expanded', String(o)); };
$('#statsBtn').onclick = () => { toMenu(); showView('profile'); };
$('#setSound').onclick = () => $('#soundBtn').click();
$('#setTheme').onclick = () => $('#themeBtn').click();
$('#setCalm').onclick = () => { prefs.calm = !prefs.calm; save(prefs); applyPrefs(); };
$('#setRefresh').onclick = () => { try { localStorage.removeItem(CACHE_KEY); } catch {} location.reload(); };
$('#setReset').onclick = () => { if (confirm('Erase your records, achievements and history on this device?')) { try { localStorage.removeItem(KEY); } catch {} location.reload(); } };
