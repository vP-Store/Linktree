// Nova KI: Chat mit Claude – Unterhaltungen, Streaming, Dateien als Kontext,
// Antworten als Notiz speichern oder in den Editor übernehmen.

import { h, clear, esc, uid, timeAgo, pathx, bus } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { store } from '../core/store.js';
import { renderMarkdown } from '../core/markdown.js';
import { toast, promptDialog, confirmDialog, showError, contextMenu } from '../core/ui.js';
import { openApp } from '../core/wm.js';

const SUGGESTIONS = [
  ['listChecks', 'Erinnere mich morgen daran, die Steuerunterlagen abzuschicken.'],
  ['calendar', 'Was steht in den nächsten zwei Wochen in meinem Kalender?'],
  ['edit', 'Schreib mir eine höfliche E-Mail, mit der ich einen Termin verschiebe.'],
  ['code', 'Erkläre mir, was ein PowerShell-Skript zum Aufräumen des Download-Ordners tun müsste, und schreib es.'],
  ['sparkles', 'Gib mir 10 kreative Namensideen für einen Online-Shop.'],
];
const EFFORTS = [['low', 'Schnell'], ['medium', 'Ausgewogen'], ['high', 'Gründlich']];
const MAX_ATTACH = 200000; // Zeichen

function chats() { return store.get('aiChats', []) || []; }
function saveChats(list) { store.set('aiChats', list.slice(0, 100)); }

export default {
  async mount(root, win, args) {
    let cur = null; // aktuelle Unterhaltung
    let busy = null; // laufende Anfrage-ID
    let attachments = [];
    let effort = store.get('aiEffort', 'medium');

    const side = h('div.app-sidebar.ai-side');
    const thread = h('div.ai-thread');
    const scroller = h('div.ai-scroll', thread);
    const ta = h('textarea.ai-input', { rows: 1, placeholder: 'Frag Nova … (Enter senden, Umschalt+Enter neue Zeile)' });
    const attachRow = h('div.ai-attachments');
    const sendBtn = h('button.ai-send', { title: 'Senden', html: icon('send') });
    const effortSel = h('select.input.ai-effort', { title: 'Denktiefe' }, ...EFFORTS.map(([v, l]) => h('option', { value: v, selected: v === effort }, l)));
    effortSel.onchange = () => { effort = effortSel.value; store.set('aiEffort', effort); };
    const composer = h('div.ai-composer',
      attachRow,
      h('div.ai-box',
        h('button.icon-btn', { title: 'Datei als Kontext anhängen', html: icon('filePlus'), onclick: attach }),
        ta, sendBtn),
      h('div.ai-foot', effortSel, h('span.faint', 'Claude kann Fehler machen – wichtige Angaben bitte prüfen.')));
    const main = h('div.app-main.ai-main', scroller, composer);
    const keyScreen = h('div.ai-key.hidden');
    root.append(h('div.app-split', side, main, keyScreen));

    // ---------- Schlüssel ----------
    async function checkKey() {
      const has = await api.ai.hasKey();
      keyScreen.classList.toggle('hidden', has);
      main.classList.toggle('hidden', !has);
      if (!has) renderKeyScreen();
      return has;
    }

    function renderKeyScreen() {
      clear(keyScreen);
      const inp = h('input.input', { type: 'password', placeholder: 'sk-ant-…', spellcheck: false, autocomplete: 'off' });
      const save = async () => {
        const v = inp.value.trim();
        if (!v) return;
        await api.ai.setKey(v);
        toast('API-Schlüssel gespeichert', 'Verschlüsselt auf diesem PC abgelegt.', { kind: 'ok', icon: 'lock' });
        if (await checkKey()) setTimeout(() => ta.focus(), 30);
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
      keyScreen.append(h('div.ai-key-card',
        h('div.ai-orb', { html: icon('sparkles') }),
        h('h2', 'Nova KI einrichten'),
        h('p.muted', 'Nova nutzt Claude von Anthropic. Hinterlege einmalig deinen API-Schlüssel – er wird mit der Windows-Verschlüsselung nur auf diesem PC gespeichert.'),
        inp,
        h('div.row', { style: { justifyContent: 'center', marginTop: '12px' } },
          h('button.btn.primary', { onclick: save, html: `${icon('lock')} Schlüssel speichern` }),
          h('button.btn', { onclick: () => api.fs.openExternal('https://console.anthropic.com/settings/keys'), html: `${icon('external')} Schlüssel erstellen` }))));
      setTimeout(() => inp.focus(), 30);
    }

    // ---------- Seitenleiste ----------
    function renderSide() {
      clear(side);
      side.append(h('button.btn.primary.ai-new', { html: `${icon('plus')} Neuer Chat`, onclick: () => newChat() }));
      const list = chats();
      if (!list.length) side.append(h('div.faint', { style: { fontSize: '12px', padding: '12px 8px' } }, 'Noch keine Unterhaltungen.'));
      for (const c of list) {
        const el = h('button.side-item.ai-chat-item', { class: cur && cur.id === c.id ? 'on' : '', title: c.title, onclick: () => select(c.id) },
          h('span', { html: icon('sparkles') }), h('span.ellipsis', c.title), h('span.count', timeAgo(c.updated).replace('vor ', '')));
        el.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          contextMenu(e.clientX, e.clientY, [
            { label: 'Umbenennen', icon: 'edit', action: async () => { const n = await promptDialog({ title: 'Chat umbenennen', value: c.title }); if (n) { saveChats(chats().map((x) => (x.id === c.id ? { ...x, title: n } : x))); if (cur && cur.id === c.id) cur.title = n; renderSide(); } } },
            { label: 'Als Notiz exportieren', icon: 'stickyNote', action: () => exportChat(c) },
            '-',
            { label: 'Löschen', icon: 'trash', danger: true, action: async () => {
              if (!(await confirmDialog({ title: 'Chat löschen?', message: c.title, ok: 'Löschen', danger: true }))) return;
              saveChats(chats().filter((x) => x.id !== c.id));
              if (cur && cur.id === c.id) newChat(); else renderSide();
            } },
          ]);
        });
        side.append(el);
      }
    }

    function newChat(initial = '') {
      if (busy) return;
      cur = { id: uid('chat'), title: 'Neuer Chat', messages: [], updated: Date.now() };
      attachments = [];
      renderAttachments();
      renderThread();
      renderSide();
      ta.value = initial;
      autosize();
      setTimeout(() => ta.focus(), 20);
    }

    function select(id) {
      if (busy) return;
      const c = chats().find((x) => x.id === id);
      if (!c) return;
      cur = structuredClone(c);
      renderThread();
      renderSide();
    }

    function persist() {
      if (!cur || !cur.messages.length) return;
      cur.updated = Date.now();
      const others = chats().filter((x) => x.id !== cur.id);
      saveChats([structuredClone(cur), ...others]);
      renderSide();
    }

    // ---------- Verlauf ----------
    function renderThread() {
      clear(thread);
      win.setTitle(cur && cur.messages.length ? `${cur.title} – Nova KI` : 'Nova KI');
      if (!cur || !cur.messages.length) {
        thread.append(h('div.ai-empty',
          h('div.ai-orb', { html: icon('sparkles') }),
          h('h2', 'Wie kann ich helfen?'),
          h('div.ai-suggest', ...SUGGESTIONS.map(([ic, text]) => h('button.ai-chip', { html: `${icon(ic)}<span>${esc(text)}</span>`, onclick: () => { ta.value = text; send(); } })))));
        return;
      }
      for (const m of cur.messages) thread.append(bubble(m));
      scroller.scrollTop = scroller.scrollHeight;
    }

    function bubble(m) {
      if (m.role === 'user') {
        const el = h('div.ai-msg.user', h('div.ai-bubble', m.display || m.content));
        if (m.files && m.files.length) el.prepend(h('div.ai-files', ...m.files.map((f) => h('span.chip', { html: `${icon('fileText')} ${esc(f)}` }))));
        return el;
      }
      const body = h('div.ai-md.md-body');
      setMd(body, m.content);
      const actions = h('div.ai-actions',
        act('copy', 'Kopieren', () => { api.clip.write(m.content); toast('Kopiert', '', { icon: 'copy', duration: 1200 }); }),
        act('stickyNote', 'Als Notiz', () => openApp('notes', { action: 'new', text: m.content })),
        act('code', 'Im Editor', () => openApp('editor', { action: 'new', text: m.content })));
      const toolsEl = h('div.ai-toolrow');
      (m.tools || []).forEach((t) => toolsEl.append(toolChip(t)));
      const el = h('div.ai-msg.bot', h('div.ai-avatar', { html: icon('sparkles') }), h('div.ai-content', toolsEl, body, m.error ? h('div.ai-error', m.error) : null, m.content ? actions : null));
      el._body = body;
      el._tools = toolsEl;
      return el;
    }

    function toolChip(t) {
      return h('div.ai-tool', { class: t.ok ? '' : 'err', html: `${icon(t.ok ? 'checkCircle' : 'alert')}<b>${esc(t.label)}</b><span>${esc(t.summary || '')}</span>` });
    }

    function act(ic, title, fn) { return h('button.icon-btn.sm', { title, html: icon(ic), onclick: fn }); }

    function setMd(el, text) {
      el.innerHTML = renderMarkdown(text || '', { remoteImages: false });
      // Kopier-Knopf an Codeblöcken
      el.querySelectorAll('pre.md-code').forEach((pre) => {
        const b = h('button.ai-codecopy', { html: `${icon('copy')} Kopieren`, onclick: () => { api.clip.write(pre.textContent.replace(/Kopieren$/, '')); toast('Code kopiert', '', { icon: 'copy', duration: 1200 }); } });
        pre.append(b);
      });
    }

    thread.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-ext]');
      if (a) { e.preventDefault(); openApp('browser', { url: a.getAttribute('href') }); }
    });

    // ---------- Senden ----------
    async function send() {
      const text = ta.value.trim();
      if ((!text && !attachments.length) || busy) return;
      if (!(await checkKey())) return;
      if (!cur) newChat();
      let content = text;
      if (attachments.length) {
        content = attachments.map((a) => `Datei „${a.name}“:\n\`\`\`\n${a.text}\n\`\`\``).join('\n\n') + (text ? `\n\n${text}` : '\n\nBitte sieh dir die Datei(en) an.');
      }
      const userMsg = { role: 'user', content, display: text || '(Datei angehängt)', files: attachments.map((a) => a.name) };
      if (!cur.messages.length) cur.title = (text || attachments[0].name).replace(/\s+/g, ' ').slice(0, 48);
      cur.messages.push(userMsg);
      attachments = [];
      renderAttachments();
      ta.value = '';
      autosize();
      const botMsg = { role: 'assistant', content: '' };
      cur.messages.push(botMsg);
      renderThread();
      const botEl = thread.lastElementChild;
      botEl.classList.add('streaming');
      const id = uid('req');
      busy = id;
      setBusy(true);
      persist();
      let pending = false;
      const offDelta = api.ai.onDelta((d) => {
        if (d.id !== id) return;
        botMsg.content += d.text;
        if (!pending) {
          pending = true;
          requestAnimationFrame(() => {
            pending = false;
            setMd(botEl._body, botMsg.content);
            const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 140;
            if (nearBottom) scroller.scrollTop = scroller.scrollHeight;
          });
        }
      });
      const offTool = bus.on('ai:tool', (t) => {
        if (t.id !== id) return;
        (botMsg.tools = botMsg.tools || []).push({ label: t.label, summary: t.summary, ok: t.ok });
        botEl._tools.append(toolChip(t));
      });
      const offDone = api.ai.onDone((d) => {
        if (d.id !== id) return;
        offDelta(); offDone(); offTool();
        busy = null;
        setBusy(false);
        if (d.error) botMsg.error = d.error;
        if (d.aborted && !botMsg.content) botMsg.content = '_(abgebrochen)_';
        if (!botMsg.content && !botMsg.error) botMsg.error = 'Keine Antwort erhalten.';
        if (botMsg.error && !botMsg.content) cur.messages.pop(); // leere Antwort nicht speichern
        persist();
        renderThread();
        if (botMsg.error) {
          thread.append(h('div.ai-msg.bot', h('div.ai-avatar', { html: icon('alert') }), h('div.ai-content', h('div.ai-error', botMsg.error))));
          scroller.scrollTop = scroller.scrollHeight;
        }
        ta.focus();
      });
      const history = cur.messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content }));
      api.ai.chat(id, history, { effort }).catch((e) => { showError(e); });
    }

    function setBusy(on) {
      sendBtn.innerHTML = icon(on ? 'stop' : 'send');
      sendBtn.title = on ? 'Stopp' : 'Senden';
      sendBtn.classList.toggle('stop', on);
    }

    sendBtn.onclick = () => { if (busy) api.ai.abort(busy); else send(); };

    function autosize() {
      ta.style.height = 'auto';
      ta.style.height = Math.min(200, ta.scrollHeight) + 'px';
    }
    ta.addEventListener('input', autosize);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    // ---------- Anhänge ----------
    async function attach(pathArg) {
      const places = await api.fs.places();
      const p = typeof pathArg === 'string' ? pathArg : await promptDialog({ title: 'Datei anhängen', message: 'Pfad zu einer Textdatei (Code, Notizen, CSV, …):', value: (places.documents || places.home) + (api.platform === 'win32' ? '\\' : '/'), ok: 'Anhängen', select: false });
      if (!p) return;
      try {
        let text = await api.fs.readText(p);
        if (text.length > MAX_ATTACH) { text = text.slice(0, MAX_ATTACH); toast('Datei gekürzt', `Nur die ersten ${MAX_ATTACH.toLocaleString('de-DE')} Zeichen werden gesendet.`, { kind: 'warn' }); }
        attachments.push({ name: pathx.base(p), text });
        renderAttachments();
        ta.focus();
      } catch (e) { showError(e, 'Datei konnte nicht gelesen werden'); }
    }

    function renderAttachments() {
      clear(attachRow);
      attachments.forEach((a, i) => attachRow.append(h('span.chip.on', { html: `${icon('fileText')} ${esc(a.name)}` },
        h('button.icon-btn.sm', { html: icon('x'), title: 'Entfernen', onclick: () => { attachments.splice(i, 1); renderAttachments(); } }))));
    }

    // Dateien aus dem Dateimanager hierher ziehen
    main.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('application/x-nova-paths')) { e.preventDefault(); main.classList.add('drop'); } });
    main.addEventListener('dragleave', (e) => { if (e.target === main) main.classList.remove('drop'); });
    main.addEventListener('drop', async (e) => {
      main.classList.remove('drop');
      const raw = e.dataTransfer.getData('application/x-nova-paths');
      if (!raw) return;
      e.preventDefault();
      for (const p of JSON.parse(raw)) await attach(p);
    });

    async function exportChat(c) {
      const text = `# ${c.title}\n\n` + c.messages.map((m) => (m.role === 'user' ? `**Du:** ${m.display || m.content}` : `**Nova:**\n\n${m.content}`)).join('\n\n---\n\n');
      openApp('notes', { action: 'new', text });
    }

    // Einstellungsmenü in der Titelleiste
    win.tools.append(h('button.icon-btn.sm', { title: 'KI-Einstellungen', html: icon('settings'), onclick: (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      contextMenu(r.left - 200, r.bottom + 4, [
        { label: 'API-Schlüssel ändern', icon: 'lock', action: async () => { await api.ai.setKey(''); checkKey(); } },
        { label: 'Alle Chats löschen', icon: 'trash', danger: true, action: async () => { if (await confirmDialog({ title: 'Alle Chats löschen?', ok: 'Löschen', danger: true })) { saveChats([]); newChat(); } } },
      ]);
    } }));

    const has = await checkKey();
    const list = chats();
    if (args.prompt) { newChat(args.prompt); if (has) send(); }
    else if (args.attach) { newChat(); attach(args.attach); }
    else if (list.length) select(list[0].id);
    else newChat();
    renderSide();

    return {
      onArgs(a) {
        if (a.prompt) { newChat(a.prompt); send(); }
        else if (a.attach) { if (!cur || cur.messages.length) newChat(); attach(a.attach); }
      },
      onFocus() { setTimeout(() => !main.classList.contains('hidden') && ta.focus(), 10); },
      destroy() { if (busy) api.ai.abort(busy); },
    };
  },
};
