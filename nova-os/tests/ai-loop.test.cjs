// Testet die Werkzeug-Schleife von Nova KI (src/main/ipc/ai.js) mit einem simulierten SDK.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const path = require('path');

class APIError extends Error {}
class APIUserAbortError extends Error {}
function FakeAnthropic() {}
Object.assign(FakeAnthropic, { APIError, APIUserAbortError, AuthenticationError: class extends APIError {}, PermissionDeniedError: class extends APIError {}, RateLimitError: class extends APIError {}, APIConnectionError: class extends APIError {} });

let calls = [];
let script = [];
FakeAnthropic.prototype.beta = { messages: { stream(params) {
  calls.push(JSON.parse(JSON.stringify(params)));
  const step = script.shift();
  const handlers = {};
  return {
    on(ev, fn) { handlers[ev] = fn; },
    abort() {},
    async finalMessage() {
      if (step.text) handlers.text && handlers.text(step.text);
      if (step.throw) throw step.throw;
      return { model: 'claude-opus-5-5', usage: {}, ...step.msg };
    },
  };
} } };

const origLoad = Module._load;
Module._load = function (req) {
  if (req === '@anthropic-ai/sdk') return FakeAnthropic;
  if (req === 'electron') return { safeStorage: { isEncryptionAvailable: () => false } };
  if (req === './store') return { get: (k) => (k === 'aiKeyPlain' ? 'sk-test' : undefined), set() {} };
  return origLoad.apply(this, arguments);
};
const register = require(path.join(__dirname, '..', 'src', 'main', 'ipc', 'ai.js'));
Module._load = origLoad;

function setup() {
  const handlers = {}, sent = [];
  const win = { isDestroyed: () => false, webContents: { send: (ch, p) => { sent.push([ch, p]); if (ch === 'ai:tool') setImmediate(() => handlers['ai:toolResult'](null, p.toolId, { result: { ok: true } })); } } };
  register({ handle: (ch, fn) => { handlers[ch] = fn; } }, () => win);
  return { handlers, sent };
}

test('Werkzeug-Runde: gültige Eingabe ausführen, ungültige als Fehler zurückgeben', async () => {
  calls = [];
  script = [
    { msg: { stop_reason: 'tool_use', content: [{ type: 'thinking', thinking: '', signature: 's' }, { type: 'tool_use', id: 'a', name: 'add_task', input: { title: 'Zahnarzt', due: '2026-10-08' } }, { type: 'tool_use', id: 'b', name: 'add_task', input: { title: 'X', due: 'morgen' } }] } },
    { text: 'Erledigt.', msg: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Erledigt.' }] } },
  ];
  const { handlers, sent } = setup();
  await handlers['ai:chat'](null, 'r1', [{ role: 'user', content: 'Erinnere mich morgen' }], {});
  assert.equal(calls.length, 2);
  assert.ok(calls[0].tools.every((t) => t.eager_input_streaming));
  assert.match(calls[0].system, /Heute ist/);
  const m = calls[1].messages;
  assert.deepEqual(m.map((x) => x.role), ['user', 'assistant', 'user']);
  assert.equal(m[1].content[0].type, 'thinking');
  assert.equal(m[2].content.length, 2);
  assert.equal(m[2].content[0].is_error, undefined);
  assert.equal(m[2].content[1].is_error, true);
  assert.equal(sent.filter((s) => s[0] === 'ai:tool').length, 1);
  assert.equal(sent.at(-1)[0], 'ai:done');
  assert.equal(sent.at(-1)[1].stop, 'end_turn');
});

test('Ablehnung beendet ohne Werkzeuge auszuführen', async () => {
  calls = [];
  script = [{ msg: { stop_reason: 'refusal', content: [{ type: 'tool_use', id: 'c', name: 'add_task', input: { title: 'x' } }] } }];
  const { handlers, sent } = setup();
  await handlers['ai:chat'](null, 'r2', [{ role: 'user', content: 'x' }], {});
  assert.equal(sent.filter((s) => s[0] === 'ai:tool').length, 0);
  assert.match(sent.at(-1)[1].error, /abgelehnt/);
});

test('Unlesbares Werkzeug-JSON wird wiederholt, API-Fehler nicht', async () => {
  calls = [];
  script = [{ throw: new SyntaxError('bad json') }, { msg: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] } }];
  let { handlers, sent } = setup();
  await handlers['ai:chat'](null, 'r3', [{ role: 'user', content: 'x' }], {});
  assert.equal(calls.length, 2);
  assert.equal(sent.at(-1)[1].stop, 'end_turn');
  calls = [];
  script = [{ throw: new APIError('kaputt') }];
  ({ handlers, sent } = setup());
  await handlers['ai:chat'](null, 'r4', [{ role: 'user', content: 'x' }], {});
  assert.equal(calls.length, 1);
  assert.ok(sent.at(-1)[1].error);
});
