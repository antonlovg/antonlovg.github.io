// Changelog from git history. Commits are classified by Conventional Commit prefixes
// (feat:, fix:, ci: …) or by recognisable messages, e.g. the game library's publish commits.

const TYPES = [
  { type: 'feature', label: 'Feature', test: /^(feat|feature)(\([^)]*\))?!?:\s*|^feat\/\s*/i },
  { type: 'fix', label: 'Fix', test: /^fix(\([^)]*\))?!?:\s*/i },
  { type: 'ci', label: 'CI', test: /^(ci|build)(\([^)]*\))?!?:\s*/i },
  { type: 'docs', label: 'Docs', test: /^docs?(\([^)]*\))?!?:\s*/i },
  { type: 'style', label: 'Design', test: /^(style|design)(\([^)]*\))?!?:\s*/i },
  { type: 'chore', label: 'Chore', test: /^(chore|refactor|perf|test)(\([^)]*\))?!?:\s*/i }
];

export function classify(subject) {
  const text = String(subject || '').trim();
  for (const { type, label, test } of TYPES) {
    if (test.test(text)) return { type, label, text: text.replace(test, '') || text };
  }
  if (/^Update shared game library\b/i.test(text)) return { type: 'library', label: 'Library', text };
  if (/^(fix|fixed|fixes)\b/i.test(text)) return { type: 'fix', label: 'Fix', text };
  if (/\b(pipeline|workflow|actions?|deploy)\b/i.test(text)) return { type: 'ci', label: 'CI', text };
  return { type: 'change', label: 'Update', text };
}

// Parses `git log --format=%H%x1f%cI%x1f%s%x1e` output.
export function parseGitLog(output) {
  return String(output).split('\x1e').map(record => record.trim()).filter(Boolean).map(record => {
    const [sha, date, subject] = record.split('\x1f');
    return { sha, date, subject: subject ?? '' };
  }).filter(commit => /^[0-9a-f]{7,40}$/.test(commit.sha) && !Number.isNaN(Date.parse(commit.date)));
}

export function buildChangelog(commits, { limit = 200 } = {}) {
  const entries = commits.slice(0, limit).map(commit => ({ ...commit, ...classify(commit.subject) }));
  const groups = [];
  for (const entry of entries) {
    const day = entry.date.slice(0, 10);
    const group = groups.at(-1);
    if (group && group.day === day) group.entries.push(entry);
    else groups.push({ day, entries: [entry] });
  }
  return { total: commits.length, entries, groups };
}
