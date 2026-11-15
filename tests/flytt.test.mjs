// The moving list (/flytt/): a shopping list you fill in yourself. Links pasted after a name are split out and
// only http(s) links are kept, prices and totals add up, two devices merge without losing edits or bringing
// erased things back, old saved lists are read in, the offline copy has every file, and the page stays unlisted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { linkFrom, linkLabel, nameFromLink, ordered, priceFrom, safeLink, shoppingText, splitEntry, totals } from '../flytt/js/list.js';
import * as store from '../flytt/js/store.js';

const root = new URL('../', import.meta.url);
const read = file => readFile(new URL(file, root), 'utf8');
const IKEA = 'https://www.ikea.com/se/sv/p/fornuft-bestick-24-delar-rostfritt-stal-60196930/';

test('a link pasted after the name becomes the link, and a lone link names the thing', () => {
  assert.deepEqual(splitEntry(`Bestick ${IKEA}`), { name: 'Bestick', link: IKEA });
  assert.deepEqual(splitEntry(`Bestick: ${IKEA}`), { name: 'Bestick', link: IKEA });
  assert.deepEqual(splitEntry('Bestick (https://ikea.se/x).'), { name: 'Bestick', link: 'https://ikea.se/x' });
  assert.deepEqual(splitEntry('Lampa (vit) https://ikea.se/l'), { name: 'Lampa (vit)', link: 'https://ikea.se/l' });
  assert.deepEqual(splitEntry(IKEA), { name: 'Fornuft bestick 24 delar rostfritt stal', link: IKEA });
  assert.deepEqual(splitEntry('  Bestick  '), { name: 'Bestick', link: null });
  assert.equal(nameFromLink('https://www.clasohlson.com/se/Brandvarnare-Housegard/p/36-7896'), 'Brandvarnare Housegard');
  assert.equal(nameFromLink('https://ikea.se/'), 'Ikea.se');
  assert.equal(linkLabel(IKEA), 'ikea.com');
  for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://ikea.se/x', 'http://localhost/x', 'nej']) assert.equal(safeLink(bad), null, bad);
  assert.equal(splitEntry('javascript:alert(1)').link, null);
  // Länkfältet: utan https:// går också, tomt är ingen länk, och något annat är fel.
  assert.equal(linkFrom('ikea.se/bestick'), 'https://ikea.se/bestick');
  assert.equal(linkFrom('  '), null);
  assert.equal(linkFrom('inte en länk'), undefined);
  assert.equal(linkFrom('javascript:alert(1)'), undefined);
});

test('prices are read the Swedish way, and the totals add up', () => {
  assert.equal(priceFrom('199'), 199);
  assert.equal(priceFrom('49,90'), 49.9);
  assert.equal(priceFrom('1 299 kr'), 1299);
  assert.equal(priceFrom('1299:-'), 1299);
  assert.equal(priceFrom(''), null);
  assert.ok(Number.isNaN(priceFrom('gratis')));
  assert.ok(Number.isNaN(priceFrom('1,999')), 'at most two decimals');
  const item = (id, name, price, qty = 1, done = false, link = '') => ({ id, name, price, qty, done, link, note: '', made: Number(id.slice(1)) });
  const items = [item('i3', 'Gardinstänger', 149.5, 2), item('i1', 'Bestick', 199, 1, true, IKEA), item('i2', 'Skärbräda', null), item('i4', 'Lampa', 299, 1, false, 'https://ikea.se/l')];
  assert.deepEqual(totals(items), { total: 299 + 199 + 299, bought: 199, left: 299 + 299, unpriced: 1 });
  assert.deepEqual(ordered(items).map(entry => entry.id), ['i2', 'i3', 'i4', 'i1'], 'in the order added, bought last');
  assert.equal(shoppingText(items), '- Skärbräda\n- Gardinstänger (2 st), 299 kr\n- Lampa, 299 kr\n  https://ikea.se/l');
});

test('the list is cleaned, old lists are read in, and two devices merge by the newest change', () => {
  assert.deepEqual(store.clean(null), { items: {}, theme: 'light' }, 'a new list is empty');
  const value = store.clean({
    items: {
      a1: { name: 'Bestick', link: IKEA, price: 199, qty: 1, note: '', done: false, made: 1, at: 2 },
      a2: { name: 'Lampa', link: 'javascript:alert(1)', price: null, qty: 1, done: false, made: 1, at: 2 },
      a3: { name: 'x', price: -1, qty: 1, done: false, made: 1, at: 2 },
      a4: { name: 'x', price: null, qty: 1.5, done: false, made: 1, at: 2 },
      a5: { gone: true, at: 9 },
      'Bad id': { name: 'x', price: null, qty: 1, done: false, made: 1, at: 2 }
    },
    theme: 'dark'
  });
  assert.deepEqual(Object.keys(value.items), ['a1', 'a5']);
  assert.equal(value.theme, 'dark');
  assert.equal(store.clean({ theme: 'cute' }).theme, 'cute');
  assert.equal(store.clean({ theme: 'neon' }).theme, 'light');
  // Den förra versionen sparade under "buy", med rum, och hade en att göra-lista.
  const old = store.clean({ tasks: { m1: { title: 'x' } }, buy: { b1: { name: 'Lampa', room: 'Sovrum', qty: 2, price: 99.9, note: '', link: '', done: false, made: 1, at: 1 } } });
  assert.deepEqual(old.items, { b1: { name: 'Lampa', link: '', price: 99.9, qty: 2, note: '', done: false, made: 1, at: 1 } });
  assert.equal(old.tasks, undefined);

  // Den här enheten: köp a1 och sudda ut a2. Den andra: en äldre ändring av båda och en ny sak.
  store.forget();
  store.setItem('a1', { name: 'Bestick', link: IKEA, price: 199, qty: 1, note: '', done: true, made: 1 });
  store.setItem('a2', { name: 'Lampa', link: '', price: null, qty: 1, note: '', done: false, made: 2 });
  store.setItem('a2', null);
  store.merge({ items: {
    a1: { name: 'Gammalt namn', price: 199, qty: 1, done: false, made: 1, at: 1 },
    a2: { name: 'Lampa', price: null, qty: 1, done: false, made: 2, at: 1 },
    z9: { name: 'Packtejp', price: 29, qty: 3, done: false, made: 3, at: 2 }
  } });
  const now = Object.fromEntries(store.items().map(entry => [entry.id, entry]));
  assert.equal(now.a1.done, true, 'the newer change wins');
  assert.equal(now.a2, undefined, 'an erased thing does not come back');
  assert.equal(now.z9.qty, 3);
  store.setTheme('dark');
  assert.equal(store.theme(), 'dark');
  store.forget();
  assert.equal(store.theme(), 'light');
  assert.deepEqual(store.items(), []);
});

test('the offline copy has every file the page loads', async () => {
  const sw = await read('flytt/sw.js');
  const files = [...sw.match(/const PRECACHE = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  for (const file of files) await assert.doesNotReject(stat(new URL(file === './' ? 'flytt/index.html' : `flytt/${file}`, root)), file);
  const html = await read('flytt/index.html');
  for (const [, file] of html.matchAll(/(?:href|src)="((?!\/|#|https?:)[^"]+)"/g)) assert.ok(files.includes(file), `${file} is not in the offline copy`);
  const app = await read('flytt/js/app.js');
  for (const [, file] of app.matchAll(/from '\.\/([^']+)'/g)) assert.ok(files.includes(`js/${file}`), file);
  const css = await read('flytt/flytt.css');
  for (const [, file] of css.matchAll(/url\('([^']+\.woff2)'\)/g)) assert.ok(files.includes(file), `${file} is not in the offline copy`);
  for (const licence of ['OFL-caveat.txt', 'OFL-patrick-hand.txt']) await assert.doesNotReject(stat(new URL(`flytt/fonts/${licence}`, root)), licence);
});

test('the page is unlisted, strict, and its storage is on the cookie page', async () => {
  const html = await read('flytt/index.html');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /script-src 'self';/);
  assert.ok(!csp.includes('unsafe'));
  assert.ok(!/\sstyle="/.test(html), 'no inline styles (the CSP blocks them)');
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(await read('scripts/build-site.mjs'), /Disallow: \/flytt\//);
  for (const file of ['index.html', 'games/index.html', 'assets/site.js']) assert.ok(!(await read(file)).includes('/flytt/'), `${file} links to /flytt/`);
  const key = (await read('flytt/js/store.js')).match(/const KEY = '([^']+)'/)[1];
  const head = await read('flytt/js/theme.js');
  assert.ok(head.includes(`'${key}'`), 'theme.js reads the same storage');
  // Varje utseende har en knapp, ett eget tema i CSS och känns igen av theme.js.
  const css = await read('flytt/flytt.css');
  for (const look of store.THEMES) {
    assert.ok(html.includes(`data-look="${look}"`), `no button for ${look}`);
    if (look !== 'light') {
      assert.ok(css.includes(`:root[data-theme="${look}"] {`), `no colours for ${look}`);
      assert.ok(head.includes(`'${look}'`), `theme.js does not know ${look}`);
    }
  }
  const cache = (await read('flytt/sw.js')).match(/const CACHE = '([^']+)'/)[1];
  const cookies = await read('cookies/index.html');
  for (const name of [key, cache, '/flytt/sw.js']) assert.ok(cookies.includes(`<code>${name}</code>`), name);
});
