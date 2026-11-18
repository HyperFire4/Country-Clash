// ===== install as app (PWA) =====
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
let installEv = null;
const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEv = e; if (!standalone) $('#installBtn').hidden = false; });
$('#installBtn').onclick = async () => { if (!installEv) return; installEv.prompt(); try { await installEv.userChoice; } catch {} installEv = null; $('#installBtn').hidden = true; };
addEventListener('appinstalled', () => { $('#installBtn').hidden = true; });
if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone) $('#iosHint').hidden = false;

let globeStart = () => {};
try {
  const cv = $('#globe'), ctx = cv.getContext('2d'), startEl = $('#start');
  $('.herologo').src = $('.logo').src;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, last = 0;
  const size = () => { const d = Math.min(devicePixelRatio || 1, 2); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  const frame = t => { last = t; if (startEl.hidden) return; drawGlobe(ctx, W, H, 20 - t * 0.008, t); if (!still) requestAnimationFrame(frame); };
  size(); addEventListener('resize', () => { size(); if (still) frame(last); });
  globeStart = () => requestAnimationFrame(frame); globeStart();
} catch (e) { console.warn('Globe unavailable', e); }
