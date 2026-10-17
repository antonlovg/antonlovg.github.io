// Build-time HTML for the /ops, /status and /changelog pages and the changelog RSS feed.
// Every value from data goes through escapeHtml/escapeXml; links through safeUrl.
// Each renderer takes a language context { t, locale, lang } (English by default). Text that comes
// from git or GitHub (commit messages, step names) stays English and is marked lang="en".
import { escapeHtml as h, escapeXml, safeUrl, formatDuration, formatDate, formatDateTime } from './html.mjs';

const interpolate = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole)) : text);
export const ENGLISH = Object.freeze({ t: interpolate, locale: 'en-GB', lang: 'en' });

// Marks text for translation where it is defined; t() translates it where it is shown.
const N_ = text => text;
const METRIC_INFO = {
  frequency: N_('How often a change reaches production.'),
  lead: N_('Time from a commit to that commit running in production.'),
  failure: N_('Share of deployments whose pipeline failed.'),
  restore: N_('Time from a failed deployment to the next good one.')
};
// Text that dora.mjs, uptime.mjs and changelog.mjs produce in English, translated when shown.
const LEVELS = { Elite: N_('Elite'), High: N_('High'), Medium: N_('Medium'), Low: N_('Low') };
const TYPE_LABELS = { Feature: N_('Feature'), Fix: N_('Fix'), CI: N_('CI'), Docs: N_('Docs'), Design: N_('Design'), Chore: N_('Chore'), Library: N_('Library'), Update: N_('Update') };
N_('Website'); N_('The homepage, served by GitHub Pages.');
N_('Game library'); N_('The game library and its shared data file.');
N_('Steam lookup proxy'); N_('The Cloudflare Worker behind “Fetch Steam info”.');

const english = ctx => (ctx.lang === 'en' ? '' : ' lang="en"');

function levelBadge(level, { t }) {
  return level ? `<span class="level-badge level-${h(level.toLowerCase())}">${h(t(LEVELS[level] || level))}</span>` : `<span class="level-badge level-none">${h(t('Not enough data'))}</span>`;
}

function time(iso, ctx, text = formatDateTime(iso, ctx.locale)) {
  return iso ? `<time datetime="${h(iso)}" data-relative>${h(text)}</time>` : '–';
}

const duration = (ms, ctx) => formatDuration(ms, ctx);
const number = (value, ctx, digits = 1) => new Intl.NumberFormat(ctx.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);

export function renderDora(dora, ctx = ENGLISH) {
  const { t } = ctx;
  if (!dora) return `<p class="slot-empty">${h(t('DORA metrics couldn’t be calculated in this build.'))}</p>`;
  const f = dora.deploymentFrequency;
  const frequency = !dora.deployments ? '–' : f.perDay >= 1
    ? `${number(f.perDay, ctx)}<span class="metric-unit"> ${h(t('per day'))}</span>`
    : `${number(f.perWeek, ctx)}<span class="metric-unit"> ${h(t('per week'))}</span>`;
  const lead = dora.leadTime.ms === null ? '–' : h(duration(dora.leadTime.ms, ctx));
  const failure = dora.changeFailureRate.rate === null ? '–' : `${Math.round(dora.changeFailureRate.rate * 100)}<span class="metric-unit">${ctx.lang === 'en' ? '' : '&nbsp;'}%</span>`;
  const restore = dora.timeToRestore.ms === null ? h(dora.failedDeployments ? t('Not restored yet') : t('No failures')) : h(duration(dora.timeToRestore.ms, ctx));
  const restoreLevel = dora.timeToRestore.ms === null && !dora.failedDeployments && dora.deployments ? 'Elite' : dora.timeToRestore.level;
  const card = (title, value, level, note) => `
        <article class="metric">
          <h3>${h(t(title))}</h3>
          <p class="metric-value">${value}</p>
          ${levelBadge(level, ctx)}
          <p class="metric-note">${h(t(note))}</p>
        </article>`;
  const span = dora.spanDays < dora.windowDays ? ` ${t(dora.spanDays === 1 ? '(the pipeline has run for {n} day)' : '(the pipeline has run for {n} days)', { n: dora.spanDays })}` : '';
  const summary = t(dora.failedDeployments === 1 ? 'Last {days} days{span}: {ok} successful and {failed} failed deployment.' : 'Last {days} days{span}: {ok} successful and {failed} failed deployments.',
    { days: dora.windowDays, span, ok: dora.deployments, failed: dora.failedDeployments });
  return `
      <div class="metric-grid">${card(N_('Deployment frequency'), frequency, f.level, METRIC_INFO.frequency)}${card(N_('Lead time for changes'), lead, dora.leadTime.level, METRIC_INFO.lead)}${card(N_('Change failure rate'), failure, dora.changeFailureRate.level, METRIC_INFO.failure)}${card(N_('Time to restore'), restore, restoreLevel, METRIC_INFO.restore)}
      </div>
      <p class="fine-print">${h(summary)} ${t('Only pushes to <code>main</code> count; hourly status refreshes don’t.')}</p>`;
}

export function renderDeploys(dora, ctx = ENGLISH) {
  const { t, locale } = ctx;
  if (!dora) return `<p class="slot-empty">${h(t('Deployment history couldn’t be loaded in this build.'))}</p>`;
  const max = Math.max(1, ...dora.daily.map(day => day.deployments + day.failures));
  const width = 600;
  const height = 120;
  const barWidth = width / dora.daily.length;
  const bars = dora.daily.map((day, index) => {
    const x = (index * barWidth + 2).toFixed(1);
    const w = (barWidth - 4).toFixed(1);
    const okHeight = (day.deployments / max) * (height - 10);
    const failHeight = (day.failures / max) * (height - 10);
    const label = `${formatDate(`${day.date}T12:00:00Z`, locale)}: ${t('{n} deployed', { n: day.deployments })}${day.failures ? `, ${t('{n} failed', { n: day.failures })}` : ''}`;
    return `<g><title>${h(label)}</title><rect class="bar-bg" x="${x}" y="0" width="${w}" height="${height}" rx="3"/>${okHeight ? `<rect class="bar-ok" x="${x}" y="${(height - okHeight).toFixed(1)}" width="${w}" height="${okHeight.toFixed(1)}" rx="3"/>` : ''}${failHeight ? `<rect class="bar-fail" x="${x}" y="${(height - okHeight - failHeight).toFixed(1)}" width="${w}" height="${failHeight.toFixed(1)}" rx="3"/>` : ''}</g>`;
  }).join('');
  const total = dora.daily.reduce((sum, day) => sum + day.deployments, 0);
  const rows = dora.recent.map(run => `
          <tr>
            <td><a href="${h(safeUrl(run.url))}" rel="noopener">#${h(run.number)}</a></td>
            <td><span class="result result-${h(run.conclusion)}">${h(run.conclusion === 'success' ? t('Passed') : t('Failed'))}</span></td>
            <td class="cell-message"><code>${h(run.sha)}</code> <span${english(ctx)}>${h(run.message)}</span></td>
            <td>${h(duration(run.durationMs, ctx))}</td>
            <td>${time(run.startedAt, ctx)}</td>
          </tr>`).join('');
  return `
      <figure class="chart">
        <svg class="deploy-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${h(t('Deployments per day over the last {days} days: {n} in total', { days: dora.daily.length, n: total }))}">${bars}</svg>
        <figcaption><span>${h(formatDate(`${dora.daily[0].date}T12:00:00Z`, locale))}</span><span class="legend"><i class="dot dot-ok"></i>${h(t('Deployed'))} <i class="dot dot-fail"></i>${h(t('Failed'))}</span><span>${h(t('Today'))}</span></figcaption>
      </figure>
      ${dora.recent.length ? `<div class="table-wrap">
        <table class="runs">
          <caption class="sr-only">${h(t('Recent pipeline runs on main'))}</caption>
          <thead><tr><th scope="col">${h(t('Run'))}</th><th scope="col">${h(t('Result'))}</th><th scope="col">${h(t('Commit'))}</th><th scope="col">${h(t('Took'))}</th><th scope="col">${h(t('Started'))}</th></tr></thead>
          <tbody>${rows}
          </tbody>
        </table>
      </div>` : `<p class="slot-empty">${h(t('No deployments in this period yet.'))}</p>`}`;
}

export function renderReplay(lastRun, ctx = ENGLISH) {
  const { t } = ctx;
  if (!lastRun) return `<p class="slot-empty">${h(t('The last pipeline run couldn’t be loaded in this build.'))}</p>`;
  const { run, jobs } = lastRun;
  const jobBlocks = jobs.map(job => {
    const total = Math.max(1, job.durationMs);
    const steps = job.steps.map(step => {
      const x = Math.min(100, (step.offsetMs / total) * 100);
      const w = Math.max(0.8, Math.min(100 - x, (step.durationMs / total) * 100));
      return `
            <li class="replay-step" data-duration="${Math.round(step.durationMs)}" data-conclusion="${h(step.conclusion)}">
              <span class="step-state" aria-hidden="true"></span>
              <span class="step-name"${english(ctx)}>${h(step.name)}</span>
              <svg class="step-bar" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect class="step-track" x="0" y="3" width="100" height="4" rx="2"/><rect class="step-fill" x="${x.toFixed(2)}" y="2" width="${w.toFixed(2)}" height="6" rx="2"/></svg>
              <span class="step-time">${h(duration(step.durationMs, ctx))}</span>
            </li>`;
    }).join('');
    return `
          <section class="replay-job">
            <h3><span${english(ctx)}>${h(job.name)}</span> <span class="job-time">${h(duration(job.durationMs, ctx))}</span></h3>
            <ol class="replay-steps">${steps}
            </ol>
          </section>`;
  }).join('');
  const outcome = run.conclusion === 'success' ? t('passed') : run.conclusion === 'failure' ? t('failed') : run.conclusion;
  return `
      <div class="replay" data-replay>
        <div class="replay-head">
          <p>${t('Run {run} for {sha}', { run: `<a href="${h(safeUrl(run.html_url))}" rel="noopener">#${h(run.run_number)}</a>`, sha: `<code>${h(run.head_sha.slice(0, 7))}</code>` })} · ${h(outcome)} · ${time(run.updated_at, ctx)}</p>
          <button class="btn btn-secondary replay-button" type="button" data-replay-button hidden>▶ ${h(t('Replay run'))}</button>
        </div>
        <div class="replay-jobs">${jobBlocks}
        </div>
        <pre class="replay-log" data-replay-log aria-live="polite" aria-label="${h(t('Replay log'))}" tabindex="0" hidden></pre>
      </div>`;
}

const STATE_TEXT = {
  operational: [N_('All systems operational'), 'ok'],
  degraded: [N_('Partial outage'), 'warn'],
  outage: [N_('Major outage'), 'down'],
  unknown: [N_('Monitoring starts with the first hourly check'), 'none']
};

function percent(value, ctx) {
  if (value === null || value === undefined) return '–';
  const pct = value * 100;
  return `${pct === 100 ? '100' : number(pct, ctx, 2)}${ctx.lang === 'en' ? '' : ' '}%`;
}

export function renderStatusBanner(summary, ctx = ENGLISH) {
  const { t } = ctx;
  const [text, tone] = STATE_TEXT[summary.overall] || STATE_TEXT.unknown;
  const checks = t(summary.checkCount === 1 ? '{n} check in the last 90 days' : '{n} checks in the last 90 days', { n: summary.checkCount });
  return `
      <div class="status-banner tone-${tone}">
        <span class="status-dot" aria-hidden="true"></span>
        <div>
          <p class="status-headline">${h(t(text))}</p>
          <p class="status-meta">${summary.lastCheck ? `${h(t('Last checked'))} ${time(summary.lastCheck, ctx)} · ${h(checks)}` : h(t('Checks run every hour from GitHub Actions.'))}</p>
        </div>
      </div>`;
}

// Component names and descriptions come from uptime.mjs (English) and are translated here.
export function renderComponents(summary, ctx = ENGLISH) {
  const { t, locale } = ctx;
  return summary.components.map(component => {
    const current = component.current;
    const state = !current ? [t('No data yet'), 'none'] : current.ok ? [t('Operational'), 'ok'] : [t('Down'), 'down'];
    const name = t(component.name);
    const bars = component.days.map((day, index) => {
      const tone = day.uptime === null ? 'none' : day.uptime === 1 ? 'ok' : day.uptime >= 0.95 ? 'warn' : 'down';
      const label = `${formatDate(`${day.date}T12:00:00Z`, locale)}: ${day.uptime === null ? t('no data') : t('{pct} uptime ({n} checks)', { pct: percent(day.uptime, ctx), n: day.checks })}`;
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
            <h3>${h(name)}</h3>
            <p class="component-desc">${h(t(component.description))}</p>
          </div>
          <span class="pill tone-${state[1]}">${h(state[0])}</span>
        </div>
        <svg class="uptime-bars" viewBox="0 0 360 28" preserveAspectRatio="none" role="img" aria-label="${h(t('{name}: {pct} uptime over 90 days', { name, pct: percent(component.uptime.quarter, ctx) }))}">${bars}</svg>
        <div class="uptime-axis" aria-hidden="true"><span>${h(t('90 days ago'))}</span><span>${h(t('Today'))}</span></div>
        <dl class="uptime-stats">
          <div><dt>${h(t('24 hours'))}</dt><dd>${percent(component.uptime.day, ctx)}</dd></div>
          <div><dt>${h(t('7 days'))}</dt><dd>${percent(component.uptime.week, ctx)}</dd></div>
          <div><dt>${h(t('30 days'))}</dt><dd>${percent(component.uptime.month, ctx)}</dd></div>
          <div><dt>${h(t('Response (24 h avg)'))}</dt><dd>${component.averageMs === null ? '–' : `${component.averageMs} ms`}</dd></div>
        </dl>
        ${line ? `<svg class="sparkline" viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label="${h(t('Response times for the last {n} checks', { n: component.responseTimes.length }))}"><polyline points="${line}"/></svg>` : ''}
      </article>`;
  }).join('');
}

export function renderIncidents(summary, notes = [], ctx = ENGLISH) {
  const { t } = ctx;
  const failedChecks = n => t(n === 1 ? '{n} failed check' : '{n} failed checks', { n });
  const items = [
    ...notes.map(note => ({ time: note.date, html: `<h3${english(ctx)}>${h(note.title)}</h3>${note.paragraphs.map(text => `<p${english(ctx)}>${h(text)}</p>`).join('')}`, tone: 'note' })),
    ...summary.incidents.map(incident => {
      const name = t(incident.name);
      return {
        time: incident.start,
        tone: incident.end ? 'resolved' : 'ongoing',
        html: `<h3>${h(t(incident.end ? '{name} was unavailable' : '{name} is unavailable', { name }))}</h3><p>${incident.end
          ? t('From {start} to {end} ({duration}, {checks}).', { start: time(incident.start, ctx), end: time(incident.end, ctx), duration: h(duration(Date.parse(incident.end) - Date.parse(incident.start), ctx)), checks: h(failedChecks(incident.failedChecks)) })
          : t('Since {start}. {checks} so far.', { start: time(incident.start, ctx), checks: h(failedChecks(incident.failedChecks)) })}</p>`
      };
    })
  ].sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).slice(0, 20);
  if (!items.length) return `<p class="slot-empty">${h(t('No incidents in the last 90 days.'))}</p>`;
  return `<ol class="incidents">${items.map(item => `
        <li class="incident incident-${item.tone}">${item.html}</li>`).join('')}
      </ol>`;
}

export function renderChangelog(changelog, repoUrl, ctx = ENGLISH) {
  const { t, locale } = ctx;
  if (!changelog.entries.length) return `<p class="slot-empty">${h(t('No changes recorded yet.'))}</p>`;
  return `<ol class="changelog">${changelog.groups.map(group => `
        <li class="changelog-day">
          <h2><time datetime="${h(group.day)}">${h(formatDate(`${group.day}T12:00:00Z`, locale))}</time></h2>
          <ul>${group.entries.map(entry => `
            <li class="change">
              <span class="change-type type-${h(entry.type)}">${h(t(TYPE_LABELS[entry.label] || entry.label))}</span>
              <span class="change-text"${english(ctx)}>${h(entry.text)}</span>
              <a class="change-sha" href="${h(`${repoUrl}/commit/${entry.sha}`)}" rel="noopener" aria-label="${h(t('Commit {sha} on GitHub', { sha: entry.sha.slice(0, 7) }))}"><code>${h(entry.sha.slice(0, 7))}</code></a>
            </li>`).join('')}
          </ul>
        </li>`).join('')}
      </ol>
      <p class="fine-print">${h(changelog.entries.length === changelog.total
        ? t(changelog.total === 1 ? 'All {n} commit, newest first.' : 'All {n} commits, newest first.', { n: changelog.total })
        : t('The latest {n} of {total} commits, newest first.', { n: changelog.entries.length, total: changelog.total }))} ${h(t('Merge commits are left out.'))}</p>`;
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
