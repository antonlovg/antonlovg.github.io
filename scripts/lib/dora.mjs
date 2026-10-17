// DORA metrics from GitHub Actions pipeline runs.
// Only runs triggered by a push to main count as deployments; the hourly uptime redeploys
// (workflow_dispatch) and pull-request checks are ignored so they can't inflate the numbers.
// Performance levels follow the bands used in the DORA State of DevOps reports.

const HOUR = 3600e3;
const DAY = 24 * HOUR;

export const LEVELS = ['Elite', 'High', 'Medium', 'Low'];

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Normalises a run from the GitHub REST API (or an already-normalised run).
export function normalizeRun(run) {
  return {
    id: run.id,
    number: run.run_number ?? run.number,
    event: run.event,
    branch: run.head_branch ?? run.branch,
    status: run.status,
    conclusion: run.conclusion,
    sha: run.head_sha ?? run.sha,
    message: (run.head_commit?.message ?? run.message ?? '').split('\n')[0],
    committedAt: run.head_commit?.timestamp ?? run.committedAt ?? null,
    startedAt: run.run_started_at ?? run.created_at ?? run.startedAt,
    completedAt: run.updated_at ?? run.completedAt,
    url: run.html_url ?? run.url ?? ''
  };
}

export function isDeployment(run) {
  return run.event === 'push' && run.branch === 'main' && run.status === 'completed' && ['success', 'failure'].includes(run.conclusion);
}

export function frequencyLevel(perDay) {
  if (perDay >= 1) return 'Elite';
  if (perDay >= 1 / 7) return 'High';
  if (perDay >= 1 / 30) return 'Medium';
  return 'Low';
}

export function leadTimeLevel(ms) {
  if (ms === null) return null;
  if (ms < DAY) return 'Elite';
  if (ms < 7 * DAY) return 'High';
  if (ms < 30 * DAY) return 'Medium';
  return 'Low';
}

export function failureRateLevel(rate) {
  if (rate === null) return null;
  if (rate <= 0.05) return 'Elite';
  if (rate <= 0.10) return 'High';
  if (rate <= 0.15) return 'Medium';
  return 'Low';
}

export function restoreLevel(ms) {
  if (ms === null) return null;
  if (ms < HOUR) return 'Elite';
  if (ms < DAY) return 'High';
  if (ms < 7 * DAY) return 'Medium';
  return 'Low';
}

export function computeDora(rawRuns, { now = Date.now(), windowDays = 30 } = {}) {
  const since = now - windowDays * DAY;
  const runs = rawRuns.map(normalizeRun)
    .filter(isDeployment)
    .filter(run => Date.parse(run.startedAt) >= since && Date.parse(run.startedAt) <= now)
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const successes = runs.filter(run => run.conclusion === 'success');
  const failures = runs.filter(run => run.conclusion === 'failure');

  // Deployment frequency over the window (the window shrinks to the data if the pipeline is newer).
  const firstRun = runs.length ? Date.parse(runs[0].startedAt) : now;
  const spanDays = Math.max(1, Math.min(windowDays, (now - Math.min(firstRun, now)) / DAY));
  const perDay = successes.length / spanDays;

  // Lead time: from the commit to its successful deployment.
  const leadTimes = successes
    .filter(run => run.committedAt)
    .map(run => Date.parse(run.completedAt) - Date.parse(run.committedAt))
    .filter(ms => Number.isFinite(ms) && ms >= 0);
  const leadTime = median(leadTimes);

  const failureRate = runs.length ? failures.length / runs.length : null;

  // Time to restore: from a failed deployment to the next successful one.
  const restoreTimes = [];
  for (const failure of failures) {
    const fixed = successes.find(run => Date.parse(run.startedAt) > Date.parse(failure.startedAt));
    if (fixed) restoreTimes.push(Date.parse(fixed.completedAt) - Date.parse(failure.completedAt));
  }
  const timeToRestore = median(restoreTimes.filter(ms => ms >= 0));

  // Successful deployments per day, oldest first, for the chart.
  const daily = [];
  for (let day = windowDays - 1; day >= 0; day--) {
    const start = new Date(now - day * DAY);
    start.setUTCHours(0, 0, 0, 0);
    const end = start.getTime() + DAY;
    daily.push({
      date: start.toISOString().slice(0, 10),
      deployments: successes.filter(run => { const t = Date.parse(run.startedAt); return t >= start.getTime() && t < end; }).length,
      failures: failures.filter(run => { const t = Date.parse(run.startedAt); return t >= start.getTime() && t < end; }).length
    });
  }

  return {
    windowDays,
    spanDays: Math.round(spanDays * 10) / 10,
    deployments: successes.length,
    failedDeployments: failures.length,
    deploymentFrequency: { perDay, perWeek: perDay * 7, level: runs.length ? frequencyLevel(perDay) : null },
    leadTime: { ms: leadTime, level: leadTimeLevel(leadTime), samples: leadTimes.length },
    changeFailureRate: { rate: failureRate, level: failureRateLevel(failureRate) },
    timeToRestore: { ms: timeToRestore, level: restoreLevel(timeToRestore), incidents: failures.length },
    daily,
    recent: runs.slice(-10).reverse().map(run => ({
      number: run.number,
      conclusion: run.conclusion,
      sha: run.sha?.slice(0, 7),
      message: run.message,
      startedAt: run.startedAt,
      durationMs: Date.parse(run.completedAt) - Date.parse(run.startedAt),
      url: run.url
    }))
  };
}

// Steps of a completed run, for the "replay" timeline. Bookkeeping steps are left out.
export function summarizeJobs(jobs) {
  const skip = /^(Set up job|Complete job|Post Run )/;
  return jobs.map(job => ({
    name: job.name,
    conclusion: job.conclusion,
    durationMs: Date.parse(job.completed_at) - Date.parse(job.started_at),
    steps: (job.steps || []).filter(step => !skip.test(step.name)).map(step => ({
      name: step.name.replace(/^Run (actions\/[\w-]+)@[0-9a-f]{40}$/, 'Run $1').replace(/@[0-9a-f]{40}/, ''),
      conclusion: step.conclusion,
      durationMs: Math.max(0, Date.parse(step.completed_at) - Date.parse(step.started_at)),
      offsetMs: Math.max(0, Date.parse(step.started_at) - Date.parse(job.started_at))
    }))
  }));
}
