// Rauchtest-Skript, das im Renderer von NovaOS ausgeführt wird (NOVA_SMOKE_JS).
// Prüft die echten System-Schnittstellen und liefert eine Zusammenfassung zurück.
module.exports = `(async () => {
  const n = window.nova;
  const r = {};
  const t = async (k, f) => { try { r[k] = await f(); } catch (e) { r[k] = 'FEHLER: ' + e.message; } };
  await t('platform', () => n.platform);
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
  const m = await import('./js/core/wm.js');
  for (const id of ['files', 'monitor', 'launcher']) await m.openApp(id);
  await new Promise((res) => setTimeout(res, 2500));
  r.fehlerToasts = [...document.querySelectorAll('.toast')].map((x) => x.textContent).filter((x) => /Fehler|fehlgeschlagen/i.test(x));
  return r;
})()`;
