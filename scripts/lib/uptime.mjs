// Uptime data: the hourly monitor appends one entry per run to uptime.json (on the uptime-data branch).
// Entry: { t: ISO time, results: { [component]: { ok, status, ms } } }

const HOUR = 3600e3;
const DAY = 24 * HOUR;
export const RETENTION_DAYS = 90;

export const COMPONENTS = [
  { id: 'site', name: 'Website', url: 'https://lovgren.dev/', description: 'The homepage, served by GitHub Pages.' },
  { id: 'games', name: 'Game library', url: 'https://lovgren.dev/games/shared-library.json', description: 'The game library and its shared data file.' },
  { id: 'proxy', name: 'Steam lookup proxy', url: 'https://curly-dawn-c08f.karlanton-lovgren.workers.dev/appdetails?appids=620', description: 'The Cloudflare Worker behind “Fetch Steam info”.' }
];

export function emptyData() {
  return { schemaVersion: 1, checks: [] };
}

// Validates untrusted JSON from the data branch; anything malformed is dropped.
export function parseData(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.checks)) return emptyData();
  const checks = value.checks.filter(entry => entry && typeof entry.t === 'string' && !Number.isNaN(Date.parse(entry.t)) && entry.results && typeof entry.results === 'object')
    .map(entry => ({
      t: new Date(entry.t).toISOString(),
      results: Object.fromEntries(COMPONENTS.filter(c => entry.results[c.id]).map(c => {
        const r = entry.results[c.id];
        return [c.id, { ok: r.ok === true, status: Number.isInteger(r.status) ? r.status : 0, ms: Number.isFinite(r.ms) ? Math.round(r.ms) : null }];
      }))
    }));
  return { schemaVersion: 1, checks };
}

export function appendCheck(data, entry, now = Date.now()) {
  const cutoff = now - RETENTION_DAYS * DAY;
  const checks = [...data.checks, entry].filter(check => Date.parse(check.t) >= cutoff)
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  return { schemaVersion: 1, checks };
}

function ratio(results) {
  return results.length ? results.filter(r => r.ok).length / results.length : null;
}

export function summarizeUptime(data, { now = Date.now() } = {}) {
  const checks = data.checks.filter(check => Date.parse(check.t) <= now);
  const lastCheck = checks.at(-1) || null;
  const components = COMPONENTS.map(component => {
    const series = checks.filter(check => check.results[component.id]).map(check => ({ t: check.t, ...check.results[component.id] }));
    const within = days => series.filter(point => Date.parse(point.t) >= now - days * DAY);
    const days = [];
    for (let day = RETENTION_DAYS - 1; day >= 0; day--) {
      const start = new Date(now - day * DAY);
      start.setUTCHours(0, 0, 0, 0);
      const points = series.filter(point => { const t = Date.parse(point.t); return t >= start.getTime() && t < start.getTime() + DAY; });
      days.push({ date: start.toISOString().slice(0, 10), checks: points.length, uptime: ratio(points) });
    }
    const recent = within(1).filter(point => point.ms !== null);
    const current = series.at(-1) || null;
    return {
      ...component,
      current: current ? { ok: current.ok, status: current.status, ms: current.ms, t: current.t } : null,
      uptime: { day: ratio(within(1)), week: ratio(within(7)), month: ratio(within(30)), quarter: ratio(within(90)) },
      averageMs: recent.length ? Math.round(recent.reduce((sum, point) => sum + point.ms, 0) / recent.length) : null,
      responseTimes: series.slice(-48).map(point => ({ t: point.t, ms: point.ok ? point.ms : null })),
      days
    };
  });
  const known = components.filter(component => component.current);
  const down = known.filter(component => !component.current.ok);
  const overall = !known.length ? 'unknown' : !down.length ? 'operational' : down.length === known.length ? 'outage' : 'degraded';
  return { overall, lastCheck: lastCheck?.t ?? null, checkCount: checks.length, components, incidents: detectIncidents(checks) };
}

// Consecutive failed checks of a component become one incident.
export function detectIncidents(checks) {
  const incidents = [];
  for (const component of COMPONENTS) {
    let open = null;
    for (const check of checks) {
      const result = check.results[component.id];
      if (!result) continue;
      if (!result.ok && !open) open = { component: component.id, name: component.name, start: check.t, end: null, failedChecks: 0, status: result.status };
      if (!result.ok && open) open.failedChecks++;
      if (result.ok && open) { open.end = check.t; incidents.push(open); open = null; }
    }
    if (open) incidents.push(open);
  }
  return incidents.sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
}
