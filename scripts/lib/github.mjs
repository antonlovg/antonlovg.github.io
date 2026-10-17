// Minimal GitHub REST client for build-time data. Uses GITHUB_TOKEN when available (in Actions),
// otherwise anonymous requests, which work for a public repository within the rate limit.
const API = 'https://api.github.com';

export async function github(path, { token = process.env.GITHUB_TOKEN } = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'lovgren.dev-build',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`GitHub API ${path} returned ${response.status}`);
  return response.json();
}

// Recent runs of the pipeline workflow (newest first), up to `pages` × 100.
export async function pipelineRuns(repo, { pages = 3, workflow = 'pipeline.yml' } = {}) {
  const runs = [];
  for (let page = 1; page <= pages; page++) {
    const data = await github(`/repos/${repo}/actions/workflows/${workflow}/runs?per_page=100&page=${page}`);
    runs.push(...data.workflow_runs);
    if (data.workflow_runs.length < 100) break;
  }
  return runs;
}

// The most recent completed push run on main, with its jobs and steps (for the replay).
export async function lastCompletedRun(repo, runs) {
  const run = runs.find(item => item.status === 'completed' && item.event === 'push' && item.head_branch === 'main');
  if (!run) return null;
  const { jobs } = await github(`/repos/${repo}/actions/runs/${run.id}/jobs`);
  return { run, jobs };
}
