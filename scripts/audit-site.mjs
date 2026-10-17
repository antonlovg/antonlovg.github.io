// Audits a built site and records the results in its status.json:
//   - accessibility: axe-core (WCAG 2.1 A/AA) on every page,
//   - privacy: cookies set anywhere, and third-party requests on pages that promise none,
//   - every page in every language (/sv/, /no/), and that each page's social preview image exists,
//   - Lighthouse category scores for the homepage (optional, --lighthouse).
// With --gate the script exits non-zero on any accessibility violation, cookie or third-party request,
// so the deploy is blocked. Drives Chrome over the DevTools protocol; the only dependency is axe-core.
// Usage: node scripts/audit-site.mjs _site --axe path/to/axe.min.js [--lighthouse] [--gate]
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer, findChrome, launchChrome, connect, sleep } from './lib/chrome.mjs';

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const option = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const siteDir = path.resolve(args.find(arg => !arg.startsWith('--') && arg !== option('--axe')) || '_site');
const axePath = option('--axe') || 'node_modules/axe-core/axe.min.js';

// Pages audited for accessibility; the privacy pages must not contact any other host,
// except declared image hosts (the homepage shows game covers from Steam's image CDN).
const BASE_PAGES = ['/', '/privacy/', '/cookies/', '/games/', '/ops/', '/status/', '/changelog/', '/island/'];
const LANG_PREFIXES = ['', '/sv', '/no'];
const PAGES = [...LANG_PREFIXES.flatMap(prefix => BASE_PAGES.map(page => `${prefix}${page}`)), '/404.html', '/sv/no-such-page', '/wc2026/'];
const NO_THIRD_PARTY = PAGES.filter(page => !/\/games\/$/.test(page));
const STEAM_IMAGES = [/\.steamstatic\.com$/];
const ALLOWED_IMAGE_HOSTS = { '/': STEAM_IMAGES, '/sv/': STEAM_IMAGES, '/no/': STEAM_IMAGES };
const LIGHTHOUSE_VERSION = '12.2.1';

function runLighthouse(url, chromePath) {
  return new Promise(async resolve => {
    const dir = await mkdtemp(path.join(tmpdir(), 'lh-'));
    const output = path.join(dir, 'report.json');
    const chromeFlags = `--headless=new${process.env.CI ? ' --no-sandbox' : ''}`;
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const child = spawn(npx, ['--yes', `lighthouse@${LIGHTHOUSE_VERSION}`, url, '--output=json', `--output-path=${output}`, '--quiet',
      `--chrome-flags=${chromeFlags}`, '--only-categories=performance,accessibility,best-practices,seo'],
    { env: { ...process.env, CHROME_PATH: chromePath }, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('exit', async code => {
      try {
        if (code !== 0) throw new Error(`exit ${code}`);
        const report = JSON.parse(await readFile(output, 'utf8'));
        const score = id => Math.round((report.categories[id]?.score ?? 0) * 100);
        resolve({ performance: score('performance'), accessibility: score('accessibility'), bestPractices: score('best-practices'), seo: score('seo') });
      } catch (error) {
        console.warn(`Lighthouse skipped: ${error.message}`);
        resolve(null);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });
}

const axeSource = await readFile(axePath, 'utf8');
const server = await startServer(siteDir);
const origin = `http://127.0.0.1:${server.address().port}`;
const chromePath = findChrome();
const profileDir = await mkdtemp(path.join(tmpdir(), 'audit-chrome-'));
const { child: chrome, wsUrl } = await launchChrome(chromePath, profileDir);
const browser = await connect(wsUrl);

let requests = [];
browser.on(message => { if (message.method === 'Network.requestWillBeSent') requests.push({ url: message.params.request.url, type: message.params.type }); });
await browser.send('Network.enable');
await browser.send('Page.enable');
await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

const pageResults = [];
const missingImages = [];
const thirdPartyHosts = new Set();
const allowedHosts = new Set();
for (const page of PAGES) {
  requests = [];
  await browser.send('Page.navigate', { url: origin + page });
  await sleep(2500);
  await browser.evaluate(axeSource);
  const violations = await browser.evaluate(`axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] })
    .then(result => result.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })))`);
  const externalRequests = requests.filter(({ url }) => /^https?:/.test(url) && !url.startsWith(origin));
  const external = [...new Set(externalRequests.map(({ url }) => new URL(url).host))];
  if (NO_THIRD_PARTY.includes(page)) {
    for (const { url, type } of externalRequests) {
      const host = new URL(url).host;
      const allowed = type === 'Image' && (ALLOWED_IMAGE_HOSTS[page] || []).some(pattern => pattern.test(host));
      if (allowed) allowedHosts.add(host);
      else thirdPartyHosts.add(`${host} (${page})`);
    }
  }
  const ogImage = await browser.evaluate(`document.querySelector('meta[property="og:image"]')?.content || ''`);
  if (ogImage.startsWith('https://lovgren.dev/') && !existsSync(path.join(siteDir, new URL(ogImage).pathname))) missingImages.push(`${page} → ${new URL(ogImage).pathname}`);
  pageResults.push({ page, violations, external });
  console.log(`${page.padEnd(20)} axe: ${violations.length ? violations.map(v => `${v.id} x${v.nodes}`).join(', ') : 'no violations'} | other hosts: ${external.join(', ') || 'none'}`);
}
const { cookies } = await browser.send('Network.getAllCookies').then(message => message.result);
browser.close();
chrome.kill();

const lighthouse = flag('--lighthouse') ? await runLighthouse(`${origin}/`, chromePath) : null;
server.close();
await rm(profileDir, { recursive: true, force: true }).catch(() => {});

const violationCount = pageResults.reduce((sum, result) => sum + result.violations.reduce((total, v) => total + v.nodes, 0), 0);
const statusPath = path.join(siteDir, 'status.json');
const status = JSON.parse(await readFile(statusPath, 'utf8'));
status.generatedAt = new Date().toISOString();
status.accessibility = { standard: 'WCAG 2.1 AA', tool: 'axe-core', pages: PAGES.length, violations: violationCount };
status.privacy = { cookies: cookies.length, thirdPartyRequests: thirdPartyHosts.size, pagesChecked: NO_THIRD_PARTY.length, allowedImageHosts: [...allowedHosts] };
status.lighthouse = lighthouse;
await writeFile(statusPath, `${JSON.stringify(status, null, 2)}\n`);

console.log(`\naccessibility violations: ${violationCount} | cookies: ${cookies.length} | unexpected third-party requests: ${thirdPartyHosts.size}${thirdPartyHosts.size ? ` (${[...thirdPartyHosts].join(', ')})` : ''} | allowed image hosts: ${[...allowedHosts].join(', ') || 'none'}`);
if (lighthouse) console.log(`lighthouse: ${JSON.stringify(lighthouse)}`);
if (missingImages.length) console.log(`missing social preview images: ${missingImages.join(', ')}`);

if (flag('--gate') && (violationCount || cookies.length || thirdPartyHosts.size || missingImages.length)) {
  console.error('Audit gate failed: fix the issues above before deploying.');
  process.exit(1);
}
process.exit(0);
