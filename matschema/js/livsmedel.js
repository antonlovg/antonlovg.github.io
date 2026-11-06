// Sök på det du ätit: schemats egna livsmedel och Livsmedelsverkets livsmedelsdatabas (data/livsmedel.json,
// CC BY 4.0, hämtad med scripts/fetch-livsmedel.mjs). Filen kommer från sidan själv första gången du söker och
// sparas sedan för offline, så det du söker på lämnar aldrig telefonen. Allt räknas per 100 g.
import { FOODS, MACROS } from './foods.js';

export const KEYS = ['kcal', 'protein', 'carbs', 'sugar', 'fat', 'satfat'];

// Ord som folk säger men som databasen kallar något annat.
const ALIASES = { sprodbakad: 'panerad', sprodbakade: 'panerad', panerade: 'panerad', friterad: 'friter', friterade: 'friter' };

// Små bokstäver utan accenter och prickar, så att "rakor" hittar "Räkor" och "creme" hittar "Crème".
export const plain = text => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9%,. ]+/g, ' ');

const entry = (ref, name, per, own = false) => ({ ref, name, per, own, key: plain(name) });

// Schemats livsmedel först: det är dem du köper hem (och de märken som inte finns i databasen).
export const OWN = Object.entries(FOODS).map(([id, food]) => {
  const [carbs, sugar, fat, satfat] = MACROS[id];
  return entry(id, food.name, { kcal: food.kcal, protein: food.protein, carbs, sugar, fat, satfat }, true);
});

// Databasens rader: [nummer, namn, kcal, protein, kolhydrater, socker, fett, mättat fett]. I databasen är sockret
// ibland lite mer än kolhydraterna (de räknas fram på olika sätt); här är det "varav socker", så högst lika mycket.
export const fromData = data => data.foods.map(([nummer, name, ...values]) => {
  const per = Object.fromEntries(KEYS.map((key, i) => [key, values[i]]));
  per.sugar = Math.min(per.sugar, per.carbs);
  return entry(`lv${nummer}`, name, per);
});

let loading = null;
export function load() {
  loading ??= fetch(new URL('../data/livsmedel.json', import.meta.url))
    .then(response => { if (!response.ok) throw new Error(response.status); return response.json(); })
    .then(data => [...OWN, ...fromData(data)])
    .catch(error => { loading = null; throw error; });
  return loading;
}

// Varje ord ska finnas någonstans i namnet. Bäst är schemats egna, sedan namn som börjar med det första ordet,
// sedan korta namn (de är oftast basvaran, inte en rätt med den i).
export function search(query, foods, limit = 8) {
  const words = plain(query).split(/\s+/).filter(Boolean).flatMap(word => (ALIASES[word] ?? word).split(' '));
  if (!words.length) return [];
  const score = food => (food.own ? 0 : 1000) + (food.key.startsWith(words[0]) ? 0 : 500) + food.key.length;
  return foods.filter(food => words.every(word => food.key.includes(word))).sort((a, b) => score(a) - score(b)).slice(0, limit);
}

// Näringen i det du ätit: [[ref, namn, gram]] mot livsmedlen som de per 100 g.
export function total(items, foods) {
  const sum = Object.fromEntries(KEYS.map(key => [key, 0]));
  for (const [ref, , grams] of items) {
    const food = foods.find(other => other.ref === ref);
    if (food) for (const key of KEYS) sum[key] += food.per[key] * grams / 100;
  }
  return Object.fromEntries(KEYS.map(key => [key, Math.round(sum[key])]));
}
