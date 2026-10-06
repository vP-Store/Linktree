// Zugriff auf das echte System (window.nova aus preload.js).
// Läuft die Oberfläche im normalen Browser (Vorschau/Tests), wird eine
// Simulation mit einem kleinen virtuellen Dateisystem verwendet.

function createMock() {
  const HOME = '/home/nova';
  const now = Date.now();
  const files = new Map(); // path → { dir, content, mtime, size }
  const add = (p, content, ago = 0) => {
    const dir = content === null;
    files.set(p, { dir, content: dir ? null : content, mtime: now - ago * 60000, size: dir ? 0 : String(content).length });
  };
  [
    '/', '/home', HOME, `${HOME}/Desktop`, `${HOME}/Dokumente`, `${HOME}/Downloads`, `${HOME}/Bilder`, `${HOME}/Musik`, `${HOME}/Videos`,
    `${HOME}/Dokumente/Projekte`, `${HOME}/Dokumente/NovaOS`,
  ].forEach((p) => add(p, null, 600));
  add(`${HOME}/Desktop/Willkommen.md`, '# Willkommen bei NovaOS\n\nDrücke **Strg+K** für die Befehlspalette.\n', 5);
  add(`${HOME}/Desktop/Einkauf.txt`, 'Milch\nBrot\nKaffee\n', 50);
  add(`${HOME}/Dokumente/Projekte/plan.md`, '# Plan\n\n- [x] Idee\n- [ ] Umsetzung\n', 300);
  add(`${HOME}/Dokumente/Projekte/app.js`, 'function hallo(name) {\n  return `Hallo ${name}!`;\n}\n\nconsole.log(hallo("Welt"));\n', 120);
  add(`${HOME}/Dokumente/Rechnung_2026.pdf`, 'PDF', 2000);
  add(`${HOME}/Dokumente/Budget.xlsx`, 'XLSX', 4000);
  add(`${HOME}/Downloads/setup.exe`, 'EXE'.repeat(5000), 90);
  add(`${HOME}/Downloads/archiv.zip`, 'ZIP'.repeat(9000), 900);
  add(`${HOME}/Bilder/urlaub.jpg`, 'JPG', 3000);
  add(`${HOME}/Musik/song.mp3`, 'MP3', 3000);

  const children = (dir) => {
    const prefix = dir === '/' ? '/' : dir + '/';
    return [...files.entries()].filter(([p]) => p !== dir && p.startsWith(prefix) && !p.slice(prefix.length).includes('/'));
  };
  const base = (p) => p.split('/').filter(Boolean).pop() || '/';
  const parent = (p) => p.slice(0, p.lastIndexOf('/')) || '/';
  const ext = (n) => (n.includes('.') ? n.split('.').pop().toLowerCase() : '');
  const unique = (p) => {
    if (!files.has(p)) return p;
    const d = parent(p), b = base(p), e = b.includes('.') ? '.' + ext(b) : '', stem = e ? b.slice(0, -e.length) : b;
    for (let i = 2; ; i++) { const c = `${d === '/' ? '' : d}/${stem} (${i})${e}`; if (!files.has(c)) return c; }
  };
  const need = (p) => { if (!files.has(p)) throw new Error('Nicht gefunden: ' + p); return files.get(p); };
  const wait = (v) => new Promise((r) => setTimeout(() => r(v), 30));
  const listeners = { term: new Set(), exit: new Set(), clip: new Set(), vis: new Set() };
  let clip = '';
  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem('nova-mock:' + k)); } catch (_) { return undefined; } },
    set(k, v) { try { localStorage.setItem('nova-mock:' + k, JSON.stringify(v)); } catch (_) {} },
    all() {
      const out = {};
      try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('nova-mock:')) out[k.slice(10)] = JSON.parse(localStorage.getItem(k)); } } catch (_) {}
      return out;
    },
  };
  let cpuPhase = 0;

  const moveTree = (src, dest, copy) => {
    for (const [p, v] of [...files.entries()]) {
      if (p === src || p.startsWith(src + '/')) {
        files.set(dest + p.slice(src.length), { ...v, mtime: Date.now() });
        if (!copy) files.delete(p);
      }
    }
  };

  return {
    isElectron: false,
    platform: 'browser',
    overlay: {
      hide: async () => {}, quit: async () => {}, reload: async () => location.reload(), devtools: async () => {},
      info: async () => ({ version: '1.0.0', electron: '–', chrome: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] || '–', node: '–', platform: 'browser', arch: '–' }),
      getHotkey: async () => 'Alt+Space', setHotkey: async (a) => a,
      getAutostart: async () => false, setAutostart: async (v) => v,
      onVisibility: (cb) => { listeners.vis.add(cb); return () => listeners.vis.delete(cb); },
      onPalette: () => () => {},
    },
    store: { get: async (k) => ls.get(k), all: async () => ls.all(), set: async (k, v) => ls.set(k, v) },
    fs: {
      list: async (dir) => wait(children(dir).map(([p, v]) => ({ name: base(p), path: p, dir: v.dir, size: v.size, mtime: v.mtime, ext: v.dir ? '' : ext(base(p)) }))),
      drives: async () => [{ name: '/', path: '/', free: 120e9, total: 512e9 }],
      places: async () => ({ home: HOME, desktop: `${HOME}/Desktop`, documents: `${HOME}/Dokumente`, downloads: `${HOME}/Downloads`, pictures: `${HOME}/Bilder`, music: `${HOME}/Musik`, videos: `${HOME}/Videos`, novaData: `${HOME}/Dokumente/NovaOS`, sep: '/' }),
      stat: async (p) => { const v = need(p); return { size: v.size, mtime: v.mtime, ctime: v.mtime, dir: v.dir }; },
      exists: async (p) => files.has(p),
      readText: async (p) => { const v = need(p); if (v.dir) throw new Error('Ist ein Ordner'); return v.content; },
      writeText: async (p, t) => {
        let d = parent(p);
        const chain = [];
        while (!files.has(d)) { chain.unshift(d); d = parent(d); }
        chain.forEach((c) => add(c, null));
        files.set(p, { dir: false, content: t, mtime: Date.now(), size: t.length });
        return true;
      },
      readDataUrl: async () => 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="#7c5cff"/><stop offset="1" stop-color="#4cc9f0"/></linearGradient></defs><rect width="800" height="500" fill="url(#g)"/><circle cx="600" cy="140" r="60" fill="#fff" opacity=".7"/><path d="M0 500 L250 220 L420 380 L560 260 L800 500Z" fill="#1e1b4b" opacity=".7"/></svg>'),
      mkdir: async (d, n) => { const p = unique(`${d === '/' ? '' : d}/${n}`); add(p, null); return p; },
      newFile: async (d, n) => { const p = unique(`${d === '/' ? '' : d}/${n}`); add(p, ''); return p; },
      rename: async (p, n) => { need(p); const t = `${parent(p) === '/' ? '' : parent(p)}/${n}`; if (files.has(t)) throw new Error('Existiert bereits'); moveTree(p, t, false); return t; },
      trash: async (ps) => { [].concat(ps).forEach((p) => { for (const k of [...files.keys()]) if (k === p || k.startsWith(p + '/')) files.delete(k); }); return true; },
      copy: async (ps, d) => [].concat(ps).map((p) => { const t = unique(`${d === '/' ? '' : d}/${base(p)}`); moveTree(p, t, true); return t; }),
      move: async (ps, d) => [].concat(ps).map((p) => { const t = unique(`${d === '/' ? '' : d}/${base(p)}`); moveTree(p, t, false); return t; }),
      open: async (p) => { console.info('[mock] öffnen', p); return true; },
      reveal: async () => {},
      openExternal: async (u) => window.open(u, '_blank'),
      fileIcon: async () => null,
      search: async (root, q) => [...files.entries()].filter(([p]) => p.startsWith(root) && base(p).toLowerCase().includes(q.toLowerCase())).slice(0, 100).map(([p, v]) => ({ name: base(p), path: p, dir: v.dir, ext: ext(base(p)) })),
    },
    sys: {
      info: async () => ({ hostname: 'nova-pc', user: 'nova', platform: 'browser', release: '–', version: 'Vorschau', arch: 'x64', cpuModel: 'Virtuelle CPU (Vorschau)', cores: navigator.hardwareConcurrency || 8, totalmem: 16 * 1024 ** 3 }),
      stats: async () => {
        cpuPhase += 0.4;
        const cores = navigator.hardwareConcurrency || 8;
        const perCore = Array.from({ length: cores }, (_, i) => Math.max(2, Math.min(98, 22 + 18 * Math.sin(cpuPhase + i) + Math.random() * 12)));
        return { cpu: perCore.reduce((a, b) => a + b, 0) / cores, perCore, totalmem: 16 * 1024 ** 3, freemem: (7 + Math.sin(cpuPhase / 3)) * 1024 ** 3, uptime: 3600 * 5 + performance.now() / 1000, load: [0.5, 0.6, 0.7] };
      },
      net: async () => ({ rate: { down: 120000 + Math.random() * 900000, up: 20000 + Math.random() * 90000 }, ifaces: [{ name: 'WLAN', address: '192.168.1.42' }] }),
      processes: async () => ['NovaOS', 'explorer.exe', 'chrome.exe', 'Code.exe', 'Spotify.exe', 'Discord.exe', 'svchost.exe', 'OneDrive.exe', 'steam.exe', 'node.exe']
        .map((name, i) => ({ name, pid: 1000 + i * 137, cpu: Math.round(Math.random() * 300) / 10, mem: (50 + Math.random() * 900) * 1024 * 1024 })),
      kill: async () => true,
    },
    term: {
      home: async () => HOME,
      defaultShell: async () => 'bash',
      cd: async (cwd, arg) => {
        const a = arg.trim();
        if (!a || a === '~') return HOME;
        let t = a.startsWith('/') ? a : (a === '..' ? parent(cwd) : `${cwd === '/' ? '' : cwd}/${a}`);
        t = t.replace(/\/+$/, '') || '/';
        if (!files.has(t) || !files.get(t).dir) throw new Error('Kein Ordner: ' + t);
        return t;
      },
      run: async (id, cmd, cwd) => {
        const emit = (data, stream = 'stdout') => listeners.term.forEach((cb) => cb({ id, data, stream }));
        setTimeout(() => {
          const [c, ...rest] = cmd.trim().split(/\s+/);
          if (c === 'ls' || c === 'dir') emit(children(cwd).map(([p, v]) => (v.dir ? base(p) + '/' : base(p))).join('  ') + '\n');
          else if (c === 'echo') emit(rest.join(' ') + '\n');
          else if (c === 'pwd') emit(cwd + '\n');
          else if (c === 'date') emit(new Date().toString() + '\n');
          else if (c === 'whoami') emit('nova\n');
          else if (c === 'cat' && rest[0]) { const p = rest[0].startsWith('/') ? rest[0] : `${cwd}/${rest[0]}`; emit(files.has(p) ? files.get(p).content + '\n' : `cat: ${rest[0]}: Datei nicht gefunden\n`, files.has(p) ? 'stdout' : 'stderr'); }
          else emit(`(Vorschau) Befehl „${c}“ würde in der Desktop-App echt ausgeführt.\n`, 'stderr');
          listeners.exit.forEach((cb) => cb({ id, code: 0 }));
        }, 120);
        return true;
      },
      input: async () => true,
      kill: async (id) => { listeners.exit.forEach((cb) => cb({ id, code: 130 })); return true; },
      onData: (cb) => { listeners.term.add(cb); return () => listeners.term.delete(cb); },
      onExit: (cb) => { listeners.exit.add(cb); return () => listeners.exit.delete(cb); },
    },
    apps: {
      list: async () => ['Google Chrome', 'Microsoft Edge', 'Visual Studio Code', 'Spotify', 'Discord', 'Steam', 'Microsoft Word', 'Microsoft Excel', 'PowerPoint', 'OBS Studio', 'GIMP', 'VLC media player', 'Notepad++', 'Paint', 'Rechner', 'Editor', 'Task-Manager', 'Systemsteuerung', 'Explorer', 'Snipping Tool', 'Teams', 'Zoom', 'Blender', '7-Zip']
        .map((name, i) => ({ name, path: `C:/Startmenü/${name}.lnk`, folder: i % 3 ? 'Programme' : 'Zubehör' })),
      icon: async () => null,
      launch: async (p) => { console.info('[mock] starte', p); return true; },
    },
    clip: {
      read: async () => clip,
      write: async (t) => { clip = String(t); listeners.clip.forEach((cb) => cb(clip)); return true; },
      onChange: (cb) => { listeners.clip.add(cb); return () => listeners.clip.delete(cb); },
    },
    power: { action: async (a) => { console.info('[mock] Energie', a); return true; } },
    ai: (() => {
      const deltas = new Set(), dones = new Set();
      let key = null;
      const timers = new Map();
      return {
        hasKey: async () => !!key || !!ls.get('mockAiKey'),
        setKey: async (k) => { key = k || null; ls.set('mockAiKey', !!k); return !!k; },
        model: async () => 'claude-opus-5-5',
        chat: async (id, messages) => {
          const q = (messages[messages.length - 1] || {}).content || '';
          const text = `**Vorschau-Modus** – in der Desktop-App antwortet hier Claude.\n\nDu hast gefragt:\n\n> ${q.slice(0, 200)}\n\nBeispiel für Code:\n\n\`\`\`js\nconsole.log('Hallo aus NovaOS');\n\`\`\`\n\n- Punkt eins\n- Punkt zwei`;
          let i = 0;
          const t = setInterval(() => {
            const chunk = text.slice(i, i + 12); i += 12;
            if (chunk) deltas.forEach((cb) => cb({ id, text: chunk }));
            else { clearInterval(t); timers.delete(id); dones.forEach((cb) => cb({ id, stop: 'end_turn', model: 'claude-opus-5-5' })); }
          }, 25);
          timers.set(id, t);
          return true;
        },
        abort: async (id) => { clearInterval(timers.get(id)); timers.delete(id); dones.forEach((cb) => cb({ id, aborted: true })); return true; },
        onDelta: (cb) => { deltas.add(cb); return () => deltas.delete(cb); },
        onDone: (cb) => { dones.add(cb); return () => dones.delete(cb); },
      };
    })(),
    win: {
      list: async () => [
        { pid: 4120, name: 'chrome', title: 'YouTube – Google Chrome', path: null },
        { pid: 5532, name: 'Code', title: 'main.js – NovaOS – Visual Studio Code', path: null },
        { pid: 7710, name: 'Spotify', title: 'Spotify Premium', path: null },
        { pid: 8120, name: 'explorer', title: 'Downloads', path: null },
      ],
      focus: async (pid) => { console.info('[mock] fokussiere', pid); return true; },
      screenshot: async () => `${HOME}/Bilder/Screenshots/NovaOS Vorschau.png`,
    },
  };
}

const base = window.nova || createMock();

// Aktionen, die ein Windows-Fenster öffnen, lassen NovaOS danach zur Seite treten.
function aside(fn) {
  return async (...args) => {
    const r = await fn(...args);
    import('../shell/state.js').then((m) => m.stepAside());
    return r;
  };
}
export const api = base.isElectron
  ? { ...base, fs: { ...base.fs, open: aside(base.fs.open), reveal: aside(base.fs.reveal), openExternal: aside(base.fs.openExternal) } }
  : base;
export const isElectron = !!(window.nova && window.nova.isElectron);
export const isWindows = api.platform === 'win32';

/** URL, unter der eine lokale Datei direkt geladen werden kann (Bilder, Audio, Video). */
export function fileUrl(path) {
  if (isElectron) return 'nova-file://local/' + encodeURIComponent(path);
  return null;
}
