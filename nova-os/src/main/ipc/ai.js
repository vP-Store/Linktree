'use strict';
// KI-Assistent: Claude über das offizielle Anthropic-SDK.
// Der API-Schlüssel bleibt im Hauptprozess und wird mit safeStorage (Windows DPAPI)
// verschlüsselt gespeichert – die Oberfläche bekommt ihn nie zu sehen.

const Anthropic = require('@anthropic-ai/sdk');
const { safeStorage } = require('electron');
const store = require('./store');

const MODEL = 'claude-opus-5-5';
const active = new Map(); // requestId → stream

const SYSTEM_BASE = [
  'Du bist Nova, der KI-Assistent in NovaOS – einer Arbeitsoberfläche, die als Overlay über Windows läuft.',
  'Antworte standardmäßig auf Deutsch, klar und gut strukturiert (Markdown erlaubt: Überschriften, Listen, Codeblöcke, Tabellen).',
  'Wenn der Nutzer Dateiinhalte mitschickt, beziehe dich konkret darauf.',
  'Wenn du Code schreibst, gib vollständige, lauffähige Blöcke mit Sprachangabe aus.',
  'Du kannst in NovaOS handeln: Aufgaben, Termine und Notizen anlegen, Aufgaben und Termine abfragen und Dateien suchen.',
  'Nutze diese Werkzeuge, wenn der Nutzer darum bittet oder es offensichtlich hilft (z. B. „erinnere mich …“, „trag ein …“, „was steht an?“).',
  'Bestätige danach kurz, was du angelegt hast. Rechne relative Angaben wie „morgen“ oder „nächsten Freitag“ anhand des heutigen Datums in ein Datum (JJJJ-MM-TT) um.',
].join('\n');

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
function systemPrompt() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  // Datum steht am Ende, damit der stabile Teil davor gecacht werden kann
  return `${SYSTEM_BASE}\n\nHeute ist ${WEEKDAYS[d.getDay()]}, ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.`;
}

// ---------------------------------------------------------------------------
// Werkzeuge – ausgeführt in der NovaOS-Oberfläche (Renderer), nicht hier.
// ---------------------------------------------------------------------------
const DATE = { type: 'string', description: 'Datum im Format JJJJ-MM-TT' };
const TIME = { type: 'string', description: 'Uhrzeit im Format HH:MM (24 h)' };
const TOOLS = [
  {
    name: 'add_task',
    description: 'Legt eine Aufgabe in der NovaOS-Aufgaben-App an. Für To-dos und Erinnerungen ohne feste Uhrzeit.',
    input_schema: { type: 'object', properties: {
      title: { type: 'string', description: 'Kurzer Titel der Aufgabe' },
      due: DATE,
      priority: { type: 'integer', enum: [0, 1, 2, 3], description: '0 keine, 1 niedrig, 2 mittel, 3 hoch' },
      repeat: { type: 'string', enum: ['daily', 'weekly', 'monthly'], description: 'Wiederholung (optional)' },
    }, required: ['title'], additionalProperties: false },
  },
  {
    name: 'add_event',
    description: 'Trägt einen Termin in den NovaOS-Kalender ein. Für Dinge mit Datum und meist Uhrzeit.',
    input_schema: { type: 'object', properties: {
      title: { type: 'string' }, date: DATE, time: TIME, end: TIME,
      notes: { type: 'string' },
      remind_minutes: { type: 'integer', enum: [0, 5, 10, 30, 60], description: 'Erinnerung so viele Minuten vorher' },
    }, required: ['title', 'date'], additionalProperties: false },
  },
  {
    name: 'create_note',
    description: 'Erstellt eine neue Markdown-Notiz in der NovaOS-Notizen-App.',
    input_schema: { type: 'object', properties: {
      title: { type: 'string' }, content: { type: 'string', description: 'Inhalt in Markdown' },
    }, required: ['title', 'content'], additionalProperties: false },
  },
  {
    name: 'list_tasks',
    description: 'Liefert die offenen (optional auch erledigten) Aufgaben des Nutzers.',
    input_schema: { type: 'object', properties: { include_done: { type: 'boolean' } }, additionalProperties: false },
  },
  {
    name: 'list_events',
    description: 'Liefert Kalendertermine in einem Zeitraum (Standard: heute bis in 14 Tagen).',
    input_schema: { type: 'object', properties: { from: DATE, to: DATE }, additionalProperties: false },
  },
  {
    name: 'search_files',
    description: 'Sucht im persönlichen Ordner des Nutzers nach Dateien und Ordnern, deren Name den Suchbegriff enthält.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
  },
].map((t) => ({ ...t, eager_input_streaming: true }));

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v) => typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v);

/** Eingaben prüfen (Werkzeug-Eingaben werden gestreamt und vom Server nicht validiert). */
function validate(name, input) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return 'Unbekanntes Werkzeug';
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'Eingabe ist kein Objekt';
  const props = tool.input_schema.properties;
  for (const k of Object.keys(input)) if (!(k in props)) return `Unbekanntes Feld: ${k}`;
  for (const k of tool.input_schema.required || []) if (input[k] == null || input[k] === '') return `Pflichtfeld fehlt: ${k}`;
  for (const [k, v] of Object.entries(input)) {
    const sch = props[k];
    if (sch === DATE && !isDate(v)) return `${k} muss JJJJ-MM-TT sein`;
    if (sch === TIME && !isTime(v)) return `${k} muss HH:MM sein`;
    if (sch.type === 'string' && typeof v !== 'string') return `${k} muss Text sein`;
    if (sch.type === 'integer' && !Number.isInteger(v)) return `${k} muss eine ganze Zahl sein`;
    if (sch.type === 'boolean' && typeof v !== 'boolean') return `${k} muss wahr/falsch sein`;
    if (sch.enum && !sch.enum.includes(v)) return `${k} hat einen ungültigen Wert`;
  }
  return null;
}

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

/** Gültige Abfolge herstellen: nur user/assistant, keine leeren Texte, gleiche Rollen
 *  hintereinander zusammenführen, mit einer Nutzer-Nachricht beginnen und enden. */
function normalize(messages) {
  const out = [];
  for (const m of messages || []) {
    if ((m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string' || !m.content.trim()) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += '\n\n' + m.content;
    else out.push({ role: m.role, content: m.content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  while (out.length && out[out.length - 1].role !== 'user') out.pop();
  return out;
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
    if (!normalize(messages).length) { send('ai:done', { id, error: 'Keine Nachricht zum Senden.' }); return false; }
    let c;
    try { c = client(); } catch (err) { send('ai:done', { id, error: err.message }); return false; }
    const effort = ['low', 'medium', 'high', 'xhigh', 'max'].includes(opts.effort) ? opts.effort : 'medium';
    let msgs = normalize(messages);
    let jsonRetries = 0;
    try {
      for (let round = 0; round < 8; round++) {
        const stream = c.beta.messages.stream({
          model: MODEL,
          max_tokens: 64000,
          system: systemPrompt(),
          thinking: { type: 'adaptive' },
          output_config: { effort },
          tools: TOOLS,
          // Lehnt ein Sicherheitsfilter ab, übernimmt serverseitig ein passendes Ersatzmodell.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          messages: msgs,
        });
        active.set(id, stream);
        stream.on('text', (text) => send('ai:delta', { id, text }));
        let msg;
        try {
          msg = await stream.finalMessage();
          jsonRetries = 0;
        } catch (err) {
          // Nur unlesbares Werkzeug-JSON wiederholen – echte API-Fehler weiterreichen
          if (err instanceof Anthropic.APIError || err instanceof Anthropic.APIUserAbortError || jsonRetries++ >= 2) throw err;
          continue;
        }
        if (msg.stop_reason === 'refusal') {
          active.delete(id);
          send('ai:done', { id, error: 'Diese Anfrage wurde aus Sicherheitsgründen abgelehnt.' });
          return true;
        }
        const uses = msg.content.filter((b) => b.type === 'tool_use');
        if (msg.stop_reason !== 'tool_use' || !uses.length) {
          active.delete(id);
          send('ai:done', { id, stop: msg.stop_reason, model: msg.model, usage: msg.usage });
          return true;
        }
        // Antwort unverändert anhängen (inkl. Denk-Blöcken), dann Werkzeuge ausführen
        msgs = [...msgs, { role: 'assistant', content: msg.content }];
        const results = [];
        for (const u of uses) {
          const problem = validate(u.name, u.input);
          if (problem) {
            results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: JSON.stringify({ INVALID_INPUT: problem, received: u.input }) });
            continue;
          }
          const r = await runInUi(id, u);
          results.push({ type: 'tool_result', tool_use_id: u.id, ...(r.error ? { is_error: true, content: String(r.error) } : { content: JSON.stringify(r.result ?? 'ok') }) });
        }
        msgs = [...msgs, { role: 'user', content: results }];
        send('ai:delta', { id, text: '\n\n' });
      }
      active.delete(id);
      send('ai:done', { id, error: 'Zu viele Werkzeug-Schritte – bitte die Anfrage aufteilen.' });
      return true;
    } catch (err) {
      active.delete(id);
      const aborted = err instanceof Anthropic.APIUserAbortError;
      send('ai:done', { id, error: aborted ? null : friendlyError(err), aborted });
      return false;
    }
  });

  // Werkzeug-Aufruf an die Oberfläche geben und auf das Ergebnis warten
  const waiting = new Map(); // toolUseId → resolve
  function runInUi(reqId, use) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => { waiting.delete(use.id); resolve({ error: 'Zeitüberschreitung – NovaOS hat nicht geantwortet.' }); }, 30000);
      waiting.set(use.id, (r) => { clearTimeout(timer); resolve(r || {}); });
      send('ai:tool', { id: reqId, toolId: use.id, name: use.name, input: use.input });
    });
  }
  ipcMain.handle('ai:toolResult', (_e, toolId, result) => {
    const fn = waiting.get(toolId);
    if (fn) { waiting.delete(toolId); fn(result); }
    return !!fn;
  });

  ipcMain.handle('ai:abort', (_e, id) => {
    const s = active.get(id);
    if (s) s.abort();
    return !!s;
  });
};
