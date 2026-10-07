// Live-3D-Hintergründe auf Canvas (ohne WebGL, ohne Bibliotheken):
//  galaxy  – rotierende Spiralgalaxie aus Tausenden Sternen, leicht geneigt
//  horizon – Flug über eine Gitterlandschaft mit Sonne am Horizont
//  waves   – Meer aus leuchtenden Punkten, über das Wellen laufen
// Beide folgen der Maus mit sanfter Parallaxe. Läuft nur, solange NovaOS
// sichtbar ist; bei „Bewegung reduzieren“ / Leistungsmodus ein Standbild.

import { bus } from '../core/dom.js';

let current = null; // { stop() }
// Beim Wechsel der Arbeitsfläche dreht sich die Szene ein Stück weiter (Raumgefühl)
let wsTarget = 0;
bus.on('wm:workspace', (i) => { wsTarget = i; });

export function stopScene() {
  if (current) current.stop();
  current = null;
}

function accentColors() {
  const cs = getComputedStyle(document.documentElement);
  const parse = (v, fb) => {
    v = (v || '').trim() || fb;
    const m = v.replace('#', '').match(/.{2}/g);
    return m && m.length >= 3 ? m.slice(0, 3).map((x) => parseInt(x, 16)) : parse(fb, '#7c5cff');
  };
  return { a: parse(cs.getPropertyValue('--accent'), '#7c5cff'), b: parse(cs.getPropertyValue('--accent-2'), '#4cc9f0') };
}

const mix = (c1, c2, t) => c1.map((v, i) => Math.round(v + (c2[i] - v) * t));

// deterministischer Zufall → jede Sitzung sieht gleich aus
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function startScene(host, kind, { still = false } = {}) {
  stopScene();
  const canvas = document.createElement('canvas');
  canvas.className = 'wp-layer wp-canvas';
  host.append(canvas);
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  let W = 0, H = 0;
  const resize = () => {
    W = host.clientWidth || innerWidth; H = host.clientHeight || innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();

  // Maus-Parallaxe (geglättet)
  const mouse = { x: 0, y: 0, sx: 0, sy: 0, ws: wsTarget * 0.6 };
  const onMove = (e) => { mouse.x = (e.clientX / innerWidth) * 2 - 1; mouse.y = (e.clientY / innerHeight) * 2 - 1; };
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('resize', resize);

  let colors = accentColors();
  const colorTimer = setInterval(() => { colors = accentColors(); }, 1500);

  const scene = kind === 'horizon' ? horizonScene() : kind === 'waves' ? wavesScene() : galaxyScene();
  let raf = 0, last = performance.now(), t = 0, stopped = false;
  canvas.dataset.frames = '0';
  let frames = 0;

  const frame = (now) => {
    raf = 0;
    if (stopped) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // Pause, wenn NovaOS ausgeblendet ist oder ein maximiertes Fenster alles verdeckt
    const paused = document.hidden || document.body.classList.contains('overlay-hidden')
      || (!document.body.classList.contains('saver-on') && !!document.querySelector('#windows .win.max:not(.min):not(.other-ws):not(.closing)'));
    if (!paused) {
      t += dt;
      mouse.sx += (mouse.x - mouse.sx) * Math.min(1, dt * 2.5);
      mouse.sy += (mouse.y - mouse.sy) * Math.min(1, dt * 2.5);
      mouse.ws += (wsTarget * 0.6 - mouse.ws) * Math.min(1, dt * 2.2);
      ctx.clearRect(0, 0, W, H);
      scene(ctx, W, H, t, mouse, colors);
      if (++frames % 30 === 0) canvas.dataset.frames = String(frames);
    }
    if (!still) raf = requestAnimationFrame(frame);
  };
  if (still) { t = 12; scene(ctx, W, H, t, mouse, colors); canvas.dataset.frames = '1'; }
  else raf = requestAnimationFrame(frame);

  current = {
    stop() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      clearInterval(colorTimer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', resize);
      canvas.remove();
    },
  };
}

/* ---------------------------------------------------------------- Galaxie */

function galaxyScene() {
  const rand = rng(7);
  const N = 4600, ARMS = 3, BUCKETS = 12;
  const stars = [];
  for (let i = 0; i < N; i++) {
    const core = i < N * 0.16;
    const r = core ? Math.pow(rand(), 1.6) * 0.2 : 0.08 + Math.pow(rand(), 0.9) * 0.95;
    const arm = Math.floor(rand() * ARMS);
    // Gauß-ähnliche Streuung um den Arm → klar erkennbare Spiralarme
    const g = (rand() + rand() + rand() - 1.5) / 1.5;
    const spread = core ? (rand() - 0.5) * 6.3 : g * (0.3 + r * 0.2);
    const a = arm * (Math.PI * 2 / ARMS) + r * 4.6 + spread;
    const y = g * (core ? 0.06 : 0.025) * (1.2 - r);
    const hue = rand();
    // Farbposition 0 (warmer Kern) … 1 (zweite Akzentfarbe) → in Farbgruppen einsortiert
    const cpos = r < 0.2 ? r * 2.5 * 0.5 : 0.5 + Math.min(1, (r - 0.2) * 1.3 + hue * 0.3) * 0.5;
    stars.push({ r, a, y, s: rand() * 1.5 + 0.7, tw: rand() * Math.PI * 2, hue, b: Math.min(BUCKETS - 1, Math.floor(cpos * BUCKETS)) });
  }
  const groups = Array.from({ length: BUCKETS }, (_, i) => stars.filter((p) => p.b === i));
  // Nebelwolken entlang der Arme (große, weiche Flecken)
  const dust = [];
  for (let i = 0; i < 90; i++) {
    const r = 0.15 + rand() * 0.75;
    const arm = Math.floor(rand() * ARMS);
    const a = arm * (Math.PI * 2 / ARMS) + r * 4.6 + (rand() - 0.5) * 0.35;
    dust.push({ r, a, size: 0.05 + rand() * 0.09, hue: rand() });
  }
  // ferne Hintergrundsterne
  const far = Array.from({ length: 260 }, () => ({ x: rand(), y: rand(), s: rand() * 1.1 + 0.2, tw: rand() * 6 }));

  return (ctx, W, H, t, m, col) => {
    const cx = W * 0.5 + m.sx * 22, cy = H * 0.48 + m.sy * 16;
    const R = Math.min(W * 0.5, H * 0.95);
    const tilt = 0.52 + m.sy * 0.08; // kleiner = flacher (Seitenansicht) // Neigung um die X-Achse
    const yaw = m.sx * 0.18 + m.ws;
    const ct = Math.cos(tilt), st = Math.sin(tilt);

    // Hintergrundsterne (leichte Gegen-Parallaxe)
    for (const f of far) {
      const a = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 0.8 + f.tw));
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      ctx.fillRect(f.x * W - m.sx * 6, f.y * H - m.sy * 5, f.s, f.s);
    }

    // Kernleuchten
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.5);
    const [ar, ag, ab] = mix(col.a, [255, 240, 220], 0.55);
    glow.addColorStop(0, `rgba(${ar},${ag},${ab},.55)`);
    glow.addColorStop(0.25, `rgba(${col.a.join(',')},.18)`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    // heller, abgeflachter Kern (Bulge)
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 0.55 + Math.sin(tilt) * 0.5);
    const bulge = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.16);
    bulge.addColorStop(0, 'rgba(255,248,235,.85)');
    bulge.addColorStop(0.35, `rgba(${ar},${ag},${ab},.35)`);
    bulge.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bulge;
    ctx.fillRect(-R * 0.16, -R * 0.16, R * 0.32, R * 0.32);
    ctx.restore();

    ctx.globalCompositeOperation = 'lighter';
    const rot = t * 0.035;
    for (const d of dust) {
      const a = d.a + rot / (0.35 + d.r) + yaw;
      const x = Math.cos(a) * d.r, z = Math.sin(a) * d.r;
      const y2 = -z * st, z2 = z * ct;
      const persp = 1.6 / (1.6 + z2);
      const px = cx + x * R * persp, py = cy + y2 * R * persp, rad = d.size * R * persp;
      const c = mix(col.a, col.b, d.hue * 0.8 + d.r * 0.2);
      const gr = ctx.createRadialGradient(px, py, 0, px, py, rad);
      gr.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},.13)`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
    const warm = [255, 236, 210];
    for (let gi = 0; gi < BUCKETS; gi++) {
      const pos = (gi + 0.5) / BUCKETS;
      const c = pos < 0.5 ? mix(warm, col.a, pos * 2) : mix(col.a, col.b, (pos - 0.5) * 2);
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      for (const p of groups[gi]) {
        // innere Sterne drehen schneller (differentielle Rotation)
        const a = p.a + rot / (0.35 + p.r) + yaw;
        const x = Math.cos(a) * p.r, z = Math.sin(a) * p.r;
        const y2 = p.y * ct - z * st; // Neigung
        const z2 = p.y * st + z * ct;
        const persp = 1.6 / (1.6 + z2);
        const sx = cx + x * R * persp, sy = cy + y2 * R * persp;
        if (sx < -4 || sy < -4 || sx > W + 4 || sy > H + 4) continue;
        const tw = 0.65 + 0.35 * Math.sin(t * 1.6 + p.tw);
        ctx.globalAlpha = Math.min(1, (0.55 + (1 - p.r) * 0.5) * tw * persp);
        const size = p.s * persp * (p.r < 0.2 ? 1.25 : 1);
        ctx.fillRect(sx, sy, size, size);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };
}

/* --------------------------------------------------------------- Horizont */

function horizonScene() {
  const rand = rng(11);
  const COLS = 46, ROWS = 34;
  // Höhenfeld: glatte Hügel aus Sinuswellen, zur Mitte hin flach (Straße)
  const height = (x, z) => {
    const side = Math.min(1, Math.pow(Math.abs(x) / 0.9, 1.6));
    return side * (0.5 + 0.5 * Math.sin(x * 3.1 + z * 0.9) * Math.cos(z * 0.55 - x * 1.7)) * 0.55;
  };
  const sky = Array.from({ length: 180 }, () => ({ x: rand(), y: rand() * 0.55, s: rand() * 1.2 + 0.2, tw: rand() * 6 }));

  return (ctx, W, H, t, m, col) => {
    const horizon = H * (0.56 + m.sy * 0.03);
    const cx = W / 2 + m.sx * 40 - Math.sin(m.ws) * W * 0.12;

    // Sterne
    for (const s of sky) {
      const a = 0.2 + 0.4 * (0.5 + 0.5 * Math.sin(t + s.tw));
      ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      ctx.fillRect(s.x * W - m.sx * 8, s.y * horizon, s.s, s.s);
    }

    // Sonne mit Streifen
    const sunR = Math.min(W, H) * 0.17;
    const sx = cx - m.sx * 18, sy = horizon - sunR * 0.35;
    const grad = ctx.createLinearGradient(0, sy - sunR, 0, sy + sunR);
    grad.addColorStop(0, `rgb(${mix(col.b, [255, 255, 255], 0.35).join(',')})`);
    grad.addColorStop(1, `rgb(${col.a.join(',')})`);
    ctx.save();
    ctx.beginPath();
    ctx.arc(sx, sy, sunR, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = grad;
    ctx.fillRect(sx - sunR, sy - sunR, sunR * 2, sunR * 2);
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 7; i++) {
      const yy = sy + sunR * (0.05 + i * 0.14) + ((t * 6) % (sunR * 0.14));
      ctx.fillRect(sx - sunR, yy, sunR * 2, 2 + i * 0.9);
    }
    ctx.restore();
    const halo = ctx.createRadialGradient(sx, sy, sunR * 0.8, sx, sy, sunR * 2.6);
    halo.addColorStop(0, `rgba(${col.a.join(',')},.28)`);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(sx - sunR * 3, sy - sunR * 3, sunR * 6, sunR * 6);

    // Boden abdecken (Sonne verschwindet hinter dem Horizont)
    const ground = ctx.createLinearGradient(0, horizon, 0, H);
    ground.addColorStop(0, 'rgba(6,4,18,.96)');
    ground.addColorStop(1, 'rgba(2,2,8,.98)');
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, W, H - horizon);

    // Gitterlandschaft: z = Tiefe (0 vorne … 1 hinten), läuft auf uns zu
    const speed = 0.08;
    const off = (t * speed) % (1 / ROWS);
    const fov = H * 0.42;
    const project = (x, z, hgt) => {
      const depth = 0.08 + z * 3.2;
      return [cx + (x * W * 0.55) / depth - m.sx * 30 * (1 - z), horizon + (fov * (0.42 - hgt * 0.5)) / depth];
    };
    ctx.lineWidth = 1;
    const line = (alpha) => `rgba(${mix(col.a, col.b, 0.35).join(',')},${alpha.toFixed(3)})`;
    // Querlinien
    for (let r = 0; r <= ROWS; r++) {
      const z = r / ROWS - off;
      if (z < 0) continue;
      const worldZ = z + t * speed;
      ctx.strokeStyle = line(Math.max(0, 0.85 - z * 0.85));
      ctx.beginPath();
      for (let c = 0; c <= COLS; c++) {
        const x = (c / COLS) * 2 - 1;
        const [px, py] = project(x * 1.6, z, height(x * 1.6, worldZ * 6));
        c ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    // Längslinien
    for (let c = 0; c <= COLS; c += 2) {
      const x = (c / COLS) * 2 - 1;
      ctx.strokeStyle = line(0.32);
      ctx.beginPath();
      for (let r = 0; r <= ROWS; r++) {
        const z = Math.max(0, r / ROWS - off);
        const [px, py] = project(x * 1.6, z, height(x * 1.6, (z + t * speed) * 6));
        r ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    // Dunst am Horizont
    const haze = ctx.createLinearGradient(0, horizon - 40, 0, horizon + 60);
    haze.addColorStop(0, 'rgba(0,0,0,0)');
    haze.addColorStop(0.5, `rgba(${col.a.join(',')},.22)`);
    haze.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon - 40, W, 100);
  };
}

/* ------------------------------------------------------------------ Wellen */

function wavesScene() {
  const ROWS = 90, BUCKETS = 10, DX = 0.13, Z0 = 1.5, DZ = 0.15;
  return (ctx, W, H, t, m, col) => {
    const cx = W / 2 + m.sx * 50 - Math.sin(m.ws) * W * 0.1;
    const horizon = H * (0.4 + m.sy * 0.04);
    const f = H * 0.8; // Brennweite
    const camH = 1.6;
    const drift = t * 0.5; // Wellen laufen langsam auf uns zu
    const groups = Array.from({ length: BUCKETS }, () => []);
    for (let r = 0; r < ROWS; r++) {
      const z = Z0 + r * DZ;
      const wz = z + drift; // Weltkoordinate für die Wellen
      // nur den sichtbaren Ausschnitt dieser Reihe berechnen
      const half = ((W / 2 + 40) / f) * z;
      const c0 = Math.ceil((-half - m.sx) / DX), c1 = Math.floor((half - m.sx) / DX);
      for (let c = c0; c <= c1; c++) {
        const x = c * DX;
        const hgt = Math.sin(x * 0.45 + wz * 0.35 + t * 0.9) * 0.45 + Math.cos(wz * 0.8 - t * 1.3 + x * 0.25) * 0.35 + Math.sin((x - wz) * 0.22 + t * 0.5) * 0.3;
        const sx = cx + (x / z) * f;
        const sy = horizon + ((camH - hgt * 0.75) / z) * f;
        if (sy > H + 4 || sy < horizon - 60) continue;
        const k = Math.max(0, Math.min(BUCKETS - 1, Math.floor(((hgt + 1.1) / 2.2) * BUCKETS)));
        const depth = (z - Z0) / (ROWS * DZ);
        groups[k].push(sx, sy, Math.max(1.1, 5 / z), Math.max(0.22, 1 - depth * 0.85));
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < BUCKETS; k++) {
      const c = mix(col.a, col.b, k / (BUCKETS - 1));
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      const g = groups[k];
      for (let i = 0; i < g.length; i += 4) {
        ctx.globalAlpha = Math.min(1, g[i + 3] * (0.55 + k / BUCKETS * 0.6));
        ctx.fillRect(g[i], g[i + 1], g[i + 2], g[i + 2]);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // Dunst am Horizont
    const haze = ctx.createLinearGradient(0, horizon - 80, 0, horizon + 120);
    haze.addColorStop(0, 'rgba(0,0,0,0)');
    haze.addColorStop(0.5, `rgba(${col.a.join(',')},.14)`);
    haze.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizon - 80, W, 200);
  };
}
