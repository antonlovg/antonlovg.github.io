// Matschemat: dagen (med recept, avbockning och byten), veckan, inköpslistan och dina val. Adressen
// bestämmer vyn: #dag/2026-11-02, #vecka/46, #handla/46 och #anpassa. Utan adress öppnas dagens dag.
import { MEALS, WEEK_NUMBERS, TARGET, makePlan, alternatives, cookAmount, startDate, todayIso } from './plan.js';
import { RECIPES } from './recipes.js';
import { FOODS, SECTIONS, SPICES, SWAPS } from './foods.js';
import * as store from './store.js';

const $ = id => document.getElementById(id);

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (name === 'class') node.className = value;
    else if (name.startsWith('on')) node.addEventListener(name.slice(2), value);
    else node.setAttribute(name, value === true ? '' : value);
  }
  node.append(...children.flat().filter(child => child != null && child !== false));
  return node;
}
const classes = (...names) => names.filter(Boolean).join(' ');
const lower = text => text[0].toLowerCase() + text.slice(1);
const list = items => items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} och ${items.at(-1)}`;

// ---------- Planen, med det du inte äter och det du bytt ----------
let plan = makePlan(store.choices());
const excluded = () => new Set(store.choices().exclude);
function refresh() {
  plan = makePlan(store.choices());
  render();
}

// ---------- Datum ----------
const format = (date, options) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC', ...options }).format(new Date(`${date}T12:00:00Z`));
const weekdayName = date => { const name = format(date, { weekday: 'long' }); return name[0].toUpperCase() + name.slice(1); };
const shortDay = date => format(date, { weekday: 'short' }).replace('.', '');
const dayMonth = date => format(date, { day: 'numeric', month: 'long' });
const number = value => value.toLocaleString('sv-SE');

function range(week) {
  const days = plan.week(week);
  const [first, last] = [days[0].date, days.at(-1).date];
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  if (sameMonth) return `${format(first, { day: 'numeric' })}–${format(last, { day: 'numeric', month: 'long' })}`;
  if (sameYear) return `${format(first, { day: 'numeric', month: 'short' })} – ${format(last, { day: 'numeric', month: 'short' })}`;
  return `${format(first, { day: 'numeric', month: 'short', year: 'numeric' })} – ${format(last, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

// ---------- Läget ----------
let today = todayIso();
const state = { view: 'dag', date: startDate(today), week: plan.day(startDate(today)).week };
const VIEWS = ['dag', 'vecka', 'handla', 'anpassa'];

function route() {
  const [view, arg] = location.hash.slice(1).split('/');
  if (view === 'vecka' || view === 'handla') {
    state.view = view;
    if (WEEK_NUMBERS.includes(Number(arg))) state.week = Number(arg);
    if (plan.day(state.date).week !== state.week) state.date = state.week === plan.day(startDate(today)).week ? startDate(today) : plan.week(state.week)[0].date;
  } else if (view === 'anpassa' || view === 'om') {
    state.view = 'anpassa';
  } else {
    state.view = 'dag';
    state.date = plan.day(arg) ? arg : startDate(today);
    state.week = plan.day(state.date).week;
  }
  render();
}

const go = hash => { if (location.hash !== hash) location.hash = hash; else route(); };

function render() {
  for (const view of VIEWS) $(`view-${view}`).hidden = view !== state.view;
  for (const tab of document.querySelectorAll('.tabs a')) {
    const view = tab.dataset.view;
    tab.href = view === 'dag' ? `#dag/${state.date}` : view === 'anpassa' ? '#anpassa' : `#${view}/${state.week}`;
    if (view === state.view) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
  }
  ({ dag: renderDay, vecka: renderWeek, handla: renderShop, anpassa: renderChoices })[state.view]();
}

// ---------- Dag ----------
const open = new Set(); // uppfällda måltider, "datum:måltid", så att de förblir öppna när sidan ritas om

function currentMeal(day) {
  if (day.date !== today) return null;
  const hour = new Date().getHours();
  return day.meals.find(meal => meal.until > hour && !store.isEaten(day.date, meal.id))?.id ?? null;
}

const dayIndex = date => plan.days.findIndex(day => day.date === date);
// Dagarna vars matlåda kommer från den här dagens middag.
const lunchesFrom = date => plan.days.filter(day => day.meals[1].leftover && day.meals[1].from === date);

function renderDay() {
  const day = plan.day(state.date);
  $('title').textContent = 'Matschema';
  $('subtitle').textContent = `Vecka ${day.week} · ${range(day.week)}`;

  $('strip').replaceChildren(...plan.week(day.week).map(other => {
    const eaten = other.meals.filter(meal => store.isEaten(other.date, meal.id)).length;
    return h('li', {},
      h('a', {
        href: `#dag/${other.date}`,
        class: classes('strip-day', other.date === today && 'is-today', eaten === MEALS.length && 'is-done'),
        'aria-current': other.date === state.date ? 'date' : false,
        'aria-label': `${weekdayName(other.date)} ${dayMonth(other.date)}${other.date === today ? ', idag' : ''}${eaten ? `, ${eaten} av ${MEALS.length} måltider ätna` : ''}`
      }, h('span', { class: 'strip-name' }, shortDay(other.date)), h('span', { class: 'strip-num' }, format(other.date, { day: 'numeric' })),
      h('span', { class: 'strip-dots', 'aria-hidden': 'true' }, other.meals.map(meal => h('i', { class: store.isEaten(other.date, meal.id) ? 'on' : '' })))));
  }));
  $('day-prev-week').disabled = day.week === WEEK_NUMBERS[0];
  $('day-next-week').disabled = day.week === WEEK_NUMBERS.at(-1);

  $('day-title').replaceChildren(weekdayName(day.date), day.note ? h('span', { class: 'note' }, day.note) : '');
  $('day-date').textContent = `${dayMonth(day.date)} ${day.date.slice(0, 4)}${day.date === today ? ' · idag' : ''}`;
  $('go-today').hidden = day.date === startDate(today);

  renderTotals(day);
  const now = currentMeal(day);
  $('meals').replaceChildren(...day.meals.map(meal => mealCard(day, meal, meal.id === now)));
}

function bar(label, eaten, planned, unit, goal) {
  const pct = planned ? Math.min(100, eaten / planned * 100) : 0;
  const node = h('div', { class: 'total' },
    h('p', { class: 'total-label' }, h('span', {}, label), h('span', {}, h('b', {}, number(eaten)), ` av ${number(planned)} ${unit}`)),
    h('div', { class: 'meter', role: 'img', 'aria-label': `${label}: ${number(eaten)} av ${number(planned)} ${unit}${goal ? `, mål minst ${goal} ${unit}` : ''}` },
      h('div', { class: 'meter-fill' }), goal ? h('div', { class: 'meter-goal', title: `Mål: minst ${goal} ${unit}` }) : null));
  node.querySelector('.meter-fill').style.width = `${pct}%`;
  if (goal) node.querySelector('.meter-goal').style.left = `${Math.min(100, goal / planned * 100)}%`;
  return node;
}

function renderTotals(day) {
  const eaten = day.meals.filter(meal => store.isEaten(day.date, meal.id));
  const kcal = eaten.reduce((sum, meal) => sum + meal.kcal, 0);
  const protein = eaten.reduce((sum, meal) => sum + meal.protein, 0);
  $('totals').replaceChildren(...[
    bar('Ätit', kcal, day.kcal, 'kcal'),
    bar('Protein', protein, day.protein, 'g', TARGET.protein),
    protein >= TARGET.protein ? h('p', { class: 'goal-met' }, 'Proteinmålet på 90 g är nått.') : null
  ].filter(Boolean));
}

// Väljaren för att byta en måltid mot en annan, närmast i kcal först.
function swapper(day, meal) {
  const options = alternatives(meal.id, meal.kcal, excluded(), [meal.recipe]);
  const select = h('select', {
    id: `swap-${meal.id}`,
    onchange: event => {
      if (!event.target.value) return;
      store.setSwap(day.date, meal.id, event.target.value);
      refresh();
      $(`swap-${meal.id}`)?.focus();
    }
  }, h('option', { value: '' }, 'Välj en annan måltid…'), options.map(option => {
    const diff = option.kcal - meal.kcal;
    return h('option', { value: option.recipe }, `${option.title} · ${option.kcal} kcal (${diff >= 0 ? '+' : '−'}${Math.abs(diff)})`);
  }));
  return h('div', { class: 'swap' },
    h('label', { for: `swap-${meal.id}` }, 'Byt måltid'),
    select,
    meal.leftover ? h('p', { class: 'fine' }, 'Byter du matlådan lagas gårdagens middag i enkel sats.') : null,
    meal.swapped ? h('button', { type: 'button', class: 'button quiet small', onclick: () => { store.setSwap(day.date, meal.id, null); refresh(); $(`swap-${meal.id}`)?.focus(); } },
      `Ångra bytet (${RECIPES[meal.planned].name})`) : null);
}

function mealCard(day, meal, isNow) {
  const key = `${day.date}:${meal.id}`;
  const eaten = store.isEaten(day.date, meal.id);
  const from = meal.leftover ? plan.day(meal.from) : null;
  const fed = meal.id === 'middag' ? lunchesFrom(day.date) : [];
  const changed = meal.swapped || (meal.replaced && !meal.leftover);
  const tags = [
    isNow ? h('span', { class: 'tag tag-now' }, 'Nu') : null,
    from ? h('span', { class: 'tag' }, 'Matlåda') : null,
    fed.length ? h('span', { class: 'tag tag-batch' }, fed.length > 1 ? 'Storkok' : 'Dubbel sats') : null,
    changed ? h('span', { class: 'tag tag-changed' }, 'Bytt') : meal.changes.length ? h('span', { class: 'tag tag-changed' }, 'Anpassad') : null
  ];
  const name = `${meal.title}${from ? ' (rester)' : ''}`;
  const check = h('button', {
    type: 'button', class: 'check', 'aria-pressed': String(eaten),
    'aria-label': `${meal.name}: ${name}. Ätit`,
    onclick: () => { store.toggleEaten(day.date, meal.id); renderDay(); document.querySelector(`[data-meal="${meal.id}"] .check`)?.focus(); }
  }, h('span', { class: 'check-mark', 'aria-hidden': 'true' }));

  const details = h('details', { open: open.has(key), ontoggle: event => { if (event.target.open) open.add(key); else open.delete(key); } },
    h('summary', {},
      h('span', { class: 'meal-label' }, meal.name, ...tags),
      h('span', { class: 'meal-name' }, name),
      h('span', { class: 'meal-numbers' }, h('b', {}, `${meal.kcal} kcal`), ` · ${meal.protein} g protein`)),
    h('div', { class: 'meal-body' },
      meal.replaced && !meal.leftover ? h('p', { class: 'changed' }, `I stället för ${lower(RECIPES[meal.replaced.from].name)}, eftersom du inte äter ${list(meal.replaced.because.map(food => lower(FOODS[food].name)))}.`) : null,
      meal.changes.length ? h('p', { class: 'changed' }, `${meal.changes.join('. ')}.`) : null,
      h('ul', { class: 'ingredients' }, meal.items.map(([, , text]) => h('li', {}, text))),
      fed.length === 1 ? h('p', { class: 'batch' }, h('b', {}, 'Laga dubbel sats: '), `hälften blir lunch på ${weekdayName(fed[0].date).toLowerCase()}.`) : null,
      fed.length > 1 ? h('p', { class: 'batch' }, h('b', {}, `Storkok, ${meal.portions} portioner: `), `middag idag och matlåda ${list(fed.map(other => weekdayName(other.date).toLowerCase()))}.`) : null,
      fed.length ? h('div', { class: 'whole' }, h('p', {}, h('b', {}, `Hela satsen (${meal.portions} portioner)`)),
        h('ul', { class: 'ingredients' }, meal.items.map(([food, grams]) => h('li', {}, `${cookAmount(food, grams * meal.portions)} ${lower(FOODS[food].name)}`)))) : null,
      from ? h('p', { class: 'how' }, `Matlådan från ${weekdayName(from.date).toLowerCase()}ens middag.`) : meal.how ? h('p', { class: 'how' }, meal.how) : null,
      swapper(day, meal)));

  return h('li', { class: classes('meal', meal.recipe === 'huel' && 'is-huel', eaten && 'is-eaten', isNow && 'is-now'), 'data-meal': meal.id }, details, check);
}

function moveDay(step) {
  const next = plan.days[dayIndex(state.date) + step];
  if (next) go(`#dag/${next.date}`);
}

function moveWeek(step, view) {
  const index = WEEK_NUMBERS.indexOf(state.week) + step;
  if (index < 0 || index >= WEEK_NUMBERS.length) return;
  const week = WEEK_NUMBERS[index];
  if (view === 'dag') go(`#dag/${plan.week(week)[plan.day(state.date).weekday].date}`);
  else go(`#${view}/${week}`);
}

// ---------- Vecka ----------
function renderWeek() {
  const days = plan.week(state.week);
  $('title').textContent = `Vecka ${state.week}`;
  $('subtitle').textContent = range(state.week);
  $('week-title').textContent = `Vecka ${state.week} · ${range(state.week)}`;
  $('week-prev').disabled = state.week === WEEK_NUMBERS[0];
  $('week-next').disabled = state.week === WEEK_NUMBERS.at(-1);

  const table = h('table', { class: 'week-table' },
    h('caption', { class: 'visually-hidden' }, `Måltider vecka ${state.week}`),
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Dag'), MEALS.map(meal => h('th', { scope: 'col' }, meal.name)), h('th', { scope: 'col' }, 'kcal / protein'))),
    h('tbody', {}, days.map(day => {
      const eaten = day.meals.filter(meal => store.isEaten(day.date, meal.id)).length;
      return h('tr', { class: classes(day.date === today && 'is-today', eaten === MEALS.length && 'is-done') },
        h('th', { scope: 'row' }, h('a', { href: `#dag/${day.date}` }, weekdayName(day.date), h('small', {}, dayMonth(day.date)), day.note ? h('small', { class: 'note' }, day.note) : null)),
        day.meals.map(meal => {
          const changed = meal.swapped || meal.replaced || meal.changes.length;
          return h('td', { 'data-label': meal.name, class: classes(store.isEaten(day.date, meal.id) && 'is-eaten', changed && 'is-changed') },
            h('span', {}, `${meal.title}${meal.leftover ? ' (rester)' : ''}`, changed ? h('span', { class: 'visually-hidden' }, ' (bytt eller anpassad)') : null));
        }),
        h('td', { class: 'week-total', 'data-label': 'Totalt' }, h('span', {}, h('b', {}, `${number(day.kcal)} kcal`), h('span', {}, `${day.protein} g protein`))));
    })));
  $('week').replaceChildren(table);

  const flow = days.filter(day => day.meals[3].batch).map(day => h('li', {}, h('b', {}, `${shortDay(day.date)}:`), ` ${day.meals[3].title} → ${lunchesFrom(day.date).map(other => shortDay(other.date)).join(', ')} lunch`));
  const kcal = days.map(day => day.kcal), protein = days.map(day => day.protein);
  const changes = days.flatMap(day => day.meals).filter(meal => !meal.leftover && (meal.swapped || meal.replaced || meal.changes.length)).length;
  $('week-boxes').replaceChildren(...[
    flow.length ? h('div', { class: 'box box-sand' }, h('h3', {}, 'Matlådeflödet'), h('ul', {}, flow)) : null,
    h('div', { class: 'box box-rose' }, h('h3', {}, 'Veckan i siffror'),
      h('p', {}, `${number(Math.min(...kcal))}–${number(Math.max(...kcal))} kcal och ${Math.min(...protein)}–${Math.max(...protein)} g protein om dagen.`),
      changes ? h('p', {}, `${changes} måltider är bytta eller anpassade (markerade med •).`) : null),
    h('div', { class: 'box box-mint' }, h('h3', {}, 'Handla'),
      h('p', {}, 'Allt till veckan på en lista. '), h('a', { href: `#handla/${state.week}` }, `Inköpslista vecka ${state.week}`))
  ].filter(Boolean));
}

// ---------- Handla ----------
function renderShop() {
  const week = state.week;
  const groups = plan.shopping(week);
  const items = groups.flatMap(group => group.items);
  const done = items.filter(item => store.has(week, item.food)).length;
  $('title').textContent = 'Inköpslista';
  $('subtitle').textContent = `Vecka ${week} · ${range(week)}`;
  $('shop-title').textContent = `Vecka ${week} · ${range(week)}`;
  $('shop-prev').disabled = week === WEEK_NUMBERS[0];
  $('shop-next').disabled = week === WEEK_NUMBERS.at(-1);
  $('shop-count').textContent = done === items.length ? `Allt klart: ${items.length} varor` : `${done} av ${items.length} avbockade`;
  $('shop-hide').checked = store.hideHave();
  $('shop').classList.toggle('hide-done', store.hideHave());
  $('shop').replaceChildren(...groups.map(group => h('section', { class: 'shop-group' },
    h('h3', {}, group.section),
    h('ul', {}, group.items.map(item => {
      const checked = store.has(week, item.food);
      return h('li', { class: checked ? 'is-done' : '' },
        h('label', {},
          h('input', { type: 'checkbox', checked, onchange: () => { store.toggleHave(week, item.food); renderShop(); document.querySelector(`#shop input[data-food="${item.food}"]`)?.focus(); }, 'data-food': item.food }),
          h('span', { class: 'shop-name' }, item.name, item.pantry ? h('small', {}, 'kolla skafferiet') : null),
          h('span', { class: 'shop-amount' }, item.amount)));
    })))),
  h('section', { class: 'shop-group' }, h('h3', {}, 'Kryddor & smaksättare'), h('p', { class: 'fine' }, SPICES)));
}

function shopText(week) {
  const lines = [`Inköpslista vecka ${week} (${range(week)})`];
  for (const group of plan.shopping(week)) {
    const left = group.items.filter(item => !store.has(week, item.food));
    if (!left.length) continue;
    lines.push('', group.section, ...left.map(item => `- ${item.name}, ${item.amount}`));
  }
  return lines.join('\n');
}

async function shareShop() {
  const text = shopText(state.week);
  const status = $('shop-status');
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ title: `Inköpslista vecka ${state.week}`, text });
      status.textContent = '';
    } else {
      await navigator.clipboard.writeText(text);
      status.textContent = 'Listan är kopierad.';
    }
  } catch (error) {
    if (error.name !== 'AbortError') status.textContent = 'Det gick inte att dela listan.';
  }
}

// ---------- Anpassa ----------
// Livsmedlen som finns i något recept, och vad som händer om du inte äter dem.
const USED = new Set(Object.values(RECIPES).flatMap(recipe => recipe.items.map(([food]) => food)));

function consequence(food, without) {
  const swap = SWAPS[food];
  if (swap === 'drop') return 'tas bort ur recepten';
  if (swap && !without.has(swap)) return `byts mot ${lower(FOODS[swap].name)}`;
  return 'måltiderna byts mot andra';
}

function renderChoices() {
  $('title').textContent = 'Anpassa';
  $('subtitle').textContent = `Vecka ${WEEK_NUMBERS[0]}–${WEEK_NUMBERS.at(-1)} · ${number(plan.days.length)} dagar`;
  const without = excluded();
  const affected = plan.days.flatMap(day => day.meals).filter(meal => !meal.leftover && !meal.swapped && (meal.replaced || meal.changes.length)).length;
  const toggle = (food, on) => { store.setExcluded(food, on); refresh(); document.querySelector(`#foods input[data-food="${food}"]`)?.focus(); };

  $('excluded').replaceChildren(...(without.size
    ? [h('ul', { class: 'chips' }, [...without].filter(food => FOODS[food]).sort((a, b) => FOODS[a].name.localeCompare(FOODS[b].name, 'sv')).map(food =>
      h('li', {}, h('button', { type: 'button', class: 'chip', 'aria-label': `Ta bort ${FOODS[food].name} från listan`, onclick: () => { store.setExcluded(food, false); refresh(); } }, FOODS[food].name, h('span', { 'aria-hidden': 'true' }, ' ×'))))),
    h('p', { class: 'fine' }, `Det ändrar ${affected} måltider i schemat. Dagarna kan då hamna lite över eller under 2100 kcal; siffrorna räknas om.`)]
    : [h('p', { class: 'fine' }, 'Du äter allt just nu.')]));

  $('foods').replaceChildren(...SECTIONS.map(section => {
    const foods = [...USED].filter(food => FOODS[food].section === section).sort((a, b) => FOODS[a].name.localeCompare(FOODS[b].name, 'sv'));
    const chosen = foods.filter(food => without.has(food)).length;
    return h('details', { class: 'food-group', open: open.has(`foods:${section}`), ontoggle: event => { if (event.target.open) open.add(`foods:${section}`); else open.delete(`foods:${section}`); } },
      h('summary', {}, section, chosen ? h('span', { class: 'count' }, ` (${chosen} bortvalda)`) : null),
      h('ul', {}, foods.map(food => h('li', {}, h('label', {},
        h('input', { type: 'checkbox', checked: without.has(food), 'data-food': food, onchange: event => toggle(food, event.target.checked) }),
        h('span', {}, FOODS[food].name, h('small', {}, consequence(food, without))))))));
  }));

  const { palette = 'skog', mode = 'auto' } = store.theme();
  for (const input of $('looks').elements) input.checked = input.value === (input.name === 'palette' ? palette : mode);

  const swaps = Object.keys(store.choices().swaps).length;
  $('swaps').textContent = swaps ? `Du har bytt ${swaps} ${swaps === 1 ? 'måltid' : 'måltider'} för hand.` : 'Du har inte bytt några måltider. Det gör du under en måltid på dagens sida.';
  $('clear-swaps').hidden = !swaps;
  $('offline').textContent = navigator.serviceWorker?.controller ? 'Schemat är sparat på den här enheten och öppnas även utan nät.' : 'Öppna sidan en gång till med nät så sparas schemat på enheten.';
}

// ---------- Händelser ----------
$('day-prev-week').addEventListener('click', () => moveWeek(-1, 'dag'));
$('day-next-week').addEventListener('click', () => moveWeek(1, 'dag'));
$('go-today').addEventListener('click', () => go(`#dag/${startDate(today)}`));
$('week-prev').addEventListener('click', () => moveWeek(-1, 'vecka'));
$('week-next').addEventListener('click', () => moveWeek(1, 'vecka'));
$('shop-prev').addEventListener('click', () => moveWeek(-1, 'handla'));
$('shop-next').addEventListener('click', () => moveWeek(1, 'handla'));
$('shop-hide').addEventListener('change', event => { store.setHide(event.target.checked); renderShop(); });
$('shop-share').addEventListener('click', shareShop);
$('shop-clear').addEventListener('click', () => { store.clearHave(state.week); $('shop-status').textContent = 'Alla varor är avmarkerade.'; renderShop(); });
$('looks').addEventListener('change', () => {
  const form = $('looks').elements;
  const mode = form.mode.value === 'auto' ? undefined : form.mode.value;
  store.setTheme({ palette: form.palette.value || 'skog', ...(mode && { mode }) });
  globalThis.matschemaTheme?.apply(store.theme());
});
$('looks').addEventListener('submit', event => event.preventDefault());
$('clear-swaps').addEventListener('click', () => { store.clearSwaps(); refresh(); $('swaps').focus(); });
$('forget').addEventListener('click', () => { store.forget(); globalThis.matschemaTheme?.apply(); refresh(); $('forget-status').textContent = 'Allt du sparat är raderat.'; });

// Svep åt sidan på dagen för att byta dag.
let touch = null;
$('view-dag').addEventListener('touchstart', event => { touch = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null; }, { passive: true });
$('view-dag').addEventListener('touchend', event => {
  if (!touch) return;
  const dx = event.changedTouches[0].clientX - touch.x, dy = event.changedTouches[0].clientY - touch.y;
  touch = null;
  if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) moveDay(dx < 0 ? 1 : -1);
}, { passive: true });

document.addEventListener('keydown', event => {
  if (state.view !== 'dag' || event.altKey || event.ctrlKey || event.metaKey || event.target.closest?.('input, textarea, select')) return;
  if (event.key === 'ArrowLeft') moveDay(-1);
  if (event.key === 'ArrowRight') moveDay(1);
});

// Över midnatt, eller när en annan flik ändrat något.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  const now = todayIso();
  if (now !== today) { today = now; route(); } else render();
});
window.addEventListener('storage', event => { if (event.key === store.KEY || event.key === null) { store.reload(); refresh(); } });
window.addEventListener('hashchange', route);

// Sparar sidan på enheten så att den öppnas utan nät (sw.js, bara /matschema/).
navigator.serviceWorker?.register('sw.js').then(() => navigator.serviceWorker.ready).then(() => { if (state.view === 'anpassa') renderChoices(); }).catch(() => {});

route();
