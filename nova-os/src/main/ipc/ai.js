'use strict';
// KI-Assistent: Claude über das offizielle Anthropic-SDK.
// Der API-Schlüssel bleibt im Hauptprozess und wird mit safeStorage (Windows DPAPI)
// verschlüsselt gespeichert – die Oberfläche bekommt ihn nie zu sehen.

const Anthropic = require('@anthropic-ai/sdk');
const { safeStorage } = require('electron');
const store = require('./store');

const MODEL = 'claude-opus-5-5';
const active = new Map(); // requestId → stream

const SYSTEM = [
  'Du bist Nova, der KI-Assistent in NovaOS – einer Arbeitsoberfläche, die als Overlay über Windows läuft.',
  'Antworte standardmäßig auf Deutsch, klar und gut strukturiert (Markdown erlaubt: Überschriften, Listen, Codeblöcke, Tabellen).',
  'Wenn der Nutzer Dateiinhalte mitschickt, beziehe dich konkret darauf.',
  'Wenn du Code schreibst, gib vollständige, lauffähige Blöcke mit Sprachangabe aus.',
].join('\n');

function getKey() {
  const enc = store.get('aiKeyEnc');
  if (enc && safeStorage.isEncryptionAvailable()) {
    try { return safeStorage.decryptString(Buffer.from(enc, 'base64')); } catch (_) { return null; }
  }
  return store.get('aiKeyPlain') || process.env.ANTHROPIC_API_KEY || null;
}

function setKey(key) {
  store.set('aiKeyEnc', undefined);
  store.set('aiKeyPlain', undefined);
  if (!key) return;
  if (safeStorage.isEncryptionAvailable()) store.set('aiKeyEnc', safeStorage.encryptString(key).toString('base64'));
  else store.set('aiKeyPlain', key); // Fallback, falls keine Systemverschlüsselung verfügbar ist
}

function client() {
  const apiKey = getKey();
  if (!apiKey) throw new Error('Kein API-Schlüssel hinterlegt. Trage ihn in der KI-App unter „Einstellungen“ ein.');
  return new Anthropic({ apiKey });
}

function friendlyError(err) {
  if (err instanceof Anthropic.AuthenticationError) return 'Der API-Schlüssel ist ungültig.';
  if (err instanceof Anthropic.PermissionDeniedError) return 'Für diesen Schlüssel ist das Modell nicht freigeschaltet.';
  if (err instanceof Anthropic.RateLimitError) return 'Zu viele Anfragen – bitte kurz warten.';
  if (err instanceof Anthropic.APIConnectionError) return 'Keine Verbindung zur Claude-API.';
  if (err instanceof Anthropic.APIError) return `API-Fehler ${err.status || ''}: ${err.message}`;
  return String((err && err.message) || err);
}

module.exports = function register(ipcMain, getWin) {
  const send = (ch, payload) => {
    const w = getWin();
    if (w && !w.isDestroyed()) w.webContents.send(ch, payload);
  };

  ipcMain.handle('ai:hasKey', () => !!getKey());
  ipcMain.handle('ai:setKey', (_e, key) => { setKey(String(key || '').trim()); return !!getKey(); });
  ipcMain.handle('ai:model', () => MODEL);

  /**
   * messages: [{ role: 'user'|'assistant', content: string }]
   * Antwort wird über 'ai:delta' gestreamt, Abschluss über 'ai:done'.
   */
  ipcMain.handle('ai:chat', async (_e, id, messages, opts = {}) => {
    let c;
    try { c = client(); } catch (err) { send('ai:done', { id, error: err.message }); return false; }
    const effort = ['low', 'medium', 'high', 'xhigh', 'max'].includes(opts.effort) ? opts.effort : 'medium';
    try {
      const stream = c.beta.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        system: SYSTEM,
        thinking: { type: 'adaptive' },
        output_config: { effort },
        // Lehnt ein Sicherheitsfilter ab, übernimmt serverseitig ein passendes Ersatzmodell.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        messages: messages
          .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
          .map((m) => ({ role: m.role, content: m.content })),
      });
      active.set(id, stream);
      stream.on('text', (text) => send('ai:delta', { id, text }));
      const msg = await stream.finalMessage();
      active.delete(id);
      if (msg.stop_reason === 'refusal') {
        send('ai:done', { id, error: 'Diese Anfrage wurde aus Sicherheitsgründen abgelehnt.' });
      } else {
        send('ai:done', { id, stop: msg.stop_reason, model: msg.model, usage: msg.usage });
      }
      return true;
    } catch (err) {
      active.delete(id);
      const aborted = err instanceof Anthropic.APIUserAbortError;
      send('ai:done', { id, error: aborted ? null : friendlyError(err), aborted });
      return false;
    }
  });

  ipcMain.handle('ai:abort', (_e, id) => {
    const s = active.get(id);
    if (s) s.abort();
    return !!s;
  });
};
