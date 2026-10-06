// Wetter: aktuelle Lage, stündliche und 7-Tage-Vorhersage (Open-Meteo, ohne API-Schlüssel).

import { h, clear, esc, debounce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { store } from '../core/store.js';
import { geocode, forecast, describe } from '../core/weather.js';
import { showError } from '../core/ui.js';

export default {
  mount(root, win) {
    const search = h('input.input', { placeholder: 'Ort suchen … (z. B. Berlin)', spellcheck: false });
    const results = h('div.wx-results.glass.hidden');
    const body = h('div.wx-body');
    root.classList.add('wx-root');
    root.append(h('div.app-toolbar', h('div.search-field.grow', { style: { position: 'relative' }, html: icon('mapPin') }, search, results),
      h('button.icon-btn', { title: 'Aktualisieren', html: icon('refresh'), onclick: () => load(true) })), body);

    const doSearch = debounce(async () => {
      const q = search.value.trim();
      if (q.length < 2) { results.classList.add('hidden'); return; }
      try {
        const list = await geocode(q);
        clear(results);
        if (!list.length) results.append(h('div.faint', { style: { padding: '10px 12px', fontSize: '12.5px' } }, 'Kein Ort gefunden.'));
        for (const c of list) {
          results.append(h('button.list-row', { onclick: () => { store.set('weatherCity', c); search.value = ''; results.classList.add('hidden'); load(true); } },
            h('span', { html: icon('mapPin') }), h('div.meta', h('b', c.name), h('small', [c.admin, c.country].filter(Boolean).join(', ')))));
        }
        results.classList.remove('hidden');
      } catch (e) { showError(e, 'Ortssuche fehlgeschlagen'); }
    }, 300);
    search.addEventListener('input', doSearch);
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const f = results.querySelector('.list-row'); if (f) f.click(); } if (e.key === 'Escape') results.classList.add('hidden'); });

    async function load(force = false) {
      const city = store.get('weatherCity');
      clear(body);
      if (!city) {
        body.append(h('div.empty', { style: { flex: 1 }, html: `${icon('cloudSun')}<b>Wo bist du?</b><span>Suche oben nach deiner Stadt, um das Wetter zu sehen.</span>` }));
        setTimeout(() => search.focus(), 30);
        return;
      }
      body.append(h('div.empty', { style: { flex: 1 } }, h('div.spinner')));
      let data;
      try { data = await forecast(city, force); } catch (e) {
        clear(body);
        body.append(h('div.empty', { style: { flex: 1 }, html: `${icon('wifiOff')}<b>Keine Verbindung</b><span>${esc(e.message)}</span>` }));
        return;
      }
      clear(body);
      const c = data.current;
      const now = describe(c.weather_code, c.is_day);
      root.dataset.sky = c.is_day ? (c.weather_code <= 1 ? 'clear' : c.weather_code >= 51 ? 'rain' : 'cloud') : 'night';
      win.setTitle(`${city.name} · ${Math.round(c.temperature_2m)}° – Wetter`);

      // Kopf
      body.append(h('div.wx-hero',
        h('div',
          h('div.wx-city', { html: `${icon('mapPin')} ${esc(city.name)}${city.admin ? `<span class="faint">, ${esc(city.admin)}</span>` : ''}` }),
          h('div.wx-temp', `${Math.round(c.temperature_2m)}°`),
          h('div.wx-cond', now.label),
          h('div.wx-hl', `H: ${Math.round(data.daily.temperature_2m_max[0])}°  T: ${Math.round(data.daily.temperature_2m_min[0])}°`)),
        h('div.wx-hero-ico', { html: icon(now.icon) })));

      // Kennzahlen
      const sr = data.daily.sunrise[0].slice(11, 16), ss = data.daily.sunset[0].slice(11, 16);
      const stat = (ic, label, val) => h('div.wx-stat.card', h('div.faint', { html: `${icon(ic)} ${label}` }), h('b', val));
      body.append(h('div.wx-stats',
        stat('thermometer', 'Gefühlt', `${Math.round(c.apparent_temperature)}°`),
        stat('droplet', 'Luftfeuchte', `${c.relative_humidity_2m} %`),
        stat('wind', 'Wind', `${Math.round(c.wind_speed_10m)} km/h`),
        stat('cloudRain', 'Regenrisiko', `${data.daily.precipitation_probability_max[0] ?? 0} %`),
        stat('sunrise', 'Sonnenaufgang', sr),
        stat('sunset', 'Sonnenuntergang', ss)));

      // Stündlich (nächste 24 h)
      const nowIdx = data.hourly.time.findIndex((t) => t >= data.current.time.slice(0, 13));
      const hours = h('div.wx-hours');
      for (let i = Math.max(0, nowIdx); i < Math.max(0, nowIdx) + 24 && i < data.hourly.time.length; i++) {
        const d = describe(data.hourly.weather_code[i], data.hourly.is_day[i]);
        const p = data.hourly.precipitation_probability[i];
        hours.append(h('div.wx-hour', { title: d.label },
          h('small', i === nowIdx ? 'Jetzt' : data.hourly.time[i].slice(11, 13) + ' Uhr'),
          h('span', { html: icon(d.icon) }),
          h('b', `${Math.round(data.hourly.temperature_2m[i])}°`),
          h('small.wx-pop', p ? `${p} %` : ' ')));
      }
      body.append(h('div.card.wx-card', h('div.section-title', 'Nächste 24 Stunden'), hours));

      // 7 Tage – Temperaturspannen auf gemeinsamer Skala
      const mins = data.daily.temperature_2m_min, maxs = data.daily.temperature_2m_max;
      const lo = Math.min(...mins), hi = Math.max(...maxs);
      const days = h('div.wx-days');
      data.daily.time.forEach((t, i) => {
        const d = describe(data.daily.weather_code[i], 1);
        const name = i === 0 ? 'Heute' : new Date(t + 'T00:00').toLocaleDateString('de-DE', { weekday: 'long' });
        const left = ((mins[i] - lo) / (hi - lo || 1)) * 100, width = ((maxs[i] - mins[i]) / (hi - lo || 1)) * 100;
        days.append(h('div.wx-day', { title: `${d.label} · Regen ${data.daily.precipitation_probability_max[i] ?? 0} % · UV ${data.daily.uv_index_max[i] ?? '–'}` },
          h('span.wx-dname', name),
          h('span.wx-dico', { html: icon(d.icon) }),
          h('small.wx-pop', data.daily.precipitation_probability_max[i] ? `${data.daily.precipitation_probability_max[i]} %` : ''),
          h('span.wx-min', `${Math.round(mins[i])}°`),
          h('div.wx-range', h('i', { style: { left: left + '%', width: Math.max(4, width) + '%' } })),
          h('span.wx-max', `${Math.round(maxs[i])}°`)));
      });
      body.append(h('div.card.wx-card', h('div.section-title', '7-Tage-Vorhersage'), days),
        h('div.faint', { style: { fontSize: '11px', textAlign: 'center', padding: '4px 0 8px' } }, 'Daten: Open-Meteo.com'));
    }

    load();
    return {};
  },
};
