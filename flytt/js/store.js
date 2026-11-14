// Det du skriver in: flyttdagen, uppgifterna (från början mallen) och sakerna att köpa. Bara i den här
// webbläsarens lokala lagring ("lovgren-flytt", listad på /cookies/), och bara när du ändrar något.
// Varje uppgift och sak har ett id och när den senast ändrades (at), så att två enheter kan slås ihop; en
// borttagen sparas som { gone: true, at } så att den inte kommer tillbaka från den andra enheten.
import { PHASE_DAYS, ROOMS, TEMPLATE } from './list.js';

const KEY = 'lovgren-flytt';
const blank = () => ({ tasks: Object.fromEntries(TEMPLATE.map(task => [task.id, { ...task, at: 0 }])), buy: {}, hide: [] });
const LISTS = ['tasks', 'items'];

// Bara det sidan känner till, i rätt form (gäller också det som läses in från en annan enhet).
const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[a-z0-9]{1,24}$/;
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const note = value => value === undefined || (typeof value === 'string' && value.length <= 500);
const within = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const stamp = value => within(value, 0, 1e14);

const task = value => isObject(value) && stamp(value.at) && (value.gone === true || (text(value.title, 120) && note(value.note)
  && PHASE_DAYS.includes(value.days) && typeof value.done === 'boolean' && stamp(value.made)));
const item = value => isObject(value) && stamp(value.at) && (value.gone === true || (text(value.name, 80) && note(value.note)
  && ROOMS.includes(value.room) && Number.isInteger(value.qty) && within(value.qty, 1, 999)
  && (value.price === null || within(value.price, 0, 1e6)) && typeof value.done === 'boolean' && stamp(value.made)));
const keep = (map, valid) => Object.fromEntries(Object.entries(isObject(map) ? map : {}).filter(([id, value]) => ID.test(id) && valid(value)));

export function clean(value) {
  if (!isObject(value)) return blank();
  const result = { tasks: keep(value.tasks, task), buy: keep(value.buy, item), hide: Array.isArray(value.hide) ? LISTS.filter(list => value.hide.includes(list)) : [] };
  if (DATE.test(value.date)) result.date = value.date;
  return result;
}

function load() {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === null ? blank() : clean(JSON.parse(saved));
  } catch {
    return blank();
  }
}

let data = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* privat läge eller full lagring: gäller tills sidan laddas om */ }
}

const live = map => Object.values(map).filter(value => !value.gone);
export const id = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------- Flyttdagen och visningen ----------
export const date = () => data.date ?? null;
export function setDate(value) {
  if (value) data.date = value; else delete data.date;
  save();
}
// Om det klara ("tasks") eller köpta ("items") ska döljas.
export const hide = list => data.hide.includes(list);
export function setHide(list, value) {
  data.hide = LISTS.filter(other => (other === list ? value : data.hide.includes(other)));
  save();
}

// ---------- Uppgifter ----------
export const tasks = () => live(data.tasks);
export function setTask(key, value) {
  data.tasks[key] = value ? { ...value, id: key, at: Date.now() } : { gone: true, at: Date.now() };
  save();
}
// Lägg tillbaka mallens uppgifter som du tagit bort.
export function restoreTemplate(missing) {
  for (const value of missing) data.tasks[value.id] = { ...value, at: Date.now() };
  save();
}

// ---------- Inköp ----------
export const items = () => live(data.buy);
export function setItem(key, value) {
  data.buy[key] = value ? { ...value, id: key, at: Date.now() } : { gone: true, at: Date.now() };
  save();
}

// ---------- Synk ----------
export const snapshot = () => structuredClone(data);

// Läs in från en annan enhet: för varje uppgift och sak gäller den senaste ändringen (även att den tagits bort),
// och flyttdagen därifrån gäller om den har en.
export function merge(incoming) {
  const other = clean(incoming);
  const newest = (mine, theirs) => {
    const result = { ...mine };
    for (const [key, value] of Object.entries(theirs)) if (!result[key] || value.at >= result[key].at) result[key] = value;
    return result;
  };
  data = { ...data, tasks: newest(data.tasks, other.tasks), buy: newest(data.buy, other.buy), ...(other.date ? { date: other.date } : {}) };
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
