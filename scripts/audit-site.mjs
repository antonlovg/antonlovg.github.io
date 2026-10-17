// Audits a built site and records the results in its status.json:
//   - accessibility: axe-core (WCAG 2.1 A/AA) on every page,
//   - privacy: cookies set anywhere, and third-party requests on pages that promise none,
//   - Lighthouse category scores for the homepage (optional, --lighthouse).
// With --gate the script exits non-zero on any accessibility violation, cookie or third-party request,
// so the deploy is blocked. Drives Chrome over the DevTools protocol; the only dependency is axe-core.
// Usage: node scripts/audit-site.mjs _site --axe path/to/axe.min.js [--lighthouse] [--gate]
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const option = name => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const siteDir = path.resolve(args.find(arg => !arg.startsWith('--') && arg !== option('--axe')) || '_site');
const axePath = option('--axe') || 'node_modules/axe-core/axe.min.js';

// Pages audited for accessibility; the privacy pages must not contact any other host,
// except declared image hosts (the homepage shows game covers from Steam's image CDN).
const PAGES = ['/', '/privacy/', '/cookies/', '/404.html', '/wc2026/', '/games/', '/ops/', '/status/', '/changelog/'];
const NO_THIRD_PARTY = ['/', '/privacy/', '/cookies/', '/404.html', '/wc2026/', '/ops/', '/status/', '/changelog/'];
const ALLOWED_IMAGE_HOSTS = { '/': [/\.steamstatic\.com$/] };
const LIGHTHOUSE_VERSION = '12.2.1';

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };

function startServer(dir) {
  const server = createServer(async (request, response) => {
    const urlPath = decodeURIComponent(new URL(request.url, 'http://x').pathname);
    let file = path.join(dir, urlPath);
    if (!file.startsWith(dir)) { response.writeHead(403).end(); return; }
    if (urlPath.endsWith('/')) file = path.join(file, 'index.html');
    try {
      const body = await readFile(file);
      response.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(body);
    } catch {
      const notFound = await readFile(path.join(dir, '404.html')).catch(() => 'Not found');
      response.writeHead(404, { 'Content-Type': TYPES['.html'] }).end(notFound);
    }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function findChrome() {
  const candidates = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    'C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  const chrome = candidates.find(candidate => candidate && existsSync(candidate));
  if (!chrome) throw new Error('Chrome not found. Set CHROME_PATH.');
  return chrome;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function launchChrome(chromePath, profileDir) {
  const port = 9300 + Math.floor(Math.random() * 500);
  const chromeArgs = ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, '--no-first-run', '--no-default-browser-check', 'about:blank'];
  if (process.env.CI) chromeArgs.unshift('--no-sandbox');
  const child = spawn(chromePath, chromeArgs, { stdio: 'ignore' });
  for (let attempt = 0; attempt < 50; attempt++) {
    await sleep(200);
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = targets.find(target => target.type === 'page');
      if (page) return { child, wsUrl: page.webSocketDebuggerUrl };
    } catch { /* not ready yet */ }
  }
  child.kill();
  throw new Error('Chrome did not start.');
}

async function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  const listeners = new Set();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
    else listeners.forEach(listener => listener(message));
  });
  const send = (method, params = {}) => new Promise(resolve => { const id = ++nextId; pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => {
    const { result } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  return { send, evaluate, on: listener => listeners.add(listener), close: () => socket.close() };
}

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
  pageResults.push({ page, violations, external });
  console.log(`${page.padEnd(12)} axe: ${violations.length ? violations.map(v => `${v.id} x${v.nodes}`).join(', ') : 'no violations'} | other hosts: ${external.join(', ') || 'none'}`);
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

if (flag('--gate') && (violationCount || cookies.length || thirdPartyHosts.size)) {
  console.error('Audit gate failed: fix the issues above before deploying.');
  process.exit(1);
}
process.exit(0);
