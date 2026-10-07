// Minimaler iCalendar-(.ics)-Import/Export für den Kalender.

function unfold(text) { return text.replace(/\r?\n[ \t]/g, ''); }
function unescape(v) { return v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1'); }
function escapeIcs(v) { return String(v || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1'); }

/** "20261020T093000Z" | "20261020" → { date: '2026-10-20', time: '09:30' | '' } (Zeit in lokaler Zone) */
function parseDate(value, params) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mi, , z] = m;
  if (!hh || /VALUE=DATE(?!-)/.test(params)) return { date: `${y}-${mo}-${d}`, time: '' };
  const dt = z ? new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mi)) : new Date(+y, +mo - 1, +d, +hh, +mi);
  const pad = (n) => String(n).padStart(2, '0');
  return { date: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`, time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}` };
}

export function parseIcs(text) {
  const lines = unfold(String(text)).split(/\r?\n/);
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur && cur.title && cur.date) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const [name, ...paramParts] = line.slice(0, i).split(';');
    const params = paramParts.join(';');
    const value = line.slice(i + 1);
    if (name === 'SUMMARY') cur.title = unescape(value).slice(0, 200);
    else if (name === 'DESCRIPTION') cur.notes = unescape(value).slice(0, 2000);
    else if (name === 'UID') cur.uid = value;
    else if (name === 'DTSTART') { const p = parseDate(value, params); if (p) { cur.date = p.date; cur.time = p.time; } }
    else if (name === 'DTEND') { const p = parseDate(value, params); if (p && p.time) cur.end = p.time; }
  }
  return events;
}

export function toIcs(events) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NovaOS//Kalender//DE'];
  for (const e of events) {
    const d = e.date.replace(/-/g, '');
    out.push('BEGIN:VEVENT', `UID:${e.uid || e.id}@novaos`, `DTSTAMP:${stamp}`);
    if (e.time) {
      out.push(`DTSTART:${d}T${e.time.replace(':', '')}00`);
      if (e.end) out.push(`DTEND:${d}T${e.end.replace(':', '')}00`);
    } else {
      out.push(`DTSTART;VALUE=DATE:${d}`);
    }
    out.push(`SUMMARY:${escapeIcs(e.title)}`);
    if (e.notes) out.push(`DESCRIPTION:${escapeIcs(e.notes)}`);
    out.push('END:VEVENT');
  }
  out.push('END:VCALENDAR');
  return out.join('\r\n') + '\r\n';
}
