// Det du bockar av och väljer: ätna måltider per datum, inköpta varor per vecka, det du inte äter,
// måltider du bytt, fasta val, om du är vegan, favoriter och rätter du inte vill ha, dina mål, butiken du söker
// varor i, egna recept, det du ätit i stället, din vikt och färgtemat. Bara i
// den här webbläsarens lokala lagring ("lovgren-matschema", listad på /cookies/), och bara när du ändrar något
// (eller stänger välkomstrutan, som då inte visas igen).
const KEY = 'lovgren-matschema';
const blank = () => ({ eaten: {}, have: {}, hide: false, exclude: [], swaps: {}, ratings: {}, fixed: {}, own: {}, outside: {}, weights: {} });

// Bara det sidan känner till, i rätt form (gäller också det som läses in från en annan enhet).
const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const entries = (value, keep) => Object.fromEntries(Object.entries(isObject(value) ? value : {}).filter(keep));
const strings = list => (Array.isArray(list) ? list.filter(item => typeof item === 'string') : []);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLOTS = ['frukost', 'lunch', 'mellanmal', 'middag', 'kvallsmal'];
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const within = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;

export function clean(value) {
  if (!isObject(value)) return blank();
  const lists = map => Object.fromEntries(Object.entries(isObject(map) ? map : {}).map(([key, list]) => [key, strings(list)]).filter(([, list]) => list.length));
  const result = {
    eaten: lists(value.eaten),
    have: lists(value.have),
    hide: value.hide === true,
    exclude: strings(value.exclude),
    swaps: entries(value.swaps, ([, recipe]) => typeof recipe === 'string'),
    ratings: entries(value.ratings, ([, rating]) => isObject(rating) && [-1, 0, 1].includes(rating.r) && DATE.test(rating.at)),
    fixed: entries(value.fixed, ([slot, choice]) => ['frukost', 'lunch', 'mellanmal', 'kvallsmal'].includes(slot) && isObject(choice)
      && typeof choice.recipe === 'string' && ['alla', 'vardag', 'helg'].includes(choice.days) && DATE.test(choice.at)),
    own: entries(value.own, ([id, recipe]) => /^egen_[a-z0-9]+$/.test(id) && isObject(recipe) && text(recipe.name, 60) && SLOTS.includes(recipe.slot)
      && Array.isArray(recipe.items) && recipe.items.length > 0 && recipe.items.length <= 20
      && recipe.items.every(item => Array.isArray(item) && typeof item[0] === 'string' && within(item[1], 1, 5000))
      && (recipe.how === undefined || (typeof recipe.how === 'string' && recipe.how.length <= 2000))),
    outside: entries(value.outside, ([key, meal]) => new RegExp(`^\\d{4}-\\d{2}-\\d{2}:(${SLOTS.join('|')}|extra)$`).test(key) && isObject(meal)
      && text(meal.label, 60) && within(meal.kcal, 0, 5000) && within(meal.protein, 0, 400)
      && (meal.carbs === undefined || ['carbs', 'sugar', 'fat', 'satfat'].every(key => within(meal[key], 0, 1000)))
      && (meal.items === undefined || (Array.isArray(meal.items) && meal.items.length <= 30 && meal.items.every(item => Array.isArray(item)
        && /^(lv\d{1,6}|[a-z_]{2,20})$/.test(item[0]) && text(item[1], 120) && within(item[2], 1, 5000))))),
    weights: entries(value.weights, ([date, kg]) => DATE.test(date) && within(kg, 30, 300))
  };
  if ([-0.5, -0.25, 0, 0.25].includes(value.weightGoal)) result.weightGoal = value.weightGoal;
  const goals = entries(value.goals, ([, amount]) => Number.isFinite(amount));
  if (Object.keys(goals).length) result.goals = goals;
  if (value.fit === false) result.fit = false;
  if (value.vegan === true) result.vegan = true;
  if (value.intro === true) result.intro = true;
  if (['willys', 'coop', 'citygross'].includes(value.shop)) result.shop = value.shop;
  const theme = entries(value.theme, ([key, text]) => ['palette', 'mode'].includes(key) && typeof text === 'string');
  if (Object.keys(theme).length) result.theme = theme;
  return result;
}

function load() {
  try {
    return clean(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return blank();
  }
}

let data = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* privat läge eller full lagring: gäller tills sidan laddas om */ }
}

function toggle(map, key, item) {
  const list = new Set(map[key] || []);
  if (list.has(item)) list.delete(item); else list.add(item);
  if (list.size) map[key] = [...list]; else delete map[key];
  save();
  return list.has(item);
}

export const isEaten = (date, meal) => Boolean(data.eaten[date]?.includes(meal));
export const toggleEaten = (date, meal) => toggle(data.eaten, date, meal);
export const has = (week, food) => Boolean(data.have[week]?.includes(food));
export const toggleHave = (week, food) => toggle(data.have, week, food);
export const hideHave = () => data.hide;

// Butiken inköpslistan söker i (willys, coop, citygross) eller ingen.
export const shop = () => data.shop || '';

export function setShop(name) {
  if (name) data.shop = name; else delete data.shop;
  save();
}

export function setHide(hide) {
  data.hide = hide;
  save();
}

// Färgtemat: { palette, mode }, läses också av theme.js innan sidan ritas.
export const theme = () => data.theme || {};

export function setTheme(value) {
  data.theme = value;
  save();
}

// Dina dagliga mål (bara de du ändrat; resten är standard) och om portionerna ska justeras efter dem.
export function setGoals(goals) {
  if (goals && Object.keys(goals).length) data.goals = goals; else delete data.goals;
  save();
}

export function setFit(fit) {
  if (fit) delete data.fit; else data.fit = false;
  save();
}

// Första besöket: inget sparat alls.
export function isNew() {
  try { return localStorage.getItem(KEY) === null; } catch { return false; }
}

export function setIntro() {
  data.intro = true;
  save();
}

export function setVegan(vegan) {
  if (vegan) data.vegan = true; else delete data.vegan;
  save();
}

// Favorit (1), aldrig mer (-1) eller inget (0), och dagen du satte det: "aldrig mer" gäller från den dagen,
// en favorit från veckan efter. Ett ångrat betyg sparas som 0, så att det också följer med i en synk.
export const rating = recipe => data.ratings[recipe]?.r || 0;
export const ratings = () => data.ratings;

export function setRating(recipe, r, at) {
  data.ratings[recipe] = { r, at };
  save();
}

// Det planen behöver: vad du inte äter, vilka måltider du bytt, dina mål, om portionerna justeras, om du är
// vegan, dina betyg och dina fasta val.
export const choices = () => ({ exclude: data.exclude, swaps: data.swaps, goals: data.goals || {}, fit: data.fit !== false, vegan: data.vegan === true, ratings: data.ratings, fixed: data.fixed,
  own: data.own, outside: data.outside, eaten: data.eaten });

// Egna recept: { name, slot, items: [[livsmedel, gram]], how }, eller null för att ta bort.
export const own = () => data.own;
export function setOwn(id, recipe) {
  if (recipe) data.own[id] = recipe; else delete data.own[id];
  save();
}

// Det du ätit i stället för en måltid, eller utöver dem (meal = "extra"): { label, kcal, protein } och, när du sökt
// fram livsmedlen, carbs, sugar, fat, satfat och items = [[livsmedel, namn, gram]]. null går tillbaka till planen.
export function setOutside(date, meal, value) {
  if (value) data.outside[`${date}:${meal}`] = value; else delete data.outside[`${date}:${meal}`];
  save();
}

// Vikten: { datum: kg }, och takten du vill ha (kg per vecka, minus är ner) eller ingen.
export const weights = () => data.weights;
export const weightGoal = () => data.weightGoal ?? null;
export function setWeight(date, kg) {
  if (kg) data.weights[date] = kg; else delete data.weights[date];
  save();
}
export function setWeightGoal(rate) {
  if (rate === null) delete data.weightGoal; else data.weightGoal = rate;
  save();
}

// Ett fast val för en måltid ({ recipe, days, at }) eller inget (null). Byten för enskilda dagar från och med
// at tas bort, så att det fasta valet gäller.
export function setFixed(meal, choice) {
  if (choice) {
    data.fixed[meal] = choice;
    for (const key of Object.keys(data.swaps)) if (key.endsWith(`:${meal}`) && key.slice(0, 10) >= choice.at) delete data.swaps[key];
  } else {
    delete data.fixed[meal];
  }
  save();
}

// ---------- Synk ----------
export const snapshot = () => structuredClone(data);

// Läs in från en annan enhet: dess inställningar gäller (mål, bortval, byten, vegan, tema), ätna måltider,
// avbockade varor, egna recept, det du ätit i stället och vägningarna slås ihop, och för varje betyg vinner det senaste.
export function merge(incoming) {
  const other = clean(incoming);
  const union = (mine, theirs) => {
    const result = { ...mine };
    for (const [key, list] of Object.entries(theirs)) result[key] = [...new Set([...(result[key] || []), ...list])];
    return result;
  };
  const ratings = { ...data.ratings };
  for (const [recipe, value] of Object.entries(other.ratings)) if (!ratings[recipe] || value.at >= ratings[recipe].at) ratings[recipe] = value;
  data = { ...other, eaten: union(data.eaten, other.eaten), have: union(data.have, other.have), ratings,
    own: { ...data.own, ...other.own }, outside: { ...data.outside, ...other.outside }, weights: { ...data.weights, ...other.weights } };
  save();
}

export function setExcluded(food, excluded) {
  data.exclude = excluded ? [...new Set([...data.exclude, food])] : data.exclude.filter(item => item !== food);
  save();
}

export function setSwap(date, meal, recipe) {
  if (recipe) data.swaps[`${date}:${meal}`] = recipe; else delete data.swaps[`${date}:${meal}`];
  save();
}

export function clearSwaps() {
  data.swaps = {};
  save();
}

export function clearHave(week) {
  delete data.have[week];
  save();
}

export function forget() {
  data = blank();
  try { localStorage.removeItem(KEY); } catch { /* inget att radera */ }
}

// En annan flik har ändrat något.
export function reload() {
  data = load();
}
export { KEY };
