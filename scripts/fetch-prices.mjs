// Fetches current Steam prices (EUR, Swedish store) for every game in the shared library with a
// Steam link, and writes games/prices.json into the built site. Runs at build time, so visitors
// never contact Steam for prices. On any failure the build continues without prices.
// Usage: node scripts/fetch-prices.mjs _site
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.resolve(root, process.argv[2] || '_site');
const BATCH = 50;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function appId(steamUrl) {
  try {
    const url = new URL(steamUrl);
    if (url.protocol !== 'https:' || !/^(www\.)?store\.steampowered\.com$/i.test(url.hostname)) return null;
    return url.pathname.match(/^\/app\/(\d{1,10})(?:\/|$)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

async function fetchBatch(ids) {
  const url = new URL('https://store.steampowered.com/api/appdetails');
  url.searchParams.set('appids', ids.join(','));
  url.searchParams.set('filters', 'price_overview');
  url.searchParams.set('cc', 'se');
  const response = await fetch(url, { headers: { 'User-Agent': 'lovgren.dev build' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Steam returned ${response.status}`);
  return response.json();
}

try {
  const library = JSON.parse(await readFile(path.join(root, 'games', 'shared-library.json'), 'utf8'));
  const ids = [...new Set(library.games.map(game => appId(game.steamUrl)).filter(Boolean))];
  const prices = {};
  for (let index = 0; index < ids.length; index += BATCH) {
    const batch = ids.slice(index, index + BATCH);
    const result = await fetchBatch(batch);
    for (const id of batch) {
      const price = result?.[id]?.success ? result[id].data?.price_overview : null;
      // Only well-formed EUR prices are kept; free or unreleased games have none.
      if (price && price.currency === 'EUR' && Number.isInteger(price.final) && Number.isInteger(price.initial)) {
        prices[id] = { final: price.final, initial: price.initial, discount: Number.isInteger(price.discount_percent) ? price.discount_percent : 0 };
      }
    }
    if (index + BATCH < ids.length) await sleep(1500);
  }
  const onSale = Object.values(prices).filter(price => price.discount > 0).length;
  await writeFile(path.join(out, 'games', 'prices.json'), `${JSON.stringify({ schemaVersion: 1, fetchedAt: new Date().toISOString(), currency: 'EUR', store: 'se', prices })}\n`);
  console.log(`Steam prices: ${Object.keys(prices).length} of ${ids.length} games priced, ${onSale} on sale.`);
} catch (error) {
  console.warn(`Steam prices skipped: ${error.message}`);
}
