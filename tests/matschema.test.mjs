// The meal plan (/matschema/): every day hits the targets the page promises, the recipes only use
// foods that exist, leftovers follow a double-batch dinner, foods you don't eat disappear from the
// plan and the shopping list, swaps stick, the offline copy has every file, and the page stays unlisted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { WEEK_NUMBERS, GOALS, POOLS, CHOOSABLE, makePlan, nutrition, startDate, traits, weekLabel } from '../matschema/js/plan.js';
import { pack, unpack, fileText, readFile as readSyncFile } from '../matschema/js/sync.js';
import * as store from '../matschema/js/store.js';
import { RECIPES } from '../matschema/js/recipes.js';
import { ANIMAL, FOODS, SWAPS } from '../matschema/js/foods.js';

const root = new URL('../', import.meta.url);
const read = file => readFile(new URL(file, root), 'utf8');
const { days, shopping } = makePlan({ fit: false }); // the recipes as written

test('the plan runs from week 45 through 2027 (and always eight weeks ahead), a week at a time', () => {
  assert.equal(days[0].date, '2026-11-02');
  assert.ok(days.at(-1).date >= '2028-01-02' && new Date(`${days.at(-1).date}T12:00:00Z`).getUTCDay() === 0, days.at(-1).date);
  assert.equal(days.length, WEEK_NUMBERS.length * 7);
  assert.equal(startDate('2026-01-01'), '2026-11-02');
  assert.equal(startDate('2027-06-01'), '2027-06-01');
  assert.equal(startDate('2099-01-01'), days.at(-1).date);
  assert.deepEqual(weekLabel(53), { number: 53, year: 2026 });
  assert.deepEqual(weekLabel(54), { number: 1, year: 2027 });
  assert.equal(makePlan().day('2027-01-04').week, 54);
});

test('weeks after 53 follow the pattern, without sweets', () => {
  for (const week of WEEK_NUMBERS.filter(week => week > 53)) {
    const plan = days.filter(day => day.week === week);
    plan.forEach((day, d) => {
      assert.equal(day.meals[d < 5 ? 0 : 2].recipe, 'huel', `${day.date}: Huel`);
      assert.equal(day.meals[1].leftover, d >= 1 && d <= 4, `${day.date}: lunchbox`);
    });
    assert.equal(Boolean(plan[0].meals[3].storkok), week % 2 === 0, `week ${week}: storkok`);
    const dinners = plan.map(day => day.meals[3].recipe);
    assert.equal(new Set(dinners).size, 7, `week ${week}: ${dinners}`);
  }
  for (const id of ['choklad', 'julgodis', 'pepparkakor', 'lussekatt']) assert.ok(!RECIPES[id], id);
  for (const food of ['choklad', 'honung', 'pepparkakor', 'lussekatt']) assert.ok(!FOODS[food], food);
  const sugar = makePlan().days.map(day => day.sugar).sort((a, b) => a - b);
  assert.ok(sugar[Math.floor(sugar.length / 2)] < 0.9 * GOALS.sugar, `median sugar ${sugar[Math.floor(sugar.length / 2)]}`);
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
  for (const [food, swap] of Object.entries(SWAPS)) assert.ok(FOODS[food] && [].concat(swap).every(to => to === 'drop' || FOODS[to]), food);
  for (const ids of Object.values(POOLS)) for (const id of ids) assert.ok(RECIPES[id], id);
  assert.deepEqual([nutrition('huel').kcal, nutrition('huel').protein], [400, 35]);
  const pdf = [2082, 2122, 2085, 2100, 2071, 2124, 2073];
  days.slice(0, 7).forEach((day, i) => assert.ok(Math.abs(day.kcal - pdf[i]) <= 60, `${day.date}: ${day.kcal} vs ${pdf[i]}`));
});

test('ingredients get a kitchen measure next to the grams', async () => {
  const { measure, cookLine } = await import('../matschema/js/plan.js');
  const { PER_DL } = await import('../matschema/js/foods.js');
  for (const food of Object.keys(PER_DL)) assert.ok(FOODS[food], food);
  assert.equal(measure('havre', 70), '1¾ dl');
  assert.equal(measure('jordnot', 15), '1 msk');
  assert.equal(measure('olja', 4.5), '1 tsk');
  assert.equal(measure('chiafron', 10), '1 msk');
  assert.equal(measure('kakao', 1), '3 krm');
  assert.equal(measure('kyckling', 120), '1 filé');
  assert.equal(measure('oxfile', 120), null);
  assert.equal(cookLine('brod', 85), 'ca 2 skivor · 85 g fullkornsbröd');
  assert.equal(cookLine('havre', 49), 'ca 1¼ dl · 50 g havregryn');
  assert.equal(cookLine('mjolk', 140), '1½ dl mjölk 1,5 %');
  assert.equal(cookLine('agg', 120), '2 st ägg');
  // Recepten som de är skrivna får ett mått före när de börjar med gram.
  const porridge = makePlan({ fit: false, swaps: { '2026-11-02:frukost': 'havregrot' } }).day('2026-11-02').meals[0];
  assert.deepEqual(porridge.items.map(([, , text]) => text).slice(0, 3), ['70 g havregryn (1¾ dl)', '1 dl mjölk + 2 dl vatten', 'ca 1½ dl · 150 g kvarg (rörs ner efteråt)']);
});

test('every grocery item can be searched for in a store', async () => {
  const { STORES, searchTerm } = await import('../matschema/js/foods.js');
  for (const food of Object.keys(FOODS)) assert.match(searchTerm(food), /^[a-zåäöéèü ]+$/, food);
  assert.equal(searchTerm('notfars'), 'nötfärs');
  assert.equal(searchTerm('sojayoghurt'), 'sojayoghurt naturell');
  assert.equal(STORES.willys[1]('gul lök'), 'https://www.willys.se/sok?q=gul%20l%C3%B6k');
  assert.equal(store.clean({ shop: 'coop' }).shop, 'coop');
  assert.equal(store.clean({ shop: 'ica' }).shop, undefined);
});

test('the shopping list has a rough price for every item and the week', async () => {
  const { PRICES } = await import('../matschema/js/foods.js');
  for (const food of Object.keys(FOODS)) assert.ok(PRICES[food] > 0, food);
  for (const vegan of [false, true]) {
    const items = makePlan({ vegan }).shopping(46).flatMap(group => group.items);
    const total = items.reduce((sum, item) => sum + item.cost, 0);
    assert.ok(items.every(item => Number.isFinite(item.cost)));
    assert.ok(total > 500 && total < 1500, `${total} kr`);
  }
});

test('the evening before lists thawing, lunch boxes and overnight steps', async () => {
  const { prepFor } = await import('../matschema/js/plan.js');
  const plan = makePlan({ swaps: { '2026-11-07:frukost': 'overnight', '2026-11-07:middag': 'ugnslax' } });
  const tasks = prepFor(plan.day('2026-11-07'));
  assert.ok(tasks.some(task => /^Overnight oats .* till frukosten: .*kvällen innan/.test(task)), tasks.join(' | '));
  assert.ok(tasks.some(task => /^Lägg \d+ g laxfilé i kylen att tina, till middagen\.$/.test(task)), tasks.join(' | '));
  assert.ok(prepFor(plan.day('2026-11-03')).some(task => task.startsWith('Packa en matlåda till lunchen')));
});

test('a meal eaten elsewhere is counted, and the rest of the day is refitted', () => {
  const outside = { '2026-11-04:middag': { label: 'Pizza', kcal: 1000, protein: 40 } };
  const before = makePlan().day('2026-11-04');
  const plan = makePlan({ outside, eaten: { '2026-11-04': ['lunch'] } });
  const day = plan.day('2026-11-04');
  const dinner = day.meals[3];
  assert.equal(dinner.outside, true);
  assert.equal(dinner.title, 'Pizza');
  assert.equal(dinner.kcal, 1000);
  assert.equal(dinner.items.length, 0);
  assert.equal(dinner.instead.recipe, before.meals[3].recipe);
  // Det ätna behåller sin portion, resten krymper.
  assert.equal(day.meals[1].scale, before.meals[1].scale);
  assert.ok(day.meals.filter(meal => !meal.outside && meal.recipe !== 'huel' && meal.id !== 'lunch' && meal.id !== 'shake').every(meal => meal.scale <= 0.75));
  // Ingen matlåda från pizzan, och inget att handla för den.
  assert.equal(plan.day('2026-11-05').meals[1].leftover, false);
  assert.equal(day.kcal, day.meals.reduce((sum, meal) => sum + meal.kcal, 0));
  // En matlåda du inte äter gör gårdagens middag till en enkel sats.
  const skipped = makePlan({ outside: { '2026-11-04:lunch': { label: 'Lunch ute', kcal: 750, protein: 35 } } });
  assert.equal(skipped.day('2026-11-03').meals[3].portions, 1);
  assert.equal(makePlan().day('2026-11-03').meals[3].portions, 2);
});

test('own recipes can be chosen and are removed again', async () => {
  const { CHOOSABLE: choosable } = await import('../matschema/js/plan.js');
  const own = { egen_abc: { name: 'Min bowl', slot: 'middag', items: [['kyckling', 150], ['ris', 80], ['nope', 10]], how: 'Koka riset.' } };
  const plan = makePlan({ own, swaps: { '2026-11-04:middag': 'egen_abc' }, fit: false });
  const dinner = plan.day('2026-11-04').meals[3];
  assert.equal(dinner.title, 'Min bowl');
  assert.equal(dinner.items.length, 2);
  assert.ok(POOLS.lunch.includes('egen_abc') && choosable.includes('egen_abc'));
  assert.ok(plan.shopping(46).flatMap(group => group.items).some(item => item.food === 'kyckling'));
  makePlan();
  assert.ok(!POOLS.middag.includes('egen_abc') && !choosable.includes('egen_abc') && !RECIPES.egen_abc);
});

test('the weight trend suggests a new kcal goal', async () => {
  const { weightTrend } = await import('../matschema/js/plan.js');
  const weights = { '2026-10-06': 85, '2026-10-13': 84.7, '2026-10-20': 84.4, '2026-10-27': 84.1, '2026-11-03': 83.8 };
  assert.equal(weightTrend({ '2026-11-01': 80, '2026-11-02': 80 }, -0.5, 2228, '2026-11-03'), null);
  assert.deepEqual(weightTrend(weights, -0.5, 2228, '2026-11-03'), { rate: -0.3, change: -220, kcal: 2008 });
  assert.deepEqual(weightTrend(weights, -0.25, 2228, '2026-11-03'), { rate: -0.3, change: 0, kcal: 2228 });
  assert.equal(weightTrend(weights, 0.25, 2228, '2026-11-03').change, 300);
  assert.equal(weightTrend(weights, null, 2228, '2026-11-03').change, 0);
});

test('own recipes, meals eaten elsewhere and weights are cleaned and merged', () => {
  const value = store.clean({
    own: { egen_a1: { name: 'Bowl', slot: 'middag', items: [['kyckling', 150]] }, egen_bad: { name: '', slot: 'middag', items: [['kyckling', 1]] }, other: { name: 'x', slot: 'lunch', items: [['agg', 60]] } },
    outside: { '2026-11-04:middag': { label: 'Pizza', kcal: 1000, protein: 40 }, '2026-11-04:fika': { label: 'x', kcal: 1, protein: 1 }, '2026-11-05:lunch': { label: 'x', kcal: 9000, protein: 1 } },
    weights: { '2026-11-03': 82.4, '2026-11-04': 12, nope: 80 },
    weightGoal: -0.5
  });
  assert.deepEqual(Object.keys(value.own), ['egen_a1']);
  assert.deepEqual(Object.keys(value.outside), ['2026-11-04:middag']);
  assert.deepEqual(value.weights, { '2026-11-03': 82.4 });
  assert.equal(value.weightGoal, -0.5);
  assert.equal(store.clean({ weightGoal: 3 }).weightGoal, undefined);
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

test('vegan: nothing from animals, dairy swapped, a vegan shake, storkok kept, and the goals still met', () => {
  const plan = makePlan({ vegan: true });
  for (const day of plan.days) {
    for (const meal of day.meals) for (const [food] of meal.items) assert.ok(!ANIMAL.includes(food), `${day.date} ${meal.id}: ${meal.recipe} has ${food}`);
    const shake = day.meals.find(meal => meal.id === 'shake');
    assert.ok(!shake || shake.items[0][0] === 'veganprotein', `${day.date}: shake`);
  }
  for (const week of WEEK_NUMBERS) for (const group of plan.shopping(week)) for (const item of group.items) assert.ok(!ANIMAL.includes(item.food), `week ${week}: ${item.food}`);
  checkLeftovers(plan);
  assert.ok(plan.days.filter(day => day.meals[3].storkok).length >= 4, 'storkok');
  const [kcal, kcalWorst] = spread(plan, GOALS, 'kcal');
  const [protein, proteinWorst] = spread(plan, GOALS, 'protein');
  assert.ok(kcal < 0.03 && kcalWorst < 0.12, `kcal: median ${kcal}, worst ${kcalWorst}`);
  assert.ok(protein < 0.04 && proteinWorst < 0.1, `protein: median ${protein}, worst ${proteinWorst}`);
  // Mejeri byts i recepten (overnight oats blir med sojayoghurt och sojadryck), kött ger veganska rätter.
  const overnight = plan.days.flatMap(day => day.meals).find(meal => meal.recipe === 'overnight');
  assert.match(overnight.title, /sojayoghurt/);
  assert.ok(overnight.vegan && overnight.items.some(([food]) => food === 'sojadryck'));
  const monday = plan.days[0].meals[3];
  assert.equal(monday.replaced.from, 'curry');
  assert.ok(monday.replaced.vegan);
  // Ditt eget bortval räknas inte som veganskt, och utan proteinpulver blir det ingen shake.
  const mine = makePlan({ vegan: true, exclude: ['tofu', 'whey'] });
  assert.ok(mine.days.every(day => day.meals.every(meal => meal.id !== 'shake' && meal.items.every(([food]) => food !== 'tofu'))));
  assert.ok(mine.days.flatMap(day => day.meals).some(meal => meal.changes.includes('Vegobitar av soja (kylda) i stället för tofu, fast') && !meal.vegan));
  // Utan vegan är planen som förut.
  assert.deepEqual(makePlan().days.map(day => day.meals.map(meal => meal.recipe)), makePlan({ vegan: false }).days.map(day => day.meals.map(meal => meal.recipe)));
});

test('never again replaces a dish from that day; a favourite comes more often from the week after', () => {
  const base = makePlan();
  const ratings = { tacos: { r: 1, at: '2026-11-04' }, curry: { r: -1, at: '2026-11-10' }, chili: { r: 0, at: '2026-11-04' } };
  const plan = makePlan({ ratings });
  const count = (p, id, from, to = '9999') => p.days.filter(day => day.date >= from && day.date < to).flatMap(day => day.meals).filter(meal => meal.recipe === id && !meal.leftover).length;
  assert.equal(count(plan, 'curry', '2026-11-10'), 0);
  assert.equal(count(plan, 'curry', '2026-11-02', '2026-11-10'), count(base, 'curry', '2026-11-02', '2026-11-10'), 'earlier days stay');
  assert.ok(plan.days.flatMap(day => day.meals).some(meal => meal.replaced?.disliked && meal.replaced.from === 'curry'));
  assert.deepEqual(plan.week(45).map(day => day.meals.map(meal => meal.recipe)), base.week(45).map(day => day.meals.map(meal => meal.recipe)), 'the week already shopped for stays');
  assert.ok(count(plan, 'tacos', '2026-11-09') > count(base, 'tacos', '2026-11-09') * 2, 'tacos more often');
  for (const week of WEEK_NUMBERS) assert.ok(count(plan, 'tacos', plan.week(week)[0].date, plan.week(week)[6].date + 'z') <= 2, `week ${week}`);
  const recipes = p => p.days.map(day => day.meals.map(meal => meal.recipe).join(' '));
  assert.deepEqual(recipes(makePlan({ ratings: { chili: { r: 0, at: '2026-11-04' } } })), recipes(base), 'an undone rating does nothing');
  checkLeftovers(plan);
});

test('sync: a link or file carries everything, and reading it in merges', async () => {
  const value = { eaten: { '2026-11-02': ['frukost'] }, swaps: { '2026-11-03:middag': 'lasagne' }, vegan: true, goals: { kcal: 2400 }, ratings: { tacos: { r: 1, at: '2026-11-04' } } };
  const code = await pack(value);
  assert.match(code, /^1\.[\w-]+$/);
  assert.deepEqual(await unpack(code), value);
  assert.deepEqual(readSyncFile(fileText(value, '2026-11-05')), value);
  assert.deepEqual(store.clean({ ...value, evil: '<script>', eaten: { x: [1, 'a'] }, ratings: { a: { r: 5, at: 'x' } } }),
    { eaten: { x: ['a'] }, have: {}, hide: false, exclude: [], swaps: value.swaps, ratings: {}, fixed: {}, own: {}, outside: {}, weights: {}, goals: { kcal: 2400 }, vegan: true });
  assert.deepEqual(store.clean({ fixed: { frukost: { recipe: 'havregrot', days: 'vardag', at: '2026-11-04' }, middag: { recipe: 'tacos', days: 'alla', at: '2026-11-04' }, lunch: { recipe: 'x', days: 'ibland', at: '2026-11-04' } } }).fixed,
    { frukost: { recipe: 'havregrot', days: 'vardag', at: '2026-11-04' } }, 'only meals that can be fixed, in the right shape');
  store.forget();
  store.toggleEaten('2026-11-02', 'lunch');
  store.setRating('tacos', -1, '2026-11-06');
  store.setRating('curry', 1, '2026-11-01');
  store.merge(value);
  assert.deepEqual(store.snapshot().eaten['2026-11-02'].sort(), ['frukost', 'lunch']);
  assert.equal(store.rating('tacos'), -1, 'the newer rating wins');
  assert.equal(store.rating('curry'), 1);
  assert.equal(store.choices().vegan, true);
  assert.deepEqual(store.choices().goals, { kcal: 2400 });
  store.forget();
});

test('a swapped meal sticks, and the next day\'s lunchbox follows the swapped dinner', () => {
  const plan = makePlan({ swaps: { '2026-11-02:middag': 'lasagne', '2026-11-04:lunch': 'grekisk', '2026-11-05:middag': 'julbord' } });
  assert.equal(plan.days[0].meals[3].recipe, 'lasagne');
  assert.ok(plan.days[0].meals[3].swapped);
  assert.equal(plan.days[1].meals[1].recipe, 'lasagne');
  assert.ok(plan.days[1].meals[1].leftover);
  assert.equal(plan.days[2].meals[1].recipe, 'grekisk'); // the lunchbox swapped away…
  assert.ok(!plan.days[1].meals[3].batch); // …so Tuesday's dinner is a single batch
  assert.equal(plan.days[3].meals[3].recipe, 'bolognese', 'dishes you can\'t choose are ignored');
  // Vilken rätt som helst går att välja i vilken måltid som helst, t.ex. gröt till kvällsmål.
  const porridge = makePlan({ swaps: { '2026-11-05:kvallsmal': 'havregrot' } }).day('2026-11-05').meals[4];
  assert.equal(porridge.recipe, 'havregrot');
  assert.ok(porridge.swapped);
  checkLeftovers(plan);
});

test('a fixed choice ("porridge every weekday") holds from its day, and a swap for one day comes first', () => {
  const base = makePlan();
  const fixed = { frukost: { recipe: 'havregrot', days: 'vardag', at: '2026-11-04' }, lunch: { recipe: 'kycklingbowl', days: 'alla', at: '2026-11-09' } };
  const plan = makePlan({ fixed, swaps: { '2026-11-12:frukost': 'omelett' } });
  for (const day of plan.days) {
    const breakfast = day.meals[0];
    if (day.date === '2026-11-12') assert.equal(breakfast.recipe, 'omelett', 'the day\'s own swap');
    else if (day.date >= '2026-11-04' && day.weekday < 5) assert.ok(breakfast.recipe === 'havregrot' && breakfast.fixed && !breakfast.swapped, day.date);
    else assert.equal(breakfast.recipe, base.day(day.date).meals[0].recipe, day.date);
    if (day.date >= '2026-11-09') assert.ok(day.meals[1].recipe === 'kycklingbowl' && !day.meals[1].leftover, `${day.date}: lunch`);
    assert.ok(day.meals.every(meal => meal.scale >= 0.7 && meal.scale <= 1.4), `${day.date}: portions`);
  }
  // Utan matlådor lagas middagarna i enkel sats.
  assert.ok(plan.days.filter(day => day.date >= '2026-11-09').every(day => !day.meals[3].batch));
  assert.ok(plan.days.filter(day => day.date >= '2026-11-04').every(day => Math.abs(day.kcal - GOALS.kcal) / GOALS.kcal < 0.1), 'still near the goals');
  checkLeftovers(plan);
  // Ett fast val tar bort byten från och med sin dag.
  store.forget();
  store.setSwap('2026-11-03', 'frukost', 'omelett');
  store.setSwap('2026-11-05', 'frukost', 'omelett');
  store.setFixed('frukost', { recipe: 'havregrot', days: 'alla', at: '2026-11-04' });
  assert.deepEqual(store.choices().swaps, { '2026-11-03:frukost': 'omelett' });
  store.setFixed('frukost', null);
  assert.deepEqual(store.choices().fixed, {});
  store.forget();
});

test('moving a dinner to another day swaps the two, and the lunchboxes follow', () => {
  const base = makePlan();
  const [monday, thursday] = [base.day('2026-11-16'), base.day('2026-11-19')];
  const swaps = { '2026-11-16:middag': thursday.meals[3].recipe, '2026-11-19:middag': monday.meals[3].recipe };
  const plan = makePlan({ swaps });
  assert.equal(plan.day('2026-11-16').meals[3].recipe, thursday.meals[3].recipe);
  assert.equal(plan.day('2026-11-19').meals[3].recipe, monday.meals[3].recipe);
  assert.equal(plan.day('2026-11-17').meals[1].recipe, thursday.meals[3].recipe, 'Tuesday\'s lunchbox follows Monday\'s new dinner');
  checkLeftovers(plan);
});

test('the filters: quick and no-cook come from the recipe text', () => {
  const t = id => traits(id);
  for (const id of ['havregrot', 'proteingrot', 'pannkakor', 'kvarg_blabar', 'overnight']) assert.ok(t(id).quick, `${id} quick`);
  for (const id of ['lasagne', 'ugnslax', 'curry', 'bolognese', 'ugnspasta', 'kottfarslimpa']) assert.ok(!t(id).quick, `${id} not quick`);
  for (const id of ['overnight', 'kvarg_blabar', 'knacke_ost', 'chiapudding']) assert.ok(t(id).cold, `${id} cold`);
  for (const id of ['omelett', 'havregrot', 'pannkakor', 'knacke_agg']) assert.ok(!t(id).cold, `${id} needs the stove`);
  const quick = CHOOSABLE.filter(id => traits(id).quick).length;
  assert.ok(quick > 30 && quick < CHOOSABLE.length * 0.7, `${quick} quick`);
  assert.equal(store.clean({ intro: true }).intro, true, 'the welcome is remembered');
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
