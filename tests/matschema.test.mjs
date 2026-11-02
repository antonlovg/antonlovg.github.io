// The meal plan (/matschema/): every day hits the targets the page promises, the recipes only use
// foods that exist, leftovers follow a double-batch dinner, foods you don't eat disappear from the
// plan and the shopping list, swaps stick, the offline copy has every file, and the page stays unlisted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { WEEK_NUMBERS, GOALS, POOLS, makePlan, nutrition, startDate } from '../matschema/js/plan.js';
import { RECIPES } from '../matschema/js/recipes.js';
import { FOODS, SWAPS } from '../matschema/js/foods.js';

const root = new URL('../', import.meta.url);
const read = file => readFile(new URL(file, root), 'utf8');
const { days, shopping } = makePlan({ fit: false }); // the recipes as written

test('the plan runs from week 45 to the last day of the year, a week at a time', () => {
  assert.equal(days[0].date, '2026-11-02');
  assert.equal(days.at(-1).date, '2027-01-03');
  assert.equal(days.length, WEEK_NUMBERS.length * 7);
  assert.equal(startDate('2026-01-01'), '2026-11-02');
  assert.equal(startDate('2026-11-20'), '2026-11-20');
  assert.equal(startDate('2027-06-01'), '2027-01-03');
});

test('as written, every day has 2000–2200 kcal, at least 140 g protein and one Huel', () => {
  for (const day of days) {
    assert.ok(day.kcal >= 2000 && day.kcal <= 2200, `${day.date}: ${day.kcal} kcal`);
    assert.ok(day.protein >= 140, `${day.date}: ${day.protein} g protein`);
    assert.equal(day.meals.filter(meal => meal.recipe === 'huel').length, 1, `${day.date}: Huel`);
  }
});

// How far each day lands from the goals, as fractions: [median, worst].
const spread = (plan, goals, key) => {
  const errors = plan.days.map(day => Math.abs(day[key] - goals[key]) / goals[key]).sort((a, b) => a - b);
  return [errors[Math.floor(errors.length / 2)], errors.at(-1)];
};

test('portions, a protein shake and a little oil bring each day to the goals', () => {
  const plan = makePlan();
  const [kcal, kcalWorst] = spread(plan, GOALS, 'kcal');
  const [protein, proteinWorst] = spread(plan, GOALS, 'protein');
  assert.ok(kcal < 0.025 && kcalWorst < 0.1, `kcal: median ${kcal}, worst ${kcalWorst}`);
  assert.ok(protein < 0.02 && proteinWorst < 0.08, `protein: median ${protein}, worst ${proteinWorst}`);
  assert.ok(spread(plan, GOALS, 'carbs')[0] < 0.06 && spread(plan, GOALS, 'fat')[0] < 0.07, 'carbs and fat, median');
  for (const key of ['sugar', 'satfat']) assert.ok(plan.days.filter(day => day[key] > GOALS[key]).length <= 6 && plan.days.every(day => day[key] <= GOALS[key] * 1.2), key);
  for (const day of plan.days) {
    for (const meal of day.meals) assert.ok(meal.scale >= 0.7 && meal.scale <= 1.4, `${day.date} ${meal.id}: ${meal.scale}`);
    assert.equal(day.meals.find(meal => meal.recipe === 'huel').scale, 1, 'Huel comes in bottles');
    const shake = day.meals.find(meal => meal.id === 'shake');
    assert.ok(!shake || (shake.items[0][1] > 0 && shake.items[0][1] <= 80), `${day.date}: shake`);
  }
  checkLeftovers(plan);
});

test('other goals move the whole plan, and without protein powder there is no shake', () => {
  const goals = { kcal: 2600, protein: 190, carbs: 260, fat: 90, sugar: 60, satfat: 28 };
  const plan = makePlan({ goals });
  assert.ok(spread(plan, goals, 'kcal')[0] < 0.03, 'kcal');
  assert.ok(spread(plan, goals, 'protein')[0] < 0.03, 'protein');
  const without = makePlan({ exclude: ['whey'] });
  assert.ok(without.days.every(day => !day.meals.some(meal => meal.id === 'shake')));
  for (const week of WEEK_NUMBERS) for (const group of without.shopping(week)) assert.ok(!group.items.some(item => item.food === 'whey'));
});

// Every lunchbox comes from a dinner one to three days before, which is cooked for exactly the portions
// eaten of it: a double batch from yesterday, or a storkok (up to its size, oldest storkok first).
const checkLeftovers = plan => plan.days.forEach((day, index) => {
  const dinner = day.meals[3];
  const eaten = plan.days.filter(other => other.meals[1].leftover && other.meals[1].from === day.date).length;
  assert.equal(dinner.portions, 1 + eaten, `${day.date}: portions`);
  assert.equal(dinner.batch, eaten > 0, `${day.date}: batch`);
  assert.ok(dinner.portions <= (dinner.storkok || 2), `${day.date}: ${dinner.portions} portions of ${dinner.recipe}`);
  const lunch = day.meals[1];
  if (!lunch.leftover) return;
  const source = plan.day(lunch.from);
  const back = index - plan.days.indexOf(source);
  assert.ok(back >= 1 && back <= (source.meals[3].storkok ? 3 : 1), `${day.date}: lunch from ${lunch.from}`);
  assert.equal(lunch.recipe, source.meals[3].recipe, day.date);
  // Same dish and ingredients (each meal has its own portion size; the dinner may have a little extra oil).
  assert.deepEqual(lunch.items.map(([food]) => food), source.meals[3].items.filter(item => !item[2].includes('extra')).map(([food]) => food), day.date);
});

test('lunchboxes come from a double batch or a storkok, cooked for the portions eaten', () => {
  const plan = makePlan();
  checkLeftovers(plan);
  assert.ok(plan.days.some(day => day.meals[3].portions === 4), 'some week has a storkok');
  assert.ok(plan.days.filter(day => day.meals[3].portions === 2).length > 15, 'most weeks cook double batches');
});

test('a storkok feeds the next three lunches, and its shopping is in the week it is cooked', () => {
  const plan = makePlan({ swaps: { '2026-11-02:middag': 'ugnspasta' } });
  checkLeftovers(plan);
  assert.equal(plan.days[0].meals[3].portions, 4);
  assert.deepEqual(plan.days.slice(1, 4).map(day => day.meals[1].recipe), ['ugnspasta', 'ugnspasta', 'ugnspasta']);
  assert.ok(!plan.days[1].meals[3].batch && !plan.days[2].meals[3].batch, 'Tuesday and Wednesday cook single portions');
  const sunday = makePlan().day('2026-12-06'); // gulasch, eaten Monday–Wednesday of week 50
  assert.equal(sunday.meals[3].portions, 4);
  const bread = week => Object.fromEntries(makePlan().shopping(week).flatMap(group => group.items).map(item => [item.food, item.amount])).brod;
  assert.equal(bread(50), 'ca 200 g', 'week 50 buys 160 g of bread for its own meals, not the 240 g in the gulasch it eats');
});

test('recipes use known foods, swaps lead to known foods, and the numbers match the PDF for week 45', () => {
  for (const [id, recipe] of Object.entries(RECIPES)) {
    for (const [food, grams, text] of recipe.items) {
      assert.ok(FOODS[food], `${id}: ${food}`);
      assert.ok(grams > 0 && text, `${id}: ${food}`);
    }
  }
  for (const [food, swap] of Object.entries(SWAPS)) assert.ok(FOODS[food] && (swap === 'drop' || FOODS[swap]), food);
  for (const ids of Object.values(POOLS)) for (const id of ids) assert.ok(RECIPES[id], id);
  assert.deepEqual([nutrition('huel').kcal, nutrition('huel').protein], [400, 35]);
  const pdf = [2082, 2122, 2085, 2100, 2071, 2124, 2073];
  days.slice(0, 7).forEach((day, i) => assert.ok(Math.abs(day.kcal - pdf[i]) <= 60, `${day.date}: ${day.kcal} vs ${pdf[i]}`));
});

test('the shopping list adds up the week', () => {
  const items = Object.fromEntries(shopping(45).flatMap(group => group.items).map(item => [item.food, item.amount]));
  assert.equal(items.huel, '7 flaskor');
  assert.equal(items.kvarg, 'ca 1,2 kg');
  assert.equal(items.kyckling, 'ca 1,1 kg');
  assert.equal(items.tonfisk, '2 burkar');
});

test('foods you don\'t eat are swapped or their meals replaced, everywhere', () => {
  const exclude = ['kyckling', 'champinjon', 'tonfisk', 'mandlar', 'lok', 'mjolk'];
  const plan = makePlan({ exclude, fit: false });
  for (const day of plan.days) {
    for (const meal of day.meals) {
      for (const [food] of meal.items) assert.ok(!exclude.includes(food), `${day.date} ${meal.id}: ${meal.recipe} has ${food}`);
    }
    assert.ok(day.protein >= 90, `${day.date}: ${day.protein} g protein`);
    assert.ok(day.kcal > 1800 && day.kcal < 2500, `${day.date}: ${day.kcal} kcal`);
  }
  for (const week of WEEK_NUMBERS) for (const group of plan.shopping(week)) for (const item of group.items) assert.ok(!exclude.includes(item.food), `week ${week}: ${item.food}`);
  checkLeftovers(plan);
  const monday = plan.days[0].meals;
  assert.equal(monday[3].recipe, 'curry'); // kyckling → kalkon, lök tas bort
  assert.ok(monday[3].items.some(([food]) => food === 'kalkonfile'));
  assert.notEqual(monday[1].recipe, 'tonfiskpasta');
  assert.equal(monday[1].replaced.from, 'tonfiskpasta');
});

test('a swapped meal sticks, and the next day\'s lunchbox follows the swapped dinner', () => {
  const plan = makePlan({ swaps: { '2026-11-02:middag': 'lasagne', '2026-11-04:lunch': 'grekisk', '2026-11-05:middag': 'julbord' } });
  assert.equal(plan.days[0].meals[3].recipe, 'lasagne');
  assert.ok(plan.days[0].meals[3].swapped);
  assert.equal(plan.days[1].meals[1].recipe, 'lasagne');
  assert.ok(plan.days[1].meals[1].leftover);
  assert.equal(plan.days[2].meals[1].recipe, 'grekisk'); // the lunchbox swapped away…
  assert.ok(!plan.days[1].meals[3].batch); // …so Tuesday's dinner is a single batch
  assert.equal(plan.days[3].meals[3].recipe, 'bolognese', 'swaps outside the pool are ignored');
  checkLeftovers(plan);
});

test('the offline copy has every file the page loads', async () => {
  const sw = await read('matschema/sw.js');
  const files = [...sw.match(/const PRECACHE = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  for (const file of files) await assert.doesNotReject(stat(new URL(file === './' ? 'matschema/index.html' : `matschema/${file}`, root)), file);
  assert.ok(sw.includes("'/assets/fonts/manrope-latin-wght.woff2'"));
  const html = await read('matschema/index.html');
  for (const [, file] of html.matchAll(/(?:href|src)="((?!\/|#|https?:)[^"]+)"/g)) assert.ok(files.includes(file), `${file} is not in the offline copy`);
  for (const file of ['app.js', 'plan.js', 'recipes.js', 'foods.js', 'store.js']) assert.ok(files.includes(`js/${file}`), file);
});

test('the page is unlisted, strict, and its storage is on the cookie page', async () => {
  const html = await read('matschema/index.html');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /script-src 'self';/);
  assert.ok(!csp.includes('unsafe'));
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(await read('scripts/build-site.mjs'), /Disallow: \/matschema\//);
  for (const file of ['index.html', 'games/index.html', 'assets/site.js']) assert.ok(!(await read(file)).includes('/matschema/'), `${file} links to /matschema/`);
  const key = (await read('matschema/js/store.js')).match(/const KEY = '([^']+)'/)[1];
  const cache = (await read('matschema/sw.js')).match(/const CACHE = '([^']+)'/)[1];
  const cookies = await read('cookies/index.html');
  for (const name of [key, cache, '/matschema/sw.js']) assert.ok(cookies.includes(`<code>${name}</code>`), name);
});
