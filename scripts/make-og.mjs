// Renders the social preview card (Open Graph image, 1200×630) for every page in every language,
// with live numbers from the build: games and sales, DORA level, uptime, commits.
// Reads the card list that build-site.mjs writes to og/cards.json, renders each card in headless
// Chrome with the site's own fonts, and writes og/<lang>/<page>.png. Fails if any card is missing,
// because the pages already point at them.
// Usage: node scripts/make-og.mjs _site   (after build-site.mjs and fetch-prices.mjs)
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startServer, findChrome, launchChrome, connect } from './lib/chrome.mjs';
import { normalizeDictionary } from './lib/i18n.mjs';
import i18nApi from '../assets/i18n.js';
import { pageEntries } from '../i18n/index.mjs';

const root = path.resolve(import.meta.dirname, '..');
const out = path.resolve(root, process.argv[2] || '_site');
const N_ = text => text;

const readJson = async file => JSON.parse(await readFile(path.join(out, file), 'utf8'));
const optionalJson = file => readJson(file).catch(() => null);

function translator(code) {
  if (code === 'en') return (text, vars) => i18nApi.interpolate(text, vars);
  const dictionary = normalizeDictionary(pageEntries(code));
  return (text, vars) => {
    if (!dictionary.has(text)) throw new Error(`Missing ${code} translation: ${text}`);
    return i18nApi.interpolate(dictionary.get(text), vars);
  };
}

// The facts shown at the bottom of each card.
async function statsFor(card, t, data) {
  const { library, prices, ops } = data;
  const sale = lang => Object.values(prices[lang]?.prices || {}).filter(price => price.discount > 0).length;
  switch (card.page) {
    case '/':
      return [t(N_('Tested, audited and deployed by its own pipeline'))];
    case '/games/':
      return [t('{n} games', { n: library.games.length }), ...(prices[card.lang] ? [t('{n} on sale', { n: sale(card.lang) })] : [])];
    case '/ops/': {
      const level = ops?.dora?.deploymentFrequency?.level;
      return [...(level ? [t(N_('DORA level: {level}'), { level: t(level) })] : []), ...(ops?.dora ? [t(N_('{n} deploys in 30 days'), { n: ops.dora.deployments })] : [])];
    }
    case '/status/': {
      const text = { operational: N_('All systems operational'), degraded: N_('Partial outage'), outage: N_('Major outage') }[ops?.uptime?.overall];
      return text ? [t(text)] : [t(N_('Checked every hour'))];
    }
    case '/changelog/':
      return ops?.commits ? [t(N_('{n} commits'), { n: ops.commits })] : [];
    case '/privacy/':
    case '/cookies/':
      return [t(N_('No cookies')), t(N_('No trackers'))];
    case '/wc2026/':
      return [t(N_('Archive'))];
    default:
      return [];
  }
}

// One HTML page that draws a card from the JSON in its #hash. Only used during the build.
const TEMPLATE = `<!doctype html>
<meta charset="utf-8">
<style>
  @font-face { font-family: Manrope; src: url('/assets/fonts/manrope-latin-wght.woff2') format('woff2'); font-weight: 200 800; }
  @font-face { font-family: 'JetBrains Mono'; src: url('/assets/fonts/jetbrains-mono-latin-wght.woff2') format('woff2'); font-weight: 400 800; }
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body { position: relative; display: flex; flex-direction: column; padding: 64px 72px 56px; background: #0b0d12; color: #eef0f6; font-family: Manrope, sans-serif; }
  body::before { position: absolute; inset: 0; z-index: -1; content: '';
    background: radial-gradient(760px 420px at 88% -10%, rgb(84 88 224 / 42%), transparent 70%),
      radial-gradient(520px 320px at -6% 112%, rgb(84 88 224 / 20%), transparent 70%),
      radial-gradient(circle, rgb(238 240 246 / 9%) 1.2px, transparent 1.4px) 0 0 / 26px 26px; }
  .brand { display: flex; align-items: center; gap: 16px; font-size: 28px; font-weight: 800; letter-spacing: -0.01em; }
  .mono { display: grid; width: 60px; height: 60px; place-items: center; border-radius: 17px; background: #5458e0; color: #fff; font-size: 23px; letter-spacing: -0.03em; box-shadow: 0 14px 34px -12px #5458e0; }
  .eyebrow { margin: auto 0 18px; color: #a5a8ff; font: 600 30px 'JetBrains Mono', monospace; }
  .eyebrow::before { content: '$ '; color: #7f84d9; }
  h1 { margin: 0; font-size: 86px; font-weight: 800; line-height: 1; letter-spacing: -0.045em; text-wrap: balance; }
  h1.is-long { font-size: 70px; }
  p { display: -webkit-box; margin: 22px 0 0; max-width: 960px; overflow: hidden; color: #aab1c2; font-size: 31px; font-weight: 500; line-height: 1.38; -webkit-box-orient: vertical; -webkit-line-clamp: 3; text-wrap: pretty; }
  footer { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-top: 40px; }
  .stats { display: flex; flex-wrap: wrap; gap: 12px; }
  .stat { padding: 9px 18px; border: 1.5px solid #343a4a; border-radius: 999px; background: rgb(18 21 28 / 85%); color: #eef0f6; font: 600 22px 'JetBrains Mono', monospace; }
  .stat:first-child { border-color: #5458e0; color: #c9cbff; }
  .url { color: #959db1; font: 500 23px 'JetBrains Mono', monospace; white-space: nowrap; }
</style>
<div class="brand"><span class="mono">AL</span>lovgren.dev</div>
<div class="eyebrow" id="eyebrow"></div>
<h1 id="title"></h1>
<p id="description"></p>
<footer><div class="stats" id="stats"></div><div class="url" id="url"></div></footer>
<script>
  const card = JSON.parse(decodeURIComponent(location.hash.slice(1)));
  const text = (id, value) => { document.getElementById(id).textContent = value; };
  document.documentElement.lang = card.lang;
  text('eyebrow', card.eyebrow);
  text('title', card.title);
  document.getElementById('title').classList.toggle('is-long', card.title.length > 22);
  text('description', card.description);
  text('url', card.url);
  for (const stat of card.stats) { const span = document.createElement('span'); span.className = 'stat'; span.textContent = stat; document.getElementById('stats').append(span); }
  window.cardReady = document.fonts.ready.then(() => true);
</script>
`;

const decodeEntities = text => text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const cards = await readJson('og/cards.json');
const data = {
  library: await readJson('games/shared-library.json'),
  prices: { en: await optionalJson('games/prices.json'), sv: await optionalJson('games/prices.json'), nb: await optionalJson('games/prices-nok.json') },
  ops: await optionalJson('ops/data.json')
};

await writeFile(path.join(out, 'og', 'render.html'), TEMPLATE);
const server = await startServer(out);
const origin = `http://127.0.0.1:${server.address().port}`;
const profileDir = await mkdtemp(path.join(tmpdir(), 'og-chrome-'));
const { child: chrome, wsUrl } = await launchChrome(findChrome(), profileDir);
const browser = await connect(wsUrl);
let failed = 0;
try {
  await browser.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
  for (const card of cards) {
    try {
      const t = translator(card.lang);
      const title = decodeEntities(card.title);
      // "Anton Lövgren, DevOps engineer. …" → "DevOps engineer. …": the title is already on the card.
      const fullDescription = decodeEntities(card.description);
      const description = fullDescription.startsWith(`${title}, `) ? fullDescription.slice(title.length + 2) : fullDescription;
      const content = { ...card, title, description: description.charAt(0).toLocaleUpperCase(card.lang) + description.slice(1), stats: await statsFor(card, t, data) };
      await browser.send('Page.navigate', { url: `${origin}/og/render.html?${encodeURIComponent(card.file)}#${encodeURIComponent(JSON.stringify(content))}` });
      // Wait for the page and its fonts.
      for (let attempt = 0; attempt < 50; attempt++) {
        if (await browser.evaluate(`Boolean(window.cardReady) && window.cardReady`).catch(() => false)) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const { result } = await browser.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1200, height: 630, scale: 1 } });
      if (!result?.data) throw new Error('no screenshot');
      await mkdir(path.dirname(path.join(out, card.file)), { recursive: true });
      await writeFile(path.join(out, card.file), Buffer.from(result.data, 'base64'));
    } catch (error) {
      failed++;
      console.error(`Social card ${card.file} failed: ${error.message}`);
    }
  }
} finally {
  browser.close();
  chrome.kill();
  server.close();
  await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  await rm(path.join(out, 'og', 'render.html'), { force: true });
  await rm(path.join(out, 'og', 'cards.json'), { force: true });
}
console.log(`Social cards: ${cards.length - failed} of ${cards.length} rendered.`);
if (failed) process.exit(1);
