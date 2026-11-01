// Veckorna, från vecka 45 till årets sista vecka. En dag är fem recept i måltidsordning; "<" i lunchen
// betyder resterna av gårdagens middag (den lagas då i dubbel sats). makePlan lägger på dina val (det du
// inte äter, måltider du bytt) och räknar fram dagarnas kcal och protein och veckans inköpslista.
import { FOODS, SECTIONS, SWAPS, WORDS } from './foods.js';
import { RECIPES } from './recipes.js';

export const TARGET = { kcal: 2100, protein: 90 };
export const MEALS = [
  { id: 'frukost', name: 'Frukost', until: 10 },
  { id: 'lunch', name: 'Lunch', until: 14 },
  { id: 'mellanmal', name: 'Mellanmål', until: 17 },
  { id: 'middag', name: 'Middag', until: 20 },
  { id: 'kvallsmal', name: 'Kvällsmål', until: 24 }
];

const WEEKS = {
  45: ['huel tonfiskpasta apple_mandlar curry kvarg_blabar',
    'huel < banan_jnt chili knacke_keso',
    'huel < apple_mandlar ugnskyckling kvarg_blabar',
    'huel < banan_jnt bolognese kalkonmackor',
    'huel < kvarg_mango tacos choklad',
    'aggrora tonfiskwrap huel burgare kvarg_blabar_liten',
    'proteingrot grekisk huel kycklingwok knacke_ost'],
  46: ['huel kycklingsallad apple_mandlar kycklinggryta knacke_agg',
    'huel < banan_jnt lasagne kvarg_blabar_liten',
    'huel < apple_mandlar mexgryta knacke_ost',
    'huel < banan_jnt stroganoff kvarg_blabar_liten',
    'huel < kvarg_mango tortillapizza choklad',
    'omelett tonfisksallad huel pannbiff kvarg_hallon',
    'pannkakor linssoppa huel nudelwok knacke_ost'],
  47: ['huel tonfiskpasta apple_mandlar linsgryta knacke_keso',
    'huel < banan_jnt biffar kvarg_blabar',
    'huel < apple_mandlar pestopasta knacke_keso',
    'huel < banan_jnt chili kvarg_blabar_liten',
    'huel < kvarg_mango gyros choklad',
    'aggrora kycklingwrap huel burgare kvarg_blabar_liten',
    'overnight grekisk huel schnitzel knacke_keso'],
  48: ['huel pestosallad apple_mandlar curry kvarg_blabar_liten',
    'huel < banan_jnt bolognese knacke_keso',
    'huel < apple_mandlar ugnskyckling kvarg_blabar',
    'huel < banan_jnt kottbullar knacke_agg',
    'huel < kvarg_mango tacos choklad',
    'pannkakor tonfiskwrap huel pannbiff kvarg_blabar',
    'omelett linssoppa huel kycklingwok pepparkakor'],
  49: ['huel kycklingsallad clementin_mandlar mexgryta kalkonmackor',
    'huel < banan_jnt lasagne kvarg_blabar_liten',
    'huel < clementin_mandlar kycklinggryta knacke_ost',
    'huel < banan_jnt biffar kvarg_blabar',
    'huel < banan_jnt tortillapizza choklad',
    'omelett tonfisksallad huel burgare kvarg_hallon',
    'overnight grekisk huel kycklingwok pepparkakor'],
  50: ['huel tonfiskpasta clementin_mandlar stroganoff kvarg_blabar_liten',
    'huel < banan_jnt linsgryta knacke_keso',
    'huel < clementin_mandlar chili kvarg_blabar',
    'huel < banan_jnt pestopasta knacke_agg',
    'huel < kvarg_mango gyros choklad',
    'aggrora kycklingwrap huel schnitzel kvarg_blabar_liten',
    'pannkakor tonfiskwrap huel pannbiff lussekatt'],
  51: ['huel pestosallad clementin_mandlar curry kvarg_blabar_liten',
    'huel < banan_jnt kottbullar knacke_keso',
    'huel < clementin_mandlar ugnskyckling kvarg_blabar',
    'huel < banan_jnt bolognese knacke_agg',
    'huel < kvarg_mango tacos choklad',
    'proteingrot tonfiskwrap huel burgare kvarg_blabar',
    'omelett grekisk huel kycklingwok pepparkakor'],
  52: ['huel kycklingsallad clementin_mandlar kycklinggryta knacke_agg',
    'huel < banan_jnt lasagne kvarg_blabar_liten',
    'huel < clementin_mandlar mexgryta knacke_ost',
    'risgrynsgrot tonfiskwrap huel julbord julgodis',
    'aggrora julmacka huel kottbullar julgodis',
    'pannkakor tonfisksallad huel nudelwok kvarg_blabar_liten',
    'overnight linssoppa huel schnitzel knacke_keso'],
  53: ['huel tonfiskpasta clementin_mandlar biffar kalkonmackor',
    'huel < banan_jnt stroganoff knacke_keso',
    'huel < clementin_mandlar linsgryta kvarg_blabar',
    'huel < banan_jnt nyar nyarsdessert',
    'pannkakor kycklingwrap huel kycklingwok kvarg_blabar',
    'aggrora grekisk huel burgare kvarg_blabar_liten',
    'proteingrot tonfisksallad huel pestopasta knacke_keso']
};

// Helgdagar och annat som står på dagen.
export const NOTES = {
  '2026-11-08': 'Fars dag',
  '2026-11-29': 'Första advent',
  '2026-12-06': 'Andra advent',
  '2026-12-13': 'Lucia · tredje advent',
  '2026-12-20': 'Fjärde advent',
  '2026-12-24': 'Julafton',
  '2026-12-25': 'Juldagen',
  '2026-12-26': 'Annandag jul',
  '2026-12-31': 'Nyårsafton',
  '2027-01-01': 'Nyårsdagen'
};

export const WEEK_NUMBERS = Object.keys(WEEKS).map(Number);
const FIRST_MONDAY = Date.UTC(2026, 10, 2); // vecka 45
const DAY = 86400000;

// Datum som "ÅÅÅÅ-MM-DD" (lokal tid för "idag", UTC internt så att sommartid inte flyttar dagar).
export const iso = time => new Date(time).toISOString().slice(0, 10);
export const parseIso = text => Date.UTC(+text.slice(0, 4), +text.slice(5, 7) - 1, +text.slice(8, 10));
export const todayIso = (now = new Date()) => iso(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

export function nutrition(id) {
  const recipe = RECIPES[id];
  if (!recipe) throw new Error(`Okänt recept: ${id}`);
  let kcal = 0, protein = 0;
  for (const [food, grams] of recipe.items) {
    const item = FOODS[food];
    if (!item) throw new Error(`Okänt livsmedel i ${id}: ${food}`);
    kcal += item.kcal * grams / 100;
    protein += item.protein * grams / 100;
  }
  return { kcal: Math.round(kcal), protein: Math.round(protein) };
}

// Planen som den är skriven: varje dag med fem recept-id ("<" = gårdagens middag).
const BASE = WEEK_NUMBERS.flatMap((week, w) => WEEKS[week].map((line, d) => {
  const date = iso(FIRST_MONDAY + (w * 7 + d) * DAY);
  const ids = line.split(/\s+/);
  if (ids.length !== MEALS.length) throw new Error(`${date}: ${ids.length} måltider`);
  for (const id of ids) if (id !== '<') nutrition(id);
  return { week, weekday: d, date, ids, note: NOTES[date] || '' };
}));
if (BASE[0].ids[1] === '<') throw new Error('Första dagen kan inte ha rester');

// Vilka recept som kan ta varandras plats, per måltid. Högtidsrätterna står kvar där de är.
const DINNERS = ['curry', 'chili', 'ugnskyckling', 'bolognese', 'kottbullar', 'linsgryta', 'lasagne', 'kycklinggryta', 'biffar', 'pestopasta', 'mexgryta', 'stroganoff',
  'tacos', 'tortillapizza', 'gyros', 'burgare', 'kycklingwok', 'nudelwok', 'pannbiff', 'schnitzel'];
const SNACKS = ['apple_mandlar', 'clementin_mandlar', 'banan_jnt', 'kvarg_mango', 'kvarg_hallon'];
export const POOLS = {
  frukost: ['huel', 'aggrora', 'proteingrot', 'pannkakor', 'omelett', 'overnight', 'risgrynsgrot'],
  lunch: ['tonfiskpasta', 'kycklingsallad', 'pestosallad', 'tonfiskwrap', 'kycklingwrap', 'grekisk', 'tonfisksallad', 'linssoppa', ...DINNERS],
  mellanmal: ['huel', ...SNACKS],
  middag: DINNERS,
  kvallsmal: ['kvarg_blabar', 'kvarg_blabar_liten', 'knacke_keso', 'knacke_ost', 'knacke_agg', 'kalkonmackor', 'choklad', 'pepparkakor', ...SNACKS]
};

const lower = text => text[0].toLowerCase() + text.slice(1);
// Byter ett ord i en rätts namn och behåller stor bokstav: ("Kycklingwok", "kyckling", "kalkon") → "Kalkonwok".
const renamed = (title, from, to) => title.replace(new RegExp(from, 'gi'), match => (match[0] === match[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to));

// Ett recept utan det du inte äter: ingredienser byts (SWAPS), små mängder tas bort, och går inte det
// är receptet inte ok (då byts hela måltiden).
export function adapt(id, exclude = new Set()) {
  const recipe = RECIPES[id];
  const items = [], changes = [], blocking = [];
  let title = recipe.name, how = recipe.how;
  for (const [food, grams, text] of recipe.items) {
    if (!exclude.has(food)) { items.push([food, grams, text]); continue; }
    const swap = SWAPS[food];
    if (swap && swap !== 'drop' && !exclude.has(swap)) {
      if (WORDS[food] && WORDS[swap]) [title, how] = [title, how].map(text => renamed(text, WORDS[food], WORDS[swap]));
      items.push([swap, grams, `${Math.round(grams)} g ${lower(FOODS[swap].name)}`]);
      changes.push(`${FOODS[swap].name} i stället för ${lower(FOODS[food].name)}`);
    } else if (swap === 'drop' || grams < 15) {
      changes.push(`Utan ${lower(FOODS[food].name)}`);
    } else {
      blocking.push(food);
    }
  }
  let kcal = 0, protein = 0;
  for (const [food, grams] of items) {
    kcal += FOODS[food].kcal * grams / 100;
    protein += FOODS[food].protein * grams / 100;
  }
  return { recipe: id, title, how, items, changes, blocking, ok: !blocking.length, kcal: Math.round(kcal), protein: Math.round(protein) };
}

// Alternativen för en måltid, närmast i kcal först.
export function alternatives(slot, kcal, exclude = new Set(), skip = []) {
  return POOLS[slot].filter(id => !skip.includes(id)).map(id => adapt(id, exclude)).filter(option => option.ok)
    .sort((a, b) => Math.abs(a.kcal - kcal) - Math.abs(b.kcal - kcal) || a.title.localeCompare(b.title, 'sv'));
}

// Planen med dina val: exclude = livsmedel du inte äter, swaps = { "2026-11-02:middag": "lasagne" }.
// Rester följer alltid gårdagens middag, som den blev.
export function makePlan({ exclude = [], swaps = {} } = {}) {
  const without = new Set(exclude.filter(food => FOODS[food]));
  const days = [];
  const lastUsed = new Map();
  BASE.forEach((base, index) => {
    const meals = MEALS.map((slot, m) => {
      const chosen = swaps[`${base.date}:${slot.id}`];
      const manual = POOLS[slot.id].includes(chosen) ? chosen : null;
      if (!manual && base.ids[m] === '<') {
        const dinner = days[index - 1].meals[3];
        return { ...dinner, ...slot, leftover: true, swapped: false, batch: false };
      }
      const planned = base.ids[m] === '<' ? days[index - 1].meals[3].recipe : base.ids[m];
      const wanted = manual || planned;
      let dish = adapt(wanted, without);
      let replaced = null;
      if (!dish.ok) {
        // Närmast i kcal, men inte samma rätt som de senaste dagarna: annars blir det samma ersättning överallt.
        const target = adapt(wanted).kcal;
        const score = option => Math.abs(option.kcal - target) + (index - (lastUsed.get(option.recipe) ?? -99) < 4 ? 400 : 0);
        const pick = alternatives(slot.id, target, without, base.ids).sort((a, b) => score(a) - score(b))[0];
        if (pick) { replaced = { from: wanted, because: dish.blocking }; dish = pick; }
      }
      lastUsed.set(dish.recipe, index);
      return { ...slot, ...dish, leftover: false, swapped: Boolean(manual), planned, replaced };
    });
    days.push({ week: base.week, weekday: base.weekday, date: base.date, note: base.note, meals });
  });
  days.forEach((day, index) => {
    day.meals[3].batch = Boolean(days[index + 1]?.meals[1].leftover);
    day.kcal = day.meals.reduce((sum, meal) => sum + meal.kcal, 0);
    day.protein = day.meals.reduce((sum, meal) => sum + meal.protein, 0);
  });
  return {
    days,
    day: date => days.find(day => day.date === date),
    week: week => days.filter(day => day.week === week),
    shopping: week => shoppingList(days.filter(day => day.week === week))
  };
}

export const FIRST_DATE = BASE[0].date;
export const LAST_DATE = BASE.at(-1).date;

// Dagen sidan öppnar på: idag om den finns i planen, annars första eller sista dagen.
export function startDate(today) {
  if (today < FIRST_DATE) return FIRST_DATE;
  if (today > LAST_DATE) return LAST_DATE;
  return today;
}

// ---------- Inköpslistan ----------
const round = (value, step) => Math.ceil(value / step - 1e-9) * step;
const plural = ([one, many], count) => (count === 1 ? one : many);
const decimal = value => String(value).replace('.', ',');

export function amount(food, grams) {
  const item = FOODS[food];
  if (item.each) {
    const count = Math.ceil(grams / item.each - 0.05);
    return `${count} ${plural(item.unit, count)}`;
  }
  if (item.pack) {
    const count = Math.ceil(grams / item.pack - 0.05);
    return item.packName ? `${count} ${plural(item.packName, count)}` : `${count} paket à ${item.pack} g`;
  }
  if (item.dl) {
    const dl = round(grams / item.dl, 1);
    return dl >= 10 ? `${decimal(round(dl / 10, 0.5))} l` : `${dl} dl`;
  }
  if (item.spoon) return `ca ${round(grams / item.spoon, 1)} msk`;
  if (grams >= 1000) return `ca ${decimal(round(grams / 1000, 0.1).toFixed(1))} kg`;
  return `ca ${round(grams, grams < 100 ? 10 : 50)} g`;
}

// Inköpen för några dagar: allt måltiderna innehåller (resterna ingår i middagen dagen innan, som
// lagas dubbelt, så att räkna båda ger rätt mängd).
function shoppingList(days) {
  const grams = new Map();
  for (const day of days) {
    for (const meal of day.meals) {
      if (meal.leftover) continue;
      for (const [food, g] of meal.items) grams.set(food, (grams.get(food) || 0) + g * (meal.batch ? 2 : 1));
    }
  }
  return SECTIONS.map(section => ({
    section,
    items: [...grams].filter(([food]) => FOODS[food].section === section)
      .map(([food, g]) => ({ food, name: FOODS[food].name, amount: amount(food, g), pantry: Boolean(FOODS[food].pantry) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
  })).filter(group => group.items.length);
}
