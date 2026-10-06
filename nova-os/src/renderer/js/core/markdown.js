// Kleiner, sicherer Markdown-Renderer (HTML wird immer maskiert).

import { esc } from './dom.js';

function inline(s) {
  // Code zuerst schützen
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s);
  s = s
    .replace(/!\[([^\]]*)\]\((https?:[^)\s]+)\)/g, '<img alt="$1" src="$2">')
    .replace(/\[([^\]]+)\]\(((?:https?:|mailto:)[^)\s]+)\)/g, '<a href="$2" data-ext="1">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" data-ext="1">$2</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_([^_\s][^_]*)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/==([^=]+)==/g, '<mark>$1</mark>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
}

export function renderMarkdown(src) {
  const lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let i = 0;
  let taskIndex = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Codeblock
    const fence = line.match(/^```\s*(\w+)?/);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      html += `<pre class="md-code"><code>${esc(buf.join('\n'))}</code></pre>`;
      continue;
    }
    const hd = line.match(/^(#{1,6})\s+(.*)$/);
    if (hd) { html += `<h${hd[1].length}>${inline(hd[2])}</h${hd[1].length}>`; i++; continue; }
    if (/^(\s*[-*_]){3,}\s*$/.test(line)) { html += '<hr>'; i++; continue; }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      html += `<blockquote>${renderMarkdown(buf.join('\n'))}</blockquote>`;
      continue;
    }
    // Tabelle
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|?\s*:?-+/.test(lines[i + 1])) {
      const row = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = row(line);
      i += 2;
      let body = '';
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) body += `<tr>${row(lines[i++]).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`;
      html += `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
      continue;
    }
    // Listen
    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line);
      let items = '';
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
        let txt = lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, '');
        const task = txt.match(/^\[( |x|X)\]\s*(.*)$/);
        if (task) {
          items += `<li class="task"><input type="checkbox" data-task="${taskIndex++}" ${task[1] !== ' ' ? 'checked' : ''}> <span>${inline(task[2])}</span></li>`;
        } else items += `<li>${inline(txt)}</li>`;
        i++;
      }
      html += ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+[.)])\s+|\|)/.test(lines[i])) buf.push(lines[i++]);
    if (!buf.length) { buf.push(lines[i++]); }
    html += `<p>${buf.map(inline).join('<br>')}</p>`;
  }
  return html;
}

/** Checkbox Nr. n in der Quelle umschalten */
export function toggleTask(src, n) {
  let count = 0;
  return src.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\]/gm, (m, pre, mark) => {
    if (count++ !== n) return m;
    return `${pre}[${mark === ' ' ? 'x' : ' '}]`;
  });
}
