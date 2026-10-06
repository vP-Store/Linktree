// Unit-Tests für reine Logik-Module (laufen ohne Browser: node --test tests/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, formatNumber, looksLikeMath } from '../src/renderer/js/core/math.js';
import { ansiToHtml, applyCarriageReturns } from '../src/renderer/js/core/ansi.js';
import { highlight, langFor } from '../src/renderer/js/core/highlight.js';
import { renderMarkdown, toggleTask } from '../src/renderer/js/core/markdown.js';
import { pathx, bytes, isoDate } from '../src/renderer/js/core/dom.js';

test('Rechner: Grundrechenarten, Vorrang, Klammern', () => {
  assert.equal(evaluate('1+2*3'), 7);
  assert.equal(evaluate('(1+2)*3'), 9);
  assert.equal(evaluate('2^3^2'), 512);
  assert.equal(evaluate('-2^2'), -4);
  assert.equal(evaluate('3(4+1)'), 15);
  assert.equal(evaluate('10%'), 0.1);
  assert.equal(evaluate('5!'), 120);
  assert.equal(evaluate('1,5*2'), 3);
  assert.equal(formatNumber(evaluate('100/3')), '33,3333333333');
  assert.throws(() => evaluate('1/0'), /Division durch 0/);
  assert.throws(() => evaluate('2+'), /Unvollständig|Syntax/);
  assert.ok(looksLikeMath('12*(3+4)'));
  assert.ok(!looksLikeMath('12345'));
});

test('ANSI: Farben, Fett, 256/Truecolor, Maskierung', () => {
  const h = ansiToHtml('\x1b[1;31mFehler\x1b[0m <b>');
  assert.match(h, /color:#f87171;font-weight:700/);
  assert.match(h, /&lt;b&gt;/);
  assert.match(ansiToHtml('\x1b[38;5;196mrot'), /rgb\(255,0,0\)/);
  assert.match(ansiToHtml('\x1b[38;2;1;2;3mx'), /rgb\(1,2,3\)/);
  assert.equal(applyCarriageReturns('10%\r100%\nok'), '100%\nok');
});

test('Highlighting: Sprachen erkennen, HTML sicher', () => {
  assert.equal(langFor('ts'), 'js');
  assert.equal(langFor('ps1'), 'ps');
  assert.equal(langFor('xyz'), 'text');
  const out = highlight('const a = "<x>"; // hi', 'js');
  assert.match(out, /hl-kw">const/);
  assert.match(out, /&lt;x&gt;/);
  assert.doesNotMatch(highlight('<script>alert(1)</script>', 'html'), /<script>/);
});

test('Markdown: Grundelemente, keine HTML-Injektion, Aufgaben umschalten', () => {
  const html = renderMarkdown('# Titel\n\n**fett** <img src=x onerror=alert(1)>\n\n- [ ] eins\n- [x] zwei');
  assert.match(html, /<h1>Titel<\/h1>/);
  assert.match(html, /<strong>fett<\/strong>/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /data-task="0"/);
  assert.equal(toggleTask('- [ ] a\n- [ ] b', 1), '- [ ] a\n- [x] b');
  assert.equal(toggleTask('```\n- [ ] code\n```\n- [ ] echt', 0), '```\n- [ ] code\n```\n- [x] echt');
});

test('Pfade: Windows und Unix', () => {
  assert.equal(pathx.base('C:\\Users\\nova\\a.txt'), 'a.txt');
  assert.equal(pathx.dir('C:\\Users'), 'C:\\');
  assert.equal(pathx.dir('C:\\'), 'C:\\');
  assert.equal(pathx.join('C:\\Users', 'x'), 'C:\\Users\\x');
  assert.equal(pathx.join('/home/nova', 'x'), '/home/nova/x');
  assert.equal(pathx.ext('Bild.JPG'), 'jpg');
  assert.deepEqual(pathx.crumbs('/home/a').map((c) => c.path), ['/', '/home', '/home/a']);
  assert.equal(bytes(1536), '1,5 KB');
  assert.match(isoDate(new Date(2026, 0, 5)), /^2026-01-05$/);
});
