// Assembles the deployable site in _site/ (or the folder given as the first argument):
//   1. copies git-tracked files only, so ignored local files (.env, credentials) can never be deployed,
//   2. writes now-playing.json for the homepage (covers stay on Steam's image CDN),
//   3. writes a provisional status.json (commit + tests); audit-site.mjs adds the audit results.
// Usage: node scripts/build-site.mjs [_site]   (set TEST_REPORT to a TAP file to include test counts)
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.resolve(root, process.argv[2] || '_site');
const REPO = process.env.GITHUB_REPOSITORY || 'antonlovg/antonlovg.github.io';
const SERVER = process.env.GITHUB_SERVER_URL || 'https://github.com';
const NOT_DEPLOYED = [/^\.github\//, /^scripts\//, /(^|\/)README\.md$/, /(^|\/)\.gitignore$/, /^games\/tests\//, /^games\/steam-worker\//];
const MAX_NOW_PLAYING = 8;

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

async function copyTrackedFiles() {
  await rm(out, { recursive: true, force: true });
  const files = git('ls-files', '-z').split('\0').filter(Boolean).filter(file => !NOT_DEPLOYED.some(pattern => pattern.test(file)));
  for (const file of files) {
    await mkdir(path.dirname(path.join(out, file)), { recursive: true });
    await cp(path.join(root, file), path.join(out, file));
  }
  return files.length;
}

// Only Steam's image CDN is allowed for homepage covers (the CSP and audit allow the same host).
function steamCoverUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('.steamstatic.com') ? url.href : null;
  } catch {
    return null;
  }
}

async function buildNowPlaying() {
  const library = JSON.parse(await readFile(path.join(root, 'games', 'shared-library.json'), 'utf8'));
  const inProgress = library.games.filter(game => game.status === 'in-progress');
  const picked = [...inProgress].sort((a, b) => Number(b.priority) - Number(a.priority)).slice(0, MAX_NOW_PLAYING);
  const games = picked.map(game => ({
    title: game.title,
    genre: (game.genre || '').split(',')[0].trim(),
    players: game.players || '',
    steamUrl: game.steamUrl || '',
    cover: steamCoverUrl(game.coverUrl)
  }));
  const nowPlaying = { generatedAt: new Date().toISOString(), libraryUpdatedAt: library.exportedAt, total: inProgress.length, games };
  await writeFile(path.join(out, 'now-playing.json'), `${JSON.stringify(nowPlaying, null, 2)}\n`);
  return games;
}

async function readTestCounts() {
  if (!process.env.TEST_REPORT) return null;
  try {
    const report = await readFile(path.resolve(root, process.env.TEST_REPORT), 'utf8');
    const count = name => Number(report.match(new RegExp(`^# ${name} (\\d+)`, 'm'))?.[1] ?? NaN);
    const passed = count('pass');
    const failed = count('fail');
    return Number.isNaN(passed) ? null : { passed, failed: Number.isNaN(failed) ? 0 : failed };
  } catch {
    return null;
  }
}

async function writeProvisionalStatus() {
  const sha = process.env.GITHUB_SHA || git('rev-parse', 'HEAD');
  const status = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    commit: {
      sha,
      short: sha.slice(0, 7),
      message: git('log', '-1', '--format=%s', sha),
      committedAt: git('log', '-1', '--format=%cI', sha),
      url: `${SERVER}/${REPO}/commit/${sha}`
    },
    run: process.env.GITHUB_RUN_ID
      ? { number: Number(process.env.GITHUB_RUN_NUMBER), url: `${SERVER}/${REPO}/actions/runs/${process.env.GITHUB_RUN_ID}` }
      : null,
    workflowUrl: `${SERVER}/${REPO}/actions/workflows/pipeline.yml`,
    tests: await readTestCounts(),
    accessibility: null,
    privacy: null,
    lighthouse: null
  };
  await writeFile(path.join(out, 'status.json'), `${JSON.stringify(status, null, 2)}\n`);
  return status;
}

const fileCount = await copyTrackedFiles();
const nowPlaying = await buildNowPlaying();
const status = await writeProvisionalStatus();
console.log(`Built ${path.relative(root, out) || out}: ${fileCount} files, ${nowPlaying.length} now-playing games, commit ${status.commit.short}.`);
