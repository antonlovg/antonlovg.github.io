// Build-time HTML for the /ops, /status and /changelog pages and the changelog RSS feed.
// Every value from data goes through escapeHtml/escapeXml; links through safeUrl.
import { escapeHtml as h, escapeXml, safeUrl, formatDuration, formatDate, formatDateTime } from './html.mjs';

const METRIC_INFO = {
  frequency: 'How often a change reaches production.',
  lead: 'Time from a commit to that commit running in production.',
  failure: 'Share of deployments whose pipeline failed.',
  restore: 'Time from a failed deployment to the next good one.'
};

function levelBadge(level) {
  return level ? `<span class="level-badge level-${h(level.toLowerCase())}">${h(level)}</span>` : '<span class="level-badge level-none">Not enough data</span>';
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function time(iso, text = formatDateTime(iso)) {
  return iso ? `<time datetime="${h(iso)}" data-relative>${h(text)}</time>` : '–';
}

export function renderDora(dora) {
  if (!dora) return '<p class="slot-empty">DORA metrics couldn’t be calculated in this build.</p>';
  const f = dora.deploymentFrequency;
  const frequency = !dora.deployments ? '–' : f.perDay >= 1 ? `${f.perDay.toFixed(1)}<span class="metric-unit"> per day</span>` : `${f.perWeek.toFixed(1)}<span class="metric-unit"> per week</span>`;
  const lead = dora.leadTime.ms === null ? '–' : h(formatDuration(dora.leadTime.ms));
  const failure = dora.changeFailureRate.rate === null ? '–' : `${Math.round(dora.changeFailureRate.rate * 100)}<span class="metric-unit">%</span>`;
  const restore = dora.timeToRestore.ms === null ? (dora.failedDeployments ? 'Not restored yet' : 'No failures') : h(formatDuration(dora.timeToRestore.ms));
  const restoreLevel = dora.timeToRestore.ms === null && !dora.failedDeployments && dora.deployments ? 'Elite' : dora.timeToRestore.level;
  const card = (title, value, level, note) => `
        <article class="metric">
          <h3>${h(title)}</h3>
          <p class="metric-value">${value}</p>
          ${levelBadge(level)}
          <p class="metric-note">${h(note)}</p>
        </article>`;
  return `
      <div class="metric-grid">${card('Deployment frequency', frequency, f.level, METRIC_INFO.frequency)}${card('Lead time for changes', lead, dora.leadTime.level, METRIC_INFO.lead)}${card('Change failure rate', failure, dora.changeFailureRate.level, METRIC_INFO.failure)}${card('Time to restore', restore, restoreLevel, METRIC_INFO.restore)}
      </div>
      <p class="fine-print">Last ${dora.windowDays} days${dora.spanDays < dora.windowDays ? ` (the pipeline has run for ${h(plural(dora.spanDays, 'day'))})` : ''}: ${dora.deployments} successful and ${plural(dora.failedDeployments, 'failed deployment')}. Only pushes to <code>main</code> count; hourly status refreshes don’t.</p>`;
}

export function renderDeploys(dora) {
  if (!dora) return '<p class="slot-empty">Deployment history couldn’t be loaded in this build.</p>';
  const max = Math.max(1, ...dora.daily.map(day => day.deployments + day.failures));
  const width = 600;
  const height = 120;
  const barWidth = width / dora.daily.length;
  const bars = dora.daily.map((day, index) => {
    const x = (index * barWidth + 2).toFixed(1);
    const w = (barWidth - 4).toFixed(1);
    const okHeight = (day.deployments / max) * (height - 10);
    const failHeight = (day.failures / max) * (height - 10);
    const label = `${formatDate(`${day.date}T12:00:00Z`)}: ${day.deployments} deployed${day.failures ? `, ${day.failures} failed` : ''}`;
    return `<g><title>${h(label)}</title><rect class="bar-bg" x="${x}" y="0" width="${w}" height="${height}" rx="3"/>${okHeight ? `<rect class="bar-ok" x="${x}" y="${(height - okHeight).toFixed(1)}" width="${w}" height="${okHeight.toFixed(1)}" rx="3"/>` : ''}${failHeight ? `<rect class="bar-fail" x="${x}" y="${(height - okHeight - failHeight).toFixed(1)}" width="${w}" height="${failHeight.toFixed(1)}" rx="3"/>` : ''}</g>`;
  }).join('');
  const total = dora.daily.reduce((sum, day) => sum + day.deployments, 0);
  const rows = dora.recent.map(run => `
          <tr>
            <td><a href="${h(safeUrl(run.url))}" rel="noopener">#${h(run.number)}</a></td>
            <td><span class="result result-${h(run.conclusion)}">${run.conclusion === 'success' ? 'Passed' : 'Failed'}</span></td>
            <td class="cell-message"><code>${h(run.sha)}</code> ${h(run.message)}</td>
            <td>${h(formatDuration(run.durationMs))}</td>
            <td>${time(run.startedAt)}</td>
          </tr>`).join('');
  return `
      <figure class="chart">
        <svg class="deploy-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Deployments per day over the last ${dora.daily.length} days: ${total} in total">${bars}</svg>
        <figcaption><span>${h(formatDate(`${dora.daily[0].date}T12:00:00Z`))}</span><span class="legend"><i class="dot dot-ok"></i>Deployed <i class="dot dot-fail"></i>Failed</span><span>Today</span></figcaption>
      </figure>
      ${dora.recent.length ? `<div class="table-wrap">
        <table class="runs">
          <caption class="sr-only">Recent pipeline runs on main</caption>
          <thead><tr><th scope="col">Run</th><th scope="col">Result</th><th scope="col">Commit</th><th scope="col">Took</th><th scope="col">Started</th></tr></thead>
          <tbody>${rows}
          </tbody>
        </table>
      </div>` : '<p class="slot-empty">No deployments in this period yet.</p>'}`;
}

export function renderReplay(lastRun) {
  if (!lastRun) return '<p class="slot-empty">The last pipeline run couldn’t be loaded in this build.</p>';
  const { run, jobs } = lastRun;
  const jobBlocks = jobs.map(job => {
    const total = Math.max(1, job.durationMs);
    const steps = job.steps.map(step => {
      const x = Math.min(100, (step.offsetMs / total) * 100);
      const w = Math.max(0.8, Math.min(100 - x, (step.durationMs / total) * 100));
      return `
            <li class="replay-step" data-duration="${Math.round(step.durationMs)}" data-conclusion="${h(step.conclusion)}">
              <span class="step-state" aria-hidden="true"></span>
              <span class="step-name">${h(step.name)}</span>
              <svg class="step-bar" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect class="step-track" x="0" y="3" width="100" height="4" rx="2"/><rect class="step-fill" x="${x.toFixed(2)}" y="2" width="${w.toFixed(2)}" height="6" rx="2"/></svg>
              <span class="step-time">${h(formatDuration(step.durationMs))}</span>
            </li>`;
    }).join('');
    return `
          <section class="replay-job">
            <h3>${h(job.name)} <span class="job-time">${h(formatDuration(job.durationMs))}</span></h3>
            <ol class="replay-steps">${steps}
            </ol>
          </section>`;
  }).join('');
  return `
      <div class="replay" data-replay>
        <div class="replay-head">
          <p>Run <a href="${h(safeUrl(run.html_url))}" rel="noopener">#${h(run.run_number)}</a> for <code>${h(run.head_sha.slice(0, 7))}</code> · ${h(run.conclusion === 'success' ? 'passed' : run.conclusion)} · ${time(run.updated_at)}</p>
          <button class="btn btn-secondary replay-button" type="button" data-replay-button hidden>▶ Replay run</button>
        </div>
        <div class="replay-jobs">${jobBlocks}
        </div>
        <pre class="replay-log" data-replay-log aria-live="polite" aria-label="Replay log" tabindex="0" hidden></pre>
      </div>`;
}

const STATE_TEXT = {
  operational: ['All systems operational', 'ok'],
  degraded: ['Partial outage', 'warn'],
  outage: ['Major outage', 'down'],
  unknown: ['Monitoring starts with the first hourly check', 'none']
};

function percent(value) {
  if (value === null || value === undefined) return '–';
  const pct = value * 100;
  return `${pct === 100 ? '100' : pct.toFixed(2)}%`;
}

export function renderStatusBanner(summary) {
  const [text, tone] = STATE_TEXT[summary.overall] || STATE_TEXT.unknown;
  return `
      <div class="status-banner tone-${tone}">
        <span class="status-dot" aria-hidden="true"></span>
        <div>
          <p class="status-headline">${h(text)}</p>
          <p class="status-meta">${summary.lastCheck ? `Last checked ${time(summary.lastCheck)} · ${plural(summary.checkCount, 'check')} in the last 90 days` : 'Checks run every hour from GitHub Actions.'}</p>
        </div>
      </div>`;
}

export function renderComponents(summary) {
  return summary.components.map(component => {
    const current = component.current;
    const state = !current ? ['No data yet', 'none'] : current.ok ? ['Operational', 'ok'] : ['Down', 'down'];
    const bars = component.days.map((day, index) => {
      const tone = day.uptime === null ? 'none' : day.uptime === 1 ? 'ok' : day.uptime >= 0.95 ? 'warn' : 'down';
      const label = `${formatDate(`${day.date}T12:00:00Z`)}: ${day.uptime === null ? 'no data' : `${percent(day.uptime)} uptime (${day.checks} checks)`}`;
      return `<rect class="day day-${tone}" x="${index * 4}" y="0" width="3" height="28" rx="1"><title>${h(label)}</title></rect>`;
    }).join('');
    const points = component.responseTimes.filter(point => point.ms !== null);
    const maxMs = Math.max(100, ...points.map(point => point.ms));
    const line = points.length < 2 ? '' : component.responseTimes.map((point, index, all) => point.ms === null ? null
      : `${((index / Math.max(1, all.length - 1)) * 100).toFixed(1)},${(30 - (point.ms / maxMs) * 28).toFixed(1)}`).filter(Boolean).join(' ');
    return `
      <article class="component">
        <div class="component-head">
          <div>
            <h3>${h(component.name)}</h3>
            <p class="component-desc">${h(component.description)}</p>
          </div>
          <span class="pill tone-${state[1]}">${h(state[0])}</span>
        </div>
        <svg class="uptime-bars" viewBox="0 0 360 28" preserveAspectRatio="none" role="img" aria-label="${h(`${component.name}: ${percent(component.uptime.quarter)} uptime over 90 days`)}">${bars}</svg>
        <div class="uptime-axis" aria-hidden="true"><span>90 days ago</span><span>Today</span></div>
        <dl class="uptime-stats">
          <div><dt>24 hours</dt><dd>${percent(component.uptime.day)}</dd></div>
          <div><dt>7 days</dt><dd>${percent(component.uptime.week)}</dd></div>
          <div><dt>30 days</dt><dd>${percent(component.uptime.month)}</dd></div>
          <div><dt>Response (24 h avg)</dt><dd>${component.averageMs === null ? '–' : `${component.averageMs} ms`}</dd></div>
        </dl>
        ${line ? `<svg class="sparkline" viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label="${h(`Response times for the last ${component.responseTimes.length} checks`)}"><polyline points="${line}"/></svg>` : ''}
      </article>`;
  }).join('');
}

export function renderIncidents(summary, notes = []) {
  const items = [
    ...notes.map(note => ({ time: note.date, html: `<h3>${h(note.title)}</h3>${note.paragraphs.map(text => `<p>${h(text)}</p>`).join('')}`, tone: 'note' })),
    ...summary.incidents.map(incident => ({
      time: incident.start,
      tone: incident.end ? 'resolved' : 'ongoing',
      html: `<h3>${h(incident.name)} ${incident.end ? 'was unavailable' : 'is unavailable'}</h3><p>${incident.end
        ? `From ${time(incident.start)} to ${time(incident.end)} (${h(formatDuration(Date.parse(incident.end) - Date.parse(incident.start)))}, ${incident.failedChecks} failed ${incident.failedChecks === 1 ? 'check' : 'checks'}).`
        : `Since ${time(incident.start)}. ${incident.failedChecks} failed ${incident.failedChecks === 1 ? 'check' : 'checks'} so far.`}</p>`
    }))
  ].sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).slice(0, 20);
  if (!items.length) return '<p class="slot-empty">No incidents in the last 90 days.</p>';
  return `<ol class="incidents">${items.map(item => `
        <li class="incident incident-${item.tone}">${item.html}</li>`).join('')}
      </ol>`;
}

export function renderChangelog(changelog, repoUrl) {
  if (!changelog.entries.length) return '<p class="slot-empty">No changes recorded yet.</p>';
  return `<ol class="changelog">${changelog.groups.map(group => `
        <li class="changelog-day">
          <h2><time datetime="${h(group.day)}">${h(formatDate(`${group.day}T12:00:00Z`))}</time></h2>
          <ul>${group.entries.map(entry => `
            <li class="change">
              <span class="change-type type-${h(entry.type)}">${h(entry.label)}</span>
              <span class="change-text">${h(entry.text)}</span>
              <a class="change-sha" href="${h(`${repoUrl}/commit/${entry.sha}`)}" rel="noopener" aria-label="${h(`Commit ${entry.sha.slice(0, 7)} on GitHub`)}"><code>${h(entry.sha.slice(0, 7))}</code></a>
            </li>`).join('')}
          </ul>
        </li>`).join('')}
      </ol>
      <p class="fine-print">${changelog.entries.length === changelog.total ? `All ${plural(changelog.total, 'commit')}` : `The latest ${changelog.entries.length} of ${changelog.total} commits`}, newest first. Merge commits are left out.</p>`;
}

export function renderFeed(changelog, { siteUrl, repoUrl }) {
  const items = changelog.entries.slice(0, 50).map(entry => `
    <item>
      <title>${escapeXml(`${entry.label}: ${entry.text}`)}</title>
      <link>${escapeXml(`${repoUrl}/commit/${entry.sha}`)}</link>
      <guid isPermaLink="false">${escapeXml(entry.sha)}</guid>
      <pubDate>${new Date(entry.date).toUTCString()}</pubDate>
      <category>${escapeXml(entry.label)}</category>
    </item>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>lovgren.dev changelog</title>
    <link>${escapeXml(`${siteUrl}/changelog/`)}</link>
    <atom:link href="${escapeXml(`${siteUrl}/changelog/feed.xml`)}" rel="self" type="application/rss+xml"/>
    <description>Every change to lovgren.dev, generated from the git history.</description>
    <language>en</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${items}
  </channel>
</rss>
`;
}

// Incident notes: status/incidents/YYYY-MM-DD-slug.md with a "# Title" first line and plain paragraphs.
export function parseIncidentNote(fileName, text) {
  const date = fileName.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!date) return null;
  const lines = String(text).replace(/\r/g, '').split('\n');
  const title = (lines.find(line => line.startsWith('# ')) || '# Incident').slice(2).trim();
  const paragraphs = lines.filter(line => !line.startsWith('#')).join('\n').split(/\n\s*\n/).map(part => part.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return { date: `${date}T12:00:00Z`, title, paragraphs };
}
