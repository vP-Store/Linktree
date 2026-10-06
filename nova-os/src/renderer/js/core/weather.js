// Wetter über Open-Meteo (kostenlos, ohne API-Schlüssel).

import { store } from './store.js';

const CODES = {
  0: ['Klar', 'sun'], 1: ['Überwiegend klar', 'sun'], 2: ['Teilweise bewölkt', 'cloudSun'], 3: ['Bedeckt', 'cloud'],
  45: ['Nebel', 'cloudFog'], 48: ['Raureifnebel', 'cloudFog'],
  51: ['Leichter Niesel', 'cloudRain'], 53: ['Niesel', 'cloudRain'], 55: ['Starker Niesel', 'cloudRain'],
  56: ['Gefrierender Niesel', 'cloudRain'], 57: ['Gefrierender Niesel', 'cloudRain'],
  61: ['Leichter Regen', 'cloudRain'], 63: ['Regen', 'cloudRain'], 65: ['Starker Regen', 'cloudRain'],
  66: ['Gefrierender Regen', 'cloudRain'], 67: ['Gefrierender Regen', 'cloudRain'],
  71: ['Leichter Schnee', 'cloudSnow'], 73: ['Schnee', 'cloudSnow'], 75: ['Starker Schnee', 'cloudSnow'], 77: ['Schneegriesel', 'cloudSnow'],
  80: ['Regenschauer', 'cloudRain'], 81: ['Regenschauer', 'cloudRain'], 82: ['Heftige Schauer', 'cloudRain'],
  85: ['Schneeschauer', 'cloudSnow'], 86: ['Schneeschauer', 'cloudSnow'],
  95: ['Gewitter', 'cloudLightning'], 96: ['Gewitter mit Hagel', 'cloudLightning'], 99: ['Gewitter mit Hagel', 'cloudLightning'],
};

export function describe(code, isDay = 1) {
  const [label, ic] = CODES[code] || ['Unbekannt', 'cloud'];
  return { label, icon: !isDay && ic === 'sun' ? 'moon' : ic };
}

export async function geocode(name) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=6&language=de&format=json`);
  if (!r.ok) throw new Error('Ortssuche fehlgeschlagen');
  const j = await r.json();
  return (j.results || []).map((x) => ({ name: x.name, country: x.country, admin: x.admin1, lat: x.latitude, lon: x.longitude, tz: x.timezone }));
}

let cache = { key: null, at: 0, data: null };

export async function forecast(city = store.get('weatherCity'), force = false) {
  if (!city) return null;
  const key = `${city.lat},${city.lon}`;
  if (!force && cache.key === key && Date.now() - cache.at < 15 * 60 * 1000) return cache.data;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}`
    + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m,precipitation'
    + '&hourly=temperature_2m,weather_code,precipitation_probability,is_day'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,uv_index_max'
    + '&timezone=auto&forecast_days=7';
  const r = await fetch(url);
  if (!r.ok) throw new Error('Wetterdaten nicht erreichbar');
  const data = await r.json();
  cache = { key, at: Date.now(), data };
  return data;
}
