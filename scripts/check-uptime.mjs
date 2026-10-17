// Hourly uptime check (run by .github/workflows/uptime.yml). Appends one result per component
// to the given uptime.json and keeps 90 days. A failed check is data, not an error: exit code is 0.
// Usage: node scripts/check-uptime.mjs uptime.json
import { readFile, writeFile } from 'node:fs/promises';
import { COMPONENTS, parseData, appendCheck, emptyData } from './lib/uptime.mjs';

const file = process.argv[2] || 'uptime.json';

// Each component must return real content, not just HTTP 200.
const VERIFY = {
  site: body => body.includes('<header class="site-bar">'),
  games: body => Array.isArray(JSON.parse(body).games),
  proxy: body => JSON.parse(body)['620']?.success === true
};

async function check(component) {
  const url = new URL(component.url);
  // Bypass CDN caches for our own pages so a stale copy can't hide an outage.
  if (url.hostname === 'lovgren.dev') url.searchParams.set('uptime', Date.now().toString(36));
  const started = performance.now();
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'lovgren.dev uptime monitor', ...(component.id === 'proxy' ? { Origin: 'https://lovgren.dev' } : {}) },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000)
    });
    const body = await response.text();
    const ms = Math.round(performance.now() - started);
    let ok = response.ok;
    try {
      ok = ok && VERIFY[component.id](body);
    } catch {
      ok = false;
    }
    return { ok, status: response.status, ms };
  } catch {
    return { ok: false, status: 0, ms: null };
  }
}

let data = emptyData();
try {
  data = parseData(JSON.parse(await readFile(file, 'utf8')));
} catch {
  console.log('No previous uptime data; starting fresh.');
}

const results = Object.fromEntries(await Promise.all(COMPONENTS.map(async component => [component.id, await check(component)])));
const next = appendCheck(data, { t: new Date().toISOString(), results });
await writeFile(file, `${JSON.stringify(next)}\n`);
for (const component of COMPONENTS) {
  const result = results[component.id];
  console.log(`${result.ok ? 'UP  ' : 'DOWN'} ${component.name.padEnd(20)} ${String(result.status).padStart(3)} ${result.ms ?? '-'} ms`);
}
console.log(`${next.checks.length} checks stored.`);
