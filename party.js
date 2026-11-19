// ===== party mode: 2-8 players, one device each, joined by room code =====
// The host's device runs the game; players connect to it directly (WebRTC via the free PeerJS
// signalling service), so no server of your own is needed. Needs core.js, game.js and ui.js loaded first.
(() => {
const MAX = 8, DUR = 20, PTS = [4, 3, 2, 1], FLAGS = 2, ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const R = $('#party');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sc = n => (Number.isInteger(n) ? n : n.toFixed(1));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const calm = () => document.body.dataset.calm === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;

let peer = null, hostConn = null, isHost = false, active = false, me = '', code = '', rounds = 10;
let conns = {}, players = [], phase = 'menu', seq = 0, r = 0, rs = null, nextT = 0; const used = new Set();   // host side
let roster = [], cq = null, cT0 = 0, cRaf = 0, cAns = null, cFlags = FLAGS, cScore = 0;                         // every device

const lib = () => window.Peer ? Promise.resolve() : new Promise((ok, no) => {
  const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
  s.onload = ok; s.onerror = () => no(new Error('Could not load the multiplayer library. Check your connection and try again.')); document.head.appendChild(s);
});

/* ---------- host: rules ---------- */
function makeQ() {
  const stats = Object.values(data.stats), blocked = new Set(prefs.reported || []);
  for (let i = 0; i < 600; i++) {
    const s = stats[Math.floor(Math.random() * stats.length)];
    if (used.has(s.id) && i < 400) continue;
    const keys = Object.keys(s.values).filter(k => data.countries[k] && !blocked.has(s.id + ':' + k));
    const pool = i < 300 ? keys.filter(k => data.countries[k].famous) : keys;
    if (pool.length < 4) continue;
    const o = shuffle(pool.slice()).slice(0, 4).map(k => ({ id: k, v: s.values[k][0], y: s.values[k][1] }));
    const ys = o.map(x => x.y), vs = o.map(x => x.v).sort((a, b) => b - a), gap = i < 300 ? 0.1 : 0.03;
    if (Math.max(...ys) - Math.min(...ys) > 3) continue;
    let ok = true; for (let j = 0; j < 3; j++) if (Math.abs(vs[j] - vs[j + 1]) / (Math.abs(vs[j]) || 1) < gap) ok = false;
    if (!ok) continue;
    used.add(s.id); return { stat: s, opts: o };
  }
  return null;
}
const toAll = m => { onClient(m); for (const c of Object.values(conns)) if (c.open) c.send(m); };
const sendTo = (pid, m) => { if (pid === 'H') onClient(m); else if (conns[pid]?.open) conns[pid].send(m); };
const up = m => { if (isHost) hostMsg('H', m); else if (hostConn?.open) hostConn.send(m); };
const board = () => players.slice().sort((a, b) => b.score - a.score || a.time - b.time).map(p => ({ id: p.id, name: p.name, score: p.score, left: !p.on }));
const sendLobby = () => toAll({ t: 'lobby', code, rounds, players: players.map(p => ({ id: p.id, name: p.name })) });

function startGame() {
  if (phase !== 'lobby') return; phase = 'play'; r = 0; used.clear();
  for (const p of players) Object.assign(p, { score: 0, time: 0, flags: FLAGS });
  nextRound();
}
function nextRound() {
  clearTimeout(nextT);
  if (r >= rounds) return endGame();
  const q = makeQ(); if (!q) return endGame();
  r++; rs = { q, ans: {}, fl: {}, done: false, t0: performance.now() };
  const live = players.filter(p => p.on);
  toAll({ t: 'q', r, n: rounds, cat: q.stat.category, label: q.stat.label, opts: q.opts.map(o => o.id), dur: DUR, fl: Object.fromEntries(live.map(p => [p.id, p.flags])), of: live.length });
  rs.timer = setTimeout(reveal, DUR * 1000 + 1200);   // small grace for network delay
}
function hostMsg(pid, m) {
  if (!rs || phase !== 'play' || !m) return;
  const p = players.find(x => x.id === pid);
  if (!p || m.r !== r || rs.done || rs.ans[pid]) return;
  if (m.t === 'flag') { if (p.flags > 0 && !rs.fl[pid]) { p.flags--; rs.fl[pid] = 1; sendTo(pid, { t: 'flagok', left: p.flags }); } }
  else if (m.t === 'ans' && rs.q.opts.some(o => o.id === m.pick)) {
    rs.ans[pid] = { pick: m.pick, t: Math.min(DUR, (performance.now() - rs.t0) / 1000) };
    checkAll();
  }
}
function checkAll() {
  const live = players.filter(x => x.on), n = live.filter(x => rs.ans[x.id]).length;
  toAll({ t: 'prog', n, of: live.length });
  if (live.length && n === live.length) setTimeout(reveal, 700);
}
function reveal() {
  if (!rs || rs.done) return; rs.done = true; clearTimeout(rs.timer);
  const q = rs.q, order = q.opts.slice().sort((a, b) => b.v - a.v), rk = Object.fromEntries(order.map((o, i) => [o.id, i]));
  let fast = null;   // "quickest draw": fastest player who picked the highest country earns +1
  for (const [pid, a] of Object.entries(rs.ans)) if (rk[a.pick] === 0 && (!fast || a.t < rs.ans[fast].t)) fast = pid;
  const res = {};
  for (const p of players) {
    const a = rs.ans[p.id]; if (!p.on && !a) continue;
    const base = a ? PTS[rk[a.pick]] : 0, gain = (rs.fl[p.id] ? base / 2 : base) + (p.id === fast ? 1 : 0);
    p.score += gain; p.time += a ? a.t : DUR;
    res[p.id] = { pick: a ? a.pick : null, gain, fl: !!rs.fl[p.id], q: p.id === fast };
  }
  toAll({ t: 'rev', r, last: r >= rounds, order: order.map((o, i) => ({ id: o.id, val: fmt(q.stat, o.v), y: o.y, pts: PTS[i] })), res, board: board() });
  nextT = setTimeout(nextRound, 8000);
}
function endGame() { clearTimeout(nextT); phase = 'end'; toAll({ t: 'end', board: board() }); }
function again() {
  if (!isHost) return; players = players.filter(p => p.on); phase = 'lobby'; rs = null;
  for (const p of players) Object.assign(p, { score: 0, time: 0, flags: FLAGS });
  sendLobby();
}
function onConnData(c, m) {
  if (m?.t === 'join') {
    if (c._pid) return;
    if (phase !== 'lobby' || players.length >= MAX) { c.send({ t: 'no', why: phase !== 'lobby' ? 'That game has already started.' : 'The room is full (8 players).' }); return void setTimeout(() => c.close(), 400); }
    const base = String(m.name || 'Player').trim().slice(0, 16) || 'Player'; let nm = base, k = 2;
    while (players.some(p => p.name === nm)) nm = base.slice(0, 13) + ' ' + k++;
    const id = 'p' + ++seq; c._pid = id; conns[id] = c; players.push({ id, name: nm, score: 0, time: 0, flags: FLAGS, on: true });
    c.send({ t: 'hi', you: id }); sendLobby();
  } else if (c._pid) hostMsg(c._pid, m);
}
function drop(c) {
  const id = c._pid; if (!id || !conns[id]) return; delete conns[id];
  if (phase === 'lobby') { players = players.filter(p => p.id !== id); sendLobby(); return; }
  const p = players.find(x => x.id === id); if (p) p.on = false;
  if (rs && !rs.done && phase === 'play') checkAll();
}

/* ---------- every device: screens ---------- */
const guard = () => !(active && !confirm('Leave the party game?'));
function leaveParty() {
  for (const c of Object.values(conns)) { try { c.send({ t: 'bye' }); } catch {} }
  clearTimeout(nextT); if (rs) clearTimeout(rs.timer); cancelAnimationFrame(cRaf);
  const p = peer; setTimeout(() => { try { p && p.destroy(); } catch {} }, 400);
  peer = hostConn = null; conns = {}; players = []; roster = []; rs = null; cq = null; active = isHost = false; phase = 'menu';
  document.body.classList.remove('ingame'); R.hidden = true; R.innerHTML = '';
}
const goHome = () => { if (!guard()) return; leaveParty(); showView('home'); };
const busy = t => { R.innerHTML = `<div class="box pbox"><h2>${esc(t)}</h2></div>`; };

function menu(err = '', pre = '') {
  phase = 'menu'; document.body.classList.remove('ingame');
  R.innerHTML = `<div class="box pbox"><h2>Party mode</h2>
    <p class="modenote">2–8 players, one device each. Everyone sees the same four outlines and picks the country with the highest value. Top country = 4 pts, then 3, 2, 1. Flags (2 per game) halve a round’s points.</p>
    <label class="plab">Your name<input id="pName" maxlength="16" value="${esc(prefs.name)}" autocomplete="off"></label>
    <div class="prow"><button class="primary" id="pHost">Create room</button></div>
    <div class="prow pjoin"><input id="pCode" maxlength="5" placeholder="CODE" value="${esc(pre)}" autocapitalize="characters" autocomplete="off" spellcheck="false" aria-label="Room code"><button class="primary" id="pJoin">Join room</button></div>
    <p class="perr" id="pErr">${esc(err)}</p><button class="pghost" id="pBack">Back to home</button></div>`;
  const nm = () => { const v = $('#pName').value.trim().slice(0, 16) || 'Player'; prefs.name = v; save(prefs); return v; };
  $('#pHost').onclick = () => hostRoom(nm());
  $('#pJoin').onclick = () => joinRoom($('#pCode').value, nm());
  $('#pBack').onclick = goHome;
}

async function hostRoom(name, tries = 0) {
  busy('Creating room…');
  try { await lib(); } catch (e) { return menu(e.message); }
  code = Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
  const p = new Peer('ccp-' + code); peer = p;
  p.on('open', () => { isHost = active = true; me = 'H'; conns = {}; seq = 0; phase = 'lobby'; players = [{ id: 'H', name, score: 0, time: 0, flags: FLAGS, on: true }]; sendLobby(); });
  p.on('connection', c => { c.on('data', m => onConnData(c, m)); c.on('close', () => drop(c)); c.on('error', () => drop(c)); });
  p.on('error', e => {
    if (e.type === 'unavailable-id' && tries < 4) { try { p.destroy(); } catch {} return hostRoom(name, tries + 1); }
    if (!active) { try { p.destroy(); } catch {} menu('Could not create the room (' + e.type + '). Try again.'); }
  });
}

async function joinRoom(raw, name) {
  const c0 = String(raw).trim().toUpperCase();
  if (c0.length !== 5) return menu('Enter the 5-character room code.', c0);
  busy('Joining…');
  try { await lib(); } catch (e) { return menu(e.message, c0); }
  let ok = false, done = false, to = 0;
  const fail = msg => { if (done) return; done = true; clearTimeout(to); try { peer && peer.destroy(); } catch {} peer = hostConn = null; active = false; menu(msg, c0); };
  const p = new Peer(); peer = p;
  to = setTimeout(() => fail('Could not reach that room. Check the code and try again.'), 15000);
  p.on('error', e => fail(e.type === 'peer-unavailable' ? 'No room with that code.' : 'Connection problem (' + e.type + ').'));
  p.on('open', () => {
    const c = p.connect('ccp-' + c0, { reliable: true }); hostConn = c;
    c.on('open', () => c.send({ t: 'join', name }));
    c.on('data', m => {
      if (m?.t === 'no') return fail(m.why);
      if (m?.t === 'hi') { ok = done = true; clearTimeout(to); active = true; isHost = false; code = c0; }
      onClient(m);
    });
    c.on('close', () => { if (ok && active) { toast('Disconnected from the room.'); leaveParty(); showView('home'); } else fail('The room closed.'); });
  });
}

function onClient(m) {
  if (!m) return;
  switch (m.t) {
    case 'hi': me = m.you; break;
    case 'bye': toast('The host closed the room.'); leaveParty(); showView('home'); break;
    case 'lobby': roster = m.players; code = m.code; rounds = m.rounds; phase = 'lobby'; cScore = 0; cFlags = FLAGS; cq = null; lobby(); break;
    case 'q': cq = { ...m, done: false, flagged: false }; cAns = null; cFlags = m.fl[me] ?? cFlags; phase = 'play'; drawQ(); break;
    case 'prog': if ($('#pProg')) $('#pProg').textContent = `${m.n}/${m.of} answered`; break;
    case 'flagok': cFlags = m.left; if (cq) { cq.flagged = true; showFlags(); } flagBtn(); break;
    case 'rev': drawRev(m); break;
    case 'end': drawEnd(m); break;
  }
}

function lobby() {
  document.body.classList.remove('ingame'); cancelAnimationFrame(cRaf);
  const list = roster.map(p => `<li class="${p.id === me ? 'me' : ''}"><span>${esc(p.name)}${p.id === me ? ' (you)' : ''}</span><small>${p.id === 'H' ? 'host' : 'player'}</small></li>`).join('');
  R.innerHTML = `<div class="box pbox"><h2>Room <span class="pcode">${esc(code)}</span></h2>
    <p class="modenote">Friends open Party mode on the home page and enter this code, or use the invite link.</p>
    <div class="prow"><button id="pShare">Copy invite link</button></div>
    <ul class="plist">${list}</ul><p class="modenote">${roster.length}/${MAX} players · ${rounds} rounds</p>
    ${isHost ? `<div class="prow">${[5, 10, 15].map(n => `<button data-n="${n}" class="${n === rounds ? 'on' : ''}">${n} rounds</button>`).join('')}</div>
      <div class="prow"><button class="primary" id="pStart">Start game</button></div>` : '<p class="modenote">Waiting for the host to start…</p>'}
    <button class="pghost" id="pLeave">Leave room</button></div>`;
  $('#pShare').onclick = async () => {
    const url = location.origin + location.pathname + '?room=' + code;
    try { if (navigator.share) await navigator.share({ title: 'Country Clash party', text: 'Join my Country Clash room ' + code, url }); else { await navigator.clipboard.writeText(url); toast('Invite link copied'); } } catch {}
  };
  R.querySelectorAll('[data-n]').forEach(b => { b.onclick = () => { rounds = +b.dataset.n; sendLobby(); }; });
  if (isHost) $('#pStart').onclick = startGame;
  $('#pLeave').onclick = goHome;
}

function drawQ() {
  const m = cq; cancelAnimationFrame(cRaf); document.body.classList.add('ingame'); scrollTo(0, 0);
  const cards = m.opts.map(id => { const c = data.countries[id]; return `<button class="pcard" data-id="${esc(id)}" aria-label="Country option"><img class="pflag" alt="" hidden><svg viewBox="${c ? c.viewBox : '0 0 10 10'}" aria-hidden="true"><path fill-rule="evenodd" d="${c ? c.path : ''}"/></svg><div class="prev" hidden></div></button>`; }).join('');
  R.innerHTML = `<div class="pgame"><div class="ptop"><div class="pst"><small>Round</small><b>${m.r}/${m.n}</b></div><div class="pst"><small>Score</small><b>${sc(cScore)}</b></div>
    <div id="pTimer"><div class="track"><div id="pBar"></div></div><span id="pT">${m.dur}</span></div></div>
    <p class="ask">WHICH COUNTRY HAS THE HIGHEST…</p><h2 class="pq">${esc(m.label)}</h2><p class="cat">${esc(m.cat)}</p>
    <div class="pgrid">${cards}</div><p id="pFb" class="fb">Pick a country</p>
    <div class="pdock"><button id="pFlag"></button><span id="pProg" class="modenote">0/${m.of} answered</span><span id="pNext"></span></div><div id="pBoard" class="pboard"></div></div>`;
  R.querySelectorAll('.pcard').forEach(b => { b.onclick = () => choose(b.dataset.id); });
  $('#pFlag').onclick = () => { $('#pFlag').disabled = true; up({ t: 'flag', r: cq.r }); };
  flagBtn(); cT0 = performance.now(); cRaf = requestAnimationFrame(tickP);
}
function flagBtn() {
  const b = $('#pFlag'); if (!b || !cq) return;
  b.textContent = `Flags ½ · ${cFlags} left`; b.disabled = cq.done || cq.flagged || cFlags <= 0 || !!cAns;
}
function showFlags() {
  R.querySelectorAll('.pcard').forEach(b => {
    const c = data.countries[b.dataset.id], img = b.querySelector('.pflag');
    if (c && /^[A-Z]{2}$/.test(c.iso2 || '')) { img.onerror = () => { img.hidden = true; }; img.src = `https://flagcdn.com/w160/${c.iso2.toLowerCase()}.png`; img.hidden = false; }
  });
  $('#pFb').textContent = 'Flags revealed — this round is worth half points.'; $('#pFb').className = 'fb warn'; flagBtn();
}
function tickP() {
  if (!cq || cq.done || cAns) return;
  const left = Math.max(0, cq.dur - (performance.now() - cT0) / 1000), el = $('#pBar'); if (!el) return;
  el.style.width = (100 * left / cq.dur) + '%'; $('#pT').textContent = Math.ceil(left);
  $('#pTimer').className = left <= cq.dur * 0.25 ? 'urgent' : left <= cq.dur * 0.5 ? 'warn' : '';
  if (left <= 0) { cAns = '-'; R.querySelectorAll('.pcard').forEach(b => { b.disabled = true; }); $('#pFb').textContent = '⏱ Time’s up!'; $('#pFb').className = 'fb bad'; flagBtn(); return; }
  cRaf = requestAnimationFrame(tickP);
}
function choose(id) {
  if (cAns || !cq || cq.done) return; cAns = id;
  R.querySelectorAll('.pcard').forEach(b => { b.disabled = true; b.classList.toggle('mine', b.dataset.id === id); b.classList.toggle('dim', b.dataset.id !== id); });
  $('#pFb').textContent = 'Locked in — waiting for the others…'; $('#pFb').className = 'fb'; flagBtn();
  up({ t: 'ans', r: cq.r, pick: id });
}
function rankRows(b) {
  return b.map((p, i) => `<div class="prk ${p.id === me ? 'me' : ''} ${p.left ? 'left' : ''}"><i>${i + 1}</i><span>${esc(p.name)}${p.left ? ' (left)' : ''}</span><u>${p.d ? '+' + sc(p.d) : ''}</u><em>${sc(p.score)}</em></div>`).join('');
}
function drawRev(m) {
  if (!cq || m.r !== cq.r) return; cq.done = true; cancelAnimationFrame(cRaf); flagBtn();
  const mine = m.res[me], byId = Object.fromEntries(m.order.map((o, i) => [o.id, { ...o, i }]));
  R.querySelectorAll('.pcard').forEach(b => {
    const o = byId[b.dataset.id], c = data.countries[b.dataset.id]; if (!o) return;
    b.disabled = true; b.classList.remove('dim'); b.classList.toggle('top', o.i === 0); b.classList.toggle('mine', !!mine && mine.pick === o.id);
    b.insertAdjacentHTML('beforeend', `<i class="ppts">+${o.pts}</i>`);
    const pv = b.querySelector('.prev'); pv.innerHTML = `<b>${esc(c ? c.name : o.id)}</b><span>${esc(o.val)} (${esc(o.y)})</span>`; pv.hidden = false;
  });
  const bd = m.board.map(p => ({ ...p, d: m.res[p.id]?.gain || 0 })), my = bd.find(p => p.id === me); if (my) cScore = my.score;
  const rank = mine && mine.pick ? byId[mine.pick].i + 1 : 0;
  if (!mine || !mine.pick) { $('#pFb').textContent = 'No answer — 0 points'; $('#pFb').className = 'fb bad'; play('bad', prefs.sound); }
  else {
    const ord = ['highest', '2nd highest', '3rd highest', 'lowest'][rank - 1];
    $('#pFb').textContent = `+${sc(mine.gain)} — your pick was the ${ord}` + (mine.fl ? ' (flags: half)' : '') + (mine.q ? ' · quickest draw +1' : '');
    $('#pFb').className = 'fb ' + (rank <= 2 ? 'ok' : 'warn'); play(rank <= 2 ? 'ok' : 'bad', prefs.sound);
    if (rank === 1 && !calm()) burst(innerWidth / 2, 180);
  }
  $('#pBoard').innerHTML = rankRows(bd); $('#pProg').textContent = '';
  $('#pNext').innerHTML = isHost ? `<button class="primary" id="pSkip">${m.last ? 'Final results' : 'Next question'}</button>` : '<span class="modenote">Next question starts automatically…</span>';
  if (isHost) $('#pSkip').onclick = nextRound;
}
function drawEnd(m) {
  cancelAnimationFrame(cRaf); document.body.classList.remove('ingame'); scrollTo(0, 0);
  const top = m.board[0], tie = m.board.filter(p => p.score === top.score).length > 1;
  R.innerHTML = `<div class="box pbox"><div class="pwin"><small>${tie ? 'WINNER ON SPEED' : 'WINNER'}</small><h2>${esc(top.name)}</h2><small>${sc(top.score)} points</small></div>
    <div class="pboard">${rankRows(m.board)}</div>
    <div class="prow">${isHost ? '<button class="primary" id="pAgain">Play again</button>' : '<span class="modenote">Waiting for the host to start another game…</span>'}</div>
    <button class="pghost" id="pLeave">Leave room</button></div>`;
  if (isHost) $('#pAgain').onclick = again; $('#pLeave').onclick = goHome;
  play('ok', prefs.sound); if (!calm()) burst(innerWidth / 2, 160);
}

/* ---------- hooks into the rest of the app ---------- */
function open(pre = '') {
  if (!data) return toast('Still loading game data…');
  for (const id of ['#start', '#profile', '#settings', '#game']) $(id).hidden = true;
  R.hidden = false; markNav('party'); scrollTo(0, 0); menu('', pre);
}
$('#partyBtn').onclick = () => open();
const _showView = showView, _start = start;
showView = v => { if (!guard()) return; if (!R.hidden) leaveParty(); _showView(v); };
start = (...a) => { if (!guard()) return; if (!R.hidden) leaveParty(); _start(...a); };
const pre = (new URLSearchParams(location.search).get('room') || '').toUpperCase().slice(0, 5);
if (pre) { const iv = setInterval(() => { if (data) { clearInterval(iv); open(pre); } }, 400); setTimeout(() => clearInterval(iv), 120000); }
})();
