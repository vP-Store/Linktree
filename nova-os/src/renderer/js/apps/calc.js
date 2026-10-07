// Rechner: Standard, Wissenschaftlich, Einheiten-Umrechner – mit Verlauf und Tastatur.

import { h, clear } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { evaluate, formatNumber } from '../core/math.js';
import { store } from '../core/store.js';
import { api } from '../core/api.js';
import { toast } from '../core/ui.js';

const UNITS = {
  'Länge': { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254 },
  'Gewicht': { kg: 1, g: 0.001, mg: 1e-6, t: 1000, lb: 0.45359237, oz: 0.028349523 },
  'Daten': { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4, bit: 0.125 },
  'Zeit': { s: 1, min: 60, h: 3600, Tag: 86400, Woche: 604800, ms: 0.001 },
  'Fläche': { 'm²': 1, 'km²': 1e6, 'cm²': 1e-4, ha: 1e4, 'ft²': 0.09290304, acre: 4046.8564 },
  'Volumen': { l: 1, ml: 0.001, 'm³': 1000, gal: 3.785411784, 'cup': 0.2365882 },
  'Tempo': { 'km/h': 1, 'm/s': 3.6, mph: 1.609344, kn: 1.852 },
  'Temperatur': { '°C': 'c', '°F': 'f', K: 'k' },
};

function convTemp(v, from, to) {
  const c = from === 'c' ? v : from === 'f' ? (v - 32) * 5 / 9 : v - 273.15;
  return to === 'c' ? c : to === 'f' ? c * 9 / 5 + 32 : c + 273.15;
}

export default {
  mount(root, win) {
    let mode = store.get('calcMode', 'std');
    let expr = '';
    let lastResult = null;
    let justEvaluated = false;
    const history = store.get('calcHistory', []) || [];

    const seg = h('div.seg', ...[['std', 'Standard'], ['sci', 'Wissenschaft'], ['graph', 'Graph'], ['conv', 'Umrechnen']].map(([m, l]) => h('button.seg-btn', { dataset: { m }, onclick: () => setMode(m) }, l)));
    const body = h('div.calc-body');
    root.classList.add('calc-root');
    root.append(h('div.app-toolbar', { style: { justifyContent: 'center' } }, seg), body);

    function setMode(m) {
      mode = m;
      store.set('calcMode', m);
      seg.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
      if (graphStop) { graphStop(); graphStop = null; }
      if (m === 'conv') renderConv(); else if (m === 'graph') renderGraph(); else renderCalc();
    }

    // ---------- Rechner ----------
    let exprEl, resEl, histEl;
    function renderCalc() {
      clear(body);
      exprEl = h('div.calc-expr');
      resEl = h('div.calc-res');
      histEl = h('div.calc-hist');
      const keys = h('div.calc-keys' + (mode === 'sci' ? '.sci' : ''));
      const K = (label, action, cls = '') => h('button.calc-key' + cls, { onclick: () => { action(); update(); } }, label);
      const ins = (s) => () => { if (justEvaluated && /[\d(πe√a-z]/i.test(s[0])) expr = ''; justEvaluated = false; expr += s; };
      const sci = mode === 'sci' ? [
        K('sin', ins('sin('), '.fn'), K('cos', ins('cos('), '.fn'), K('tan', ins('tan('), '.fn'), K('π', ins('π'), '.fn'),
        K('ln', ins('ln('), '.fn'), K('log', ins('log('), '.fn'), K('√', ins('√('), '.fn'), K('e', ins('e'), '.fn'),
        K('x²', ins('^2'), '.fn'), K('xʸ', ins('^'), '.fn'), K('n!', ins('!'), '.fn'), K('(', ins('('), '.fn'),
      ] : [];
      keys.append(
        ...sci,
        K('AC', () => { expr = ''; lastResult = null; }, '.op2'),
        K(mode === 'sci' ? ')' : '( )', mode === 'sci' ? ins(')') : () => { const open = (expr.match(/\(/g) || []).length - (expr.match(/\)/g) || []).length; expr += open > 0 && /[\d)πe!%]$/.test(expr) ? ')' : '('; }, '.op2'),
        K('%', ins('%'), '.op2'),
        K('÷', ins('÷'), '.op'),
        K('7', ins('7')), K('8', ins('8')), K('9', ins('9')), K('×', ins('×'), '.op'),
        K('4', ins('4')), K('5', ins('5')), K('6', ins('6')), K('−', ins('−'), '.op'),
        K('1', ins('1')), K('2', ins('2')), K('3', ins('3')), K('+', ins('+'), '.op'),
        K('±', () => { expr = expr ? `-(${expr})` : '-'; }), K('0', ins('0')), K(',', ins(',')), K('=', equals, '.eq'),
      );
      const side = h('div.calc-side', h('div.side-label', 'Verlauf'), histEl,
        h('button.btn.sm.ghost', { onclick: () => { history.length = 0; store.set('calcHistory', []); renderHist(); } }, 'Verlauf leeren'));
      body.append(h('div.calc-main', h('div.calc-display', exprEl, resEl), keys), side);
      renderHist();
      update();
    }

    function preview() {
      if (!expr) return '';
      try { return formatNumber(evaluate(expr)); } catch (_) { return ''; }
    }

    function update() {
      if (!exprEl) return;
      exprEl.textContent = expr || (lastResult != null ? '' : '0');
      const p = justEvaluated ? '' : preview();
      resEl.textContent = justEvaluated ? lastResult : (p ? '= ' + p : (lastResult != null && !expr ? lastResult : ''));
      resEl.classList.toggle('final', justEvaluated);
      exprEl.classList.toggle('dim', justEvaluated);
    }

    function equals() {
      if (!expr) return;
      try {
        const v = formatNumber(evaluate(expr));
        history.unshift({ expr, v });
        if (history.length > 50) history.length = 50;
        store.set('calcHistory', history);
        lastResult = v;
        justEvaluated = true;
        exprEl.textContent = expr;
        expr = v.replace(/\./g, '');
        renderHist();
      } catch (e) {
        resEl.textContent = e.message;
        resEl.classList.add('err');
        setTimeout(() => resEl.classList.remove('err'), 1200);
        return;
      }
    }

    function renderHist() {
      if (!histEl) return;
      clear(histEl);
      if (!history.length) histEl.append(h('div.faint', { style: { fontSize: '12px', padding: '6px' } }, 'Noch keine Rechnungen.'));
      for (const it of history) {
        histEl.append(h('button.calc-hrow', { title: 'Übernehmen', onclick: () => { expr = it.v.replace(/\./g, ''); justEvaluated = false; update(); } },
          h('small', it.expr), h('b', it.v)));
      }
    }

    // ---------- Umrechner ----------
    function renderConv() {
      clear(body);
      exprEl = null;
      let cat = store.get('calcConvCat', 'Länge');
      const catSel = h('select.input', ...Object.keys(UNITS).map((c) => h('option', { value: c, selected: c === cat }, c)));
      const inA = h('input.input.calc-conv-in', { type: 'text', value: '1', inputMode: 'decimal' });
      const inB = h('input.input.calc-conv-in', { type: 'text' });
      const selA = h('select.input'), selB = h('select.input');
      const fill = () => {
        clear(selA); clear(selB);
        const keys = Object.keys(UNITS[cat]);
        keys.forEach((k, i) => { selA.append(h('option', { value: k, selected: i === 0 }, k)); selB.append(h('option', { value: k, selected: i === 1 }, k)); });
      };
      const conv = (fromEl, fromSel, toEl, toSel) => {
        const v = parseFloat(String(fromEl.value).replace(',', '.'));
        if (isNaN(v)) { toEl.value = ''; return; }
        const u = UNITS[cat];
        const out = cat === 'Temperatur' ? convTemp(v, u[fromSel.value], u[toSel.value]) : (v * u[fromSel.value]) / u[toSel.value];
        toEl.value = formatNumber(out);
      };
      const ab = () => conv(inA, selA, inB, selB);
      const ba = () => conv(inB, selB, inA, selA);
      catSel.onchange = () => { cat = catSel.value; store.set('calcConvCat', cat); fill(); ab(); };
      inA.oninput = ab; inB.oninput = ba; selA.onchange = ab; selB.onchange = ab;
      fill(); ab();
      body.append(h('div.calc-conv',
        h('label.col', h('span.faint', 'Kategorie'), catSel),
        h('div.calc-conv-row', inA, selA),
        h('button.icon-btn', { style: { alignSelf: 'center' }, title: 'Tauschen', html: icon('arrowDown'), onclick: () => { const t = selA.value; selA.value = selB.value; selB.value = t; ab(); } }),
        h('div.calc-conv-row', inB, selB)));
    }

    // ---------- Funktionsplotter ----------
    let graphStop = null;
    function renderGraph() {
      clear(body);
      const COLORS = ['var(--accent)', 'var(--accent-2)', '#f43f5e'];
      const fns = store.get('calcGraphFns') || ['sin(x)', 'x^2/4', ''];
      let view = { cx: 0, cy: 0, scale: 46 }; // Pixel pro Einheit
      const canvas = h('canvas.graph-canvas');
      const tip = h('div.graph-tip.hidden');
      const inputs = fns.map((f, i) => {
        const inp = h('input.input.graph-fn', { value: f, placeholder: i ? 'weitere Funktion …' : 'z. B. sin(x)*x', spellcheck: false });
        inp.addEventListener('input', () => { fns[i] = inp.value; store.set('calcGraphFns', fns); draw(); });
        return h('label.graph-row', h('i', { style: { background: COLORS[i] } }), h('span.faint', `f${i + 1}(x) =`), inp);
      });
      const err = h('div.graph-err.faint');
      body.append(h('div.graph-wrap',
        h('div.graph-side', ...inputs, err,
          h('div.graph-hint.faint', 'Ziehen verschiebt · Mausrad zoomt · Doppelklick zentriert'),
          h('button.btn.sm', { onclick: () => { view = { cx: 0, cy: 0, scale: 46 }; draw(); } }, 'Ansicht zurücksetzen')),
        h('div.graph-plot', canvas, tip)));

      const css = (v) => getComputedStyle(root).getPropertyValue(v).trim();
      function colorOf(i) { const c = COLORS[i]; return c.startsWith('var(') ? css(c.slice(4, -1)) || '#7c5cff' : c; }
      let hoverX = null;
      function draw() {
        const W = canvas.clientWidth, H = canvas.clientHeight;
        if (!W || !H) return;
        const dpr = devicePixelRatio || 1;
        if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        const sx = (x) => W / 2 + (x - view.cx) * view.scale, sy = (y) => H / 2 - (y - view.cy) * view.scale;
        const wx = (px) => view.cx + (px - W / 2) / view.scale;
        // Rasterweite: 1, 2, 5 × 10^n, sodass Linien ~60 px auseinander liegen
        const raw = 60 / view.scale, mag = Math.pow(10, Math.floor(Math.log10(raw)));
        const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw);
        ctx.font = '10.5px ' + (css('--font') || 'sans-serif');
        ctx.lineWidth = 1;
        const grid = css('--border') || 'rgba(255,255,255,.08)', muted = css('--text-3') || '#888';
        const fmt = (v) => String(+v.toFixed(6)).replace('.', ',');
        for (let x = Math.ceil(wx(0) / step) * step; sx(x) <= W; x += step) {
          ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(Math.round(sx(x)) + .5, 0); ctx.lineTo(Math.round(sx(x)) + .5, H); ctx.stroke();
          if (Math.abs(x) > step / 2) { ctx.fillStyle = muted; ctx.fillText(fmt(x), sx(x) + 3, Math.min(H - 4, Math.max(12, sy(0) + 13))); }
        }
        const top = view.cy + (H / 2) / view.scale;
        for (let y = Math.floor(top / step) * step; sy(y) <= H; y -= step) {
          ctx.strokeStyle = grid; ctx.beginPath(); ctx.moveTo(0, Math.round(sy(y)) + .5); ctx.lineTo(W, Math.round(sy(y)) + .5); ctx.stroke();
          if (Math.abs(y) > step / 2) { ctx.fillStyle = muted; ctx.fillText(fmt(y), Math.min(W - 30, Math.max(4, sx(0) + 4)), sy(y) - 3); }
        }
        // Achsen
        ctx.strokeStyle = css('--text-2') || '#aaa'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(0, sy(0)); ctx.lineTo(W, sy(0)); ctx.moveTo(sx(0), 0); ctx.lineTo(sx(0), H); ctx.stroke();
        // Kurven
        const errors = [];
        fns.forEach((f, i) => {
          if (!f.trim()) return;
          try { evaluate(f, { x: 1.2345 }); } catch (e) { if (!/Division|ungültig/.test(e.message)) { errors.push(`f${i + 1}: ${e.message}`); return; } }
          ctx.strokeStyle = colorOf(i); ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
          ctx.beginPath();
          let pen = false, lastY = null;
          for (let px = 0; px <= W; px += 1) {
            let y;
            try { y = evaluate(f, { x: wx(px) }); } catch (_) { pen = false; continue; }
            const py = sy(y);
            // Sprungstellen (z. B. tan, 1/x) nicht verbinden
            if (!pen || (lastY !== null && Math.abs(py - lastY) > H * 2)) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
            lastY = py;
          }
          ctx.stroke();
        });
        err.textContent = errors.join(' · ');
        // Fadenkreuz mit Werten
        if (hoverX != null) {
          const x = wx(hoverX);
          ctx.strokeStyle = 'rgba(127,127,127,.45)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(hoverX, 0); ctx.lineTo(hoverX, H); ctx.stroke(); ctx.setLineDash([]);
          const parts = [`x = ${fmt(x)}`];
          fns.forEach((f, i) => {
            if (!f.trim()) return;
            try { const y = evaluate(f, { x }); parts.push(`f${i + 1} = ${fmt(y)}`); ctx.fillStyle = colorOf(i); ctx.beginPath(); ctx.arc(hoverX, sy(y), 4, 0, Math.PI * 2); ctx.fill(); } catch (_) { /* undefiniert */ }
          });
          tip.textContent = parts.join('   ');
          tip.classList.remove('hidden');
        } else tip.classList.add('hidden');
      }

      canvas.addEventListener('pointermove', (e) => { const r = canvas.getBoundingClientRect(); hoverX = e.clientX - r.left; if (!e.buttons) draw(); });
      canvas.addEventListener('pointerleave', () => { hoverX = null; draw(); });
      canvas.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const sx0 = e.clientX, sy0 = e.clientY, c0 = { ...view };
        const mv = (ev) => { view.cx = c0.cx - (ev.clientX - sx0) / view.scale; view.cy = c0.cy + (ev.clientY - sy0) / view.scale; draw(); };
        const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
        addEventListener('pointermove', mv); addEventListener('pointerup', up);
      });
      canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
        const W = canvas.clientWidth, H = canvas.clientHeight;
        const before = { x: view.cx + (px - W / 2) / view.scale, y: view.cy - (py - H / 2) / view.scale };
        view.scale = Math.max(2, Math.min(5000, view.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        // Punkt unter dem Mauszeiger bleibt stehen
        view.cx = before.x - (px - W / 2) / view.scale; view.cy = before.y + (py - H / 2) / view.scale;
        draw();
      }, { passive: false });
      canvas.addEventListener('dblclick', (e) => { const r = canvas.getBoundingClientRect(); view.cx += (e.clientX - r.left - canvas.clientWidth / 2) / view.scale; view.cy -= (e.clientY - r.top - canvas.clientHeight / 2) / view.scale; draw(); });
      const ro = new ResizeObserver(() => draw());
      ro.observe(canvas);
      graphStop = () => ro.disconnect();
      requestAnimationFrame(draw);
    }

    root.tabIndex = 0;
    root.addEventListener('keydown', (e) => {
      if (mode === 'conv' || mode === 'graph' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      const k = e.key;
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'c') { const v = lastResult || preview(); if (v) { api.clip.write(v); toast('Kopiert', v, { icon: 'copy', duration: 1200 }); } return; }
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'v') { api.clip.read().then((t) => { expr += t.trim(); update(); }); return; }
      if (/^[\d.,+\-*/^%()!]$/.test(k)) { if (justEvaluated && /[\d(]/.test(k)) expr = ''; justEvaluated = false; expr += k === '*' ? '×' : k === '/' ? '÷' : k === '-' ? '−' : k === '.' ? ',' : k; }
      else if (k === 'Enter' || k === '=') { e.preventDefault(); equals(); }
      else if (k === 'Backspace') { expr = expr.slice(0, -1); justEvaluated = false; }
      else if (k === 'Escape' || k === 'Delete') { expr = ''; lastResult = null; justEvaluated = false; }
      else return;
      e.preventDefault();
      update();
    });

    setMode(mode);
    setTimeout(() => root.focus(), 50);
    const wide = () => win.el.classList.toggle('wide', win.w >= 560);
    wide();
    return { onFocus() { if (mode !== 'conv') root.focus(); }, onResize: wide };
  },
};
