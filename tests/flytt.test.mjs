// The moving list (/flytt/): the template's dates follow the moving day, totals add up, two devices merge
// without losing edits or bringing deleted things back, the offline copy has every file, and the page stays unlisted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { PHASES, PHASE_DAYS, ROOMS, SUGGESTIONS, TEMPLATE, addDays, daysBetween, missingTemplate, phases, rooms, shoppingText, totals } from '../flytt/js/list.js';
import * as store from '../flytt/js/store.js';

const root = new URL('../', import.meta.url);
const read = file => readFile(new URL(file, root), 'utf8');

test('the template covers the whole move, each task in a phase, with unique ids', () => {
  assert.ok(TEMPLATE.length >= 20);
  assert.equal(new Set(TEMPLATE.map(task => task.id)).size, TEMPLATE.length);
  for (const task of TEMPLATE) {
    assert.ok(PHASE_DAYS.includes(task.days), task.title);
    assert.ok(task.title.length <= 120 && task.note.length <= 500, task.title);
    assert.ok(!/\s$|^\s|\.$/.test(task.title), `${task.title}: no trailing dot or spaces`);
  }
  for (const phase of PHASES) assert.ok(TEMPLATE.some(task => task.days === phase.days), `${phase.name} has tasks`);
  assert.ok(TEMPLATE.some(task => /Skatteverket/.test(task.title)));
});

test('phases get a due date counted from the moving day', () => {
  assert.equal(addDays('2026-12-01', -28), '2026-11-03');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-11-14', '2026-12-01'), 17);
  assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2, 'across the switch to summer time');
  const groups = phases(TEMPLATE, '2026-12-01');
  assert.deepEqual(groups.map(group => group.days), PHASE_DAYS);
  assert.equal(groups.find(group => group.days === -28).due, '2026-11-03');
  assert.equal(groups.find(group => group.days === 0).due, '2026-12-01');
  assert.ok(phases(TEMPLATE, null).every(group => group.due === null));
  // Inom en fas: i den ordning de lades till.
  const own = { id: 'x1', title: 'Egen', note: '', days: -28, made: Date.now(), done: false };
  assert.equal(phases([own, ...TEMPLATE], null).find(group => group.days === -28).tasks.at(-1).id, 'x1');
  assert.deepEqual(missingTemplate(TEMPLATE.slice(1)).map(task => task.id), ['m1']);
});

test('the shopping list adds up per room and in total, and copies as text', () => {
  const item = (id, name, room, qty, price, done = false) => ({ id, name, room, qty, price, done, note: '', made: Number(id.slice(1)) });
  const items = [item('i1', 'Gardinstänger', 'Vardagsrum', 2, 149.5), item('i2', 'Diskmedel', 'Kök', 1, 25, true), item('i3', 'Skärbräda', 'Kök', 1, null),
    item('i4', 'Duschdraperi', 'Badrum', 1, 199)];
  assert.deepEqual(totals(items), { total: 299 + 25 + 199, bought: 25, left: 299 + 199, unpriced: 1 });
  assert.deepEqual(rooms(items).map(group => [group.room, group.total]), [['Kök', 25], ['Badrum', 199], ['Vardagsrum', 299]]);
  assert.equal(shoppingText(items), 'Kök\n- Skärbräda\n\nBadrum\n- Duschdraperi\n\nVardagsrum\n- Gardinstänger (2 st)');
  for (const room of Object.keys(SUGGESTIONS)) assert.ok(ROOMS.includes(room), room);
});

test('stored lists are cleaned, and two devices merge by the newest change', () => {
  const fresh = store.clean(null);
  assert.equal(Object.keys(fresh.tasks).length, TEMPLATE.length, 'a new list starts as the template');
  const value = store.clean({
    date: '2026-12-01',
    tasks: { a1: { title: 'Ok', note: '', days: -7, done: false, made: 1, at: 5 }, a2: { title: 'Fel fas', note: '', days: -3, done: false, made: 1, at: 5 },
      a3: { gone: true, at: 9 }, 'Bad id': { title: 'x', days: 0, done: false, made: 1, at: 1 } },
    buy: { b1: { name: 'Lampa', room: 'Sovrum', qty: 2, price: 99.9, note: '', done: false, made: 1, at: 1 }, b2: { name: 'Lampa', room: 'Garage', qty: 1, price: null, done: false, made: 1, at: 1 },
      b3: { name: 'x', room: 'Kök', qty: 1.5, price: null, done: false, made: 1, at: 1 }, b4: { name: 'x', room: 'Kök', qty: 1, price: -1, done: false, made: 1, at: 1 } },
    hide: ['items', 'nope']
  });
  assert.deepEqual(Object.keys(value.tasks), ['a1', 'a3']);
  assert.deepEqual(Object.keys(value.buy), ['b1']);
  assert.deepEqual(value.hide, ['items']);
  assert.equal(value.date, '2026-12-01');
  assert.equal(store.clean({ date: '1 dec' }).date, undefined);

  // Den här enheten: bocka av m1 och ta bort m2. Den andra: ändra m1 tidigare, lägg till en sak och en flyttdag.
  store.forget();
  store.setTask('m1', { ...TEMPLATE[0], done: true });
  store.setTask('m2', null);
  const other = { date: '2026-12-01', tasks: { m1: { ...TEMPLATE[0], title: 'Gammal', at: 1 }, m2: { ...TEMPLATE[1], at: 1 } },
    buy: { z9: { name: 'Packtejp', room: 'Flytten', qty: 3, price: 29, note: '', done: false, made: 1, at: 2 } } };
  store.merge(other);
  assert.equal(store.tasks().find(task => task.id === 'm1').done, true, 'the newer change wins');
  assert.ok(!store.tasks().some(task => task.id === 'm2'), 'a deleted task does not come back');
  assert.equal(store.items()[0].name, 'Packtejp');
  assert.equal(store.date(), '2026-12-01');
  assert.equal(store.tasks().length, TEMPLATE.length - 1);
  store.forget();
});

test('the offline copy has every file the page loads', async () => {
  const sw = await read('flytt/sw.js');
  const files = [...sw.match(/const PRECACHE = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  for (const file of files) await assert.doesNotReject(stat(new URL(file === './' ? 'flytt/index.html' : `flytt/${file}`, root)), file);
  assert.ok(sw.includes("'/assets/fonts/manrope-latin-wght.woff2'"));
  const html = await read('flytt/index.html');
  for (const [, file] of html.matchAll(/(?:href|src)="((?!\/|#|https?:)[^"]+)"/g)) assert.ok(files.includes(file), `${file} is not in the offline copy`);
  const app = await read('flytt/js/app.js');
  for (const [, file] of app.matchAll(/from '\.\/([^']+)'/g)) assert.ok(files.includes(`js/${file}`), file);
});

test('the page is unlisted, strict, and its storage is on the cookie page', async () => {
  const html = await read('flytt/index.html');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /script-src 'self';/);
  assert.ok(!csp.includes('unsafe'));
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(await read('scripts/build-site.mjs'), /Disallow: \/flytt\//);
  for (const file of ['index.html', 'games/index.html', 'assets/site.js']) assert.ok(!(await read(file)).includes('/flytt/'), `${file} links to /flytt/`);
  const key = (await read('flytt/js/store.js')).match(/const KEY = '([^']+)'/)[1];
  const cache = (await read('flytt/sw.js')).match(/const CACHE = '([^']+)'/)[1];
  const cookies = await read('cookies/index.html');
  for (const name of [key, cache, '/flytt/sw.js']) assert.ok(cookies.includes(`<code>${name}</code>`), name);
});
