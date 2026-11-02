// Det du bockar av och väljer: ätna måltider per datum, inköpta varor per vecka, det du inte äter,
// måltider du bytt, om du är vegan, favoriter och rätter du inte vill ha, dina mål och färgtemat. Bara i
// den här webbläsarens lokala lagring ("lovgren-matschema", listad på /cookies/), och bara när du ändrar något.
const KEY = 'lovgren-matschema';
const blank = () => ({ eaten: {}, have: {}, hide: false, exclude: [], swaps: {}, ratings: {} });

// Bara det sidan känner till, i rätt form (gäller också det som läses in från en annan enhet).
const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const entries = (value, keep) => Object.fromEntries(Object.entries(isObject(value) ? value : {}).filter(keep));
const strings = list => (Array.isArray(list) ? list.filter(item => typeof item === 'string') : []);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function clean(value) {
  if (!isObject(value)) return blank();
  const lists = map => Object.fromEntries(Object.entries(isObject(map) ? map : {}).map(([key, list]) => [key, strings(list)]).filter(([, list]) => list.length));
  const result = {
    eaten: lists(value.eaten),
    have: lists(value.have),
    hide: value.hide === true,
    exclude: strings(value.exclude),
    swaps: entries(value.swaps, ([, recipe]) => typeof recipe === 'string'),
    ratings: entries(value.ratings, ([, rating]) => isObject(rating) && [-1, 0, 1].includes(rating.r) && DATE.test(rating.at))
  };
  const goals = entries(value.goals, ([, amount]) => Number.isFinite(amount));
  if (Object.keys(goals).length) result.goals = goals;
  if (value.fit === false) result.fit = false;
  if (value.vegan === true) result.vegan = true;
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
// vegan och dina betyg.
export const choices = () => ({ exclude: data.exclude, swaps: data.swaps, goals: data.goals || {}, fit: data.fit !== false, vegan: data.vegan === true, ratings: data.ratings });

// ---------- Synk ----------
export const snapshot = () => structuredClone(data);

// Läs in från en annan enhet: dess inställningar gäller (mål, bortval, byten, vegan, tema), ätna måltider och
// avbockade varor slås ihop, och för varje betyg vinner det senaste.
export function merge(incoming) {
  const other = clean(incoming);
  const union = (mine, theirs) => {
    const result = { ...mine };
    for (const [key, list] of Object.entries(theirs)) result[key] = [...new Set([...(result[key] || []), ...list])];
    return result;
  };
  const ratings = { ...data.ratings };
  for (const [recipe, value] of Object.entries(other.ratings)) if (!ratings[recipe] || value.at >= ratings[recipe].at) ratings[recipe] = value;
  data = { ...other, eaten: union(data.eaten, other.eaten), have: union(data.have, other.have), ratings };
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
