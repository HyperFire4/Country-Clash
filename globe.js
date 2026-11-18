function drawGlobe(ctx, W, H, lam0Deg, time, clear = true) {
  const R = H * 0.42, cx = W / 2, cy = H / 2, rad = Math.PI / 180, lam0 = lam0Deg * rad, phi0 = 20 * rad;
  const sp0 = Math.sin(phi0), cp0 = Math.cos(phi0), TAU = Math.PI * 2;
  if (clear) ctx.clearRect(0, 0, W, H);
  for (const [sx, sy, sr, ph] of STARS) { ctx.globalAlpha = 0.25 + 0.5 * Math.abs(Math.sin(time / 900 + ph * 6)); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx * W, sy * H, sr, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1;
  const orbit = front => {            // thin tilted ring with a glowing satellite
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.32);
    ctx.strokeStyle = 'rgba(216,180,92,.45)'; ctx.lineWidth = 1; ctx.beginPath();
    ctx.ellipse(0, 0, R * 1.42, R * 0.36, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); ctx.stroke();
    const th = time / 1100, x = Math.cos(th) * R * 1.42, y = Math.sin(th) * R * 0.36;
    if ((Math.sin(th) > 0) === front) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, 9); g.addColorStop(0, '#fff'); g.addColorStop(0.25, 'rgba(255,220,140,.9)'); g.addColorStop(1, 'rgba(255,200,100,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill();
    }
    ctx.restore();
  };
  const halo = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.18);
  halo.addColorStop(0, 'rgba(32,198,213,.38)'); halo.addColorStop(1, 'rgba(32,198,213,0)');
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, R * 1.18, 0, TAU); ctx.fill();
  orbit(false);
  const sea = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
  sea.addColorStop(0, '#0f4a63'); sea.addColorStop(0.6, '#0a2a44'); sea.addColorStop(1, '#06121f');
  ctx.fillStyle = sea; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
  const v3 = (lon, lat) => { const l = lon * rad - lam0, p = lat * rad, cp = Math.cos(p), cl = Math.cos(l);
    return [cp * Math.sin(l), cp0 * Math.sin(p) - sp0 * cp * cl, sp0 * Math.sin(p) + cp0 * cp * cl]; };
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
  const line = pts => { ctx.beginPath(); let pen = false; for (const [lo, la] of pts) { const [x, y, z] = v3(lo, la); if (z <= 0) { pen = false; continue; } pen ? ctx.lineTo(cx + R * x, cy - R * y) : ctx.moveTo(cx + R * x, cy - R * y); pen = true; } ctx.stroke(); };
  ctx.strokeStyle = 'rgba(32,198,213,.22)'; ctx.lineWidth = 0.7;
  for (let lo = -180; lo < 180; lo += 30) line(Array.from({ length: 37 }, (_, i) => [lo, -90 + i * 5]));
  for (let la = -60; la <= 60; la += 30) line(Array.from({ length: 73 }, (_, i) => [-180 + i * 5, la]));
  ctx.fillStyle = 'rgba(32,198,213,.2)'; ctx.strokeStyle = 'rgba(120,235,245,.95)'; ctx.lineWidth = 0.7; ctx.lineJoin = 'round';
  for (const r of LAND) {              // clip each outline to the visible hemisphere, following the horizon
    const P = []; for (let i = 0; i < r.length; i += 2) P.push(v3(r[i], r[i + 1]));
    const out = [], n = P.length;
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      if (b[2] > 0) {
        if (a[2] <= 0) { const t = a[2] / (a[2] - b[2]), x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, m = Math.hypot(x, y) || 1; out.push({ x: x / m, y: y / m, k: 2 }); }
        out.push({ x: b[0], y: b[1], k: 0 });
      } else if (a[2] > 0) { const t = a[2] / (a[2] - b[2]), x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, m = Math.hypot(x, y) || 1; out.push({ x: x / m, y: y / m, k: 1 }); }
    }
    if (out.length < 3) continue;
    ctx.beginPath(); ctx.moveTo(cx + R * out[0].x, cy - R * out[0].y);
    for (let i = 0; i < out.length; i++) {
      const c = out[i], nx = out[(i + 1) % out.length];
      if (i) ctx.lineTo(cx + R * c.x, cy - R * c.y);
      if (c.k === 1 && nx.k === 2) {   // hidden stretch: walk the limb the short way round
        const a1 = Math.atan2(c.y, c.x); let d = Math.atan2(nx.y, nx.x) - a1; d -= Math.round(d / TAU) * TAU;
        const steps = Math.ceil(Math.abs(d) / 0.08); for (let s = 1; s < steps; s++) ctx.lineTo(cx + R * Math.cos(a1 + d * s / steps), cy - R * Math.sin(a1 + d * s / steps));
      }
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  const rim = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R);
  rim.addColorStop(0, 'rgba(32,198,213,0)'); rim.addColorStop(1, 'rgba(32,198,213,.55)');
  ctx.fillStyle = rim; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  const shade = ctx.createRadialGradient(cx - R * 0.45, cy - R * 0.5, R * 0.2, cx, cy, R * 1.08);
  shade.addColorStop(0, 'rgba(255,255,255,.16)'); shade.addColorStop(0.5, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,8,36,.62)');
  ctx.fillStyle = shade; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  ctx.restore();
  orbit(true);
}
// ===== /globe =====
