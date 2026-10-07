// Live-Liniendiagramm (Canvas) mit Fadenkreuz-Tooltip – für den Systemmonitor.
// Dünne 2px-Linien, dezentes Raster, eine y-Achse, Legende ab zwei Serien.

import { h } from './dom.js';

export class LiveChart {
  /**
   * series: [{ label, color, values: [] }], max: fester Höchstwert oder null (automatisch)
   * format: (v) => string für Achse & Tooltip
   */
  constructor({ series, max = 100, points = 60, format = (v) => Math.round(v) + '%', height = 140 }) {
    this.series = series.map((s) => ({ ...s, values: s.values || [] }));
    this.max = max;
    this.points = points;
    this.format = format;
    this.canvas = h('canvas.chart-canvas', { style: { height: height + 'px' } });
    this.tip = h('div.chart-tip.hidden');
    this.legend = this.series.length > 1
      ? h('div.chart-legend', ...this.series.map((s) => h('span', h('i', { style: { background: s.color } }), s.label)))
      : null;
    this.el = h('div.chart', this.legend, h('div.chart-plot', this.canvas, this.tip));
    this.hover = null;
    this.canvas.addEventListener('pointermove', (e) => { const r = this.canvas.getBoundingClientRect(); this.hover = (e.clientX - r.left) / r.width; this.draw(); });
    this.canvas.addEventListener('pointerleave', () => { this.hover = null; this.tip.classList.add('hidden'); this.draw(); });
  }

  push(...vals) {
    this.series.forEach((s, i) => {
      s.values.push(vals[i] ?? 0);
      if (s.values.length > this.points) s.values.shift();
    });
    this.draw();
  }

  draw() {
    const c = this.canvas;
    const dpr = devicePixelRatio || 1;
    const w = c.clientWidth, hgt = c.clientHeight;
    if (!w || !hgt) return;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hgt * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(hgt * dpr); }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hgt);
    const css = getComputedStyle(document.documentElement);
    const grid = css.getPropertyValue('--border').trim() || 'rgba(255,255,255,.08)';
    const muted = css.getPropertyValue('--text-3').trim() || '#888';
    let max = this.max;
    if (max == null) {
      max = Math.max(1, ...this.series.flatMap((s) => s.values));
      const mag = Math.pow(10, Math.floor(Math.log10(max)));
      max = Math.ceil(max / mag) * mag;
    }
    // Raster + Achsenbeschriftung (linker Rand passt sich der längsten Beschriftung an)
    ctx.font = '10.5px ' + (css.getPropertyValue('--font').trim() || 'sans-serif');
    const labelW = Math.max(...[0, 2, 4].map((i) => ctx.measureText(this.format((max * i) / 4)).width));
    const padL = Math.max(36, Math.ceil(labelW) + 14), padR = 6, padT = 8, padB = 6;
    const pw = w - padL - padR, ph = hgt - padT - padB;
    ctx.fillStyle = muted;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const y = padT + ph - (ph * i) / 4;
      ctx.strokeStyle = grid;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, Math.round(y) + .5); ctx.lineTo(w - padR, Math.round(y) + .5); ctx.stroke();
      if (i % 2 === 0) ctx.fillText(this.format((max * i) / 4), padL - 8, y);
    }
    const xAt = (i) => padL + (pw * i) / (this.points - 1);
    const yAt = (v) => padT + ph - (Math.min(v, max) / max) * ph;
    for (const s of this.series) {
      const off = this.points - s.values.length;
      if (s.values.length < 2) continue;
      // Fläche (dezent) nur für die erste Serie
      if (s === this.series[0]) {
        const grad = ctx.createLinearGradient(0, padT, 0, padT + ph);
        grad.addColorStop(0, hexA(s.color, .28));
        grad.addColorStop(1, hexA(s.color, 0));
        ctx.beginPath();
        s.values.forEach((v, i) => (i ? ctx.lineTo(xAt(i + off), yAt(v)) : ctx.moveTo(xAt(i + off), yAt(v))));
        ctx.lineTo(xAt(this.points - 1), padT + ph);
        ctx.lineTo(xAt(off), padT + ph);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }
      ctx.beginPath();
      s.values.forEach((v, i) => (i ? ctx.lineTo(xAt(i + off), yAt(v)) : ctx.moveTo(xAt(i + off), yAt(v))));
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    // Fadenkreuz + Tooltip
    if (this.hover != null) {
      const i = Math.round(((this.hover * w - padL) / pw) * (this.points - 1));
      if (i >= 0 && i < this.points) {
        const x = xAt(i);
        ctx.strokeStyle = muted;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(Math.round(x) + .5, padT); ctx.lineTo(Math.round(x) + .5, padT + ph); ctx.stroke();
        const rows = [];
        for (const s of this.series) {
          const v = s.values[i - (this.points - s.values.length)];
          if (v == null) continue;
          ctx.beginPath(); ctx.arc(x, yAt(v), 4, 0, Math.PI * 2);
          ctx.fillStyle = s.color; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = css.getPropertyValue('--glass-strong').trim() || '#000'; ctx.stroke();
          rows.push(`<div><i style="background:${s.color}"></i>${s.label}<b>${this.format(v)}</b></div>`);
        }
        const secs = (this.points - 1 - i) * 2;
        if (rows.length) {
          this.tip.innerHTML = `<small>${secs ? `vor ${secs} s` : 'jetzt'}</small>${rows.join('')}`;
          this.tip.classList.remove('hidden');
          const tw = this.tip.offsetWidth;
          this.tip.style.left = Math.min(w - tw - 4, Math.max(4, x + 12)) + 'px';
        } else this.tip.classList.add('hidden');
      }
    }
  }
}

function hexA(color, a) {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
