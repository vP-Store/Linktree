// Rauchtest-Skript, das im Renderer von NovaOS ausgeführt wird (NOVA_SMOKE_JS).
// Prüft die echten System-Schnittstellen und liefert eine Zusammenfassung zurück.
module.exports = `(async () => {
  const n = window.nova;
  const r = {};
  const t = async (k, f) => { try { r[k] = await f(); } catch (e) { r[k] = 'FEHLER: ' + e.message; } };
  await t('platform', () => n.platform);
  await t('startzeitMs', () => window.__novaBootMs);
  await t('speicherMB', () => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null));
  await t('apps', async () => (await n.apps.list()).length);
  await t('fenster', async () => (await n.win.list()).map((w) => w.name).slice(0, 8));
  await t('prozesse', async () => (await n.sys.processes()).length);
  await t('laufwerke', async () => (await n.fs.drives()).map((d) => d.name));
  await t('orte', async () => Object.keys(await n.fs.places()).length);
  await t('netz1', async () => (await n.sys.net()).ifaces.length);
  await new Promise((res) => setTimeout(res, 4500));
  await t('netzrate', async () => (await n.sys.net()).rate);
  await t('terminal', () => new Promise((res) => {
    let out = '';
    const off = n.term.onData((d) => { if (d.id === 'smoke') out += d.data; });
    const off2 = n.term.onExit((d) => { if (d.id === 'smoke') { off(); off2(); res(out.trim().slice(0, 80)); } });
    n.term.run('smoke', 'echo NovaOS-OK', null, n.platform === 'win32' ? 'powershell' : 'bash');
  }));
  const places = await n.fs.places();
  const tmp = places.documents + (n.platform === 'win32' ? String.fromCharCode(92) : '/') + 'NovaOS-Rauchtest';
  const sep = n.platform === 'win32' ? String.fromCharCode(92) : '/';
  await t('schreiben', async () => { await n.fs.writeText(tmp + sep + 'probe.txt', 'Hallo'); return n.fs.readText(tmp + sep + 'probe.txt'); });
  await t('zip', async () => { const z = await n.tools.zip([tmp + sep + 'probe.txt']); const d = await n.tools.unzip(z); return (await n.fs.list(d)).map((f) => f.name); });
  await t('pdf', async () => { const p = await n.tools.pdf('<h1>Test</h1>', tmp + sep + 'test.pdf', 'Test'); return (await n.fs.stat(p)).size > 1000; });
  await t('appIcon', async () => { const a = (await n.apps.list())[0]; return a ? !!(await n.apps.icon(a.path)) : 'keine Apps'; });
  await t('screenshot', async () => { const p = await n.win.screenshot(); const st = await n.fs.stat(p); await n.fs.trash(p); return st.size > 10000; });
  await t('aiKey', () => n.ai.hasKey());
  await t('aufraeumen', async () => { await n.fs.trash(tmp); return true; });
  const m = await import('./js/core/wm.js');
  await t('terminalUI', async () => {
    const w = await m.openApp('terminal');
    const inp = w.body.querySelector('.term-input');
    inp.value = 'echo Zeile1; echo Zeile2';
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise((res) => setTimeout(res, 5000));
    const txt = w.body.querySelector('.term-out').innerText;
    await w.close(true);
    const lines = txt.split(String.fromCharCode(10)).map((x) => x.trim());
    const i = lines.indexOf('Zeile1');
    return i >= 0 && lines[i + 1] === 'Zeile2' ? 'ok' : 'FEHLER: ' + JSON.stringify(txt.slice(-160));
  });
  for (const id of ['files', 'monitor', 'launcher']) await m.openApp(id);
  await new Promise((res) => setTimeout(res, 2500));
  r.fehlerToasts = [...document.querySelectorAll('.toast')].map((x) => x.textContent).filter((x) => /Fehler|fehlgeschlagen/i.test(x));
  return r;
})()`;
