// Leichtgewichtiges Syntax-Highlighting für den Code-Editor.

import { esc } from './dom.js';

const KW = {
  js: 'await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async true false null undefined',
  py: 'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield self print',
  css: 'important',
  sh: 'if then else elif fi for while do done case esac function return in echo exit export local set unset',
  ps: 'if else elseif foreach for while do function param return switch break continue try catch finally throw begin process end write-host get-childitem set-location',
  sql: 'select from where insert into values update set delete create table drop alter join left right inner outer on group by order having limit and or not null as distinct',
  c: 'auto break case char const continue default do double else enum extern float for goto if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while class public private protected namespace using new delete template typename bool true false nullptr include define',
  go: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var true false nil',
  rs: 'as break const continue crate else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while async await dyn',
};

export function langFor(ext) {
  const e = (ext || '').toLowerCase();
  if (['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'java', 'kt', 'swift', 'cs', 'php', 'dart', 'vue', 'svelte'].includes(e)) return 'js';
  if (['json'].includes(e)) return 'json';
  if (['py', 'rb', 'pyw'].includes(e)) return 'py';
  if (['html', 'htm', 'xml', 'svg'].includes(e)) return 'html';
  if (['css', 'scss', 'less'].includes(e)) return 'css';
  if (['sh', 'bash', 'zsh', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'env'].includes(e)) return 'sh';
  if (['ps1', 'psm1', 'bat', 'cmd'].includes(e)) return 'ps';
  if (['sql'].includes(e)) return 'sql';
  if (['c', 'cpp', 'h', 'hpp', 'cc'].includes(e)) return 'c';
  if (e === 'go') return 'go';
  if (e === 'rs') return 'rs';
  if (['md', 'markdown'].includes(e)) return 'md';
  return 'text';
}

export const LANG_LABEL = { js: 'JavaScript/TS', json: 'JSON', py: 'Python', html: 'HTML/XML', css: 'CSS', sh: 'Shell/Config', ps: 'PowerShell/Batch', sql: 'SQL', c: 'C/C++', go: 'Go', rs: 'Rust', md: 'Markdown', text: 'Klartext' };

function wrap(cls, s) { return `<span class="hl-${cls}">${esc(s)}</span>`; }

function generic(src, lang) {
  const kws = new Set((KW[lang] || '').split(' ').map((k) => k.toLowerCase()));
  const lineComment = { js: '//', c: '//', go: '//', rs: '//', css: null, py: '#', sh: '#', ps: '#', sql: '--' }[lang];
  const blockComment = ['js', 'c', 'go', 'rs', 'css'].includes(lang);
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    const rest2 = src.substr(i, 2);
    if (blockComment && rest2 === '/*') {
      let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2;
      out += wrap('com', src.slice(i, j)); i = j; continue;
    }
    if (lineComment && src.startsWith(lineComment, i) && !(lang === 'sh' && i > 0 && /\S/.test(src[i - 1]))) {
      let j = src.indexOf('\n', i); j = j < 0 ? n : j;
      out += wrap('com', src.slice(i, j)); i = j; continue;
    }
    if (ch === '"' || ch === "'" || (ch === '`' && lang === 'js')) {
      let j = i + 1;
      while (j < n && src[j] !== ch) { if (src[j] === '\\') j++; if (src[j] === '\n' && ch !== '`') break; j++; }
      j = Math.min(n, j + 1);
      out += wrap('str', src.slice(i, j)); i = j; continue;
    }
    if (/[0-9]/.test(ch) && !/[\w$]/.test(src[i - 1] || '')) {
      const m = src.slice(i).match(/^(0x[\da-f]+|\d[\d_]*\.?\d*(e[+-]?\d+)?)/i);
      out += wrap('num', m[0]); i += m[0].length; continue;
    }
    if (/[A-Za-z_$@-]/.test(ch) && !(ch === '-' && lang !== 'ps' && lang !== 'css')) {
      const m = src.slice(i).match(lang === 'ps' || lang === 'css' ? /^[\w$@-]+/ : /^[\w$@]+/);
      const w = m[0];
      if (kws.has(w.toLowerCase())) out += wrap('kw', w);
      else if (lang === 'css' && src[i + w.length] === ':' ) out += wrap('prop', w);
      else if (src[i + w.length] === '(') out += wrap('fn', w);
      else if (/^[A-Z][a-zA-Z0-9]+$/.test(w) && lang !== 'sql') out += wrap('type', w);
      else if (lang === 'ps' && w.startsWith('$')) out += wrap('var', w);
      else out += esc(w);
      i += w.length; continue;
    }
    out += esc(ch);
    i++;
  }
  return out;
}

function html(src) {
  return src.replace(/(<!--[\s\S]*?-->)|(<\/?)([\w:-]+)([^>]*?)(\/?>)|([^<]+)/g, (m, com, open, tag, attrs, close, text) => {
    if (com) return wrap('com', com);
    if (text != null) return esc(text);
    let a = '', last = 0;
    attrs.replace(/([\w:-]+)(=)("[^"]*"|'[^']*'|[^\s>]+)?/g, (mm, k, eq, v, off) => {
      a += esc(attrs.slice(last, off)) + wrap('prop', k) + esc(eq) + (v ? wrap('str', v) : '');
      last = off + mm.length;
      return mm;
    });
    a += esc(attrs.slice(last));
    return `${esc(open)}${wrap('kw', tag)}${a}${esc(close)}`;
  });
}

function json(src) {
  return src.replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+\.?\d*(?:e[+-]?\d+)?)|([^"\w-]+|[\w-])/gi, (m, str, colon, kw, num) => {
    if (str) return colon ? wrap('prop', str) + esc(colon) : wrap('str', str);
    if (kw) return wrap('kw', kw);
    if (num) return wrap('num', num);
    return esc(m);
  });
}

function md(src) {
  return src.split('\n').map((l) => {
    if (/^#{1,6}\s/.test(l)) return wrap('kw', l);
    if (/^```/.test(l)) return wrap('com', l);
    if (/^\s*([-*+]|\d+\.)\s/.test(l)) return l.replace(/^(\s*(?:[-*+]|\d+\.))(.*)$/, (_, a, b) => wrap('num', a) + esc(b));
    if (/^>/.test(l)) return wrap('str', l);
    return esc(l).replace(/\*\*([^*]+)\*\*/g, '<span class="hl-fn">**$1**</span>');
  }).join('\n');
}

export function highlight(src, lang) {
  if (src.length > 300000) return esc(src);
  if (lang === 'html') return html(src);
  if (lang === 'json') return json(src);
  if (lang === 'md') return md(src);
  if (lang === 'text') return esc(src);
  return generic(src, lang);
}
