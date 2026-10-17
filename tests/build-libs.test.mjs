import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, escapeXml, safeUrl, fillSlot, formatDuration } from '../scripts/lib/html.mjs';
import { computeDora, summarizeJobs, frequencyLevel, leadTimeLevel, failureRateLevel, restoreLevel } from '../scripts/lib/dora.mjs';
import { parseData, appendCheck, summarizeUptime, detectIncidents, emptyData } from '../scripts/lib/uptime.mjs';
import { classify, parseGitLog, buildChangelog } from '../scripts/lib/changelog.mjs';

const HOUR = 3600e3;
const NOW = Date.parse('2026-10-20T12:00:00Z');
const iso = ms => new Date(ms).toISOString();

test('escapeHtml neutralises markup from commit messages', () => {
  assert.equal(escapeHtml('<script>alert("x")</script> & \'y\''), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeXml('a\u0001b<c>'), 'ab&lt;c&gt;');
});

test('safeUrl only allows http(s)', () => {
  assert.equal(safeUrl('https://github.com/x'), 'https://github.com/x');
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('not a url'), '');
});

test('fillSlot replaces only the marked region', () => {
  const html = '<p>a</p><!-- build:x -->old<!-- /build:x --><p>b</p>';
  assert.equal(fillSlot(html, 'x', 'new'), '<p>a</p><!-- build:x -->new<!-- /build:x --><p>b</p>');
  assert.throws(() => fillSlot(html, 'missing', ''), /not found/);
});

test('formatDuration is human friendly', () => {
  assert.equal(formatDuration(42e3), '42 s');
  assert.equal(formatDuration(5 * 60e3), '5 min');
  assert.equal(formatDuration(3 * HOUR), '3.0 h');
  assert.equal(formatDuration(5 * 24 * HOUR), '5 days');
  assert.equal(formatDuration(NaN), '–');
  // Localized: decimal comma and a translated unit.
  const sv = { locale: 'sv-SE', t: (text, vars) => (text === '{n} days' ? `${vars.n} dagar` : text) };
  assert.equal(formatDuration(3 * HOUR, sv), '3,0 h');
  assert.equal(formatDuration(5 * 24 * HOUR, sv), '5 dagar');
});

function run(overrides) {
  return { id: 1, run_number: 1, event: 'push', head_branch: 'main', status: 'completed', conclusion: 'success', head_sha: 'a'.repeat(40), head_commit: { message: 'msg', timestamp: iso(NOW - 2 * HOUR) }, run_started_at: iso(NOW - HOUR), updated_at: iso(NOW - HOUR + 90e3), html_url: 'https://github.com/x', ...overrides };
}

test('DORA metrics from pipeline runs', () => {
  const runs = [
    run({ id: 1, run_started_at: iso(NOW - 5 * 24 * HOUR), updated_at: iso(NOW - 5 * 24 * HOUR + 60e3), head_commit: { timestamp: iso(NOW - 5 * 24 * HOUR - HOUR) } }),
    run({ id: 2, conclusion: 'failure', run_started_at: iso(NOW - 3 * 24 * HOUR), updated_at: iso(NOW - 3 * 24 * HOUR + 60e3) }),
    run({ id: 3, run_started_at: iso(NOW - 3 * 24 * HOUR + 30 * 60e3), updated_at: iso(NOW - 3 * 24 * HOUR + 31 * 60e3), head_commit: { timestamp: iso(NOW - 3 * 24 * HOUR + 20 * 60e3) } }),
    run({ id: 4 }),
    // Ignored: uptime redeploys, pull requests, other branches, cancelled runs, in-progress runs.
    run({ id: 5, event: 'workflow_dispatch' }),
    run({ id: 6, event: 'pull_request' }),
    run({ id: 7, head_branch: 'feature' }),
    run({ id: 8, conclusion: 'cancelled' }),
    run({ id: 9, status: 'in_progress', conclusion: null })
  ];
  const dora = computeDora(runs, { now: NOW, windowDays: 30 });
  assert.equal(dora.deployments, 3);
  assert.equal(dora.failedDeployments, 1);
  assert.equal(dora.changeFailureRate.rate, 0.25);
  assert.equal(dora.changeFailureRate.level, 'Low');
  // Time to restore: failure finished at +1 min, fix finished at +31 min.
  assert.equal(dora.timeToRestore.ms, 30 * 60e3);
  assert.equal(dora.timeToRestore.level, 'Elite');
  assert.ok(dora.leadTime.ms > 0 && dora.leadTime.ms < 24 * HOUR);
  assert.equal(dora.leadTime.level, 'Elite');
  assert.equal(dora.daily.length, 30);
  assert.equal(dora.daily.reduce((sum, day) => sum + day.deployments, 0), 3);
  assert.equal(dora.recent[0].number, 1);
});

test('DORA with no runs reports nothing instead of fake levels', () => {
  const dora = computeDora([], { now: NOW });
  assert.equal(dora.deployments, 0);
  assert.equal(dora.deploymentFrequency.level, null);
  assert.equal(dora.leadTime.ms, null);
  assert.equal(dora.changeFailureRate.rate, null);
  assert.equal(dora.timeToRestore.ms, null);
});

test('DORA level bands', () => {
  assert.equal(frequencyLevel(2), 'Elite');
  assert.equal(frequencyLevel(0.2), 'High');
  assert.equal(frequencyLevel(0.05), 'Medium');
  assert.equal(frequencyLevel(0.01), 'Low');
  assert.equal(leadTimeLevel(2 * 24 * HOUR), 'High');
  assert.equal(failureRateLevel(0.05), 'Elite');
  assert.equal(failureRateLevel(0.2), 'Low');
  assert.equal(restoreLevel(2 * HOUR), 'High');
});

test('job steps are summarised for the replay, hiding bookkeeping steps and SHAs', () => {
  const jobs = [{ name: 'build', conclusion: 'success', started_at: '2026-10-17T16:43:29Z', completed_at: '2026-10-17T16:44:24Z', steps: [
    { name: 'Set up job', conclusion: 'success', started_at: '2026-10-17T16:43:30Z', completed_at: '2026-10-17T16:43:32Z' },
    { name: `Run actions/checkout@${'3'.repeat(40)}`, conclusion: 'success', started_at: '2026-10-17T16:43:32Z', completed_at: '2026-10-17T16:43:34Z' },
    { name: 'Unit tests', conclusion: 'success', started_at: '2026-10-17T16:43:34Z', completed_at: '2026-10-17T16:43:35Z' },
    { name: `Post Run actions/checkout@${'3'.repeat(40)}`, conclusion: 'success', started_at: '2026-10-17T16:44:22Z', completed_at: '2026-10-17T16:44:22Z' }
  ] }];
  const [job] = summarizeJobs(jobs);
  assert.deepEqual(job.steps.map(step => step.name), ['Run actions/checkout', 'Unit tests']);
  assert.equal(job.steps[0].durationMs, 2000);
  assert.equal(job.steps[1].offsetMs, 5000);
  assert.equal(job.durationMs, 55000);
});

test('uptime data is validated, appended and pruned to 90 days', () => {
  assert.deepEqual(parseData('nonsense'), emptyData());
  const parsed = parseData({ checks: [{ t: 'bad' }, { t: iso(NOW), results: { site: { ok: 'yes', status: 200, ms: 120.4 }, evil: { ok: true } } }] });
  assert.equal(parsed.checks.length, 1);
  assert.deepEqual(parsed.checks[0].results, { site: { ok: false, status: 200, ms: 120 } });
  const old = { t: iso(NOW - 100 * 24 * HOUR), results: { site: { ok: true, status: 200, ms: 1 } } };
  const data = appendCheck({ checks: [old] }, { t: iso(NOW), results: { site: { ok: true, status: 200, ms: 1 } } }, NOW);
  assert.equal(data.checks.length, 1);
});

test('uptime summary and incidents', () => {
  const checks = [];
  for (let hour = 48; hour >= 0; hour--) {
    const down = hour === 10 || hour === 9;
    checks.push({ t: iso(NOW - hour * HOUR), results: { site: { ok: true, status: 200, ms: 100 }, games: { ok: true, status: 200, ms: 150 }, proxy: { ok: !down, status: down ? 502 : 200, ms: down ? null : 300 } } });
  }
  const summary = summarizeUptime({ checks }, { now: NOW });
  assert.equal(summary.overall, 'operational');
  const proxy = summary.components.find(c => c.id === 'proxy');
  assert.equal(proxy.uptime.day, 23 / 25);
  assert.equal(proxy.averageMs, 300);
  assert.equal(proxy.days.length, 90);
  assert.equal(summary.incidents.length, 1);
  assert.equal(summary.incidents[0].failedChecks, 2);
  assert.ok(summary.incidents[0].end);
  const outage = summarizeUptime({ checks: [{ t: iso(NOW), results: { site: { ok: false, status: 0, ms: null } } }] }, { now: NOW });
  assert.equal(outage.overall, 'outage');
  assert.equal(detectIncidents(outage.components.length ? [{ t: iso(NOW), results: { site: { ok: false } } }] : []).at(0).end, null);
  assert.equal(summarizeUptime(emptyData(), { now: NOW }).overall, 'unknown');
});

test('changelog classifies commits', () => {
  assert.deepEqual(classify('feat(games): add sale badges'), { type: 'feature', label: 'Feature', text: 'add sale badges' });
  assert.equal(classify('fix pipa').type, 'fix');
  assert.equal(classify('ci: pin actions').type, 'ci');
  assert.equal(classify('Update shared game library (157 games)').type, 'library');
  assert.equal(classify('reworked').type, 'change');
  assert.deepEqual(classify('feat/worker'), { type: 'feature', label: 'Feature', text: 'worker' });
});

test('git log parsing and grouping by day', () => {
  const log = ['a'.repeat(40) + '\x1f2026-10-17T18:00:00+02:00\x1ffeat: one\x1e', 'b'.repeat(40) + '\x1f2026-10-17T10:00:00+02:00\x1ffix: two\x1e', 'c'.repeat(40) + '\x1f2026-10-16T10:00:00+02:00\x1f<b>three</b>\x1e', 'junk\x1e'].join('\n');
  const commits = parseGitLog(log);
  assert.equal(commits.length, 3);
  const changelog = buildChangelog(commits);
  assert.equal(changelog.groups.length, 2);
  assert.equal(changelog.groups[0].entries.length, 2);
  assert.equal(changelog.groups[1].entries[0].text, '<b>three</b>');
});

test('rendered changelog and feed never contain raw markup from commit messages', async () => {
  const { renderChangelog, renderFeed, renderIncidents, parseIncidentNote } = await import('../scripts/lib/render.mjs');
  const hostile = '<script>alert(1)</script><img src=x onerror=alert(2)> "onmouseover=x';
  const changelog = buildChangelog([{ sha: 'd'.repeat(40), date: '2026-10-17T10:00:00+02:00', subject: `feat: ${hostile}` }]);
  const html = renderChangelog(changelog, 'https://github.com/antonlovg/antonlovg.github.io');
  assert.doesNotMatch(html, /<script|<img|"onmouseover/); // tags and attribute-breaking quotes must be escaped
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  const feed = renderFeed(changelog, { siteUrl: 'https://lovgren.dev', repoUrl: 'https://github.com/x/y' });
  assert.doesNotMatch(feed, /<script|<img/);
  const note = parseIncidentNote('2026-10-17-test.md', `# ${hostile}\n\nBody ${hostile}`);
  const incidents = renderIncidents({ incidents: [] }, [note]);
  assert.doesNotMatch(incidents, /<script|<img/);
});
