// Fills the /ops, /status and /changelog pages in the built site with real data:
// git history, GitHub Actions runs and the hourly uptime checks. Any data source may be
// unavailable (offline, API limits, first run); the pages then show a friendly placeholder.
import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fillSlot } from './lib/html.mjs';
import { computeDora, summarizeJobs } from './lib/dora.mjs';
import { parseData, summarizeUptime, emptyData } from './lib/uptime.mjs';
import { parseGitLog, buildChangelog } from './lib/changelog.mjs';
import { pipelineRuns, lastCompletedRun } from './lib/github.mjs';
import { renderDora, renderDeploys, renderReplay, renderStatusBanner, renderComponents, renderIncidents, renderChangelog, renderFeed, parseIncidentNote, ENGLISH } from './lib/render.mjs';

const SITE_URL = 'https://lovgren.dev';

async function attempt(label, task, fallback = null) {
  try {
    return await task();
  } catch (error) {
    console.warn(`${label} unavailable: ${error.message}`);
    return fallback;
  }
}

async function fillPage(file, slots) {
  let html = await readFile(file, 'utf8');
  for (const [name, content] of Object.entries(slots)) html = fillSlot(html, name, content);
  await writeFile(file, html);
}

// languages: [{ dir, ctx }] where dir is the language folder in the built site ('' for English).
export async function buildOps({ root, out, repo, languages = [{ dir: '', ctx: ENGLISH }] }) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const repoUrl = `https://github.com/${repo}`;

  const commits = await attempt('git history', () => parseGitLog(git('log', '-n', '200', '--no-merges', '--format=%H%x1f%cI%x1f%s%x1e', 'HEAD')), []);
  const totalCommits = await attempt('commit count', () => Number(git('rev-list', '--count', '--no-merges', 'HEAD').trim()), commits.length);
  const changelog = buildChangelog(commits);
  changelog.total = totalCommits;

  const runs = await attempt('pipeline runs', () => pipelineRuns(repo), null);
  const dora = runs ? computeDora(runs) : null;
  const last = runs ? await attempt('last pipeline run', () => lastCompletedRun(repo, runs)) : null;
  const lastRun = last ? { run: last.run, jobs: summarizeJobs(last.jobs) } : null;

  const uptimeRaw = await attempt('uptime data', async () => process.env.UPTIME_FILE
    ? JSON.parse(await readFile(process.env.UPTIME_FILE, 'utf8'))
    : JSON.parse(git('show', 'origin/uptime-data:uptime.json')), emptyData());
  const uptime = summarizeUptime(parseData(uptimeRaw));

  const notes = await attempt('incident notes', async () => {
    const dir = path.join(root, 'status', 'incidents');
    const files = (await readdir(dir).catch(error => { if (error.code === 'ENOENT') return []; throw error; }))
      .filter(file => /^\d{4}-\d{2}-\d{2}.*\.md$/.test(file));
    return Promise.all(files.map(async file => parseIncidentNote(file, await readFile(path.join(dir, file), 'utf8'))));
  }, []);

  for (const { dir, ctx } of languages) {
    await fillPage(path.join(out, dir, 'ops', 'index.html'), {
      dora: renderDora(dora, ctx),
      deploys: renderDeploys(dora, ctx),
      replay: renderReplay(lastRun, ctx)
    });
    await fillPage(path.join(out, dir, 'status', 'index.html'), {
      banner: renderStatusBanner(uptime, ctx),
      components: renderComponents(uptime, ctx),
      incidents: renderIncidents(uptime, notes.filter(Boolean), ctx)
    });
    await fillPage(path.join(out, dir, 'changelog', 'index.html'), { changelog: renderChangelog(changelog, repoUrl, ctx) });
  }
  await writeFile(path.join(out, 'changelog', 'feed.xml'), renderFeed(changelog, { siteUrl: SITE_URL, repoUrl }));

  // Compact data for the terminal (replay, neofetch, status, log).
  const data = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    dora: dora && {
      windowDays: dora.windowDays, deployments: dora.deployments, failedDeployments: dora.failedDeployments,
      deploymentFrequency: dora.deploymentFrequency, leadTime: dora.leadTime, changeFailureRate: dora.changeFailureRate, timeToRestore: dora.timeToRestore
    },
    lastRun: lastRun && {
      number: lastRun.run.run_number, url: lastRun.run.html_url, conclusion: lastRun.run.conclusion,
      sha: lastRun.run.head_sha.slice(0, 7), message: (lastRun.run.head_commit?.message || '').split('\n')[0], finishedAt: lastRun.run.updated_at,
      jobs: lastRun.jobs
    },
    uptime: { overall: uptime.overall, lastCheck: uptime.lastCheck, components: uptime.components.map(({ id, name, current, uptime: u, averageMs }) => ({ id, name, current, uptime: u, averageMs })) },
    commits: totalCommits,
    changelog: changelog.entries.slice(0, 15).map(({ sha, date, label, text }) => ({ sha: sha.slice(0, 7), date, label, text }))
  };
  await mkdir(path.join(out, 'ops'), { recursive: true });
  await writeFile(path.join(out, 'ops', 'data.json'), `${JSON.stringify(data, null, 2)}\n`);
  return { dora: Boolean(dora), lastRun: Boolean(lastRun), uptimeChecks: uptime.checkCount, commits: commits.length };
}
