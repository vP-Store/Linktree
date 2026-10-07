// Terminal: echte PowerShell/CMD/Bash-Befehle mit Verlauf, Tabs, Autovervollständigung.

import { h, clear, esc, uid, pathx } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { store } from '../core/store.js';
import { openApp } from '../core/wm.js';
import { toast } from '../core/ui.js';
import { ansiToHtml, applyCarriageReturns } from '../core/ansi.js';

const SHELLS = { powershell: 'PowerShell', cmd: 'CMD', bash: 'Bash' };

export default {
  async mount(root, win, args) {
    const home = await api.term.home();
    const defShell = store.get('terminalShell') || (await api.term.defaultShell());
    const history = store.get('termHistory', []) || [];
    const tabs = [];
    let active = null;

    const tabBar = h('div.term-tabs');
    const body = h('div.term-body');
    root.classList.add('term-root');
    root.dataset.tt = store.get('termTheme') || 'nova';
    root.append(tabBar, body);

    win.tools.append(
      h('button.icon-btn.sm', { title: 'Neuer Tab (Strg+T)', html: icon('plus'), onclick: () => newTab() }),
      h('button.icon-btn.sm', { title: 'Shell wählen', html: icon('chevronDown'), onclick: (e) => shellMenu(e.currentTarget) }),
    );

    function shellMenu(btn) {
      import('../core/ui.js').then(({ contextMenu }) => {
        const r = btn.getBoundingClientRect();
        const opts = api.platform === 'win32' ? ['powershell', 'cmd', 'bash'] : ['bash'];
        const themes = [['nova', 'Nova'], ['crt', 'Retro-CRT (grün)'], ['amber', 'Bernstein'], ['light', 'Papier (hell)']];
        const cur = root.dataset.tt;
        contextMenu(r.left - 150, r.bottom + 4, [
          ...opts.map((s) => ({ label: `Neuer Tab: ${SHELLS[s]}`, icon: 'terminal', action: () => newTab({ shell: s }) })),
          '-', { header: true, label: 'Design' },
          ...themes.map(([id, label]) => ({ label, icon: cur === id ? 'check' : 'circle', action: () => { root.dataset.tt = id; store.set('termTheme', id); } })),
        ]);
      });
    }

    function newTab(opts = {}) {
      const t = {
        id: uid('term'),
        cwd: opts.cwd || home,
        shell: opts.shell || defShell,
        busy: false,
        hIndex: -1,
        draft: '',
      };
      t.out = h('div.term-out');
      t.input = h('input.term-input', { spellcheck: false, autocomplete: 'off' });
      t.prompt = h('span.term-prompt');
      t.line = h('div.term-line', t.prompt, t.input);
      t.view = h('div.term-view', { onclick: () => { if (!getSelection().toString()) t.input.focus(); } }, t.out, t.line);
      t.tab = h('button.term-tab', { onclick: () => activate(t) },
        h('span', { html: icon('terminal') }), h('span.term-tab-label', SHELLS[t.shell] || t.shell),
        h('span.term-tab-x', { html: icon('x'), onclick: (e) => { e.stopPropagation(); closeTab(t); } }));
      tabs.push(t);
      tabBar.append(t.tab);
      body.append(t.view);
      t.input.addEventListener('keydown', (e) => onKey(t, e));
      print(t, `NovaOS Terminal · ${SHELLS[t.shell] || t.shell}\n`, 'dim');
      print(t, 'Tipps: „cls“ leert, „open .“ öffnet Dateien hier, Strg+C bricht ab, ↑/↓ Verlauf, Tab vervollständigt.\n\n', 'dim');
      updatePrompt(t);
      activate(t);
      return t;
    }

    function activate(t) {
      active = t;
      tabs.forEach((x) => { x.view.classList.toggle('hidden', x !== t); x.tab.classList.toggle('on', x === t); });
      tabBar.classList.toggle('hidden', tabs.length < 2);
      win.setTitle(`Terminal – ${shortPath(t.cwd)}`);
      setTimeout(() => t.input.focus(), 10);
    }

    function closeTab(t) {
      if (t.busy) api.term.kill(t.id);
      const i = tabs.indexOf(t);
      tabs.splice(i, 1);
      t.view.remove();
      t.tab.remove();
      if (!tabs.length) { win.close(); return; }
      activate(tabs[Math.max(0, i - 1)]);
    }

    function shortPath(p) {
      if (p.toLowerCase().startsWith(home.toLowerCase())) return '~' + p.slice(home.length);
      return p;
    }

    function updatePrompt(t) {
      const sym = t.shell === 'cmd' ? '>' : t.shell === 'powershell' ? '❯' : '$';
      t.prompt.innerHTML = `<span class="tp-path">${esc(shortPath(t.cwd))}</span> <span class="tp-sym">${sym}</span>`;
      if (t === active) win.setTitle(`Terminal – ${shortPath(t.cwd)}`);
    }

    function print(t, text, cls = '') {
      text = text.replace(/\r\n/g, '\n'); // Windows-Zeilenenden sind kein Überschreiben
      // Fortschrittsbalken (\r) überschreiben die zuletzt ausgegebene Zeile
      const prev = t.out.lastChild;
      const prevRaw = prev && prev.dataset ? prev.dataset.raw : null;
      if (prevRaw != null && !prevRaw.endsWith('\n') && !text.startsWith('\n') && (text.includes('\r') || prevRaw.endsWith('\r'))) {
        text = prevRaw + text;
        prev.remove();
      }
      const openCr = text.endsWith('\r');
      text = applyCarriageReturns(text);
      const span = h('span', { class: cls, html: ansiToHtml(text) });
      // Nur den sichtbaren Stand merken (plus offenes \r), sonst wächst er bei jedem Fortschrittsschritt
      span.dataset.raw = text + (openCr ? '\r' : '');
      t.out.append(span);
      // Ausgabe begrenzen, damit sehr lange Läufe flüssig bleiben
      while (t.out.childNodes.length > 4000) t.out.firstChild.remove();
      t.view.scrollTop = t.view.scrollHeight;
    }

    function echoCommand(t, cmd) {
      const line = h('div.term-echo', { html: t.prompt.innerHTML + ' ' });
      line.append(h('span.term-cmd', cmd));
      t.out.append(line);
    }

    async function run(t, raw) {
      const cmd = raw.trim();
      echoCommand(t, raw);
      if (!cmd) return;
      if (history[history.length - 1] !== cmd) history.push(cmd);
      if (history.length > 300) history.splice(0, history.length - 300);
      store.set('termHistory', history);
      t.hIndex = -1;

      // Eingebaute Befehle
      const [c0, ...rest] = cmd.split(/\s+/);
      const arg = cmd.slice(c0.length).trim();
      const lc = c0.toLowerCase();
      if (lc === 'cls' || lc === 'clear') { clear(t.out); return; }
      if (lc === 'exit') { closeTab(t); return; }
      if (lc === 'cd' || lc === 'chdir' || lc === 'set-location' || (/^[a-z]:$/i.test(cmd) && api.platform === 'win32')) {
        try {
          // „cd -“ springt zum vorherigen Ordner (der Hauptprozess liefert dafür null)
          const next = arg === '-' ? t.prevCwd : await api.term.cd(t.cwd, /^[a-z]:$/i.test(cmd) ? cmd + '\\' : arg);
          if (!next) return;
          t.prevCwd = t.cwd;
          t.cwd = next;
          updatePrompt(t);
        } catch (e) {
          print(t, String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') + '\n', 'err');
        }
        return;
      }
      if (lc === 'open' || lc === 'nova') {
        const target = !arg || arg === '.' ? t.cwd : (/^([a-z]:|\/)/i.test(arg) ? arg : pathx.join(t.cwd, arg));
        try {
          const s = await api.fs.stat(target);
          if (s.dir) openApp('files', { path: target });
          else (await import('../core/open.js')).openPath(target);
        } catch (_) { print(t, `Nicht gefunden: ${target}\n`, 'err'); }
        return;
      }
      if (lc === 'edit' || lc === 'code') {
        if (!arg) { openApp('editor'); return; }
        openApp('editor', { path: /^([a-z]:|\/)/i.test(arg) ? arg : pathx.join(t.cwd, arg) });
        return;
      }

      t.busy = true;
      t.line.classList.add('busy');
      t.started = Date.now();
      try {
        await api.term.run(t.id, cmd, t.cwd, t.shell);
      } catch (e) {
        print(t, String(e.message || e) + '\n', 'err');
        t.busy = false;
        t.line.classList.remove('busy');
      }
    }

    function onKey(t, e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = t.input.value;
        t.input.value = '';
        if (t.busy) {
          // Eingabe an laufenden Prozess senden
          echoCommand(t, v);
          api.term.input(t.id, v + '\n');
          return;
        }
        run(t, v);
      } else if (e.key === 'c' && e.ctrlKey) {
        if (t.input.selectionStart !== t.input.selectionEnd) return; // normales Kopieren
        e.preventDefault();
        if (t.busy) { api.term.kill(t.id); print(t, '^C\n', 'dim'); }
        else { echoCommand(t, t.input.value + '^C'); t.input.value = ''; }
      } else if (e.key === 'l' && e.ctrlKey) {
        e.preventDefault(); clear(t.out);
      } else if (e.key === 't' && e.ctrlKey) {
        e.preventDefault(); newTab({ cwd: t.cwd, shell: t.shell });
      } else if (e.key === 'w' && e.ctrlKey) {
        e.preventDefault(); closeTab(t);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!history.length) return;
        if (t.hIndex === -1) { t.draft = t.input.value; t.hIndex = history.length; }
        t.hIndex = Math.max(0, t.hIndex - 1);
        t.input.value = history[t.hIndex];
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (t.hIndex === -1) return;
        t.hIndex++;
        if (t.hIndex >= history.length) { t.hIndex = -1; t.input.value = t.draft; } else t.input.value = history[t.hIndex];
      } else if (e.key === 'Tab') {
        e.preventDefault();
        complete(t);
      }
    }

    async function complete(t) {
      const v = t.input.value;
      const m = v.match(/(?:^|\s)("?)([^\s"]*)$/);
      if (!m) return;
      const word = m[2];
      const sepIdx = Math.max(word.lastIndexOf('/'), word.lastIndexOf('\\'));
      const dirPart = sepIdx >= 0 ? word.slice(0, sepIdx + 1) : '';
      const base = word.slice(sepIdx + 1).toLowerCase();
      const dir = dirPart ? (/^([a-z]:|\/)/i.test(dirPart) ? dirPart : pathx.join(t.cwd, dirPart)) : t.cwd;
      let entries = [];
      try { entries = await api.fs.list(dir, true); } catch (_) { return; }
      const hits = entries.filter((e) => e.name.toLowerCase().startsWith(base));
      if (!hits.length) return;
      if (hits.length === 1) {
        const hit = hits[0];
        const sep = api.platform === 'win32' ? '\\' : '/';
        let name = hit.name + (hit.dir ? sep : '');
        if (/\s/.test(name) && !m[1]) name = '"' + dirPart + name + '"';
        else name = dirPart + name;
        t.input.value = v.slice(0, v.length - word.length - (m[1] ? 1 : 0)) + (m[1] && !name.startsWith('"') ? '"' : '') + name;
      } else {
        // gemeinsamen Präfix ergänzen + Vorschläge anzeigen
        let prefix = hits[0].name;
        for (const x of hits) while (!x.name.toLowerCase().startsWith(prefix.toLowerCase())) prefix = prefix.slice(0, -1);
        if (prefix.length > base.length) t.input.value = v.slice(0, v.length - base.length) + prefix;
        else {
          echoCommand(t, v);
          print(t, hits.slice(0, 60).map((x) => x.name + (x.dir ? '/' : '')).join('   ') + '\n', 'dim');
        }
      }
    }

    const offData = api.term.onData(({ id, data, stream }) => {
      const t = tabs.find((x) => x.id === id);
      if (t) print(t, data, stream === 'stderr' ? 'err' : '');
    });
    const offExit = api.term.onExit(({ id, code }) => {
      const t = tabs.find((x) => x.id === id);
      if (!t) return;
      t.busy = false;
      t.line.classList.remove('busy');
      const secs = (Date.now() - (t.started || Date.now())) / 1000;
      if (code) print(t, `\n[Beendet mit Code ${code}]\n`, 'dim');
      if (secs > 10 && !document.hasFocus()) toast('Befehl fertig', `nach ${Math.round(secs)} s`, { icon: 'terminal' });
      t.input.focus();
    });

    newTab({ cwd: args.cwd || home, shell: args.shell });
    if (args.run) run(active, args.run);

    return {
      onFocus() { active && setTimeout(() => active.input.focus(), 10); },
      onArgs(a) { const t = newTab({ cwd: a.cwd || home }); if (a.run) run(t, a.run); },
      getState() { return active ? { cwd: active.cwd, shell: active.shell } : {}; },
      destroy() { tabs.forEach((t) => t.busy && api.term.kill(t.id)); offData(); offExit(); },
    };
  },
};
