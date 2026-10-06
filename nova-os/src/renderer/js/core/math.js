// Sicherer Ausdrucks-Parser (kein eval) für Rechner & Befehlspalette.
// Unterstützt + - * / ^ %, Klammern, Funktionen und Konstanten, Dezimalkomma.

const FUNCS = {
  sqrt: Math.sqrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, ln: Math.log, log: Math.log10,
  exp: Math.exp, round: Math.round, floor: Math.floor, ceil: Math.ceil,
};
const CONSTS = { pi: Math.PI, e: Math.E, π: Math.PI };

export function tokenize(src) {
  const s = String(src).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/√/g, 'sqrt');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[\d.,]/.test(c)) {
      let j = i;
      while (j < s.length && /[\d.,]/.test(s[j])) j++;
      let num = s.slice(i, j);
      // 1.234,5 → 1234.5 | 1,5 → 1.5
      if (num.includes(',')) num = num.replace(/\./g, '').replace(',', '.');
      if (!/^\d*\.?\d+$|^\d+\.$/.test(num)) throw new Error('Ungültige Zahl');
      out.push({ t: 'n', v: parseFloat(num) });
      i = j;
      continue;
    }
    if (/[a-zπ]/i.test(c)) {
      let j = i;
      while (j < s.length && /[a-zπ]/i.test(s[j])) j++;
      const w = s.slice(i, j).toLowerCase();
      if (w in FUNCS) out.push({ t: 'f', v: w });
      else if (w in CONSTS) out.push({ t: 'n', v: CONSTS[w] });
      else throw new Error('Unbekannt: ' + w);
      i = j;
      continue;
    }
    if ('+-*/^%()!'.includes(c)) { out.push({ t: 'o', v: c }); i++; continue; }
    throw new Error('Unerwartetes Zeichen: ' + c);
  }
  return out;
}

export function evaluate(src) {
  const toks = tokenize(src);
  let pos = 0;
  const peek = () => toks[pos];
  const eat = (v) => { const t = toks[pos]; if (!t || (v && t.v !== v)) throw new Error('Syntaxfehler'); pos++; return t; };

  // Grammatik: expr = term (('+'|'-') term)*
  function expr() {
    let v = term();
    while (peek() && (peek().v === '+' || peek().v === '-')) {
      const op = eat().v;
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  function term() {
    let v = unary();
    for (;;) {
      const t = peek();
      if (t && (t.v === '*' || t.v === '/')) {
        const op = eat().v; const r = unary();
        if (op === '/' && r === 0) throw new Error('Division durch 0');
        v = op === '*' ? v * r : v / r;
      } else if (t && (t.t === 'n' || t.t === 'f' || t.v === '(')) {
        v *= unary(); // implizite Multiplikation: 2pi, 3(4)
      } else break;
    }
    return v;
  }
  function unary() {
    if (peek() && peek().v === '-') { eat(); return -unary(); }
    if (peek() && peek().v === '+') { eat(); return unary(); }
    return power();
  }
  function power() {
    let b = postfix();
    if (peek() && peek().v === '^') { eat(); return Math.pow(b, unary()); }
    return b;
  }
  function postfix() {
    let v = primary();
    for (;;) {
      if (peek() && peek().v === '%') { eat(); v = v / 100; continue; }
      if (peek() && peek().v === '!') { eat(); v = fact(v); continue; }
      break;
    }
    return v;
  }
  function primary() {
    const t = peek();
    if (!t) throw new Error('Unvollständig');
    if (t.t === 'n') { pos++; return t.v; }
    if (t.t === 'f') {
      pos++;
      const arg = peek() && peek().v === '(' ? (eat('('), (() => { const v = expr(); eat(')'); return v; })()) : unary();
      return FUNCS[t.v](arg);
    }
    if (t.v === '(') { eat('('); const v = expr(); if (peek() && peek().v === ')') eat(')'); return v; }
    throw new Error('Syntaxfehler');
  }
  function fact(n) {
    if (n < 0 || !Number.isInteger(n) || n > 170) throw new Error('Fakultät nur für 0–170');
    let r = 1; for (let i = 2; i <= n; i++) r *= i; return r;
  }

  const v = expr();
  if (pos < toks.length) throw new Error('Syntaxfehler');
  if (!isFinite(v)) throw new Error('Ergebnis ungültig');
  return v;
}

export function formatNumber(v) {
  if (Math.abs(v) >= 1e15 || (Math.abs(v) < 1e-9 && v !== 0)) return v.toExponential(8).replace('.', ',');
  const r = Math.round(v * 1e10) / 1e10;
  return r.toLocaleString('de-DE', { maximumFractionDigits: 10 });
}

/** true, wenn der Text wie eine Rechnung aussieht */
export function looksLikeMath(s) {
  return /\d/.test(s) && /[+\-*/^%×÷()!]|sqrt|sin|cos|tan|log|ln|pi/i.test(s) && !/^[\d.,\s]+$/.test(s);
}
