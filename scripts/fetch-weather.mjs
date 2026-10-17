// Fetches the current weather in Stockholm from Open-Meteo (free, no key; data CC BY 4.0) and writes
// it into the built site as weather.json, which sets the site's mood (assets/weather.js). Runs at
// build time, and the uptime monitor rebuilds hourly, so visitors never contact a weather service.
// If Open-Meteo fails, the build continues without weather and pages simply show none.
// Usage: node scripts/fetch-weather.mjs _site
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import weather from '../assets/weather.js';

const root = path.resolve(import.meta.dirname, '..');
const out = path.resolve(root, process.argv[2] || '_site');

const url = new URL('https://api.open-meteo.com/v1/forecast');
url.search = new URLSearchParams({
  latitude: String(weather.PLACE.latitude),
  longitude: String(weather.PLACE.longitude),
  current: 'temperature_2m,weather_code,wind_speed_10m',
  daily: 'sunrise,sunset',
  timezone: 'GMT',
  wind_speed_unit: 'ms',
  past_days: '1',
  forecast_days: '2'
});

try {
  const response = await fetch(url, { headers: { 'User-Agent': 'lovgren.dev build' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Open-Meteo returned ${response.status}`);
  const data = weather.fromOpenMeteo(await response.json());
  await writeFile(path.join(out, 'weather.json'), `${JSON.stringify(data)}\n`);
  const { kind, label } = weather.condition(data.code);
  console.log(`Weather in ${data.place}: ${data.temperature} °C, ${label} (${kind}), wind ${data.wind} m/s.`);
} catch (error) {
  console.warn(`Weather skipped: ${error.message}`);
}
