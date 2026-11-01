// Det du bockar av och väljer: ätna måltider per datum, inköpta varor per vecka, det du inte äter och
// måltider du bytt. Bara i den här webbläsarens lokala lagring ("lovgren-matschema", listad på
// /cookies/), och bara när du ändrar något.
const KEY = 'lovgren-matschema';
const blank = () => ({ eaten: {}, have: {}, hide: false, exclude: [], swaps: {} });

function load() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY));
    if (!value || typeof value !== 'object') return blank();
    return { ...blank(), ...value, hide: Boolean(value.hide), exclude: Array.isArray(value.exclude) ? value.exclude : [], swaps: value.swaps || {} };
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

// Det planen behöver: vad du inte äter och vilka måltider du bytt.
export const choices = () => ({ exclude: data.exclude, swaps: data.swaps });

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
