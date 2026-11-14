// Det du skriver in: sakerna på listan (namn, länk, pris, antal, anteckning, om de är köpta) och om sidan ska
// vara ljus eller mörk. Bara i den här webbläsarens lokala lagring ("lovgren-flytt", listad på /cookies/), och
// bara när du ändrar något. Varje sak har ett id och när den senast ändrades (at), så att två enheter kan slås
// ihop; en borttagen sparas som { gone: true, at } så att den inte kommer tillbaka från den andra enheten.
import { safeLink } from './list.js';

const KEY = 'lovgren-flytt';
const blank = () => ({ items: {}, theme: 'light' });

// Bara det sidan känner till, i rätt form (gäller också det som läses in från en annan enhet).
const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const ID = /^[a-z0-9]{1,24}$/;
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const within = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const stamp = value => within(value, 0, 1e14);

const item = value => isObject(value) && stamp(value.at) && (value.gone === true || (text(value.name, 80)
  && (value.note === undefined || (typeof value.note === 'string' && value.note.length <= 500))
  && (value.link === undefined || value.link === '' || (typeof value.link === 'string' && safeLink(value.link) === value.link))
  && Number.isInteger(value.qty) && within(value.qty, 1, 999) && (value.price === null || within(value.price, 0, 1e6))
  && typeof value.done === 'boolean' && stamp(value.made)));

// Bara det en sak består av (en äldre version hade också rum, som inte används längre).
const KEEP = ['id', 'name', 'link', 'price', 'qty', 'note', 'done', 'made', 'at'];
const tidy = value => (value.gone ? { gone: true, at: value.at } : Object.fromEntries(KEEP.filter(key => key in value).map(key => [key, value[key]])));

export function clean(value) {
  if (!isObject(value)) return blank();
  // Äldre versioner sparade sakerna under "buy" (och en att göra-lista, som är borttagen).
  const source = isObject(value.items) ? value.items : value.buy;
  const items = Object.fromEntries(Object.entries(isObject(source) ? source : {})
    .filter(([id, entry]) => ID.test(id) && item(entry)).map(([id, entry]) => [id, tidy(entry)]));
  return { items, theme: value.theme === 'dark' ? 'dark' : 'light' };
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

export const id = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------- Sakerna ----------
export const items = () => Object.entries(data.items).filter(([, value]) => !value.gone).map(([key, value]) => ({ ...value, id: key }));
export function setItem(key, value) {
  data.items[key] = value ? { ...value, id: key, at: Date.now() } : { gone: true, at: Date.now() };
  save();
}

// ---------- Ljust eller mörkt ----------
export const theme = () => data.theme;
export function setTheme(value) {
  data.theme = value === 'dark' ? 'dark' : 'light';
  save();
}

// ---------- Synk ----------
export const snapshot = () => structuredClone(data);

// Läs in från en annan enhet: för varje sak gäller den senaste ändringen (även att den tagits bort). Ljust
// eller mörkt följer den här enheten.
export function merge(incoming) {
  const other = clean(incoming);
  const result = { ...data.items };
  for (const [key, value] of Object.entries(other.items)) if (!result[key] || value.at >= result[key].at) result[key] = value;
  data = { ...data, items: result };
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
