// ===== game =====

const $ = s => document.querySelector(s);
const prefs = load();
if (!prefs.bests || typeof prefs.bests !== 'object') prefs.bests = { classic: prefs.best || 0 };
if (!prefs.ach || typeof prefs.ach !== 'object') prefs.ach = {};
for (const k of ['hist', 'lb', 'days']) if (!Array.isArray(prefs[k])) prefs[k] = [];
prefs.name = String(prefs.name || 'Player').slice(0, 16);
const MODES = { classic: { time: 45 }, daily: { time: 45 }, blitz: { time: 15 }, hardcore: { time: 45, nolife: true }, practice: { time: 45, practice: true } };
const MODE_NAME = { classic: 'Classic', daily: 'Daily Challenge', blitz: 'Blitz', hardcore: 'Hardcore', practice: 'Practice' };
const RANKS = [[30, 'Geography Legend'], [20, 'Globetrotter'], [15, 'Cartographer'], [10, 'Navigator'], [5, 'Explorer'], [3, 'Backpacker'], [0, 'Tourist']];
const rank = n => RANKS.find(([m]) => n >= m)[1];
const today = () => new Date().toISOString().slice(0, 10);
const hashStr = t => { let h = 2166136261; for (const c of t) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const mulberry = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
let mode = 'classic', maxTime = 45, lastBlob = null, cardUrl = null, hintLevel = 0, flagged = false;
const modeBest = () => prefs.bests[mode] || 0;
const toast = t => { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 2700); };
let data, gen, S, q, t0, pausedMs = 0, pauseAt = 0, paused = false, locked = true, raf = 0;

const applyPrefs = () => { document.body.dataset.theme = prefs.theme; $('#soundBtn').innerHTML = prefs.sound ? IC('on') : IC('off'); $('#setSound').textContent = 'Sound: ' + (prefs.sound ? 'on' : 'off'); $('#setTheme').textContent = 'Theme: ' + prefs.theme; $('#setCalm').textContent = 'Reduced motion: ' + (prefs.calm ? 'on' : 'off'); document.body.dataset.calm = prefs.calm ? '1' : ''; };
const hud = () => { $('#streak').textContent = S?.streak ?? 0; $('#score').textContent = S?.score ?? 0; $('#best').textContent = modeBest(); { const n = S?.streak || 0; document.body.dataset.heat = n >= 20 ? 'fire' : n >= 10 ? 'hot' : n >= 5 ? 'warm' : 'cool'; } $('#streak').parentElement.classList.toggle('hot', (S?.streak || 0) >= 5); };
const stat = (l, v) => `<div><small>${l}</small><b>${v}</b></div>`;
const pct = () => (prefs.answered ? Math.round(100 * prefs.correct / prefs.answered) + '%' : '–');
function showLifetime() {
  $('#lifetime').innerHTML = stat('Best (Classic)', prefs.bests.classic || 0) + stat('Highest score', prefs.highScore) + stat('Games', prefs.games) + stat('Accuracy', pct());
  careerUI(); renderProfile();
}

function showDailyState() {
  const done = prefs.daily?.date === today();
  document.querySelector('[data-mode=daily] .tag').textContent = done ? 'Completed today' : 'Available';
  $('#dailyNote').textContent = done ? `Today’s challenge: ${prefs.daily.streak} in a row, ${prefs.daily.score} pts. A new one arrives tomorrow!` : '';
}
const TIPS = ['Outlines are not drawn to scale — a tiny outline can still be a giant.', 'Faster answers earn up to +100 bonus points.', 'Hints are free, but you only get 3 per run.', 'The shield saves one mistake — it triggers automatically.', 'Daily Challenge: everyone gets the same questions.', 'All statistics come from the World Bank — latest year available.'];
async function init() {
  applyPrefs(); hud(); showLifetime(); showDailyState();
  let ti = 0; $('#tip').textContent = TIPS[0]; const tipTimer = setInterval(() => { $('#tip').textContent = TIPS[++ti % TIPS.length]; }, 4500);
  try {
    data = await loadData(p => { $('#playBtn').textContent = 'Loading data… ' + p; const m = /(\d+)\/(\d+)/.exec(p); $('#loadFill').style.width = (m ? 10 + 90 * m[1] / m[2] : 6) + '%'; });
    gen = new QuestionGenerator(data); $('#playBtn').disabled = false; $('#playBtn').textContent = 'Start challenge';
    document.querySelectorAll('.modes button').forEach(b => { b.disabled = false; }); $('#loading').hidden = true;
  } catch (e) { $('#err').textContent = e.message; $('#playBtn').textContent = 'Unavailable'; }
  clearInterval(tipTimer);
}

function start(m = 'classic') {
  if (m === 'daily' && prefs.daily?.date === today()) return showDailyState();
  mode = m; maxTime = MODES[m].time; const M = MODES[m];
  if (m === 'daily') { prefs.daily = { date: today(), streak: 0, score: 0 }; save(prefs); }   // the attempt counts from the moment it starts
  gen = new QuestionGenerator(data, m === 'daily' ? mulberry(hashStr('country-clash-' + today())) : Math.random);
  S = { cats: {}, streak: 0, score: 0, correct: 0, times: [], hints: M.nolife ? 0 : 3, shield: !M.nolife, saved: 0 };
  $('.lifelines').hidden = !!M.nolife; $('#hintNote').hidden = !!M.nolife;
  $('#start').hidden = true; $('#profile').hidden = true; $('#settings').hidden = true; document.body.classList.add('ingame'); markNav('play'); $('#over').hidden = true; $('#game').hidden = false; $('#pauseBtn').hidden = false;
  $('#timer').className = ''; $('#last').innerHTML = '&nbsp;'; hud(); round();
}
function toMenu() {
  clearTimeout(nextTimer); resumeThen = null; locked = true; S = null; document.body.classList.remove('panic');
  $('#game').hidden = true; document.body.classList.remove('ingame'); markNav('home'); $('#over').hidden = true; $('#start').hidden = false; $('#pauseBtn').hidden = true; $('#pauseOv').hidden = true; paused = false;
  hud(); showLifetime(); showDailyState(); globeStart();
}

function round() {
  q = gen.next(S.streak);
  if (!q) return finish('You cleared the whole question pool!');
  resetRound();
  for (const side of ['a', 'b']) {
    const info = data.countries[q[side].id], card = $('#card-' + side);
    card.className = 'card'; card.disabled = false; for (const el of [card, card.querySelector('svg')]) { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; }
    card.querySelector('svg').setAttribute('viewBox', info.viewBox);
    card.querySelector('path').setAttribute('d', info.path);
    card.querySelector('.reveal').hidden = true; card.querySelector('em').hidden = false;
  }
  $('#cat').textContent = `${q.stat.category} · ${tierFor(S.streak)}`; $('#cat').dataset.tier = tierFor(S.streak);
  $('#q').textContent = `Which country has a higher ${q.stat.label}?`;
  $('#fb').textContent = ''; $('#fb').className = 'fb'; $('#src').textContent = ''; $('#reportBtn').hidden = true; $('#reportBtn').textContent = '⚑ Report this question';
  locked = false; pausedMs = 0; t0 = performance.now(); lifeUI();
  cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
}

const elapsed = () => (performance.now() - t0 - pausedMs) / 1000;
function tick() {
  if (paused || locked) return;
  const left = Math.max(0, maxTime - elapsed());
  $('#bar').style.width = (100 * left / maxTime) + '%';
  $('#t').textContent = Math.ceil(left);
  $('#timer').className = left <= maxTime * 0.22 ? 'urgent' : left <= maxTime * 0.45 ? 'warn' : ''; document.body.classList.toggle('panic', left <= maxTime * 0.22);
  if (left <= 0) return answer(null);
  raf = requestAnimationFrame(tick);
}

function reveal(pick) {
  for (const side of ['a', 'b']) {
    const card = $('#card-' + side), r = card.querySelector('.reveal'), x = q[side];
    card.disabled = true; card.querySelector('em').hidden = true;
    card.classList.add(side === q.correct ? 'win' : 'lose'); if (side === pick) card.classList.add('picked');
    r.querySelector('b').textContent = data.countries[x.id].name;
    r.querySelector('span').textContent = fmt(q.stat, x.v) + ` (${x.y})`; r.hidden = false;
  }
  $('#src').textContent = 'Source: ' + q.stat.source; $('#reportBtn').hidden = false;
}

function answer(side) {
  if (locked) return; locked = true; cancelAnimationFrame(raf); lifeUI(); document.body.classList.remove('panic');
  const t = side ? Math.min(maxTime, elapsed()) : maxTime, ok = side === q.correct;
  (S.cats[q.stat.category] ??= [0, 0])[0]++; if (ok) S.cats[q.stat.category][1]++;
  reveal(side); play(ok ? 'ok' : 'bad', prefs.sound); fx(ok, side);
  if (ok) {
    const pts = flagged ? Math.floor(pointsFor(t) / 2) : pointsFor(t); S.streak++; S.correct++; S.score += pts; S.times.push(t); hud(); if ([5, 10, 20, 30].includes(S.streak)) { toast(`${S.streak} in a row — ${rank(S.streak)}!`); burst(innerWidth / 2, 150); }
    $('#fb').textContent = `✔ Correct! +${pts} ` + (flagged ? '(flags used: half points)' : `(100 + ${speedBonus(t)} speed)`); $('#fb').className = 'fb ok';
    $('#last').textContent = `Last answer: ${t.toFixed(1)}s · +${pts} pts`;
    later(2400);
  } else {
    $('#fb').textContent = side ? '✘ Wrong answer' : '⏱ Time’s up!'; $('#fb').className = 'fb bad';
    if (MODES[mode].practice) {
      S.streak = 0; hud(); $('#fb').textContent = `${side ? '✘ Wrong' : '⏱ Time’s up'} — it was ${data.countries[q[q.correct].id].name}. Streak reset (practice).`; $('#fb').className = 'fb warn';
      later(3200);
    } else if (S.shield) {
      S.shield = false; S.saved++; lifeUI();
      $('#fb').textContent = `Shield used! The right answer was ${data.countries[q[q.correct].id].name}. No points — next round…`; $('#fb').className = 'fb warn';
      later(3400);
    } else finish();
  }
}
let resumeThen = null;

function finish(msg) {
  clearTimeout(nextTimer); resumeThen = null; locked = true; document.body.classList.remove('panic');
  let isPB = false; const prevBest = modeBest();
  if (!MODES[mode].practice) {
    prefs.games++; prefs.correct += S.correct; prefs.answered += S.correct + S.saved + (msg ? 0 : 1);
    isPB = S.streak > modeBest(); if (isPB) prefs.bests[mode] = S.streak;
    prefs.highScore = Math.max(prefs.highScore, S.score);
    if (mode === 'daily') prefs.daily = { date: today(), streak: S.streak, score: S.score };
    record(msg); save(prefs);
  }
  hud(); showLifetime(); showDailyState();
  const avg = S.times.length ? (S.times.reduce((a, b) => a + b, 0) / S.times.length).toFixed(1) + 's' : '–';
  const fast = S.times.length ? Math.min(...S.times).toFixed(1) + 's' : '–';
  $('#overStats').innerHTML = stat('Final score', S.score) + stat('Final streak', S.streak) + stat(MODE_NAME[mode] + ' best', modeBest())
    + stat('Correct answers', S.correct) + stat('Avg response', avg) + stat('Best response', fast) + stat('Accuracy', pct());
  $('#rank').textContent = `${rank(S.streak)} · ${MODE_NAME[mode]}`; $('#shareBtn').textContent = 'Share score';
  $('#pbNote').hidden = !isPB || !S.streak; $('#over').hidden = false; $('#pauseBtn').hidden = true;
  resultsUI(prevBest, msg);
  makeCard();
  setTimeout(() => $('#over').scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 300);
}
function renderCard() {
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const bg = x.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0b1230'); bg.addColorStop(1, '#05070f'); x.fillStyle = bg; x.fillRect(0, 0, W, H);
  x.save(); x.translate(0, 40); drawGlobe(x, W, 720, 30 + Math.random() * 300, 1000, false); x.restore();
  const img = $('.logo');
  try { x.shadowColor = 'rgba(0,0,0,.85)'; x.shadowBlur = 26; x.drawImage(img, W / 2 - 150, 240, 300, 300); x.shadowBlur = 0; } catch {}
  x.textAlign = 'center'; x.font = '700 84px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'; x.fillStyle = '#fff'; x.fillText('COUNTRY CLASH', W / 2, 650);
  x.textAlign = 'center'; const F = (w, px) => { x.font = `${w} ${px}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`; };
  F(700, 64); x.fillStyle = '#ffd36b'; x.fillText(rank(S.streak).toUpperCase(), W / 2, 880);
  F(800, 230); x.fillStyle = '#fff'; x.fillText(String(S.streak), W / 2, 1090);
  F(600, 40); x.fillStyle = '#9fb0d8'; x.fillText('IN A ROW', W / 2, 1145);
  F(600, 46); x.fillStyle = '#fff'; x.fillText(`Score ${S.score}  ·  ${MODE_NAME[mode]}`, W / 2, 1215);
  F(500, 34); x.fillStyle = '#7f8db3'; x.fillText(location.host + location.pathname, W / 2, 1290);
  return c;
}
function makeCard() {
  try { renderCard().toBlob(b => { if (!b) return; lastBlob = b; if (cardUrl) URL.revokeObjectURL(cardUrl); cardUrl = URL.createObjectURL(b); $('#shareImg').src = cardUrl; }); } catch (e) { console.warn('Score card unavailable', e); }
}

let nextTimer = 0;
const later = ms => { clearTimeout(nextTimer); nextTimer = setTimeout(() => { if (!paused) round(); else resumeThen = round; }, ms); };
function lifeUI() {
  if (!S) return;
  const live = !locked && !paused;
  $('#hintBtn').innerHTML = IC('hint') + ` Hint ×${S.hints}`; $('#hintBtn').disabled = !live || S.hints <= 0 || hintLevel >= 3;
  $('#flagBtn').disabled = !live || flagged;
  $('#shieldChip').innerHTML = IC('shield') + (S.shield ? ' Shield ready' : ' Shield used'); $('#shieldChip').classList.toggle('used', !S.shield);
}
function resetRound() {
  hintLevel = 0; flagged = false; $('#hintNote').textContent = '';
  for (const side of ['a', 'b']) { const card = $('#card-' + side); card.querySelector('.clues').innerHTML = ''; const f = card.querySelector('.flag'); f.hidden = true; f.removeAttribute('src'); }
}
function useHint() {
  if (!S || locked || paused || S.hints <= 0 || hintLevel >= 3) return;
  S.hints--; hintLevel++;
  if (hintLevel < 3) for (const side of ['a', 'b']) {
    const c = data.countries[q[side].id], chip = document.createElement('span');
    chip.textContent = hintLevel === 1 ? c.continent : `Starts with “${c.name[0]}”`;
    $('#card-' + side).querySelector('.clues').appendChild(chip);
  } else {
    const hi = Math.max(Math.abs(q.a.v), Math.abs(q.b.v)) || 1, mag = Math.pow(10, Math.floor(Math.log10(hi)));
    $('#hintNote').textContent = `Hint: the higher value is roughly ${fmt(q.stat, Math.sign(Math.max(q.a.v, q.b.v) || 1) * Math.round(hi / mag) * mag)}.`;
  }
  lifeUI();
}
function useFlags() {
  if (!S || locked || paused || flagged) return;
  flagged = true;
  for (const side of ['a', 'b']) {
    const c = data.countries[q[side].id], img = $('#card-' + side).querySelector('.flag');
    if (/^[A-Z]{2}$/.test(c.iso2 || '')) { img.onerror = () => { img.hidden = true; }; img.src = `https://flagcdn.com/w160/${c.iso2.toLowerCase()}.png`; img.hidden = false; }
  }
  $('#fb').textContent = 'Flags revealed — this round is worth half points.'; $('#fb').className = 'fb warn'; lifeUI();
}
function setPause(on) {
  if (!S || $('#over').hidden === false || $('#game').hidden) return;
  if (on === paused) return; paused = on; $('#pauseOv').hidden = !on; lifeUI();
  if (on) { pauseAt = performance.now(); cancelAnimationFrame(raf); document.body.classList.remove('panic'); }
  else {
    pausedMs += performance.now() - pauseAt;
    if (resumeThen) { const f = resumeThen; resumeThen = null; f(); } else if (!locked) raf = requestAnimationFrame(tick);
  }
}

$('#playBtn').onclick = () => start('classic'); $('#againBtn').onclick = () => start(mode); $('#menuBtn').onclick = toMenu;
document.querySelectorAll('.modes button').forEach(b => { b.onclick = () => start(b.dataset.mode); });
$('#card-a').onclick = () => !paused && answer('a');
$('#card-b').onclick = () => !paused && answer('b');
$('#pauseBtn').onclick = () => setPause(true); $('#hintBtn').onclick = useHint; $('#flagBtn').onclick = useFlags; $('#resumeBtn').onclick = () => setPause(false);
$('#soundBtn').onclick = () => { prefs.sound = !prefs.sound; save(prefs); applyPrefs(); };
$('#themeBtn').onclick = () => { prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark'; save(prefs); applyPrefs(); };
$('#shareBtn').onclick = async () => {
  const text = `Country Clash — ${S.streak} in a row (${rank(S.streak)}), score ${S.score}. Can you beat me?`;
  try {
    const file = lastBlob && new File([lastBlob], 'country-clash.png', { type: 'image/png' });
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text, url: location.href });
    else if (cardUrl) { const a = document.createElement('a'); a.href = cardUrl; a.download = 'country-clash-score.png'; a.click(); try { await navigator.clipboard.writeText(text + ' ' + location.href); } catch {} $('#shareBtn').textContent = 'Image saved ✓'; }
    else { await navigator.clipboard.writeText(text + ' ' + location.href); $('#shareBtn').textContent = 'Copied ✓'; }
  } catch {}
};
$('#quitBtn').onclick = () => {
  paused = false; $('#pauseOv').hidden = true; clearTimeout(nextTimer); resumeThen = null; cancelAnimationFrame(raf); locked = true;
  MODES[mode].practice ? toMenu() : finish('Run ended');
};
$('#reportBtn').onclick = () => {
  const [a, b] = [q.a, q.b].map(x => data.countries[x.id].name);
  prefs.reported ??= []; for (const x of [q.a, q.b]) prefs.reported.push(q.stat.id + ':' + x.id); save(prefs);
  const title = `Data check: ${q.stat.label} — ${a} vs ${b}`;
  const body = `Statistic: ${q.stat.label} (${q.stat.source})\n${a}: ${fmt(q.stat, q.a.v)} (${q.a.y})\n${b}: ${fmt(q.stat, q.b.v)} (${q.b.y})\n\nWhat looks wrong?`;
  const m = /^([^.]+)\.github\.io$/.exec(location.hostname), repo = location.pathname.split('/')[1];
  if (m && repo) window.open(`https://github.com/${m[1]}/${repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`, '_blank');
  else try { navigator.clipboard.writeText(title + '\n' + body); } catch {}
  $('#reportBtn').textContent = 'Reported ✓ — won’t be asked again';
};
document.addEventListener('visibilitychange', () => { if (document.hidden) setPause(true); });
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'p') setPause(!paused);
  else if (k === 'h') useHint();
  else if (k === 'f') useFlags();
  else if (!paused && (k === 'arrowleft' || k === 'a')) answer('a');
  else if (!paused && (k === 'arrowright' || k === 'b')) answer('b');
});
function burst(x, y) {
  const rg = document.createElement('i'); rg.className = 'ring'; rg.style.cssText = `left:${x}px;top:${y}px`; document.body.appendChild(rg); setTimeout(() => rg.remove(), 850);
  for (let i = 0; i < 30; i++) {
    const p = document.createElement('i'), a = Math.random() * 6.283, d = 70 + Math.random() * 140;
    p.className = 'dot'; p.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;background:hsl(${Math.random() * 360} 90% 60%)`;
    document.body.appendChild(p); setTimeout(() => p.remove(), 950);
  }
}
function fx(ok, side) {
  if (ok) {
    const r = $('#card-' + side).getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2);
    const st = $('#streak'); st.classList.remove('pop'); void st.offsetWidth; st.classList.add('pop');
  } else { document.body.classList.add('flash'); setTimeout(() => document.body.classList.remove('flash'), 700); }
}
