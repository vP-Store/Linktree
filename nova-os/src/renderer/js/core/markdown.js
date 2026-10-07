// Kleiner, sicherer Markdown-Renderer (HTML wird immer maskiert).

import { esc } from './dom.js';
import { highlight, langFor } from './highlight.js';

const FENCE_LANG = { javascript: 'js', typescript: 'ts', python: 'py', shell: 'sh', bash: 'sh', zsh: 'sh', powershell: 'ps1', pwsh: 'ps1', batch: 'bat', rust: 'rs', golang: 'go', markdown: 'md', yaml: 'yml', 'c++': 'cpp', csharp: 'cs', html: 'html', xml: 'xml', json: 'json', css: 'css', sql: 'sql' };

function emphasis(s) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_([^_\s][^_]*)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/==([^=]+)==/g, '<mark>$1</mark>');
}

// Erzeugte Tags (Code, Bilder, Links) werden als Platzhalter geschützt, damit
// spätere Regeln (Auto-Links, Hervorhebungen) nie in deren Attribute schreiben.
function inline(s, opts = {}) {
  const parts = [];
  const keep = (html) => { parts.push(html); return `\u0000${parts.length - 1}\u0000`; };
  s = s.replace(/`([^`]+)`/g, (_, c) => keep(`<code>${esc(c)}</code>`));
  s = esc(s)
    .replace(/!\[([^\]]*)\]\((https?:[^)\s]+)\)/g, (_, alt, src) => keep(opts.remoteImages === false
      // Fremde Bilder laden sofort (Datenabfluss möglich) → in KI-Antworten nur als Link
      ? `<a href="${src}" data-ext="1">🖼 ${alt || src}</a>`
      : `<img alt="${alt}" src="${src}">`))
    .replace(/\[([^\]]+)\]\(((?:https?:|mailto:)[^)\s]+)\)/g, (_, txt, href) => keep(`<a href="${href}" data-ext="1">${emphasis(txt)}</a>`))
    .replace(/(^|[\s(])(https?:\/\/[^\s<)\u0000]+)/g, (_, pre, url) => pre + keep(`<a href="${url}" data-ext="1">${url}</a>`));
  s = emphasis(s);
  // Platzhalter können verschachtelt sein (Link-Text mit Code) → bis zur Ruhe auflösen
  for (let n = 0; n < 4 && s.includes('\u0000'); n++) s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => parts[+i]);
  return s;
}

export function renderMarkdown(src, { tasks = true, remoteImages = true } = {}) {
  const io = { remoteImages };
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
      const lang = fence[1] ? langFor(FENCE_LANG[fence[1].toLowerCase()] || fence[1].toLowerCase()) : 'text';
      html += `<pre class="md-code"${fence[1] ? ` data-lang="${esc(fence[1])}"` : ''}><code>${highlight(buf.join('\n'), lang)}</code></pre>`;
      continue;
    }
    const hd = line.match(/^(#{1,6})\s+(.*)$/);
    if (hd) { html += `<h${hd[1].length}>${inline(hd[2], io)}</h${hd[1].length}>`; i++; continue; }
    if (/^(\s*[-*_]){3,}\s*$/.test(line)) { html += '<hr>'; i++; continue; }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      // Aufgaben in Zitaten zählt toggleTask() nicht mit → nur anzeigen, nicht umschaltbar
      html += `<blockquote>${renderMarkdown(buf.join('\n'), { tasks: false, remoteImages })}</blockquote>`;
      continue;
    }
    // Tabelle
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|?\s*:?-+/.test(lines[i + 1])) {
      const row = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = row(line);
      i += 2;
      let body = '';
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) body += `<tr>${row(lines[i++]).map((c) => `<td>${inline(c, io)}</td>`).join('')}</tr>`;
      html += `<table><thead><tr>${head.map((c) => `<th>${inline(c, io)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
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
          const attr = tasks ? `data-task="${taskIndex++}"` : 'disabled';
          items += `<li class="task"><input type="checkbox" ${attr} ${task[1] !== ' ' ? 'checked' : ''}> <span>${inline(task[2], io)}</span></li>`;
        } else items += `<li>${inline(txt, io)}</li>`;
        i++;
      }
      html += ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|>|\s*([-*+]|\d+[.)])\s+|\|)/.test(lines[i])) buf.push(lines[i++]);
    if (!buf.length) { buf.push(lines[i++]); }
    html += `<p>${buf.map((l) => inline(l, io)).join('<br>')}</p>`;
  }
  return html;
}

/** Checkbox Nr. n in der Quelle umschalten */
export function toggleTask(src, n) {
  // Zählung wie renderMarkdown(): Zeilen in ```-Codeblöcken sind keine Aufgaben.
  let count = 0;
  let inFence = false;
  return src.split('\n').map((line) => {
    if (/^```/.test(line)) { inFence = !inFence; return line; }
    if (inFence) return line;
    return line.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\]/, (m, pre, mark) => {
      if (count++ !== n) return m;
      return `${pre}[${mark === ' ' ? 'x' : ' '}]`;
    });
  }).join('\n');
}
