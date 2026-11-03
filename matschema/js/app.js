// Matschemat: dagen (med recept, avbockning och byten), veckan, inköpslistan och dina val. Adressen
// bestämmer vyn: #dag/2026-11-02, #vecka/46, #handla/46 och #anpassa (veckorna räknas vidare efter 53, så
// vecka 54 är vecka 1 2027). #synk/… läser in det du sparat på en annan enhet. Utan adress öppnas dagens dag.
import { MEALS, WEEK_NUMBERS, GOALS, NUTRIENTS, POOLS, CHOOSABLE, FIXABLE, makePlan, alternatives, contents, cookLine, prepFor, startDate, todayIso, traits, weekLabel, weightTrend } from './plan.js';
import { pack, unpack, fileText, readFile } from './sync.js';
import { RECIPES } from './recipes.js';
import { ANIMAL, FOODS, PRICES, SECTIONS, SPICES, STORES, searchTerm, swapFor } from './foods.js';
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
const goals = () => ({ ...GOALS, ...store.choices().goals });
function refresh() {
  plan = makePlan(store.choices());
  render();
}

// Det du själv ändrat (byten, bortval); det som bara blivit veganskt räknas inte.
const personal = meal => !meal.leftover && Boolean(meal.outside || meal.swapped || meal.fixed || (meal.replaced && !meal.replaced.vegan) || (meal.changes.length && !meal.vegan));

// ---------- Datum ----------
const format = (date, options) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC', ...options }).format(new Date(`${date}T12:00:00Z`));
const weekdayName = date => { const name = format(date, { weekday: 'long' }); return name[0].toUpperCase() + name.slice(1); };
const shortDay = date => format(date, { weekday: 'short' }).replace('.', '');
const dayMonth = date => format(date, { day: 'numeric', month: 'long' });
const number = value => value.toLocaleString('sv-SE');
// Veckans namn i almanackan: planens vecka 54 är vecka 1 2027.
const weekName = week => `Vecka ${weekLabel(week).number}`;

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
  } else if (view === 'synk' && arg) {
    // Ta bort datan ur adressen direkt (och ur historiken), och fråga innan något läses in.
    history.replaceState(null, '', '#anpassa');
    state.view = 'anpassa';
    offerSync(arg);
  } else {
    state.view = 'dag';
    state.date = plan.day(arg) ? arg : startDate(today);
    state.week = plan.day(state.date).week;
  }
  render();
}

const go = hash => { if (location.hash !== hash) location.hash = hash; else route(); };

function render() {
  const target = goals();
  $('goal-kcal').textContent = `${number(target.kcal)} kcal`;
  $('goal-rest').textContent = `${target.protein} g protein · ${target.carbs} g kolh · ${target.fat} g fett`;
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
  $('subtitle').textContent = `${weekName(day.week)} · ${range(day.week)}`;

  $('strip').replaceChildren(...plan.week(day.week).map(other => {
    const eaten = other.meals.filter(meal => store.isEaten(other.date, meal.id)).length;
    return h('li', {},
      h('a', {
        href: `#dag/${other.date}`,
        class: classes('strip-day', other.date === today && 'is-today', eaten === other.meals.length && 'is-done'),
        'aria-current': other.date === state.date ? 'date' : false,
        'aria-label': `${weekdayName(other.date)} ${dayMonth(other.date)}${other.date === today ? ', idag' : ''}${eaten ? `, ${eaten} av ${other.meals.length} måltider ätna` : ''}`
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
  renderPrep(day);
}

// Det som ska göras i kväll inför imorgon: tina, packa matlåda, det recepten säger ska göras kvällen innan.
function renderPrep(day) {
  const next = plan.days[dayIndex(day.date) + 1];
  const tasks = next ? prepFor(next) : [];
  $('prep').replaceChildren(...(tasks.length ? [h('div', { class: 'box box-sand prep' },
    h('h3', {}, day.date === today ? 'I kväll, inför imorgon' : `Kvällen inför ${weekdayName(next.date).toLowerCase()}`),
    h('ul', {}, tasks.map(task => h('li', {}, task))))] : []));
}

// Hur långt från målet dagens plan är: inom 5 % räknas som träff, och taken får inte passeras.
const missed = (nutrient, planned, goal) => (nutrient.max ? planned > goal : Math.abs(planned - goal) > goal * 0.05);

// En rad per näringsämne: hur mycket du ätit av dagens plan, med målet (eller taket) markerat.
function bar(nutrient, eaten, planned, goal) {
  const { name, unit } = nutrient;
  const scale = Math.max(planned, goal) || 1;
  const node = h('div', { class: classes('total', missed(nutrient, planned, goal) && 'is-off') },
    h('p', { class: 'total-label' }, h('span', {}, name, h('small', {}, `${nutrient.max ? 'högst' : 'mål'} ${number(goal)} ${unit}`)),
      h('span', {}, h('b', {}, number(eaten)), ` av ${number(planned)} ${unit}`)),
    h('div', { class: 'meter', role: 'img', 'aria-label': `${name}: ${number(eaten)} av ${number(planned)} ${unit} ätet, ${nutrient.max ? 'högst' : 'mål'} ${number(goal)} ${unit}` },
      h('div', { class: 'meter-plan' }), h('div', { class: 'meter-fill' }), h('div', { class: 'meter-goal' })));
  node.querySelector('.meter-plan').style.width = `${planned / scale * 100}%`;
  node.querySelector('.meter-fill').style.width = `${Math.min(eaten, planned) / scale * 100}%`;
  node.querySelector('.meter-goal').style.left = `${goal / scale * 100}%`;
  return node;
}

// Energi och protein syns alltid; resten när du fäller ut dem, eller när dagens plan missar dem.
let allTotals = false;

function renderTotals(day) {
  const target = goals();
  const eaten = day.meals.filter(meal => store.isEaten(day.date, meal.id));
  const off = NUTRIENTS.filter(nutrient => missed(nutrient, day[nutrient.id], target[nutrient.id]));
  const shown = NUTRIENTS.filter(nutrient => allTotals || ['kcal', 'protein'].includes(nutrient.id) || off.includes(nutrient));
  const toggle = h('button', { type: 'button', class: 'totals-toggle', 'aria-expanded': String(allTotals), onclick: () => {
    allTotals = !allTotals;
    renderTotals(day);
    $('totals').querySelector('.totals-toggle').focus();
  } }, allTotals ? 'Visa färre' : 'Alla näringsvärden');
  $('totals').replaceChildren(
    ...shown.map(nutrient => bar(nutrient, eaten.reduce((sum, meal) => sum + meal[nutrient.id], 0), day[nutrient.id], target[nutrient.id])),
    h('div', { class: 'totals-foot' },
      h('p', { class: classes('plan-note', !off.length && 'goal-met') }, off.length
        ? `Planen missar ${list(off.map(nutrient => lower(nutrient.name)))}. Byt en måltid för att komma närmare.`
        : '✓ Planen träffar dina mål.'),
      shown.length < NUTRIENTS.length || allTotals ? toggle : null));
}

// ---------- Bladet: en dialog som glider upp underifrån på mobilen (byt, laga, flytta, välkommen) ----------
const sheet = $('sheet');
let sheetBack = null; // ger det som ska få fokus när bladet stängs
let onSheetClose = null;
let wakeLock = null;

function openSheet(title, body, { cook = false, back = null, onClose = null } = {}) {
  sheetBack = back;
  onSheetClose = onClose;
  sheet.className = classes('sheet', cook && 'sheet-cook');
  $('sheet-title').textContent = title;
  $('sheet-body').replaceChildren(...[body].flat().filter(Boolean));
  $('sheet-body').scrollTop = 0;
  if (!sheet.open) sheet.showModal();
  $('sheet-close').focus();
}
const closeSheet = () => { if (sheet.open) sheet.close(); };

sheet.addEventListener('close', () => {
  releaseWake();
  const [back, done] = [sheetBack, onSheetClose];
  sheetBack = onSheetClose = null;
  done?.();
  back?.()?.focus();
});
// Ett tryck utanför bladet (på bakgrunden) stänger det.
sheet.addEventListener('click', event => { if (event.target === sheet) closeSheet(); });
$('sheet-close').addEventListener('click', closeSheet);

// Skärmen hålls tänd medan du lagar (där webbläsaren kan), och tänds igen när du kommer tillbaka till fliken.
async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request('screen') ?? null; } catch { wakeLock = null; }
  const note = $('cook-awake');
  if (note) note.textContent = wakeLock ? 'Skärmen hålls tänd medan du lagar.' : '';
}
function releaseWake() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

// Sökning utan accenter, så att "grot" hittar gröt.
const plain = text => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const DAY_TEXT = { alla: 'varje dag', vardag: 'alla vardagar', helg: 'alla helger' };
const SCOPES = [['idag', 'Bara den här dagen'], ['alla', 'Varje dag'], ['vardag', 'Vardagar'], ['helg', 'Helger']];
const SHOWN = 6;
const FILTERS = [
  ['snabb', 'Snabb', option => option.quick],
  ['protein', 'Mycket protein', option => option.protein * 4 >= option.kcal * 0.3],
  ['vegan', 'Vegansk', option => option.items.every(([food]) => !ANIMAL.includes(food))],
  ['storkok', 'Storkok', option => option.storkok > 0],
  ['kall', 'Utan spis', option => option.cold]
];
const swapButton = meal => () => document.querySelector(`[data-meal="${meal.id}"] [data-action="swap"]`);

// Byt en måltid: sök bland alla rätter (på namn eller ingrediens), filtrera, eller välj bland de närmast i
// kcal. Frukost, lunch, mellanmål och kvällsmål kan också bli ett fast val från den här dagen.
function openSwap(day, meal) {
  const id = `swap-${meal.id}`;
  const options = alternatives(meal.id, meal.kcal, plan.without, [meal.recipe, ...plan.disliked], CHOOSABLE).map(option => ({
    ...option,
    ...traits(option.recipe),
    here: POOLS[meal.id].includes(option.recipe),
    text: plain(`${option.title} ${RECIPES[option.recipe].name} ${option.items.map(([food]) => FOODS[food].name).join(' ')}`)
  }));
  const scope = FIXABLE.includes(meal.id) ? h('fieldset', { class: 'swap-scope' }, h('legend', {}, 'Gäller'),
    SCOPES.map(([value, text], i) => h('label', {}, h('input', { type: 'radio', name: `${id}-scope`, value, checked: i === 0 }), text))) : null;
  const choose = recipe => {
    const days = scope?.querySelector('input:checked').value || 'idag';
    if (days === 'idag') store.setSwap(day.date, meal.id, recipe);
    else store.setFixed(meal.id, { recipe, days, at: day.date });
    refresh();
    closeSheet();
    $('day-status').textContent = days === 'idag' ? `${RECIPES[recipe].name} till ${lower(meal.name)}.`
      : `${RECIPES[recipe].name} till ${lower(meal.name)} ${DAY_TEXT[days]} från och med ${dayMonth(day.date)}.`;
  };
  let all = false;
  const active = new Set();
  const results = h('ul', { class: 'swap-results', id: `${id}-results` });
  const count = h('p', { class: 'fine', role: 'status' });
  const more = h('button', { type: 'button', class: 'button quiet small', onclick: () => { all = true; show(); results.querySelector(`li:nth-child(${SHOWN + 1}) button`)?.focus(); } });
  const search = h('input', { type: 'search', id, autocomplete: 'off', enterkeyhint: 'search', placeholder: 'T.ex. gröt, lax eller tofu', 'aria-controls': `${id}-results`, oninput: () => show() });
  const filters = h('div', { class: 'filters', role: 'group', 'aria-label': 'Filter' }, FILTERS.map(([key, text]) =>
    h('button', { type: 'button', class: 'filter', 'aria-pressed': 'false', onclick: event => {
      if (active.has(key)) active.delete(key); else active.add(key);
      event.currentTarget.setAttribute('aria-pressed', String(active.has(key)));
      all = false;
      show();
    } }, text)));
  function show() {
    const words = plain(search.value).split(/\s+/).filter(Boolean);
    const narrowed = words.length > 0 || active.size > 0;
    const tests = FILTERS.filter(([key]) => active.has(key)).map(([, , test]) => test);
    // Utan sökord och filter: rätterna för den här måltiden. Annars allt som matchar, den här måltidens rätter först.
    const matches = options.filter(option => (narrowed || option.here) && words.every(word => option.text.includes(word)) && tests.every(test => test(option)))
      .sort((a, b) => b.here - a.here);
    const shown = narrowed || all ? matches : matches.slice(0, SHOWN);
    results.replaceChildren(...shown.map(option => {
      const diff = option.kcal - meal.kcal;
      const usual = option.here ? null : [MEALS[3], ...MEALS].find(slot => POOLS[slot.id]?.includes(option.recipe));
      return h('li', {}, h('button', { type: 'button', class: 'swap-option', onclick: () => choose(option.recipe) },
        h('span', {}, `${plan.favourites.includes(option.recipe) ? '★ ' : ''}${option.title}`),
        h('small', {}, `${option.kcal} kcal (${diff >= 0 ? '+' : '−'}${Math.abs(diff)}) · ${option.protein} g protein${usual ? ` · brukar vara ${lower(usual.name)}` : ''}`)));
    }));
    more.hidden = narrowed || all || matches.length <= SHOWN;
    more.textContent = `Visa alla ${matches.length}`;
    count.textContent = !narrowed ? '' : matches.length ? `${matches.length} ${matches.length === 1 ? 'rätt' : 'rätter'}.` : 'Ingen rätt matchar. Prova ett annat ord eller färre filter.';
  }
  show();
  openSheet(`Byt ${lower(meal.name)}`, [
    h('p', { class: 'fine sheet-now' }, `Nu: ${meal.title} · ${meal.kcal} kcal`),
    h('div', { class: 'swap' },
      h('label', { for: id }, 'Sök på rätt eller ingrediens'),
      search,
      filters,
      scope,
      count,
      results,
      more,
      meal.leftover ? h('p', { class: 'fine' }, 'Byter du matlådan lagas gårdagens middag i enkel sats.') : null,
      meal.swapped ? h('button', { type: 'button', class: 'button quiet small', onclick: () => { store.setSwap(day.date, meal.id, null); refresh(); closeSheet(); } },
        `Ångra bytet (${RECIPES[meal.planned].name})`) : null)
  ], { back: swapButton(meal) });
  if (matchMedia('(pointer: fine)').matches) search.focus();
}

// Laga: receptet i stor text, steg för steg (tryck på ett steg när det är klart), med skärmen tänd.
function openCook(day, meal) {
  const fed = meal.id === 'middag' ? lunchesFrom(day.date) : [];
  const ingredients = fed.length
    ? [...wholeBatch(meal, fed)].map(([food, grams]) => cookLine(food, grams))
    : meal.items.map(([, , text]) => text);
  const steps = meal.how.split(/(?<=[.!])\s+/).filter(Boolean);
  const tick = event => {
    const button = event.currentTarget;
    button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
  };
  openSheet(meal.title, [
    h('p', { class: 'fine', id: 'cook-awake', role: 'status' }),
    fed.length ? h('p', { class: 'batch' }, h('b', {}, `${fed.length > 1 ? 'Storkok' : 'Dubbel sats'}, ${meal.portions} portioner: `),
      `middag idag och matlåda ${list(fed.map(other => weekdayName(other.date).toLowerCase()))}.`) : null,
    h('h3', { class: 'cook-head' }, 'Ingredienser'),
    h('ul', { class: 'cook-list' }, ingredients.map(text => h('li', {}, text))),
    h('h3', { class: 'cook-head' }, 'Gör så här'),
    h('ol', { class: 'cook-steps' }, steps.map((text, i) => h('li', {},
      h('button', { type: 'button', 'aria-pressed': 'false', onclick: tick }, h('span', { class: 'cook-num', 'aria-hidden': 'true' }, i + 1), h('span', {}, text))))),
    h('p', { class: 'fine' }, `Kryddor att ha hemma: ${SPICES}`)
  ], { cook: true, back: () => document.querySelector(`[data-meal="${meal.id}"] [data-action="cook"]`) });
  keepAwake();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && sheet.open && sheet.classList.contains('sheet-cook')) keepAwake(); });

// Åt något annat: en uppskattning i kcal och protein (eller ett vanligt val). Resten av dagens portioner räknas
// om, och det du redan ätit behåller sin portion.
const ELSEWHERE = [['Hoppade över', 0, 0], ['Fika', 350, 6], ['Sallad ute', 550, 30], ['Lunch ute', 750, 35], ['Middag ute', 900, 40],
  ['Pizza', 1000, 40], ['Hamburgare & pommes', 1100, 40]];

function openOutside(day, meal) {
  const now = meal.outside ? meal : null;
  const field = (name, label, unit, attrs) => h('label', {}, h('span', {}, label), h('input', { name, ...attrs }), unit ? h('small', {}, unit) : null);
  const form = h('form', { class: 'goals outside-form', novalidate: true },
    field('label', 'Vad', null, { type: 'text', maxlength: 60, autocomplete: 'off', value: now?.title ?? '' }),
    field('kcal', 'Energi', 'kcal', { type: 'number', inputmode: 'numeric', min: 0, max: 5000, step: 1, value: now?.kcal ?? '' }),
    field('protein', 'Protein', 'g', { type: 'number', inputmode: 'numeric', min: 0, max: 400, step: 1, value: now?.protein ?? '' }));
  const status = h('p', { class: 'fine', role: 'status' });
  const presets = h('div', { class: 'filters', role: 'group', 'aria-label': 'Vanliga val' }, ELSEWHERE.map(([label, kcal, protein]) =>
    h('button', { type: 'button', class: 'filter', onclick: () => {
      form.elements.label.value = label;
      form.elements.kcal.value = kcal;
      form.elements.protein.value = protein;
      status.textContent = `${label}: ca ${kcal} kcal och ${protein} g protein. Ändra om du vet bättre.`;
    } }, label)));
  const done = text => { refresh(); closeSheet(); $('day-status').textContent = text; };
  form.addEventListener('submit', event => {
    event.preventDefault();
    const label = form.elements.label.value.trim();
    const [kcal, protein] = ['kcal', 'protein'].map(name => Math.round(Number(form.elements[name].value)));
    const bad = !label ? form.elements.label : ['kcal', 'protein'].map(name => form.elements[name])
      .find(input => input.value === '' || !(Number(input.value) >= Number(input.min) && Number(input.value) <= Number(input.max)));
    if (bad) {
      status.textContent = bad.name === 'label' ? 'Skriv vad du åt, eller välj ett vanligt val.' : `Skriv ett tal mellan ${bad.min} och ${bad.max}.`;
      bad.focus();
      return;
    }
    store.setOutside(day.date, meal.id, { label, kcal, protein });
    done(`${label} till ${lower(meal.name)}. Resten av dagen är omräknad.`);
  });
  form.append(h('div', { class: 'intro-nav' },
    now ? h('button', { type: 'button', class: 'button quiet', onclick: () => { store.setOutside(day.date, meal.id, null); done(`${meal.instead.title} till ${lower(meal.name)} igen.`); } }, 'Tillbaka till planen') : null,
    h('button', { type: 'submit', class: 'button' }, 'Spara')));
  openSheet(`Åt annat till ${lower(meal.name)}`, [
    h('p', { class: 'fine sheet-now' }, `Planen: ${(now ? meal.instead : meal).title} · ${(now ? meal.instead : meal).kcal} kcal`),
    h('p', { class: 'fine' }, 'Välj ett vanligt val eller skriv en egen uppskattning. Resten av dagen räknas om så att den ändå hamnar nära målet, och det du redan bockat av ändras inte.'),
    presets, form, status
  ], { back: () => document.querySelector(`[data-meal="${meal.id}"] [data-action="outside"]`) });
}

// Ett fast val: vad det gäller och en knapp för att sluta med det.
function fixedNote(meal) {
  const choice = store.choices().fixed[meal.id];
  return h('div', { class: 'fixed-note' },
    h('p', { class: 'changed' }, `Fast val: ${lower(RECIPES[choice.recipe].name)} till ${lower(meal.name)} ${DAY_TEXT[choice.days]} från och med ${dayMonth(choice.at)}.`),
    h('button', { type: 'button', class: 'button quiet small', onclick: () => {
      store.setFixed(meal.id, null);
      refresh();
      $('day-status').textContent = `Det fasta valet för ${lower(meal.name)} är borttaget.`;
      swapButton(meal)()?.focus();
    } }, 'Sluta med det fasta valet'));
}

// Allt som ska lagas till en middag och matlådorna från den (de kan ha olika portionsstorlek).
function wholeBatch(meal, fed) {
  const grams = new Map();
  for (const part of [meal, ...fed.map(other => other.meals[1])]) for (const [food, g] of part.items) grams.set(food, (grams.get(food) || 0) + g);
  return grams;
}

// Knapparna överst i en måltid: laga, byt, favorit och aldrig mer (en matlåda betygsätts som middagen den
// kommer från).
function actions(day, meal, from) {
  if (meal.id === 'shake') return null;
  const outside = h('button', { type: 'button', class: 'button quiet small', 'data-action': 'outside', 'aria-haspopup': 'dialog', onclick: () => openOutside(day, meal) }, meal.outside ? 'Ändra…' : 'Åt annat…');
  if (meal.outside) return h('div', { class: 'actions' }, outside);
  const value = store.rating(meal.recipe);
  const rate = next => {
    store.setRating(meal.recipe, next, today);
    refresh();
    $('day-status').textContent = next === 1 ? `${RECIPES[meal.recipe].name} är en favorit. Den kommer oftare från nästa vecka.`
      : next === -1 ? `${RECIPES[meal.recipe].name} kommer inte tillbaka. Den byts ut från idag.` : 'Betyget är borttaget.';
    document.querySelector(`[data-meal="${meal.id}"] .actions button[data-rate="${next || value}"]`)?.focus();
  };
  return h('div', { class: 'actions' },
    !from && meal.how && meal.recipe !== 'huel' ? h('button', { type: 'button', class: 'button small', 'data-action': 'cook', 'aria-haspopup': 'dialog', onclick: () => openCook(day, meal) }, 'Laga') : null,
    h('button', { type: 'button', class: 'button quiet small', 'data-action': 'swap', 'aria-haspopup': 'dialog', onclick: () => openSwap(day, meal) }, 'Byt…'),
    h('button', { type: 'button', class: 'button quiet small', 'data-rate': '1', 'aria-pressed': String(value === 1), onclick: () => rate(value === 1 ? 0 : 1) }, value === 1 ? '★ Favorit' : '☆ Favorit'),
    h('button', { type: 'button', class: 'button quiet small', 'data-rate': '-1', 'aria-pressed': String(value === -1), onclick: () => rate(value === -1 ? 0 : -1) }, 'Aldrig mer'),
    outside);
}

function mealCard(day, meal, isNow) {
  const key = `${day.date}:${meal.id}`;
  const eaten = store.isEaten(day.date, meal.id);
  const from = meal.leftover ? plan.day(meal.from) : null;
  const fed = meal.id === 'middag' ? lunchesFrom(day.date) : [];
  const changed = meal.swapped || (meal.replaced && !meal.leftover);
  const vegan = !meal.swapped && !meal.fixed && !meal.leftover && (meal.replaced ? meal.replaced.vegan : meal.vegan);
  const favourite = meal.id !== 'shake' && store.rating(meal.recipe) === 1;
  const tags = [
    favourite ? h('span', { class: 'tag tag-fav' }, '★ Favorit') : null,
    isNow ? h('span', { class: 'tag tag-now' }, 'Nu') : null,
    from ? h('span', { class: 'tag' }, 'Matlåda') : null,
    fed.length ? h('span', { class: 'tag tag-batch' }, fed.length > 1 ? 'Storkok' : 'Dubbel sats') : null,
    meal.outside ? h('span', { class: 'tag tag-changed' }, 'Åt annat') : meal.fixed ? h('span', { class: 'tag tag-changed' }, 'Fast val') : vegan ? h('span', { class: 'tag tag-vegan' }, 'Vegansk') : changed ? h('span', { class: 'tag tag-changed' }, 'Bytt') : meal.changes.length ? h('span', { class: 'tag tag-changed' }, 'Anpassad') : null,
    meal.scale !== 1 ? h('span', { class: 'tag' }, `${Math.round(meal.scale * 100)} %`) : null
  ];
  const name = `${meal.title}${from ? ' (rester)' : ''}`;
  const check = h('button', {
    type: 'button', class: 'check', 'aria-pressed': String(eaten),
    'aria-label': `${meal.name}: ${name}. Ätit`,
    onclick: () => { store.toggleEaten(day.date, meal.id); if (day.meals.some(other => other.outside)) refresh(); else renderDay(); document.querySelector(`[data-meal="${meal.id}"] .check`)?.focus(); }
  }, h('span', { class: 'check-mark', 'aria-hidden': 'true' }));

  const details = h('details', { open: open.has(key), ontoggle: event => { if (event.target.open) open.add(key); else open.delete(key); } },
    h('summary', {},
      h('span', { class: 'meal-label' }, meal.name, ...tags),
      h('span', { class: 'meal-name' }, name),
      h('span', { class: 'meal-numbers' }, h('b', {}, `${meal.kcal} kcal`), ` · ${meal.protein} g protein · ${meal.carbs} g kolh · ${meal.fat} g fett`)),
    h('div', { class: 'meal-body' },
      actions(day, meal, from),
      meal.replaced && !meal.leftover ? h('p', { class: 'changed' }, meal.replaced.disliked
        ? `I stället för ${lower(RECIPES[meal.replaced.from].name)}, som du inte vill ha mer.`
        : meal.replaced.vegan
        ? `Veganskt i stället för ${lower(RECIPES[meal.replaced.from].name)}.`
        : `I stället för ${lower(RECIPES[meal.replaced.from].name)}, eftersom du inte äter ${list(meal.replaced.because.map(food => lower(FOODS[food].name)))}.`) : null,
      meal.changes.length ? h('p', { class: 'changed' }, `${meal.changes.join('. ')}.`) : null,
      meal.fixed ? fixedNote(meal) : null,
      meal.outside ? h('p', { class: 'changed' }, `I stället för ${lower(meal.instead.title)}. Uppskattat till ${meal.kcal} kcal och ${meal.protein} g protein; resten av dagen är omräknad efter det.`) : null,
      meal.scale !== 1 ? h('p', { class: 'fine' }, `Portionen är ${Math.round(meal.scale * 100)} % av receptet, för att dagen ska träffa dina mål.`) : null,
      meal.items.length ? h('ul', { class: 'ingredients' }, meal.items.map(([, , text]) => h('li', {}, text))) : null,
      fed.length === 1 ? h('p', { class: 'batch' }, h('b', {}, 'Laga dubbel sats: '), `hälften blir lunch på ${weekdayName(fed[0].date).toLowerCase()}.`) : null,
      fed.length > 1 ? h('p', { class: 'batch' }, h('b', {}, `Storkok, ${meal.portions} portioner: `), `middag idag och matlåda ${list(fed.map(other => weekdayName(other.date).toLowerCase()))}.`) : null,
      fed.length ? h('div', { class: 'whole' }, h('p', {}, h('b', {}, `Hela satsen (${meal.portions} portioner)`)),
        h('ul', { class: 'ingredients' }, [...wholeBatch(meal, fed)].map(([food, grams]) => h('li', {}, cookLine(food, grams))))) : null,
      from ? h('p', { class: 'how' }, `Matlådan från ${weekdayName(from.date).toLowerCase()}ens middag.`) : meal.how ? h('p', { class: 'how' }, meal.how) : null));

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
  $('title').textContent = weekName(state.week);
  $('subtitle').textContent = range(state.week);
  $('week-title').textContent = `${weekName(state.week)} · ${range(state.week)}`;
  $('week-prev').disabled = state.week === WEEK_NUMBERS[0];
  $('week-next').disabled = state.week === WEEK_NUMBERS.at(-1);

  const table = h('table', { class: 'week-table' },
    h('caption', { class: 'visually-hidden' }, `Måltider ${weekName(state.week).toLowerCase()}`),
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Dag'), MEALS.map(meal => h('th', { scope: 'col' }, meal.name)), h('th', { scope: 'col' }, 'kcal / protein'))),
    h('tbody', {}, days.map(day => {
      const eaten = day.meals.filter(meal => store.isEaten(day.date, meal.id)).length;
      return h('tr', { 'data-date': day.date, class: classes(day.date === today && 'is-today', eaten === day.meals.length && 'is-done') },
        h('th', { scope: 'row' }, h('a', { href: `#dag/${day.date}` }, weekdayName(day.date), h('small', {}, dayMonth(day.date)), day.note ? h('small', { class: 'note' }, day.note) : null)),
        day.meals.map(meal => {
          const changed = personal(meal);
          return h('td', { 'data-label': meal.name, class: classes(store.isEaten(day.date, meal.id) && 'is-eaten', changed && 'is-changed') },
            h('span', {}, `${meal.title}${meal.leftover ? ' (rester)' : ''}`, changed ? h('span', { class: 'visually-hidden' }, ' (bytt eller anpassad)') : null,
              meal.id === 'middag' && movable(day) ? h('button', { type: 'button', class: 'move', 'aria-haspopup': 'dialog', 'aria-label': `Flytta ${lower(meal.title)} till en annan dag`, onclick: () => openMove(day) }, 'Flytta') : null));
        }),
        h('td', { class: 'week-total', 'data-label': 'Totalt' }, h('span', {}, h('b', {}, `${number(day.kcal)} kcal`), h('span', {}, `${day.protein} g protein`))));
    })));
  $('week').replaceChildren(table);

  const flow = days.filter(day => day.meals[3].batch).map(day => h('li', {}, h('b', {}, `${shortDay(day.date)}:`), ` ${day.meals[3].title} → ${lunchesFrom(day.date).map(other => shortDay(other.date)).join(', ')} lunch`));
  const kcal = days.map(day => day.kcal), protein = days.map(day => day.protein);
  const changes = days.flatMap(day => day.meals).filter(personal).length;
  $('week-boxes').replaceChildren(...[
    flow.length ? h('div', { class: 'box box-sand' }, h('h3', {}, 'Matlådeflödet'), h('ul', {}, flow)) : null,
    h('div', { class: 'box box-rose' }, h('h3', {}, 'Veckan i siffror'),
      h('p', {}, `${number(Math.min(...kcal))}–${number(Math.max(...kcal))} kcal och ${Math.min(...protein)}–${Math.max(...protein)} g protein om dagen.`),
      changes ? h('p', {}, `${changes} måltider är bytta eller anpassade (markerade med •).`) : null),
    h('div', { class: 'box box-mint' }, h('h3', {}, 'Handla'),
      h('p', {}, 'Allt till veckan på en lista. '), h('a', { href: `#handla/${state.week}` }, `Inköpslista ${weekName(state.week).toLowerCase()}`))
  ].filter(Boolean));
}

// Flytta en middag: den byter plats med middagen en annan dag samma vecka. Matlådorna och inköpslistan följer
// med, eftersom det blir två vanliga byten. Högtidsrätterna står kvar.
const movable = day => CHOOSABLE.includes(day.meals[3].recipe);

function openMove(day) {
  const dinner = day.meals[3];
  const back = () => document.querySelector(`.week-table tr[data-date="${day.date}"] .move`);
  const others = plan.week(day.week).filter(other => other.date !== day.date && movable(other));
  const move = other => {
    const set = (target, recipe) => store.setSwap(target.date, 'middag', recipe === target.meals[3].planned ? null : recipe);
    const [mine, theirs] = [dinner.recipe, other.meals[3].recipe];
    set(day, theirs);
    set(other, mine);
    refresh();
    closeSheet();
    $('week-status').textContent = `${dinner.title} flyttad till ${weekdayName(other.date).toLowerCase()}, och ${lower(other.meals[3].title)} till ${weekdayName(day.date).toLowerCase()}.`;
  };
  openSheet(`Flytta ${lower(dinner.title)}`, [
    h('p', { class: 'fine' }, `Middagen på ${weekdayName(day.date).toLowerCase()} byter plats med den dag du väljer. Matlådorna och inköpslistan följer med.`),
    h('ul', { class: 'swap-results' }, others.map(other => h('li', {},
      h('button', { type: 'button', class: 'swap-option', onclick: () => move(other) },
        h('span', {}, `${weekdayName(other.date)} ${format(other.date, { day: 'numeric', month: 'short' })}`),
        h('small', {}, `${other.meals[3].title} · ${other.meals[3].kcal} kcal`)))))
  ], { back });
}

// ---------- Välkommen: tre steg första gången (mål, vegan, frukost på vardagar) ----------
const BREAKFASTS = [['huel', 'Huel, som i schemat'], ['havregrot', 'Havregrynsgröt med blåbär & kvarg'], ['overnight', 'Overnight oats med kvarg & blåbär'], ['aggrora', 'Äggröra på bröd']];
const VEGAN_BREAKFAST = { havregrot: 'grot_vegan', aggrora: 'tofurora' };

function openIntro() {
  let step = 0;
  const field = (name, label, unit, min, max) => h('label', {}, h('span', {}, label),
    h('input', { type: 'number', inputmode: 'numeric', name, min, max, step: 1, value: GOALS[name] }), h('small', {}, unit));
  const goalsForm = h('div', { class: 'goals intro-goals' }, field('kcal', 'Energi', 'kcal', 1200, 4500), field('protein', 'Protein', 'g', 40, 350));
  const vegan = h('input', { type: 'checkbox', id: 'intro-vegan' });
  const breakfast = h('fieldset', { class: 'intro-choices' }, h('legend', { class: 'visually-hidden' }, 'Frukost på vardagar'),
    BREAKFASTS.map(([value, text], i) => h('label', {}, h('input', { type: 'radio', name: 'intro-breakfast', value, checked: i === 0 }), text)));
  const steps = [
    ['Dina mål', [h('p', {}, 'Schemat räknar portionerna mot ett dagligt mål. Standard är 2 228 kcal och 167 g protein. Kolhydrater, fett och taken för socker och mättat fett ändrar du under Anpassa.'), goalsForm]],
    ['Det här äter du', [h('label', { class: 'goals-fit vegan-choice' }, vegan, ' Jag är vegan'),
      h('p', { class: 'fine' }, 'Annat du inte äter, till exempel champinjoner eller fisk, väljer du bort under Anpassa. Det byts då mot något liknande.')]],
    ['Frukost på vardagar', [h('p', {}, 'Vardagarna börjar med en Huel, men du kan välja något annat. Det blir ett fast val som du kan ändra när du vill.'), breakfast]]
  ];
  const heading = h('h3', { class: 'intro-step', tabindex: '-1' });
  const body = h('div', { class: 'intro-body' });
  const back = h('button', { type: 'button', class: 'button quiet', onclick: () => turn(-1) }, 'Tillbaka');
  const next = h('button', { type: 'button', class: 'button', onclick: () => (step < steps.length - 1 ? turn(1) : finish()) });
  const status = h('p', { class: 'fine', role: 'status' });
  const draw = () => {
    heading.textContent = `${steps[step][0]} (${step + 1} av ${steps.length})`;
    body.replaceChildren(...steps[step][1]);
    back.hidden = step === 0;
    next.textContent = step < steps.length - 1 ? 'Nästa' : 'Klart';
  };
  const turn = by => {
    if (by > 0 && !validGoals()) return;
    step += by;
    status.textContent = '';
    draw();
    heading.focus();
  };
  const validGoals = () => {
    const bad = [...goalsForm.querySelectorAll('input')].find(input => !(Number(input.value) >= Number(input.min) && Number(input.value) <= Number(input.max)));
    status.textContent = bad ? `Skriv ett tal mellan ${bad.min} och ${bad.max}.` : '';
    bad?.focus();
    return !bad;
  };
  const finish = () => {
    const changed = Object.fromEntries([...goalsForm.querySelectorAll('input')].map(input => [input.name, Math.round(Number(input.value))]).filter(([key, value]) => value !== GOALS[key]));
    if (Object.keys(changed).length) store.setGoals({ ...store.choices().goals, ...changed });
    store.setVegan(vegan.checked);
    const chosen = breakfast.querySelector('input:checked').value;
    if (chosen !== 'huel') store.setFixed('frukost', { recipe: (vegan.checked && VEGAN_BREAKFAST[chosen]) || chosen, days: 'vardag', at: startDate(today) });
    refresh();
    closeSheet();
    $('day-status').textContent = 'Klart! Schemat är anpassat. Allt kan ändras under Anpassa.';
  };
  draw();
  openSheet('Välkommen till matschemat', [heading, body, status, h('div', { class: 'intro-nav' }, back, next)],
    { back: () => $('main'), onClose: () => store.setIntro() });
}

// ---------- Handla ----------
function renderShop() {
  const week = state.week;
  const groups = plan.shopping(week);
  const items = groups.flatMap(group => group.items);
  const done = items.filter(item => store.has(week, item.food)).length;
  $('title').textContent = 'Inköpslista';
  $('subtitle').textContent = `${weekName(week)} · ${range(week)}`;
  $('shop-title').textContent = `${weekName(week)} · ${range(week)}`;
  $('shop-prev').disabled = week === WEEK_NUMBERS[0];
  $('shop-next').disabled = week === WEEK_NUMBERS.at(-1);
  $('shop-count').textContent = done === items.length ? `Allt klart: ${items.length} varor` : `${done} av ${items.length} avbockade`;
  const total = items.reduce((sum, item) => sum + item.cost, 0);
  const left = items.filter(item => !store.has(week, item.food)).reduce((sum, item) => sum + item.cost, 0);
  $('shop-cost').replaceChildren(h('strong', {}, `Veckans mat ≈ ${kronor(total)}`), done ? ` · kvar att handla ≈ ${kronor(left)}` : '');
  $('shop-hide').checked = store.hideHave();
  $('shop-store').value = store.shop();
  $('shop').classList.toggle('hide-done', store.hideHave());
  const [storeName, searchUrl] = STORES[store.shop()] || [];
  $('shop').replaceChildren(...groups.map(group => h('section', { class: 'shop-group' },
    h('h3', {}, group.section),
    h('ul', {}, group.items.map(item => {
      const checked = store.has(week, item.food);
      return h('li', { class: checked ? 'is-done' : '' },
        h('label', {},
          h('input', { type: 'checkbox', checked, onchange: () => { store.toggleHave(week, item.food); renderShop(); document.querySelector(`#shop input[data-food="${item.food}"]`)?.focus(); }, 'data-food': item.food }),
          h('span', { class: 'shop-name' }, item.name, item.pantry ? h('small', {}, 'kolla skafferiet') : null),
          h('span', { class: 'shop-amount' }, item.amount, h('small', {}, `≈ ${item.cost < 1 ? '< 1 kr' : kronor(item.cost, 1)}`))),
        searchUrl ? h('a', { class: 'shop-search', href: searchUrl(searchTerm(item.food)), target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Sök ${searchTerm(item.food)} på ${storeName} (ny flik)` }, 'Sök') : null);
    })))),
  h('section', { class: 'shop-group' }, h('h3', {}, 'Kryddor & smaksättare'), h('p', { class: 'fine' }, SPICES)));
}

// Ungefär: totalen avrundad till tiotal kronor, en vara till hela kronor.
const kronor = (amount, step = 10) => `${(Math.max(step, Math.round(amount / step) * step)).toLocaleString('sv-SE')} kr`;

function shopText(week) {
  const lines = [`Inköpslista ${weekName(week).toLowerCase()} (${range(week)})`];
  for (const group of plan.shopping(week)) {
    const left = group.items.filter(item => !store.has(week, item.food));
    if (!left.length) continue;
    lines.push('', group.section, ...left.map(item => `- ${item.name}, ${item.amount}`));
  }
  const cost = plan.shopping(week).flatMap(group => group.items).filter(item => !store.has(week, item.food)).reduce((sum, item) => sum + item.cost, 0);
  lines.push('', `Ungefär ${kronor(cost)}`);
  return lines.join('\n');
}

async function shareShop() {
  const text = shopText(state.week);
  const status = $('shop-status');
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ title: `Inköpslista ${weekName(state.week).toLowerCase()}`, text });
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
  if (food === 'whey' || food === 'veganprotein') return 'ingen proteinshake';
  const swap = swapFor(food, without);
  if (swap === 'drop') return 'tas bort ur recepten';
  if (swap) return `byts mot ${lower(FOODS[swap].name)}`;
  return 'måltiderna byts mot andra';
}

function renderChoices() {
  $('title').textContent = 'Anpassa';
  $('subtitle').textContent = `${format(plan.days[0].date, { month: 'short', year: 'numeric' })} – ${format(plan.days.at(-1).date, { month: 'short', year: 'numeric' })}`;
  const { exclude, vegan } = store.choices();
  const mine = new Set(exclude.filter(food => FOODS[food]));
  const without = plan.without;
  const veganOnly = food => vegan && ANIMAL.includes(food) && !mine.has(food);
  const affected = plan.days.flatMap(day => day.meals).filter(meal => personal(meal) && !meal.swapped).length;
  $('vegan').checked = vegan;
  const toggle = (food, on) => { store.setExcluded(food, on); refresh(); document.querySelector(`#foods input[data-food="${food}"]`)?.focus(); };

  $('excluded').replaceChildren(...(mine.size
    ? [h('ul', { class: 'chips' }, [...mine].sort((a, b) => FOODS[a].name.localeCompare(FOODS[b].name, 'sv')).map(food =>
      h('li', {}, h('button', { type: 'button', class: 'chip', 'aria-label': `Ta bort ${FOODS[food].name} från listan`, onclick: () => { store.setExcluded(food, false); refresh(); } }, FOODS[food].name, h('span', { 'aria-hidden': 'true' }, ' ×'))))),
    h('p', { class: 'fine' }, `Det ändrar ${affected} måltider i schemat. Portionerna räknas om så att dagarna ändå träffar dina mål.`)]
    : [h('p', { class: 'fine' }, vegan ? 'Utöver det veganska äter du allt.' : 'Du äter allt just nu.')]));

  $('foods').replaceChildren(...SECTIONS.map(section => {
    const foods = [...USED].filter(food => FOODS[food].section === section).sort((a, b) => FOODS[a].name.localeCompare(FOODS[b].name, 'sv'));
    const chosen = foods.filter(food => without.has(food)).length;
    return h('details', { class: 'food-group', open: open.has(`foods:${section}`), ontoggle: event => { if (event.target.open) open.add(`foods:${section}`); else open.delete(`foods:${section}`); } },
      h('summary', {}, section, chosen ? h('span', { class: 'count' }, ` (${chosen} bortvalda)`) : null),
      h('ul', {}, foods.map(food => h('li', {}, h('label', {},
        h('input', { type: 'checkbox', checked: without.has(food), disabled: veganOnly(food), 'data-food': food, onchange: event => toggle(food, event.target.checked) }),
        h('span', {}, FOODS[food].name, h('small', {}, veganOnly(food) ? `inte veganskt, ${consequence(food, without)}` : consequence(food, without))))))));
  }));

  const target = goals();
  for (const input of $('goals').elements) {
    if (input.name === 'fit') input.checked = store.choices().fit;
    else if (document.activeElement !== input) input.value = target[input.name];
  }
  $('goals-reset').hidden = !Object.keys(store.choices().goals).length;

  const { palette = 'skog', mode = 'auto' } = store.theme();
  for (const input of $('looks').elements) input.checked = input.value === (input.name === 'palette' ? palette : mode);

  const rated = value => Object.entries(store.ratings()).filter(([recipe, rating]) => rating.r === value && RECIPES[recipe])
    .map(([recipe]) => recipe).sort((a, b) => RECIPES[a].name.localeCompare(RECIPES[b].name, 'sv'));
  const chips = (recipes, label) => h('ul', { class: 'chips' }, recipes.map(recipe => h('li', {},
    h('button', { type: 'button', class: 'chip', 'aria-label': `Ta bort ${RECIPES[recipe].name} från ${label}`, onclick: () => { store.setRating(recipe, 0, today); refresh(); $('ratings-title').focus(); } },
      RECIPES[recipe].name, h('span', { 'aria-hidden': 'true' }, ' ×')))));
  const [liked, never] = [rated(1), rated(-1)];
  $('ratings').replaceChildren(
    h('h4', {}, 'Favoriter'), liked.length ? chips(liked, 'favoriterna') : h('p', { class: 'fine' }, 'Inga favoriter än.'),
    h('h4', {}, 'Aldrig mer'), never.length ? chips(never, 'aldrig mer') : h('p', { class: 'fine' }, 'Inga rätter bortvalda.'));

  const fixed = Object.entries(store.choices().fixed).filter(([, choice]) => RECIPES[choice.recipe]);
  $('fixed').replaceChildren(fixed.length ? h('ul', { class: 'chips' }, fixed.map(([slot, choice]) => {
    const name = MEALS.find(meal => meal.id === slot).name;
    return h('li', {}, h('button', { type: 'button', class: 'chip', 'aria-label': `Ta bort det fasta valet för ${lower(name)}`, onclick: () => { store.setFixed(slot, null); refresh(); $('fixed-title').focus(); } },
      `${name}: ${RECIPES[choice.recipe].name} (${DAY_TEXT[choice.days]})`, h('span', { 'aria-hidden': 'true' }, ' ×')));
  })) : h('p', { class: 'fine' }, 'Inga fasta val. Välj "Varje dag", "Vardagar" eller "Helger" när du byter frukost, lunch, mellanmål eller kvällsmål.'));

  renderOwn();
  renderWeight();

  const swaps = Object.keys(store.choices().swaps).length;
  $('swaps').textContent = swaps ? `Du har bytt ${swaps} ${swaps === 1 ? 'måltid' : 'måltider'} för hand.` : 'Du har inte bytt några måltider. Det gör du under en måltid på dagens sida.';
  $('clear-swaps').hidden = !swaps;
  $('offline').textContent = navigator.serviceWorker?.controller ? 'Schemat är sparat på den här enheten och öppnas även utan nät.' : 'Öppna sidan en gång till med nät så sparas schemat på enheten.';
}

// ---------- Egna recept ----------
const MEAL_NAMES = Object.fromEntries(MEALS.map(meal => [meal.id, meal.name]));
const ownSummary = items => {
  const sum = contents(items);
  const cost = items.reduce((total, [food, grams]) => total + grams * PRICES[food] / 1000, 0);
  return `${Math.round(sum.kcal)} kcal · ${Math.round(sum.protein)} g protein · ${Math.round(sum.carbs)} g kolh · ${Math.round(sum.fat)} g fett · ≈ ${Math.max(1, Math.round(cost))} kr`;
};

function renderOwn() {
  const own = Object.entries(store.own()).sort(([, a], [, b]) => a.name.localeCompare(b.name, 'sv'));
  $('own').replaceChildren(own.length ? h('ul', { class: 'own-list' }, own.map(([id, recipe]) => h('li', {},
    h('span', {}, h('b', {}, recipe.name), h('small', {}, `${MEAL_NAMES[recipe.slot]} · ${ownSummary(recipe.items.filter(([food]) => FOODS[food]))}`)),
    h('button', { type: 'button', class: 'button quiet small', 'data-own': id, 'aria-haspopup': 'dialog', 'aria-label': `Ändra ${recipe.name}`, onclick: () => openOwn(id) }, 'Ändra'))))
    : h('p', { class: 'fine' }, 'Inga egna recept än.'));
}

// Ett eget recept: namn, måltid, ingredienser (från livsmedelslistan, i gram) och hur man gör. Näringen räknas
// medan du skriver.
const foodOptions = chosen => SECTIONS.map(section => h('optgroup', { label: section },
  Object.keys(FOODS).filter(food => FOODS[food].section === section).sort((a, b) => FOODS[a].name.localeCompare(FOODS[b].name, 'sv'))
    .map(food => h('option', { value: food, selected: food === chosen }, FOODS[food].name))));

function openOwn(id = null) {
  const recipe = id ? store.own()[id] : { name: '', slot: 'middag', items: [['kyckling', 150], ['ris', 75], ['broccoli', 150]], how: '' };
  const status = h('p', { class: 'fine', role: 'status' });
  const summary = h('p', { class: 'own-sum', 'aria-live': 'polite' });
  const rows = h('ol', { class: 'own-items' });
  const read = () => [...rows.children].map(row => [row.querySelector('select').value, Number(row.querySelector('input').value)]).filter(([food, grams]) => FOODS[food] && grams > 0);
  const update = () => { const items = read(); summary.textContent = items.length ? `Per portion: ${ownSummary(items)}` : 'Lägg till minst en ingrediens.'; };
  const row = ([food, grams]) => {
    const item = h('li', {},
      h('select', { 'aria-label': 'Ingrediens', onchange: update }, foodOptions(food)),
      h('label', { class: 'own-grams' }, h('input', { type: 'number', inputmode: 'numeric', min: 1, max: 2000, step: 1, value: grams, 'aria-label': 'Gram', oninput: update }), h('small', {}, 'g')),
      h('button', { type: 'button', class: 'own-remove', 'aria-label': 'Ta bort ingrediensen', onclick: () => {
        const next = item.nextElementSibling || item.previousElementSibling;
        item.remove();
        update();
        next?.querySelector('select')?.focus();
      } }, '×'));
    return item;
  };
  rows.append(...recipe.items.map(row));
  const name = h('input', { type: 'text', id: 'own-name', maxlength: 60, autocomplete: 'off', value: recipe.name });
  const slot = h('select', { id: 'own-slot' }, MEALS.map(meal => h('option', { value: meal.id, selected: meal.id === recipe.slot }, meal.name)));
  const how = h('textarea', { id: 'own-how', rows: 4, maxlength: 2000 });
  how.value = recipe.how || '';
  const save = () => {
    const items = read();
    if (!name.value.trim()) { status.textContent = 'Ge receptet ett namn.'; name.focus(); return; }
    if (!items.length) { status.textContent = 'Lägg till minst en ingrediens med gram.'; return; }
    const key = id || `egen_${Date.now().toString(36)}`;
    store.setOwn(key, { name: name.value.trim(), slot: slot.value, items: items.map(([food, grams]) => [food, Math.round(grams)]), how: how.value.trim() });
    refresh();
    closeSheet();
    $('own-status').textContent = `${name.value.trim()} är sparat. Du hittar det under Byt när du söker på namnet.`;
  };
  update();
  openSheet(id ? `Ändra ${recipe.name}` : 'Nytt recept', [
    h('div', { class: 'own-form' },
      h('label', { for: 'own-name' }, 'Namn'), name,
      h('label', { for: 'own-slot' }, 'Måltid'), slot,
      h('p', { class: 'own-head' }, 'Ingredienser för en portion'), rows,
      h('button', { type: 'button', class: 'button quiet small', onclick: () => { rows.append(row(['agg', 60])); update(); rows.lastElementChild.querySelector('select').focus(); } }, 'Lägg till ingrediens'),
      summary,
      h('label', { for: 'own-how' }, 'Gör så här (valfritt)'), how),
    status,
    h('div', { class: 'intro-nav' },
      id ? h('button', { type: 'button', class: 'button quiet', onclick: () => {
        store.setOwn(id, null);
        refresh();
        closeSheet();
        $('own-status').textContent = `${recipe.name} är borttaget.`;
      } }, 'Ta bort') : null,
      h('button', { type: 'button', class: 'button', onclick: save }, 'Spara'))
  ], { back: () => (id && document.querySelector(`[data-own="${id}"]`)) || $('own-new') });
}

// ---------- Vikt ----------
// Vägningarna som en linje (de senaste tolv veckorna), takten de senaste fyra veckorna och ett förslag på
// nytt kcal-mål om du valt en takt.
const kg = value => `${value.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...children) => {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  node.append(...children);
  return node;
};

function weightChart(points) {
  const [width, height, left, right, top, bottom] = [320, 140, 34, 10, 10, 22];
  const times = points.map(([date]) => Date.parse(`${date}T12:00:00Z`));
  const values = points.map(([, value]) => value);
  const [low, high] = [Math.floor(Math.min(...values) - 0.5), Math.ceil(Math.max(...values) + 0.5)];
  const [first, last] = [times[0], Math.max(times.at(-1), times[0] + 86400000)];
  const x = time => left + (time - first) / (last - first) * (width - left - right);
  const y = value => top + (high - value) / (high - low) * (height - top - bottom);
  const label = (text, attrs) => svg('text', { class: 'chart-text', ...attrs }, text);
  return svg('svg', { class: 'weight-chart', viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `Vikt från ${dayMonth(points[0][0])} till ${dayMonth(points.at(-1)[0])}: ${kg(values[0])} till ${kg(values.at(-1))}.` },
    ...[low, high].map(value => svg('line', { class: 'chart-grid', x1: left, x2: width - right, y1: y(value), y2: y(value) })),
    label(String(high), { x: left - 6, y: y(high) + 4, 'text-anchor': 'end' }),
    label(String(low), { x: left - 6, y: y(low) + 4, 'text-anchor': 'end' }),
    label(format(points[0][0], { day: 'numeric', month: 'short' }), { x: left, y: height - 4 }),
    points.length > 1 ? label(format(points.at(-1)[0], { day: 'numeric', month: 'short' }), { x: width - right, y: height - 4, 'text-anchor': 'end' }) : '',
    svg('polyline', { class: 'chart-line', points: times.map((time, i) => `${x(time)},${y(values[i])}`).join(' ') }),
    ...times.map((time, i) => svg('circle', { class: 'chart-dot', cx: x(time), cy: y(values[i]), r: 4 },
      svg('title', {}, `${dayMonth(points[i][0])}: ${kg(values[i])}`))));
}

function renderWeight() {
  const all = Object.entries(store.weights()).sort(([a], [b]) => a.localeCompare(b));
  const form = $('weight-form').elements;
  if (!form.date.value) form.date.value = today;
  form.date.max = today;
  $('weight-goal').value = store.weightGoal() === null ? '' : String(store.weightGoal());
  const recent = all.filter(([date]) => date >= new Date(Date.parse(`${today}T12:00:00Z`) - 84 * 86400000).toISOString().slice(0, 10));
  const trend = weightTrend(store.weights(), store.weightGoal(), goals().kcal, today);
  const pace = rate => (Math.abs(rate) < 0.05 ? 'Vikten står ungefär still' : `Du går ${rate < 0 ? 'ner' : 'upp'} ca ${kg(Math.abs(rate)).replace(' kg', '')} kg i veckan`);
  const suggestion = trend && trend.change ? h('div', { class: 'box box-mint weight-tip' },
    h('p', {}, `${pace(trend.rate)} de senaste fyra veckorna. För takten du vill ha: ${trend.change < 0 ? 'sänk' : 'höj'} målet med ${Math.abs(trend.change)} kcal till ${number(trend.kcal)} kcal om dagen.`),
    h('button', { type: 'button', class: 'button small', onclick: () => {
      store.setGoals({ ...store.choices().goals, kcal: trend.kcal });
      refresh();
      $('weight-status').textContent = `Målet är nu ${number(trend.kcal)} kcal om dagen. Se hur det går ett par veckor innan du ändrar igen.`;
      $('weight-title').focus();
    } }, `Ändra målet till ${number(trend.kcal)} kcal`)) : null;
  $('weight').replaceChildren(...[
    recent.length ? h('h3', { class: 'section-sub' }, 'Vikt, senaste tolv veckorna') : null,
    recent.length ? weightChart(recent) : null,
    h('p', { class: 'fine' }, !all.length ? 'Inga vägningar än.'
      : !trend ? 'Efter minst fyra vägningar över två veckor visar sidan hur fort vikten ändras.'
      : trend.change ? '' : `${pace(trend.rate)} de senaste fyra veckorna.${store.weightGoal() === null ? ' Välj en takt ovan för att få förslag på kcal-mål.' : ' Det stämmer med takten du vill ha.'}`),
    suggestion,
    all.length ? h('ul', { class: 'chips' }, all.slice(-8).reverse().map(([date, value]) => h('li', {},
      h('button', { type: 'button', class: 'chip', 'aria-label': `Ta bort vägningen ${dayMonth(date)}, ${kg(value)}`, onclick: () => {
        store.setWeight(date, null);
        renderWeight();
        $('weight-status').textContent = `Vägningen ${dayMonth(date)} är borttagen.`;
        $('weight-title').focus();
      } }, `${format(date, { day: 'numeric', month: 'short' })}: ${kg(value)}`, h('span', { 'aria-hidden': 'true' }, ' ×'))))) : null
  ].filter(Boolean));
}

// ---------- Händelser ----------
$('own-new').addEventListener('click', () => openOwn());
$('weight-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target.elements;
  const value = Math.round(Number(String(form.kg.value).replace(',', '.')) * 10) / 10;
  if (!form.date.value || form.date.value > today) { $('weight-status').textContent = 'Välj ett datum, idag eller tidigare.'; form.date.focus(); return; }
  if (!(value >= 30 && value <= 300)) { $('weight-status').textContent = 'Skriv vikten i kg, till exempel 82,4.'; form.kg.focus(); return; }
  store.setWeight(form.date.value, value);
  form.kg.value = '';
  renderWeight();
  $('weight-status').textContent = `${kg(value)} ${form.date.value === today ? 'idag' : dayMonth(form.date.value)} är sparat.`;
});
$('weight-goal').addEventListener('change', event => {
  store.setWeightGoal(event.target.value === '' ? null : Number(event.target.value));
  renderWeight();
});
$('day-prev-week').addEventListener('click', () => moveWeek(-1, 'dag'));
$('day-next-week').addEventListener('click', () => moveWeek(1, 'dag'));
$('go-today').addEventListener('click', () => go(`#dag/${startDate(today)}`));
$('week-prev').addEventListener('click', () => moveWeek(-1, 'vecka'));
$('week-next').addEventListener('click', () => moveWeek(1, 'vecka'));
$('shop-prev').addEventListener('click', () => moveWeek(-1, 'handla'));
$('shop-next').addEventListener('click', () => moveWeek(1, 'handla'));
$('shop-hide').addEventListener('change', event => { store.setHide(event.target.checked); renderShop(); });
$('shop-store').addEventListener('change', event => {
  store.setShop(event.target.value);
  renderShop();
  $('shop-status').textContent = event.target.value ? `Tryck på Sök vid en vara för att hitta den på ${STORES[event.target.value][0]}.` : '';
});
$('shop-share').addEventListener('click', shareShop);
$('shop-clear').addEventListener('click', () => { store.clearHave(state.week); $('shop-status').textContent = 'Alla varor är avmarkerade.'; renderShop(); });
$('looks').addEventListener('change', () => {
  const form = $('looks').elements;
  const mode = form.mode.value === 'auto' ? undefined : form.mode.value;
  store.setTheme({ palette: form.palette.value || 'skog', ...(mode && { mode }) });
  globalThis.matschemaTheme?.apply(store.theme());
});
$('looks').addEventListener('submit', event => event.preventDefault());
$('goals').addEventListener('submit', event => event.preventDefault());
$('goals').addEventListener('change', event => {
  const input = event.target;
  if (input.name === 'fit') {
    store.setFit(input.checked);
    $('goals-status').textContent = input.checked ? 'Portionerna justeras efter dina mål.' : 'Recepten används som de är skrivna.';
  } else {
    const value = Math.round(Number(input.value));
    if (!input.value || !Number.isFinite(value) || value < Number(input.min) || value > Number(input.max)) {
      $('goals-status').textContent = `Skriv ett tal mellan ${input.min} och ${input.max}.`;
      input.value = goals()[input.name];
      return;
    }
    const changed = Object.fromEntries(Object.entries({ ...store.choices().goals, [input.name]: value }).filter(([key, amount]) => amount !== GOALS[key]));
    store.setGoals(changed);
    $('goals-status').textContent = 'Schemat är omräknat efter dina mål.';
  }
  refresh();
});
$('goals-reset').addEventListener('click', () => { store.setGoals(null); $('goals-status').textContent = 'Målen är återställda.'; refresh(); $('goals-title').scrollIntoView(); });
$('vegan').addEventListener('change', event => {
  store.setVegan(event.target.checked);
  refresh();
  $('vegan-status').textContent = event.target.checked
    ? 'Schemat är veganskt: kött, fisk, ägg och mejeri är bytta mot veganska rätter och alternativ.'
    : 'Schemat är som vanligt igen.';
});
// ---------- Synk ----------
let incoming = null; // det som väntar på att läsas in från en annan enhet

async function offerSync(code) {
  try {
    showOffer(await unpack(code));
  } catch {
    $('sync-status').textContent = 'Länken gick inte att läsa. Kopiera en ny synklänk på den andra enheten.';
    $('sync-title').scrollIntoView();
  }
}

function showOffer(value) {
  const other = store.clean(value);
  const days = Object.keys(other.eaten).length;
  const liked = Object.values(other.ratings).filter(rating => rating.r === 1).length;
  incoming = other;
  $('sync-summary').textContent = [
    `${days} ${days === 1 ? 'dag' : 'dagar'} med ätna måltider`,
    `${liked} ${liked === 1 ? 'favorit' : 'favoriter'}`,
    `${other.exclude.length} bortvalda livsmedel`,
    other.vegan ? 'vegan' : null,
    other.goals ? 'egna mål' : null,
    Object.keys(other.own).length ? `${Object.keys(other.own).length} egna recept` : null,
    Object.keys(other.weights).length ? `${Object.keys(other.weights).length} vägningar` : null
  ].filter(Boolean).join(', ') + '.';
  $('sync-offer').hidden = false;
  $('sync-title').scrollIntoView();
  $('sync-accept').focus();
}

async function shareSync() {
  const status = $('sync-status');
  try {
    const link = `${location.origin}${location.pathname}#synk/${await pack(store.snapshot())}`;
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ title: 'Matschema: synklänk', url: link });
      status.textContent = '';
    } else {
      await navigator.clipboard.writeText(link);
      status.textContent = 'Synklänken är kopierad. Öppna den på den andra enheten.';
    }
  } catch (error) {
    if (error.name !== 'AbortError') status.textContent = 'Det gick inte att skapa länken. Spara som fil i stället.';
  }
}

$('sync-link').addEventListener('click', shareSync);
$('sync-save').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([fileText(store.snapshot(), today)], { type: 'application/json' }));
  const link = h('a', { href: url, download: `matschema-${today}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('sync-status').textContent = 'Filen är sparad. Läs in den på den andra enheten.';
});
$('sync-open').addEventListener('click', () => $('sync-file').click());
$('sync-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    showOffer(readFile(await file.text()));
  } catch {
    $('sync-status').textContent = 'Filen gick inte att läsa. Välj en fil som sparats här.';
  }
});
$('sync-accept').addEventListener('click', () => {
  if (incoming) store.merge(incoming);
  incoming = null;
  $('sync-offer').hidden = true;
  globalThis.matschemaTheme?.apply(store.theme());
  refresh();
  $('sync-status').textContent = 'Inläst. Schemat, bockarna och favoriterna är nu desamma som på den andra enheten.';
  $('sync-title').focus();
});
$('sync-cancel').addEventListener('click', () => {
  incoming = null;
  $('sync-offer').hidden = true;
  $('sync-status').textContent = 'Inget lästes in.';
  $('sync-title').focus();
});

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

const firstVisit = store.isNew() && !location.hash.startsWith('#synk/');
route();
if (firstVisit) openIntro();
