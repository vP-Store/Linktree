// Gauntlet-Tests: jede Runde muss diese Prüfungen bestehen.
const { test, expect } = require('@playwright/test');

const APPS = ['files', 'terminal', 'browser', 'editor', 'notes', 'tasks', 'calendar', 'calc', 'monitor', 'launcher', 'clipboard', 'music', 'photos', 'timer', 'weather', 'settings'];

test.beforeEach(async ({ page }) => {
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('nova-mock:welcomed', 'true');
    localStorage.setItem('nova-mock:bootAnimation', 'false');
  });
  await page.reload();
  await expect(page.locator('#dock .dock-item').first()).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(page.errors, 'keine JavaScript-Fehler').toEqual([]);
});

const open = (page, id, args = {}) => page.evaluate(async ([id, args]) => {
  const m = await import('/js/core/wm.js');
  const w = await m.openApp(id, args);
  return w && w.id;
}, [id, args]);

test('Shell startet: Statusleiste, Dock, Widgets', async ({ page }) => {
  await expect(page.locator('#topbar .tb-clock')).toContainText(':');
  await expect(page.locator('#widgets .widget')).toHaveCount(5);
  await expect(page.locator('#desk-icons .desk-icon').first()).toBeVisible();
});

for (const id of APPS) {
  test(`App öffnet ohne Fehler: ${id}`, async ({ page }) => {
    await open(page, id);
    await expect(page.locator(`.win[data-app="${id}"] .win-body`)).toBeVisible();
    await page.waitForTimeout(400);
    await expect(page.locator(`.win[data-app="${id}"] .win-body`)).not.toContainText('Fehler beim Laden');
  });
}

test('Befehlspalette rechnet', async ({ page }) => {
  await page.keyboard.press('Control+k');
  await page.keyboard.type('12*(3+4)');
  await expect(page.locator('.pal-item').first()).toContainText('= 84');
});

test('Startmenü sucht und öffnet Apps', async ({ page }) => {
  await page.keyboard.press('Control+Space');
  await page.keyboard.type('rechner');
  await page.keyboard.press('Enter');
  await expect(page.locator('.win[data-app="calc"]')).toBeVisible();
});

test('Fenster: Einrasten, Maximieren, Schließen per Tastatur', async ({ page }) => {
  await open(page, 'files');
  const win = page.locator('.win[data-app="files"]');
  await expect(win).toHaveClass(/win(?!.*inactive)/);
  await page.keyboard.press('Alt+ArrowLeft');
  await expect.poll(async () => (await win.boundingBox()).x).toBeLessThan(20);
  await expect.poll(async () => (await win.boundingBox()).width).toBeLessThan(820);
  await page.keyboard.press('Alt+ArrowUp');
  await expect(win).toHaveClass(/max/);
  await page.keyboard.press('Alt+q');
  await expect(win).toHaveCount(0);
});

test('Rechner rechnet per Tastatur', async ({ page }) => {
  await open(page, 'calc');
  await page.locator('.calc-root').focus();
  await page.keyboard.type('7*6');
  await page.keyboard.press('Enter');
  await expect(page.locator('.calc-res')).toHaveText('42');
});

test('Aufgaben: Schnelleingabe mit Priorität', async ({ page }) => {
  await open(page, 'tasks');
  const input = page.locator('.tasks-input');
  await input.fill('Bericht schreiben !hoch');
  await input.press('Enter');
  await expect(page.locator('.task-row')).toContainText('Bericht schreiben');
  await expect(page.locator('.task-meta')).toContainText('Hoch');
});

test('Dateien: Ordner anlegen', async ({ page }) => {
  await open(page, 'files');
  await page.locator('.win[data-app="files"] button[title^="Neuer Ordner"]').click();
  await page.locator('.modal input').fill('Testordner');
  await page.locator('.modal .btn.primary').click();
  await expect(page.locator('.fm-content')).toContainText('Testordner');
});

test('Notizen: neue Notiz schreiben', async ({ page }) => {
  await open(page, 'notes');
  await page.keyboard.press('Control+n');
  await page.locator('.notes-ta').fill('# Einkauf\n\n- [ ] Milch');
  await expect(page.locator('.notes-prev h1')).toHaveText('Einkauf');
  await expect(page.locator('.note-item.on')).toContainText('Einkauf');
});

test('Terminal: Befehl ausführen', async ({ page }) => {
  await open(page, 'terminal');
  const input = page.locator('.term-input');
  await input.fill('echo hallo welt');
  await input.press('Enter');
  await expect(page.locator('.term-out')).toContainText('hallo welt');
});

test('Einstellungen: Akzentfarbe und Thema wechseln', async ({ page }) => {
  await open(page, 'settings', { page: 'look' });
  await page.locator('.seg-btn', { hasText: 'Hell' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('.set-card .accent-swatch').nth(3).click();
  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  expect(accent).toBe('#10b981');
});

test('Übersicht zeigt alle Fenster und fokussiert per Klick', async ({ page }) => {
  await open(page, 'files');
  await open(page, 'calc');
  await page.keyboard.press('Alt+w');
  await expect(page.locator('#overview .ov-hit')).toHaveCount(2);
  await page.locator('#overview .ov-hit').first().click();
  await expect(page.locator('#overview')).toHaveCount(0);
  await expect(page.locator('.win[data-app="files"]')).not.toHaveClass(/inactive/);
});

test('Nova KI: Schlüssel-Einrichtung und Antwort-Streaming', async ({ page }) => {
  await open(page, 'assistant');
  await expect(page.locator('.ai-key-card')).toBeVisible();
  await page.locator('.ai-key-card input').fill('sk-ant-test');
  await page.locator('.ai-key-card .btn.primary').click();
  await page.locator('.ai-input').fill('Hallo Nova');
  await page.locator('.ai-input').press('Enter');
  await expect(page.locator('.ai-msg.user')).toContainText('Hallo Nova');
  await expect(page.locator('.ai-msg.bot .ai-md')).toContainText('Punkt zwei', { timeout: 10000 });
  await expect(page.locator('.ai-chat-item')).toHaveCount(1);
});

test('Heiße Ecke: nur beim Hineinfahren, nicht beim Draufliegen', async ({ page }) => {
  await page.mouse.move(1, 1);
  await page.mouse.move(2, 1);
  await expect(page.locator('#overview')).toHaveCount(0);
  await page.mouse.move(200, 200);
  await page.mouse.move(1, 1, { steps: 4 });
  await expect(page.locator('#overview')).toHaveCount(1);
});

test('Sitzung: offene Fenster überleben einen Neustart', async ({ page }) => {
  await open(page, 'calc');
  await open(page, 'notes');
  await page.waitForTimeout(900); // Sitzung wird verzögert gespeichert
  await page.reload();
  await expect(page.locator('.win[data-app="calc"]')).toHaveCount(1);
  await expect(page.locator('.win[data-app="notes"]')).toHaveCount(1);
});

test('Terminal: cd und cd - (vorheriger Ordner)', async ({ page }) => {
  await open(page, 'terminal');
  const input = page.locator('.term-input');
  await input.fill('cd Dokumente');
  await input.press('Enter');
  await expect(page.locator('.term-prompt .tp-path')).toHaveText('~/Dokumente');
  await input.fill('cd -');
  await input.press('Enter');
  await expect(page.locator('.term-prompt .tp-path')).toHaveText('~');
});

test('Dateien: Umbenennen auf vorhandenen Namen wird abgelehnt', async ({ page }) => {
  await open(page, 'files', { path: '/home/nova/Desktop' });
  await page.locator('.fm-item', { hasText: 'Einkauf.txt' }).click();
  await page.keyboard.press('F2');
  await page.locator('.modal input').fill('Willkommen.md');
  await page.locator('.modal .btn.primary').click();
  await expect(page.locator('.toast')).toContainText(/existiert/i);
  await expect(page.locator('.fm-item', { hasText: 'Einkauf.txt' })).toHaveCount(1);
});

test('Dateien: als ZIP komprimieren und entpacken', async ({ page }) => {
  await open(page, 'files', { path: '/home/nova/Desktop' });
  await page.locator('.fm-item', { hasText: 'Einkauf.txt' }).click({ button: 'right' });
  await page.locator('.ctx-item', { hasText: 'Als ZIP komprimieren' }).click();
  await expect(page.locator('.fm-item', { hasText: 'Einkauf.zip' })).toHaveCount(1);
  await page.locator('.fm-item', { hasText: 'Einkauf.zip' }).click({ button: 'right' });
  await page.locator('.ctx-item', { hasText: 'Hier entpacken' }).click();
  await expect(page.locator('.fm-name').filter({ hasText: /^Einkauf$/ })).toHaveCount(1);
});

test('Palette findet Aufgaben und Termine', async ({ page }) => {
  await page.evaluate(async () => {
    const t = await import('/js/core/tasks.js');
    t.addTask('Steuererklärung abgeben');
    const { store } = await import('/js/core/store.js');
    store.set('calendarEvents', [{ id: 'e1', title: 'Zahnarzt Termin', date: '2026-10-20', time: '09:30' }]);
  });
  await page.keyboard.press('Control+k');
  await page.keyboard.type('steuer');
  await expect(page.locator('.pal-group', { hasText: 'Aufgaben' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('zahnarzt');
  await expect(page.locator('.pal-item', { hasText: 'Zahnarzt Termin' })).toBeVisible();
  await page.locator('.pal-item', { hasText: 'Zahnarzt Termin' }).click();
  await expect(page.locator('.cal-ag-title')).toHaveText('Zahnarzt Termin');
});

test('Windows-Programm ans Dock heften und wieder lösen', async ({ page }) => {
  await open(page, 'launcher');
  await page.locator('.lp-tile', { hasText: 'Spotify' }).click({ button: 'right' });
  await page.locator('.ctx-item', { hasText: 'Ans Dock heften' }).click();
  await expect(page.locator('.dock-item.win-app[title="Spotify"]')).toHaveCount(1);
  await page.locator('.dock-item.win-app[title="Spotify"]').click({ button: 'right' });
  await page.locator('.ctx-item', { hasText: 'Vom Dock lösen' }).click();
  await expect(page.locator('.dock-item.win-app')).toHaveCount(0);
});

test('Einstellungen: Sicherung erstellen', async ({ page }) => {
  await page.evaluate(async () => { const t = await import('/js/core/tasks.js'); t.addTask('Sicherungs-Test'); });
  await open(page, 'settings', { page: 'system' });
  await page.locator('.btn', { hasText: 'Sichern' }).click();
  await expect(page.locator('.toast')).toContainText('Sicherung erstellt');
  const content = await page.evaluate(async () => {
    const { api } = await import('/js/core/api.js');
    const files = await api.fs.list('/home/nova/Dokumente/NovaOS');
    const f = files.find((x) => x.name.startsWith('Sicherung'));
    return f ? api.fs.readText(f.path) : '';
  });
  expect(content).toContain('Sicherungs-Test');
});

test('Haftnotiz behält Text beim Neuzeichnen; Termin-Notizen erscheinen beim Bearbeiten', async ({ page }) => {
  await page.locator('#desktop').click({ button: 'right', position: { x: 600, y: 300 } });
  await page.locator('.ctx-item', { hasText: 'Neue Haftnotiz' }).click();
  await page.keyboard.type('Einkaufen');
  await page.evaluate(async () => { const m = await import('/js/shell/stickies.js'); m.addSticky(900, 100); });
  await expect(page.locator('.sticky textarea').first()).toHaveValue('Einkaufen');
  await page.evaluate(async () => {
    const { store } = await import('/js/core/store.js');
    const { isoDate } = await import('/js/core/dom.js');
    store.set('calendarEvents', [{ id: 'e1', title: 'Meeting', date: isoDate(), time: '10:00', notes: 'Raum 3' }]);
  });
  await open(page, 'calendar');
  await page.locator('.cal-ag-ev', { hasText: 'Meeting' }).click();
  await expect(page.locator('.modal textarea')).toHaveValue('Raum 3');
});

test('F1 zeigt die Tastenkürzel', async ({ page }) => {
  await page.keyboard.press('F1');
  await expect(page.locator('.help-modal .help-row').first()).toBeVisible();
  await expect(page.locator('.help-modal')).toContainText('Befehlspalette');
  await page.keyboard.press('Escape');
  await expect(page.locator('.help-modal')).toHaveCount(0);
});

test('Aufgaben: wiederkehrend – Abhaken legt die nächste an', async ({ page }) => {
  await open(page, 'tasks');
  const input = page.locator('.tasks-input');
  await input.fill('Pflanzen gießen wöchentlich');
  await input.press('Enter');
  await expect(page.locator('.task-meta')).toContainText('Wöchentlich');
  await page.locator('.task-row', { hasText: 'Pflanzen gießen' }).locator('.task-check').click();
  await page.locator('.side-item', { hasText: 'Geplant' }).click();
  await expect(page.locator('.task-row:not(.done)', { hasText: 'Pflanzen gießen' })).toHaveCount(1);
  await expect(page.locator('.task-row:not(.done) .task-meta')).toContainText('Wöchentlich');
});
