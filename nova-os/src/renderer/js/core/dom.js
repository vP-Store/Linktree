// Kleine DOM-Helfer, damit Apps ohne Framework übersichtlich bleiben.

// Sicherheitsnetz: append()/prepend() ignorieren null/false/undefined, damit bedingte
// Kinder (cond ? el : null) nie als Text „null“ im Fenster landen.
for (const proto of [Element.prototype, DocumentFragment.prototype]) {
  for (const name of ['append', 'prepend']) {
    const orig = proto[name];
    proto[name] = function (...nodes) { return orig.apply(this, nodes.filter((n) => n != null && n !== false)); };
  }
}

/**
 * h('div.card#main', { onclick, style: {...}, dataset: {...} }, 'Text', child)
 */
export function h(tag, props, ...children) {
  const m = String(tag).match(/^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement((m && m[1]) || 'div');
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g)) {
      if (part[0] === '.') el.classList.add(part.slice(1));
      else el.id = part.slice(1);
    }
  }
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv;
        }
      }
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'class') el.className += ' ' + v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** HTML-String → Element (für SVG-Icons etc.) */
export function frag(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

export function uid(prefix = 'id') {
  return prefix + '-' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
export function bytes(n) {
  if (n == null || isNaN(n)) return '–';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${i ? nf1.format(n) : Math.round(n)} ${u[i]}`;
}

export function rate(n) {
  return n == null ? '–' : bytes(n) + '/s';
}

const dfShort = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export function dateShort(ms) { return ms ? dfShort.format(new Date(ms)) : '–'; }

export function timeAgo(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 45) return 'gerade eben';
  const m = Math.round(s / 60);
  if (m < 60) return `vor ${m} Min.`;
  const hh = Math.round(m / 60);
  if (hh < 24) return `vor ${hh} Std.`;
  const d = Math.round(hh / 24);
  if (d < 7) return d === 1 ? 'gestern' : `vor ${d} Tagen`;
  return new Date(ms).toLocaleDateString('de-DE');
}

export function duration(sec) {
  sec = Math.max(0, Math.floor(sec));
  const d = Math.floor(sec / 86400), hh = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  if (d) return `${d} T ${hh} Std`;
  if (hh) return `${hh} Std ${m} Min`;
  return `${m} Min`;
}

export function pad(n, w = 2) { return String(n).padStart(w, '0'); }

/** Pfad-Helfer, die mit / und \ umgehen können */
export const pathx = {
  sep(p) { return p.includes('\\') && !p.includes('/') ? '\\' : (p.includes('\\') ? '\\' : '/'); },
  base(p) { const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/); return parts[parts.length - 1] || p; },
  dir(p) {
    const s = p.replace(/[\\/]+$/, '');
    // Laufwerkswurzel („C:\“) hat keinen Elternordner – „C:“ allein wäre laufwerksrelativ.
    if (/^[a-z]:$/i.test(s)) return s + '\\';
    const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
    if (i < 0) return s;
    const d = s.slice(0, i);
    if (/^[a-z]:$/i.test(d)) return d + '\\';
    return d || '/';
  },
  join(a, b) { const sep = pathx.sep(a); return a.replace(/[\\/]+$/, '') + sep + b; },
  ext(p) { const b = pathx.base(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i + 1).toLowerCase() : ''; },
  crumbs(p) {
    const parts = p.split(/[\\/]+/).filter(Boolean);
    if (/^[a-z]:/i.test(p)) {
      const out = [];
      let acc = '';
      parts.forEach((part, i) => {
        acc = i === 0 ? part + '\\' : (acc.endsWith('\\') ? acc : acc + '\\') + part;
        out.push({ name: i === 0 ? part : part, path: acc });
      });
      return out;
    }
    const out = [{ name: '/', path: '/' }];
    let acc = '';
    for (const part of parts) { acc += '/' + part; out.push({ name: part, path: acc }); }
    return out;
  },
};

/** Ereignis-Bus */
export class Emitter {
  constructor() { this.map = new Map(); }
  on(ev, fn) {
    if (!this.map.has(ev)) this.map.set(ev, new Set());
    this.map.get(ev).add(fn);
    return () => this.map.get(ev).delete(fn);
  }
  emit(ev, ...a) { (this.map.get(ev) || []).forEach((fn) => { try { fn(...a); } catch (e) { console.error(e); } }); }
}

export const bus = new Emitter();

/** Lokales Datum als JJJJ-MM-TT (ohne UTC-Verschiebung) */
export function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
