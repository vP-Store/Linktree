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
