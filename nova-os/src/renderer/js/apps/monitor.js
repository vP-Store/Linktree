// System: Leistung (CPU, RAM, Netzwerk, Laufwerke), Prozesse, Systeminfo.

import { h, clear, esc, bytes, rate, duration, bus } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { LiveChart } from '../core/chart.js';
import { confirmDialog, showError, toast } from '../core/ui.js';

export default {
  async mount(root, win) {
    let page = 'perf';
    const info = await api.sys.info().catch(() => ({}));
    const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c5cff';
    const accent2 = () => getComputedStyle(document.documentElement).getPropertyValue('--accent-2').trim() || '#4cc9f0';

    const side = h('div.app-sidebar.mon-side');
    const main = h('div.app-main.mon-main');
    root.append(h('div.app-split', side, main));

    const pages = [['perf', 'activity', 'Leistung'], ['proc', 'list', 'Prozesse'], ['info', 'info', 'System']];
    function renderSide() {
      clear(side);
      side.append(h('div.side-label', 'Übersicht'));
      for (const [id, ic, label] of pages) side.append(h('button.side-item', { class: page === id ? 'on' : '', html: `${icon(ic)}<span>${label}</span>`, onclick: () => { page = id; renderSide(); renderPage(); } }));
    }

    // ---------- Leistung ----------
    const cpuChart = new LiveChart({ series: [{ label: 'CPU', color: accent() }], max: 100 });
    const memChart = new LiveChart({ series: [{ label: 'RAM', color: accent2() }], max: 100 });
    const netChart = new LiveChart({ series: [{ label: 'Empfangen', color: accent() }, { label: 'Gesendet', color: accent2() }], max: null, format: (v) => rate(v).replace(' ', ' ') });
    const cpuVal = h('b.mon-big'), memVal = h('b.mon-big'), netVal = h('b.mon-big');
    const cpuSub = h('span.faint'), memSub = h('span.faint'), netSub = h('span.faint');
    const cores = h('div.mon-cores');
    const disks = h('div.mon-disks');

    function card(title, ic, val, sub, chart, extra) {
      return h('div.mon-card.card',
        h('div.mon-card-head', h('span', { html: `${icon(ic)} ${title}` }), h('div.grow'), val),
        h('div.mon-card-sub', sub), chart.el, extra || null);
    }

    function perfPage() {
      return h('div.mon-perf',
        card('Prozessor', 'cpu', cpuVal, cpuSub, cpuChart, cores),
        card('Arbeitsspeicher', 'memory', memVal, memSub, memChart),
        card('Netzwerk', 'wifi', netVal, netSub, netChart),
        h('div.mon-card.card', h('div.mon-card-head', h('span', { html: `${icon('hardDrive')} Laufwerke` })), disks));
    }

    async function loadDisks() {
      clear(disks);
      try {
        for (const d of await api.fs.drives()) {
          if (!d.total) continue;
          const used = d.total - d.free, pct = (used / d.total) * 100;
          disks.append(h('div.mon-disk',
            h('div.row', h('b', d.name === '/' ? 'System' : d.name), h('div.grow'), h('span.faint', `${bytes(d.free)} frei von ${bytes(d.total)}`)),
            h('div.progress', h('i', { style: { width: pct + '%', background: pct > 90 ? 'var(--danger)' : pct > 75 ? 'var(--warn)' : '' } }))));
        }
      } catch (_) {}
      if (!disks.childElementCount) disks.append(h('div.faint', 'Keine Laufwerksdaten.'));
    }

    function onStats(s) {
      cpuChart.series[0].color = accent();
      memChart.series[0].color = accent2();
      cpuChart.push(s.cpu);
      const usedMem = s.totalmem - s.freemem;
      memChart.push((usedMem / s.totalmem) * 100);
      cpuVal.textContent = Math.round(s.cpu) + ' %';
      cpuSub.textContent = `${info.cpuModel || ''} · ${s.perCore.length} Kerne · Laufzeit ${duration(s.uptime)}`;
      memVal.textContent = Math.round((usedMem / s.totalmem) * 100) + ' %';
      memSub.textContent = `${bytes(usedMem)} von ${bytes(s.totalmem)} belegt · ${bytes(s.freemem)} frei`;
      if (cores.childElementCount !== s.perCore.length) {
        clear(cores);
        s.perCore.forEach((_, i) => cores.append(h('div.mon-core', { title: `Kern ${i + 1}` }, h('i'))));
      }
      s.perCore.forEach((v, i) => {
        const bar = cores.children[i].firstChild;
        bar.style.height = Math.max(3, v) + '%';
        cores.children[i].title = `Kern ${i + 1}: ${Math.round(v)} %`;
      });
    }
    function onNet(n) {
      netChart.series[0].color = accent();
      netChart.series[1].color = accent2();
      if (!n.rate) { netSub.textContent = 'Wird gemessen …'; return; }
      netChart.push(n.rate.down, n.rate.up);
      netVal.textContent = '↓ ' + rate(n.rate.down);
      netSub.textContent = `↑ ${rate(n.rate.up)} · ${n.ifaces.map((i) => `${i.name}: ${i.address}`).join(' · ') || 'kein Netzwerk'}`;
    }

    // ---------- Prozesse ----------
    let procs = [];
    let sort = { key: 'mem', dir: -1 };
    let procFilter = '';
    const procBody = h('div.mon-procs');
    const procSearch = h('input.input', { placeholder: 'Prozess suchen …', spellcheck: false, oninput: () => { procFilter = procSearch.value.toLowerCase(); renderProcs(); } });
    const procCount = h('span.faint');

    async function loadProcs() {
      try { procs = await api.sys.processes(); } catch (e) { showError(e); procs = []; }
      renderProcs();
    }

    function renderProcs() {
      // gleiche Namen zusammenfassen (wie im Task-Manager)
      const groups = new Map();
      for (const p of procs) {
        if (procFilter && !p.name.toLowerCase().includes(procFilter)) continue;
        const g = groups.get(p.name) || { name: p.name, pids: [], mem: 0, cpu: 0 };
        g.pids.push(p.pid); g.mem += p.mem || 0; g.cpu += p.cpu || 0;
        groups.set(p.name, g);
      }
      for (const g of groups.values()) g.count = g.pids.length;
      const list = [...groups.values()].sort((a, b) => (sort.key === 'name' ? a.name.localeCompare(b.name) : (a[sort.key] - b[sort.key])) * sort.dir);
      procCount.textContent = `${list.length} Anwendungen · ${procs.length} Prozesse`;
      clear(procBody);
      const hasCpu = procs.some((p) => p.cpu != null);
      const th = (key, label, cls = '') => h('button.fm-th' + cls, { onclick: () => { sort = sort.key === key ? { key, dir: -sort.dir } : { key, dir: key === 'name' ? 1 : -1 }; renderProcs(); } }, label, sort.key === key ? h('span', { html: icon(sort.dir > 0 ? 'chevronUp' : 'chevronDown') }) : null);
      procBody.append(h('div.mon-prow.head', th('name', 'Name'), th('count', 'Anzahl', '.r'), hasCpu ? th('cpu', 'CPU', '.r') : h('span'), th('mem', 'Speicher', '.r'), h('span')));
      const maxMem = Math.max(1, ...list.map((g) => g.mem));
      for (const g of list.slice(0, 400)) {
        procBody.append(h('div.mon-prow',
          h('span.ellipsis', { title: `PID ${g.pids.join(', ')}` }, g.name),
          h('span.r.faint', String(g.pids.length)),
          hasCpu ? h('span.r', g.cpu.toFixed(1) + ' %') : h('span'),
          h('span.r.mon-mem', h('i', { style: { width: (g.mem / maxMem) * 100 + '%' } }), h('b', bytes(g.mem))),
          h('button.icon-btn.sm', { title: 'Beenden', html: icon('x'), onclick: () => kill(g) })));
      }
    }

    async function kill(g) {
      if (!(await confirmDialog({ title: `„${g.name}“ beenden?`, message: `${g.pids.length} Prozess(e) werden sofort beendet. Ungespeicherte Daten gehen verloren.`, ok: 'Beenden', danger: true }))) return;
      let ok = 0;
      for (const pid of g.pids) { try { await api.sys.kill(pid); ok++; } catch (_) {} }
      toast(ok ? 'Beendet' : 'Nicht möglich', ok ? `${g.name} (${ok}/${g.pids.length})` : 'Fehlende Berechtigung', { kind: ok ? 'ok' : 'error' });
      setTimeout(loadProcs, 500);
    }

    function procPage() {
      return h('div.mon-procpage',
        h('div.row', { style: { padding: '14px 16px 8px' } }, h('div.search-field', { style: { width: '260px' }, html: icon('search') }, procSearch), procCount, h('div.grow'),
          h('button.btn.sm', { html: `${icon('refresh')} Aktualisieren`, onclick: loadProcs })),
        procBody);
    }

    // ---------- Info ----------
    async function infoPage() {
      const ov = await api.overlay.info().catch(() => ({}));
      const row = (k, v) => h('div.mon-info-row', h('span.faint', k), h('b', v || '–'));
      return h('div.mon-info',
        h('div.mon-info-hero', h('div.avatar', { style: { width: '54px', height: '54px', fontSize: '22px' } }, (info.hostname || 'N')[0].toUpperCase()), h('div', h('h2', info.hostname || 'Dieser PC'), h('div.faint', `${info.user || ''} · ${info.platform === 'win32' ? 'Windows' : info.platform}`))),
        h('div.card', { style: { padding: '6px 16px' } },
          row('Betriebssystem', info.version || info.platform),
          row('Version', info.release),
          row('Architektur', info.arch),
          row('Prozessor', info.cpuModel),
          row('Kerne', String(info.cores || '')),
          row('Arbeitsspeicher', bytes(info.totalmem)),
          row('NovaOS', ov.version),
          row('Electron / Chromium', `${ov.electron} / ${ov.chrome}`)));
    }

    async function renderPage() {
      clear(main);
      if (page === 'perf') { main.append(perfPage()); loadDisks(); requestAnimationFrame(() => { cpuChart.draw(); memChart.draw(); netChart.draw(); }); }
      if (page === 'proc') { main.append(procPage()); loadProcs(); }
      if (page === 'info') main.append(await infoPage());
    }

    const off1 = bus.on('sys:stats', onStats);
    const off2 = bus.on('sys:net', onNet);
    const procTimer = setInterval(() => { if (page === 'proc' && !document.body.classList.contains('overlay-hidden')) loadProcs(); }, 5000);

    renderSide();
    renderPage();
    api.sys.stats().then((s) => { onStats(s); bus.emit('sys:stats', s); }).catch(() => {});
    return {
      onResize() { cpuChart.draw(); memChart.draw(); netChart.draw(); },
      destroy() { off1(); off2(); clearInterval(procTimer); },
    };
  },
};
