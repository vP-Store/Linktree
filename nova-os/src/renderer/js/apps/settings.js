// Einstellungen: Erscheinungsbild, Desktop & Dock, Tastenkürzel, System, Info.

import { h, clear, esc } from '../core/dom.js';
import { icon, logoSvg } from '../core/icons.js';
import { api, isElectron } from '../core/api.js';
import { store, DEFAULTS } from '../core/store.js';
import { listApps, appIconSpan } from '../core/registry.js';
import { ACCENTS, WALLPAPERS, wallpaperThumb } from '../shell/theme.js';
import { toast, confirmDialog, promptDialog, showError } from '../core/ui.js';
import { openApp } from '../core/wm.js';
import { sysInfo } from '../shell/state.js';

const PAGES = [
  ['welcome', 'sparkles', 'Willkommen'],
  ['look', 'palette', 'Erscheinungsbild'],
  ['desktop', 'monitor', 'Desktop & Dock'],
  ['keys', 'keyboard', 'Tastenkürzel'],
  ['system', 'settings', 'System'],
  ['about', 'info', 'Über NovaOS'],
];

const SHORTCUTS = [
  ['NovaOS ein-/ausblenden', 'Alt + Leertaste (änderbar)'],
  ['Befehlspalette / Suche', 'Strg + K'],
  ['Startmenü', 'Strg + Leertaste'],
  ['Fenster wechseln', 'Strg + Tab (halten)'],
  ['Fenster schließen', 'Alt + Q'],
  ['Maximieren / Wiederherstellen', 'Alt + ↑'],
  ['Minimieren', 'Alt + ↓'],
  ['Links / rechts einrasten', 'Alt + ← / →'],
  ['Fensterübersicht', 'Alt + W'],
  ['Alle Fenster minimieren', 'Alt + D'],
  ['Terminal öffnen', 'Alt + T'],
  ['Dateien öffnen', 'Alt + E'],
  ['Arbeitsfläche wechseln', 'Alt + 1 … 4'],
  ['Menüs schließen', 'Esc'],
];

function toAccelerator(e) {
  const mods = [];
  if (e.ctrlKey) mods.push('Control');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Super');
  let k = e.key;
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(k)) return null;
  if (k === ' ') k = 'Space';
  else if (k.length === 1) k = k.toUpperCase();
  else if (/^F\d+$/.test(k)) { /* F-Tasten bleiben */ }
  else k = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Escape: 'Esc' }[k] || k;
  if (!mods.length && !/^F\d+$/.test(k)) return null;
  return [...mods, k].join('+');
}

export default {
  async mount(root, win, args) {
    let page = args.page || 'look';
    const side = h('div.app-sidebar.set-side');
    const main = h('div.app-scroll.set-main');
    root.append(h('div.app-split', side, main));

    function renderSide() {
      clear(side);
      const info = sysInfo();
      const name = store.get('userName') || (info && info.user) || 'Nova';
      side.append(h('div.set-user', h('div.avatar', name[0].toUpperCase()), h('div', h('b', name), h('small.faint', info ? info.hostname : ''))));
      for (const [id, ic, label] of PAGES) side.append(h('button.side-item', { class: page === id ? 'on' : '', html: `${icon(ic)}<span>${label}</span>`, onclick: () => go(id) }));
    }

    function go(id) { page = id; renderSide(); render(); main.scrollTop = 0; }

    // ---------- Bausteine ----------
    const section = (title, ...rows) => h('div.set-section', title ? h('h3', title) : null, h('div.set-card.card', ...rows.filter(Boolean)));
    const row = (title, desc, control) => h('div.set-row', h('div.grow', h('div.set-row-title', title), desc ? h('div.set-row-desc', desc) : null), control);
    function toggle(key, onChange) {
      const inp = h('input', { type: 'checkbox', checked: !!store.get(key) });
      inp.onchange = () => { store.set(key, inp.checked); onChange && onChange(inp.checked); };
      return h('span.switch', inp, h('span'));
    }
    function slider(key, min, max, step = 1, suffix = '') {
      const r = h('input.range', { type: 'range', min, max, step, value: store.get(key), style: { width: '180px' } });
      const out = h('span.set-val', store.get(key) + suffix);
      const fill = () => r.style.setProperty('--p', ((r.value - min) / (max - min)) * 100 + '%');
      fill();
      r.oninput = () => { fill(); out.textContent = r.value + suffix; store.set(key, +r.value); };
      return h('div.row', r, out);
    }
    function select(key, options, onChange) {
      const s = h('select.input', { style: { width: '200px' } }, ...options.map(([v, l]) => h('option', { value: v, selected: String(store.get(key)) === String(v) }, l)));
      s.onchange = () => { const v = options.find(([x]) => String(x) === s.value)[0]; store.set(key, v); onChange && onChange(v); };
      return s;
    }

    // ---------- Seiten ----------
    async function render() {
      clear(main);
      const title = PAGES.find((p) => p[0] === page)[2];
      win.setTitle(`${title} – Einstellungen`);
      if (page !== 'welcome') main.append(h('h1.set-title', title));

      if (page === 'welcome') {
        main.append(h('div.set-welcome',
          h('div.set-hero', { html: logoSvg(84) }),
          h('h1', 'Willkommen bei NovaOS'),
          h('p.muted', 'Dein eigenes Betriebssystem – als Overlay über Windows. Ein Tastendruck holt es hervor, ein weiterer bringt dich zurück.'),
          h('div.set-tiles',
            ...[['keyboard', 'Alt + Leertaste', 'NovaOS jederzeit ein- und ausblenden'], ['command', 'Strg + K', 'Alles finden: Apps, Dateien, Befehle, Rechnen'],
              ['columns', 'Fenster ziehen', 'An den Rand ziehen zum Einrasten (Hälfte/Viertel)'], ['apps', 'Programme', 'Starte alle installierten Windows-Programme'],
              ['layers', 'Arbeitsflächen', 'Alt + 1…4 für getrennte Arbeitsbereiche'], ['eye', 'Durchsichtig', 'Schnelleinstellungen → Hintergrund-Deckkraft']]
              .map(([ic, t, d]) => h('div.set-tile.card', { html: `<span class="set-tile-ico">${icon(ic)}</span><b>${t}</b><span>${d}</span>` }))),
          h('div.set-name', h('label.col', { style: { gap: '6px' } }, h('span.faint', 'Wie dürfen wir dich nennen?'),
            (() => { const i = h('input.input', { value: store.get('userName') || '', placeholder: (sysInfo() && sysInfo().user) || 'Dein Name' }); i.oninput = () => { store.set('userName', i.value.trim()); renderSide(); }; return i; })())),
          h('div.row', { style: { justifyContent: 'center', gap: '10px', marginTop: '10px' } },
            h('button.btn.primary', { html: `${icon('palette')} Design anpassen`, onclick: () => go('look') }),
            h('button.btn', { html: `${icon('folder')} Dateien öffnen`, onclick: () => openApp('files') }))));
        return;
      }

      if (page === 'look') {
        const themeSeg = h('div.seg', ...[['dark', 'moon', 'Dunkel'], ['light', 'sun', 'Hell'], ['auto', 'monitor', 'Automatisch']].map(([v, ic, l]) =>
          h('button.seg-btn', { class: store.get('theme') === v ? 'on' : '', html: `${icon(ic)}<span>${l}</span>`, onclick: () => { store.set('theme', v); render(); } })));
        const accents = h('div.accent-row', ...ACCENTS.map((a) => h('button.accent-swatch', { title: a.name, class: store.get('accent') === a.color ? 'on' : '', style: { background: `linear-gradient(135deg, ${a.color}, ${a.alt})`, width: '30px', height: '30px' }, onclick: () => { store.set('accent', a.color); render(); } })));
        const custom = h('input', { type: 'color', value: store.get('accent'), title: 'Eigene Farbe', class: 'set-color' });
        custom.oninput = () => store.set('accent', custom.value);
        accents.append(custom);
        const wps = h('div.set-wps', ...Object.keys(WALLPAPERS).map((k) => {
          const t = wallpaperThumb(k);
          return h('button.set-wp', { class: store.get('wallpaper') === k ? 'on' : '', onclick: () => { store.set('wallpaper', k); render(); } }, t, h('span', WALLPAPERS[k].name));
        }));
        const imgPath = store.get('wallpaperImage');
        wps.append(h('button.set-wp', { class: store.get('wallpaper') === 'image' ? 'on' : '', onclick: async () => {
          const p = await promptDialog({ title: 'Eigenes Hintergrundbild', message: 'Pfad zu einem Bild (JPG, PNG, WEBP …). Tipp: In der Bilder-App geht das mit einem Klick.', value: imgPath || '', ok: 'Übernehmen', select: false });
          if (!p) return;
          if (!(await api.fs.exists(p))) { showError('Datei nicht gefunden: ' + p); return; }
          store.set('wallpaperImage', p); store.set('wallpaper', 'image'); render();
        } }, h('div.wp-thumb.set-wp-custom', { html: icon('image') }), h('span', imgPath ? 'Eigenes Bild' : 'Bild wählen …')));
        main.append(
          section('Design', row('Erscheinungsbild', 'Hell, dunkel oder wie Windows', themeSeg), row('Akzentfarbe', 'Wird für Hervorhebungen, Schalter und Auswahl genutzt', accents)),
          section('Hintergrund', h('div.set-pad', wps),
            row('Bewegter Hintergrund', 'Sanft treibende Farbflächen', toggle('animatedWallpaper')),
            row('Abdunkeln', 'Bessere Lesbarkeit auf hellen Bildern', slider('wallpaperDim', 0, 80, 5, ' %')),
            row('Deckkraft (Durchsicht auf Windows)', 'Bei 0 % siehst du Windows hinter NovaOS', slider('overlayOpacity', 0, 100, 5, ' %'))),
          section('Effekte', row('Glas-Unschärfe', 'Stärke des Milchglas-Effekts', slider('blur', 0, 60, 2, ' px')),
            row('Animationen reduzieren', 'Für ruhigere Darstellung und schwächere PCs', toggle('reduceMotion')),
            row('Skalierung', 'Größe der gesamten Oberfläche', select('uiScale', [[80, '80 %'], [90, '90 %'], [100, '100 %'], [110, '110 %'], [125, '125 %'], [150, '150 %']]))));
      }

      if (page === 'desktop') {
        const pinned = store.get('dockPinned');
        const dockApps = h('div.set-dockapps', ...listApps().map((a) => {
          const on = pinned.includes(a.id);
          return h('button.set-dockapp', { class: on ? 'on' : '', title: on ? 'Vom Dock lösen' : 'Ans Dock heften', onclick: () => { store.set('dockPinned', on ? store.get('dockPinned').filter((x) => x !== a.id) : [...store.get('dockPinned'), a.id]); render(); }, html: `${appIconSpan(a)}<span>${esc(a.name)}</span>${on ? `<i>${icon('check')}</i>` : ''}` });
        }));
        main.append(
          section('Desktop', row('Widgets anzeigen', 'Uhr, System, Aufgaben, Wetter, Schnellnotiz', toggle('showWidgets')),
            row('Desktop-Symbole', 'Verknüpfungen und Dateien deines Windows-Desktops', toggle('showDesktopIcons')),
            row('Arbeitsflächen', 'Anzahl der virtuellen Desktops', select('workspaces', [[1, '1 (aus)'], [2, '2'], [3, '3'], [4, '4'], [6, '6'], [9, '9']]))),
          section('Dock', row('Automatisch ausblenden', 'Erscheint, wenn die Maus den unteren Rand berührt', toggle('dockAutohide')),
            row('Symbolgröße', '', slider('dockSize', 40, 72, 2, ' px')),
            h('div.set-pad', h('div.set-row-title', { style: { marginBottom: '10px' } }, 'Apps im Dock'), dockApps)),
          section('Statusleiste', row('Systemanzeigen', 'CPU, RAM und Netzwerk oben rechts', toggle('showMeters')),
            row('24-Stunden-Format', '', toggle('clock24')), row('Sekunden anzeigen', '', toggle('showSeconds'))));
      }

      if (page === 'keys') {
        const current = h('span.kbd.set-hotkey', '…');
        api.overlay.getHotkey().then((k) => { current.textContent = k || 'nicht belegt'; });
        const rec = h('button.btn', { html: `${icon('keyboard')} Neue Kombination aufnehmen` });
        rec.onclick = () => {
          rec.textContent = 'Drücke die neue Tastenkombination …';
          rec.classList.add('primary');
          const onKey = async (e) => {
            e.preventDefault(); e.stopPropagation();
            if (e.key === 'Escape') { done(); return; }
            const acc = toAccelerator(e);
            if (!acc) return;
            done();
            const res = await api.overlay.setHotkey(acc);
            if (res === acc) { toast('Tastenkürzel gespeichert', acc, { kind: 'ok', icon: 'keyboard' }); current.textContent = acc; }
            else { showError(`„${acc}“ ist bereits von einem anderen Programm belegt. Aktiv: ${res || 'keins'}`); current.textContent = res || 'nicht belegt'; }
          };
          const done = () => { removeEventListener('keydown', onKey, true); rec.innerHTML = `${icon('keyboard')} Neue Kombination aufnehmen`; rec.classList.remove('primary'); };
          addEventListener('keydown', onKey, true);
        };
        main.append(
          section('Globales Tastenkürzel', row('NovaOS ein-/ausblenden', 'Funktioniert überall in Windows', h('div.row', current, rec))),
          section('Alle Tastenkürzel', ...SHORTCUTS.map(([t, k]) => row(t, '', h('span.set-keys', ...k.split(' ').map((p) => (p === '+' || p === '/' || p === '…' || p === '(halten)' || p === '(änderbar)' ? h('span.faint', ' ' + p + ' ') : h('span.kbd', p))))))));
      }

      if (page === 'system') {
        const auto = h('input', { type: 'checkbox' });
        api.overlay.getAutostart().then((v) => { auto.checked = !!v; });
        auto.onchange = async () => { auto.checked = !!(await api.overlay.setAutostart(auto.checked)); toast(auto.checked ? 'Autostart aktiviert' : 'Autostart deaktiviert', auto.checked ? 'NovaOS startet unsichtbar mit Windows.' : '', { icon: 'power' }); };
        const shells = api.platform === 'win32' ? [['powershell', 'PowerShell'], ['cmd', 'Eingabeaufforderung (CMD)'], ['bash', 'Bash (WSL/Git)']] : [['bash', 'Bash']];
        main.append(
          section('Start', row('Mit Windows starten', 'NovaOS startet beim Anmelden im Hintergrund (ausgeblendet)', h('span.switch', auto, h('span'))),
            row('Startanimation', '', toggle('bootAnimation'))),
          section('Verhalten', row('Nach Programmstart ausblenden', 'Wenn du ein Windows-Programm startest, tritt NovaOS zur Seite', (() => { const i = h('input', { type: 'checkbox', checked: store.get('hideOnLaunch', true) }); i.onchange = () => store.set('hideOnLaunch', i.checked); return h('span.switch', i, h('span')); })()),
            row('Standard-Shell im Terminal', '', select('terminalShell', shells))),
          section('Daten', row('Einstellungen zurücksetzen', 'Design, Dock und Desktop auf Standard (Notizen & Dateien bleiben)', h('button.btn.danger', { onclick: async () => {
            if (!(await confirmDialog({ title: 'Einstellungen zurücksetzen?', message: 'Alle NovaOS-Einstellungen gehen auf den Standard zurück. Deine Dateien und Notizen bleiben erhalten.', ok: 'Zurücksetzen', danger: true }))) return;
            for (const k of Object.keys(DEFAULTS)) store.set(k, DEFAULTS[k]);
            toast('Zurückgesetzt', 'Standardeinstellungen aktiv', { kind: 'ok' });
            render();
          } }, 'Zurücksetzen')),
            row('Mitteilungen löschen', '', h('button.btn', { onclick: async () => { (await import('../core/ui.js')).clearNotifications(); toast('Mitteilungen gelöscht', ''); } }, 'Löschen')),
            row('Oberfläche neu laden', 'Hilft, falls etwas hängt', h('button.btn', { onclick: () => api.overlay.reload() }, 'Neu laden')),
            isElectron ? row('Entwicklertools', 'Für Fehlersuche', h('button.btn', { onclick: () => api.overlay.devtools() }, 'Öffnen')) : null));
      }

      if (page === 'about') {
        const ov = await api.overlay.info().catch(() => ({}));
        const info = sysInfo() || {};
        main.append(h('div.set-about',
          h('div.set-hero', { html: logoSvg(96) }),
          h('h2', 'NovaOS'),
          h('div.faint', `Version ${ov.version || '1.0.0'}`),
          h('p.muted', 'Ein Overlay für Windows, das sich wie ein eigenes Betriebssystem anfühlt – mit echten Dateien, echtem Terminal und all deinen Programmen.')),
          section('Technik', row('Plattform', '', h('span', `${info.platform === 'win32' ? 'Windows' : info.platform || '–'} ${info.release || ''}`)),
            row('Electron', '', h('span', ov.electron || '–')), row('Chromium', '', h('span', ov.chrome || '–')), row('Node.js', '', h('span', ov.node || '–'))));
      }
    }

    renderSide();
    render();
    return { onArgs(a) { if (a.page) go(a.page); }, getState() { return { page }; } };
  },
};
