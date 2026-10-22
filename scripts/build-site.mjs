// Assembles the deployable site in _site/ (or the folder given as the first argument):
//   1. copies git-tracked files only, so ignored local files (.env, credentials) can never be deployed,
//   2. writes now-playing.json for the homepage (covers stay on Steam's image CDN),
//   3. builds every page in Swedish (/sv/) and Norwegian (/no/) from the English source (i18n/),
//      with hreflang links, social preview tags and the browser dictionaries,
//   4. fills /ops, /status and /changelog with DORA metrics, uptime and git history (build-ops.mjs),
//   5. writes sitemap.xml, robots.txt and the list of social preview cards for make-og.mjs,
//   6. writes a provisional status.json (commit + tests); audit-site.mjs adds the audit results.
// Usage: node scripts/build-site.mjs [_site]   (set TEST_REPORT to a TAP file to include test counts)
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildOps } from './build-ops.mjs';
import { translatePage, normalizeDictionary, alternateLinks, addDictionaryScript, dictionaryScript } from './lib/i18n.mjs';
import { escapeXml } from './lib/html.mjs';
import { ENGLISH } from './lib/render.mjs';
import i18nApi from '../assets/i18n.js';
import { CODES, uiEntries, pageEntries } from '../i18n/index.mjs';

const root = path.resolve(import.meta.dirname, '..');
const out = path.resolve(root, process.argv[2] || '_site');
const REPO = process.env.GITHUB_REPOSITORY || 'antonlovg/antonlovg.github.io';
const SERVER = process.env.GITHUB_SERVER_URL || 'https://github.com';
const NOT_DEPLOYED = [/^\.github\//, /^scripts\//, /^i18n\//, /(^|\/)README\.md$/, /(^|\/)\.gitignore$/, /^tests\//, /^games\/tests\//, /^games\/steam-worker\//, /^status\/incidents\//];
const MAX_NOW_PLAYING = 8;
const SITE_URL = 'https://lovgren.dev';
// Source file of every page in SiteI18n.PAGES; each is built in every language.
const PAGE_FILES = { '/': 'index.html', '/games/': 'games/index.html', '/ops/': 'ops/index.html', '/status/': 'status/index.html', '/changelog/': 'changelog/index.html', '/privacy/': 'privacy/index.html', '/cookies/': 'cookies/index.html', '/island/': 'island/index.html' };
// Social preview cards (scripts/make-og.mjs renders them): page → image name and eyebrow.
const CARDS = { '/': ['home', 'whoami'], '/games/': ['games', '~/games'], '/ops/': ['ops', '~/ops'], '/status/': ['status', '~/status'], '/changelog/': ['changelog', '~/changelog'],
  '/privacy/': ['privacy', '~/privacy'], '/cookies/': ['cookies', '~/cookies'], '/island/': ['island', '~/island'], '/wc2026/': ['wc2026', '~/wc2026'] };
const OG_LOCALES = { en: 'en_GB', sv: 'sv_SE', nb: 'nb_NO' };
const { LANGS, byCode, localize } = i18nApi;

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

// ---------- Languages, social previews and the sitemap ----------

const headValue = (html, pattern) => html.match(pattern)?.[1] ?? '';

// Replaces the canonical link and social tags with a full set for this page and language.
function setHeadMeta(html, { base, code, translated, cards }) {
  const [slug, eyebrow] = CARDS[base];
  const url = `${SITE_URL}${localize(base, code)}`;
  const title = headValue(html, /<title>([^<]*)<\/title>/).replace(/"/g, '&quot;');
  const description = headValue(html, /<meta name="description" content="([^"]*)">/);
  const image = `${SITE_URL}/og/${code}/${slug}.png`;
  cards.push({ file: `og/${code}/${slug}.png`, lang: code, page: base, eyebrow, title: title.split(' · ')[0], description, url: url.replace(/^https:\/\//, '') });
  const lines = [
    `<link rel="canonical" href="${url}">`,
    ...(translated ? alternateLinks(base, SITE_URL) : []),
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="lovgren.dev">',
    `<meta property="og:locale" content="${OG_LOCALES[code]}">`,
    ...(translated ? LANGS.filter(lang => lang.code !== code).map(lang => `<meta property="og:locale:alternate" content="${OG_LOCALES[lang.code]}">`) : []),
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:image" content="${image}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:image:alt" content="${title}">`,
    '<meta name="twitter:card" content="summary_large_image">'
  ];
  const cleaned = html.replace(/^[ \t]*<(?:link rel="canonical"|link rel="alternate" hreflang|meta property="og:|meta name="twitter:)[^>]*>\r?\n/gm, '');
  const anchor = cleaned.match(/^([ \t]*)<meta name="description"[^>]*>\r?\n/m);
  if (!anchor) throw new Error(`${base}: no <meta name="description">`);
  const at = anchor.index + anchor[0].length;
  return cleaned.slice(0, at) + lines.map(line => `${anchor[1]}${line}\n`).join('') + cleaned.slice(at);
}

async function buildLanguages() {
  const cards = [];
  const dictionaries = Object.fromEntries(CODES.map(code => [code, normalizeDictionary(pageEntries(code))]));
  const problems = [];
  for (const [base, file] of Object.entries(PAGE_FILES)) {
    const source = await readFile(path.join(root, file), 'utf8');
    await writeFile(path.join(out, file), setHeadMeta(source, { base, code: 'en', translated: true, cards }));
    for (const code of CODES) {
      const { html, missing } = translatePage(source, { code, dictionary: dictionaries[code], pagePath: `/${file}` });
      problems.push(...missing.map(text => `${code} ${base}: ${text}`));
      const target = path.join(out, byCode(code).prefix.slice(1), file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, setHeadMeta(addDictionaryScript(html, code), { base, code, translated: true, cards }));
    }
  }
  if (problems.length) throw new Error(`Missing translations (add them to i18n/):\n  ${problems.join('\n  ')}`);
  // The World Cup archive is English only.
  const worldCup = path.join(out, 'wc2026', 'index.html');
  await writeFile(worldCup, setHeadMeta(await readFile(worldCup, 'utf8'), { base: '/wc2026/', code: 'en', translated: false, cards }));
  await mkdir(path.join(out, 'assets', 'i18n'), { recursive: true });
  for (const code of CODES) await writeFile(path.join(out, 'assets', 'i18n', `${code}.js`), dictionaryScript(code, uiEntries(code)));
  await mkdir(path.join(out, 'og'), { recursive: true });
  await writeFile(path.join(out, 'og', 'cards.json'), `${JSON.stringify(cards, null, 2)}\n`);
  return { cards, dictionaries };
}

// Renderer context for one language: t() from the dictionary, numbers and dates in its locale.
function languageContext(code, dictionary) {
  if (code === 'en') return ENGLISH;
  const lang = byCode(code);
  return {
    lang: code,
    locale: lang.locale,
    t: (text, vars) => {
      if (!dictionary.has(text)) throw new Error(`Missing ${code} translation for renderer text: ${text}`);
      return i18nApi.interpolate(dictionary.get(text), vars);
    }
  };
}

async function writeSitemap() {
  const pages = [...Object.keys(PAGE_FILES).flatMap(base => LANGS.map(lang => ({ base, code: lang.code, translated: true }))), { base: '/wc2026/', code: 'en', translated: false }];
  const urls = pages.map(({ base, code, translated }) => `  <url>
    <loc>${escapeXml(`${SITE_URL}${localize(base, code)}`)}</loc>${translated ? LANGS.map(lang => `
    <xhtml:link rel="alternate" hreflang="${lang.code}" href="${escapeXml(`${SITE_URL}${localize(base, lang.code)}`)}"/>`).join('') : ''}
  </url>`).join('\n');
  await writeFile(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`);
  await writeFile(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /secret/\nDisallow: /os/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  return pages.length;
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
const { cards, dictionaries } = await buildLanguages();
const languages = LANGS.map(lang => ({ dir: lang.prefix.slice(1), ctx: languageContext(lang.code, dictionaries[lang.code]) }));
const ops = await buildOps({ root, out, repo: REPO, languages });
const sitemapUrls = await writeSitemap();
const status = await writeProvisionalStatus();
console.log(`Languages: ${LANGS.map(lang => lang.code).join(', ')} · ${Object.keys(PAGE_FILES).length} pages each · ${cards.length} social cards · ${sitemapUrls} sitemap URLs.`);
console.log(`Ops pages: DORA ${ops.dora ? 'yes' : 'no'}, last run ${ops.lastRun ? 'yes' : 'no'}, ${ops.uptimeChecks} uptime checks, ${ops.commits} commits.`);
console.log(`Built ${path.relative(root, out) || out}: ${fileCount} files, ${nowPlaying.length} now-playing games, commit ${status.commit.short}.`);
