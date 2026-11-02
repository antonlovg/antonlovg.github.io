// Veckorna: vecka 45–53 handskrivna, sedan byggda av sig själva (se generateWeek). En dag är fem recept i
// måltidsordning; "<" i lunchen betyder en matlåda (rester). makePlan lägger på dina val (det du inte äter, måltider du bytt), justerar
// portionerna och proteinshaken efter dina dagliga mål och räknar fram näringen och inköpslistan.
import { ANIMAL, FOODS, MACROS, SECTIONS, WORDS, swapFor } from './foods.js';
import { RECIPES } from './recipes.js';

// Dagliga mål. Socker och mättat fett är tak; resten försöker dagarna träffa.
export const GOALS = { kcal: 2228, protein: 167, carbs: 201, fat: 84, sugar: 56, satfat: 25 };
export const NUTRIENTS = [
  { id: 'kcal', name: 'Energi', unit: 'kcal' },
  { id: 'protein', name: 'Protein', unit: 'g' },
  { id: 'carbs', name: 'Kolhydrater', unit: 'g' },
  { id: 'fat', name: 'Fett', unit: 'g' },
  { id: 'sugar', name: 'Socker', unit: 'g', max: true },
  { id: 'satfat', name: 'Mättat fett', unit: 'g', max: true }
];
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
    'huel < kvarg_mango tacos knacke_ost',
    'aggrora tonfiskwrap huel burgare kvarg_blabar_liten',
    'proteingrot grekisk huel kycklingwok knacke_ost'],
  46: ['huel kycklingsallad apple_mandlar kycklinggryta knacke_agg',
    'huel < banan_jnt lasagne kvarg_blabar_liten',
    'huel < apple_mandlar mexgryta knacke_ost',
    'huel < banan_jnt stroganoff kvarg_blabar_liten',
    'huel < kvarg_mango tortillapizza knacke_ost',
    'omelett tonfisksallad huel pannbiff kvarg_hallon',
    'pannkakor linssoppa huel nudelwok knacke_ost'],
  47: ['huel tonfiskpasta apple_mandlar ugnspasta knacke_keso',
    'huel < banan_jnt shakshuka kvarg_blabar',
    'huel < apple_mandlar kycklingpasta knacke_keso',
    'huel < banan_jnt chili kvarg_blabar_liten',
    'huel < kvarg_mango gyros knacke_ost',
    'smoothie kycklingwrap huel burgare kvarg_blabar_liten',
    'overnight grekisk huel schnitzel knacke_ost'],
  48: ['huel pestosallad apple_mandlar curry kvarg_blabar_liten',
    'huel < banan_jnt bolognese knacke_keso',
    'huel < apple_mandlar ugnskyckling kvarg_blabar',
    'huel < banan_jnt kottbullar knacke_agg',
    'huel < kvarg_mango tacos knacke_ost',
    'pannkakor tonfiskrora huel platmat riskakor',
    'kvargmusli linssoppa huel kycklingwok knacke_keso'],
  49: ['huel kycklingsallad clementin_mandlar kycklingkokos kalkonmackor',
    'huel < banan_jnt burrito kvarg_blabar_liten',
    'huel < clementin_mandlar tonfisktomat knacke_ost',
    'huel < banan_jnt biffar knacke_agg',
    'huel < banan_jnt tortillapizza knacke_agg',
    'omelett tonfisksallad huel burgare kvarg_hallon',
    'overnight tonfiskwrap huel gulasch knacke_keso'],
  50: ['huel < clementin_mandlar stroganoff kvarg_blabar_liten',
    'huel < banan_jnt quesadilla kalkonmackor',
    'huel < clementin_mandlar chili kvarg_blabar',
    'huel < banan_jnt pestopasta knacke_agg',
    'huel < kvarg_mango gyros knacke_agg',
    'aggmackor kycklingwrap huel schnitzel kvarg_blabar_liten',
    'pannkakor tonfiskwrap huel pannbiff knacke_ost'],
  51: ['huel pestosallad clementin_mandlar tacogratang kalkonmackor',
    'huel < riskakor kycklingpytt knacke_agg',
    'huel < clementin_mandlar nudelsoppa kalkonmackor',
    'huel < banan_jnt bolognese knacke_agg',
    'huel < kvarg_mango tortillapizza knacke_ost',
    'proteingrot tonfiskwrap huel burgare kvarg_blabar',
    'omelett grekisk huel kycklingwok knacke_keso'],
  52: ['huel kycklingsallad clementin_mandlar kycklinggryta knacke_agg',
    'huel < banan_jnt lasagne kvarg_blabar_liten',
    'huel < clementin_mandlar mexgryta knacke_ost',
    'risgrynsgrot tonfiskwrap huel julbord agg_morot',
    'aggrora julmacka huel kottbullar agg_morot',
    'pannkakor tonfisksallad huel nudelwok kvarg_blabar_liten',
    'overnight linssoppa huel schnitzel knacke_keso'],
  53: ['huel tonfiskpasta clementin_mandlar kottfarslimpa kalkonmackor',
    'huel < banan_jnt kycklingpasta knacke_keso',
    'huel < clementin_mandlar platmat kvarg_blabar',
    'huel < banan_jnt nyar kalkonmackor',
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
  '2027-01-01': 'Nyårsdagen',
  '2027-01-06': 'Trettondedag jul',
  '2027-03-26': 'Långfredagen',
  '2027-03-27': 'Påskafton',
  '2027-03-28': 'Påskdagen',
  '2027-03-29': 'Annandag påsk',
  '2027-04-30': 'Valborg',
  '2027-05-01': 'Första maj',
  '2027-05-06': 'Kristi himmelsfärd',
  '2027-05-30': 'Mors dag',
  '2027-06-06': 'Nationaldagen',
  '2027-06-25': 'Midsommarafton',
  '2027-06-26': 'Midsommardagen',
  '2027-11-06': 'Alla helgons dag',
  '2027-11-14': 'Fars dag',
  '2027-11-28': 'Första advent',
  '2027-12-13': 'Lucia',
  '2027-12-24': 'Julafton',
  '2027-12-25': 'Juldagen',
  '2027-12-26': 'Annandag jul',
  '2027-12-31': 'Nyårsafton'
};

const FIRST_MONDAY = Date.UTC(2026, 10, 2); // vecka 45
const DAY = 86400000;

// Datum som "ÅÅÅÅ-MM-DD" (lokal tid för "idag", UTC internt så att sommartid inte flyttar dagar).
export const iso = time => new Date(time).toISOString().slice(0, 10);
export const parseIso = text => Date.UTC(+text.slice(0, 4), +text.slice(5, 7) - 1, +text.slice(8, 10));
export const todayIso = (now = new Date()) => iso(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

// Näringen i några ingredienser ([livsmedel, gram, …]), oavrundad.
export function contents(items) {
  const sum = { kcal: 0, protein: 0, carbs: 0, sugar: 0, fat: 0, satfat: 0 };
  for (const [food, grams] of items) {
    const item = FOODS[food];
    if (!item) throw new Error(`Okänt livsmedel: ${food}`);
    const [carbs, sugar, fat, satfat] = MACROS[food];
    const part = grams / 100;
    sum.kcal += item.kcal * part; sum.protein += item.protein * part;
    sum.carbs += carbs * part; sum.sugar += sugar * part; sum.fat += fat * part; sum.satfat += satfat * part;
  }
  return sum;
}
const rounded = sum => Object.fromEntries(Object.entries(sum).map(([key, value]) => [key, Math.round(value)]));

export function nutrition(id) {
  const recipe = RECIPES[id];
  if (!recipe) throw new Error(`Okänt recept: ${id}`);
  return rounded(contents(recipe.items));
}

// ---------- Veckorna efter vecka 53 ----------
// Samma mönster som de handskrivna: Huel och matlåda på vardagarna, varannan vecka ett storkok på måndagen
// (lunch tisdag–torsdag), annars dubbel sats måndag–torsdag; fredag och helg något lite roligare, och
// lagad frukost och lunch på helgen. Ingen rätt kommer tillbaka förrän efter ett par veckor. Mellanmål,
// kvällsmål och helglunch väljs så att dagen (som recepten är skrivna) hamnar nära 2100 kcal med minst
// 145 g protein och så lite socker som möjligt. Slumpen har veckans nummer som frö och veckorna byggs i
// ordning, så en vecka blir alltid likadan och planen ändras inte när den byggs längre fram.
const KINDS = {
  vardag: ['curry', 'chili', 'ugnskyckling', 'bolognese', 'kottbullar', 'linsgryta', 'lasagne', 'kycklinggryta', 'biffar', 'pestopasta', 'mexgryta',
    'stroganoff', 'kycklingpasta', 'shakshuka', 'burrito', 'kycklingpytt', 'tonfisktomat', 'nudelsoppa', 'tacobowl'],
  storkok: ['ugnspasta', 'kycklingris', 'tacogratang', 'kycklingkokos', 'kottfarslimpa', 'gulasch', 'kycklingchili', 'frittata'],
  helg: ['tacos', 'tortillapizza', 'gyros', 'burgare', 'kycklingwok', 'nudelwok', 'pannbiff', 'schnitzel', 'platmat', 'quesadilla'],
  lunch: ['tonfiskpasta', 'kycklingsallad', 'pestosallad', 'tonfiskwrap', 'kycklingwrap', 'grekisk', 'tonfisksallad', 'linssoppa', 'tonfiskrora', 'kycklingmacka'],
  frukost: ['aggrora', 'proteingrot', 'pannkakor', 'omelett', 'overnight', 'kvargmusli', 'smoothie', 'aggmackor'],
  mellanmal: ['apple_mandlar', 'clementin_mandlar', 'banan_jnt', 'kvarg_mango', 'kvarg_hallon', 'riskakor', 'agg_morot'],
  kvallsmal: ['kvarg_blabar', 'kvarg_blabar_liten', 'knacke_keso', 'knacke_ost', 'knacke_agg', 'kalkonmackor', 'chokladkvarg', 'keso_hallon', 'agg_morot', 'kvarg_musli']
};
const WRITTEN = Object.keys(WEEKS).map(Number);
const LAST_WRITTEN = WRITTEN.at(-1);

// Ett litet slumptal med frö (mulberry32).
function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateWeek(week, seen) {
  const rand = random(week * 7919);
  const day0 = (week - WRITTEN[0]) * 7;
  const recent = (id, gap, at) => at - (seen.get(id) ?? -99) < gap;
  // En rätt som inte ätits på gap dagar, slumpvis (finns ingen, den som var längst sedan).
  const pick = (list, gap, at) => {
    const free = list.filter(id => !recent(id, gap, at));
    return free.length ? free[Math.floor(rand() * free.length)] : [...list].sort((a, b) => (seen.get(a) ?? -99) - (seen.get(b) ?? -99))[0];
  };
  const storkok = week % 2 === 0;
  const dinners = [storkok ? pick(KINDS.storkok, 28, day0) : pick(KINDS.vardag, 14, day0)];
  seen.set(dinners[0], day0);
  for (let d = 1; d < 7; d++) {
    const at = day0 + d;
    const id = pick(d < 4 ? KINDS.vardag : d === 6 ? [...KINDS.vardag, ...KINDS.helg] : KINDS.helg, 14, at);
    dinners.push(id);
    seen.set(id, at);
  }
  const lines = [];
  for (let d = 0; d < 7; d++) {
    const at = day0 + d;
    const weekend = d >= 5;
    const breakfast = weekend ? pick(KINDS.frukost, 5, at) : 'huel';
    // Matlådan tisdag–fredag: storkoket (tis–tors) eller gårdagens middag.
    const box = d >= 1 && d <= 4 ? (storkok && d <= 3 ? dinners[0] : dinners[d - 1]) : null;
    const fixed = [breakfast, box, dinners[d], weekend ? 'huel' : null].filter(Boolean).map(nutrition);
    const lunches = box ? ['<'] : KINDS.lunch.filter(id => !recent(id, 6, at));
    const snacks = weekend ? ['huel'] : KINDS.mellanmal;
    let best = null;
    for (const lunch of lunches) for (const snack of snacks) for (const evening of KINDS.kvallsmal) {
      if (snack === evening) continue;
      const parts = [...fixed, ...[box ? null : lunch, weekend ? null : snack, evening].filter(Boolean).map(nutrition)];
      const total = key => parts.reduce((sum, part) => sum + part[key], 0);
      const kcal = total('kcal');
      const cost = Math.abs(kcal - 2100) + 20 * (Math.max(0, 2020 - kcal) + Math.max(0, kcal - 2180)) + 6 * Math.max(0, 145 - total('protein'))
        + total('sugar') + 8 * Math.max(0, total('satfat') - 20)
        + (recent(snack, 2, at) ? 60 : 0) + (recent(evening, 2, at) ? 60 : 0) + rand() * 20;
      if (!best || cost < best.cost) best = { cost, lunch, snack, evening };
    }
    seen.set(breakfast, at);
    for (const id of [best.lunch, best.snack, best.evening]) seen.set(id, at);
    lines.push([breakfast, best.lunch, best.snack, dinners[d], best.evening].join(' '));
  }
  return lines;
}

// Planen räcker året ut 2027, och alltid minst åtta veckor framåt.
const LAST_SUNDAY = Math.max(Date.UTC(2028, 0, 2), parseIso(todayIso()) + 8 * 7 * DAY);
export const WEEK_NUMBERS = Array.from({ length: Math.floor((LAST_SUNDAY - FIRST_MONDAY) / (7 * DAY)) + 1 }, (_, i) => WRITTEN[0] + i);
{
  const seen = new Map();
  WRITTEN.forEach((week, w) => WEEKS[week].forEach((line, d) => line.split(/\s+/).forEach(id => seen.set(id, w * 7 + d))));
  for (const week of WEEK_NUMBERS) if (week > LAST_WRITTEN) WEEKS[week] = generateWeek(week, seen);
}

// Veckans namn i almanackan (ISO-vecka): vecka 54 i planen är vecka 1 2027.
export function weekLabel(week) {
  const thursday = FIRST_MONDAY + ((week - WRITTEN[0]) * 7 + 3) * DAY;
  const year = new Date(thursday).getUTCFullYear();
  return { number: Math.floor((thursday - Date.UTC(year, 0, 1)) / DAY / 7) + 1, year };
}

// Planen som den är skriven: varje dag med fem recept-id ("<" = en matlåda).
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
  'tacos', 'tortillapizza', 'gyros', 'burgare', 'kycklingwok', 'nudelwok', 'pannbiff', 'schnitzel',
  'ugnspasta', 'kycklingris', 'tacogratang', 'kycklingkokos', 'kottfarslimpa', 'gulasch', 'kycklingchili', 'frittata',
  'kycklingpasta', 'platmat', 'shakshuka', 'burrito', 'kycklingpytt', 'tonfisktomat', 'quesadilla', 'nudelsoppa', 'tacobowl'];
const VEGAN_DINNERS = ['tofucurry', 'vegochili', 'vegobolognese', 'linsgryta_vegan', 'tofuwok', 'vegotacos', 'falafeltallrik', 'vegoburgare', 'tempeh',
  'vegopytt', 'vegopizza', 'ramen', 'kikartsgryta', 'vegostroganoff', 'bonburrito', 'vegougnspasta', 'dal', 'bonchili', 'vegolasagne'];
const SNACKS = ['apple_mandlar', 'clementin_mandlar', 'banan_jnt', 'kvarg_mango', 'kvarg_hallon', 'riskakor', 'agg_morot',
  'edamame', 'hummus_morot', 'rostade_kikartor'];
export const POOLS = {
  frukost: ['huel', 'aggrora', 'proteingrot', 'pannkakor', 'omelett', 'overnight', 'risgrynsgrot', 'kvargmusli', 'smoothie', 'aggmackor',
    'tofurora', 'chiapudding', 'frukostburrito', 'avokadotoast', 'bananplattar'],
  lunch: ['tonfiskpasta', 'kycklingsallad', 'pestosallad', 'tonfiskwrap', 'kycklingwrap', 'grekisk', 'tonfisksallad', 'linssoppa', 'tonfiskrora', 'kycklingmacka',
    'falafelwrap', 'linsquinoa', 'kikartsrora', 'edamamebowl', 'tofumacka', 'linssoppa_vegan', ...DINNERS, ...VEGAN_DINNERS],
  mellanmal: ['huel', ...SNACKS],
  middag: [...DINNERS, ...VEGAN_DINNERS],
  kvallsmal: ['kvarg_blabar', 'kvarg_blabar_liten', 'knacke_keso', 'knacke_ost', 'knacke_agg', 'kalkonmackor', 'chokladkvarg', 'keso_hallon', 'kvarg_musli',
    'sojayoghurt_musli', 'chia_hallon', 'chokladmousse', ...SNACKS]
};

// Det du inte äter: det du valt bort, och allt från djur om du är vegan.
export const excludedFoods = ({ exclude = [], vegan = false } = {}) => new Set([...exclude, ...(vegan ? ANIMAL : [])].filter(food => FOODS[food]));

const lower = text => text[0].toLowerCase() + text.slice(1);
// Byter ett ord i en rätts namn och behåller stor bokstav: ("Kycklingwok", "kyckling", "kalkon") → "Kalkonwok".
const renamed = (title, from, to) => title.replace(new RegExp(from, 'gi'), match => (match[0] === match[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to));

// Ett recept utan det du inte äter: ingredienser byts (SWAPS), små mängder tas bort, och går inte det
// är receptet inte ok (då byts hela måltiden).
export function adapt(id, exclude = new Set()) {
  const recipe = RECIPES[id];
  const items = [], changes = [], blocking = [], touched = [];
  let title = recipe.name, how = recipe.how;
  for (const [food, grams, text] of recipe.items) {
    if (!exclude.has(food)) { items.push([food, grams, text]); continue; }
    touched.push(food);
    const swap = swapFor(food, exclude);
    if (swap && swap !== 'drop') {
      if (WORDS[food] && WORDS[swap]) [title, how] = [title, how].map(text => renamed(text, WORDS[food], WORDS[swap]));
      items.push([swap, grams, `${Math.round(grams)} g ${lower(FOODS[swap].name)}`]);
      changes.push(`${FOODS[swap].name} i stället för ${lower(FOODS[food].name)}`);
    } else if (swap === 'drop' || grams < 15) {
      changes.push(`Utan ${lower(FOODS[food].name)}`);
    } else {
      blocking.push(food);
    }
  }
  return { recipe: id, title, how, items, changes, blocking, touched, ok: !blocking.length, ...rounded(contents(items)), storkok: recipe.storkok || 0 };
}

// Alternativen för en måltid, närmast i kcal först.
export function alternatives(slot, kcal, exclude = new Set(), skip = []) {
  return POOLS[slot].filter(id => !skip.includes(id)).map(id => adapt(id, exclude)).filter(option => option.ok)
    .sort((a, b) => Math.abs(a.kcal - kcal) - Math.abs(b.kcal - kcal) || a.title.localeCompare(b.title, 'sv'));
}

// Varifrån en matlåda ("<") kommer: ett storkok från de senaste tre dagarna som har portioner kvar
// (det äldsta först), annars gårdagens middag, som då lagas i dubbel sats.
function leftoverSource(days, index) {
  for (let back = 3; back >= 1; back--) {
    const dinner = days[index - back]?.meals[3];
    if (dinner?.storkok && dinner.extra < dinner.storkok - 1) return dinner;
  }
  const yesterday = days[index - 1]?.meals[3];
  return yesterday && !yesterday.storkok && yesterday.extra < 1 ? yesterday : null;
}

// ---------- Portionerna efter målen ----------
// Varje måltid utom Huel får en portionsstorlek (70–140 % av receptet), dagen en
// proteinshake (0–80 g pulver) och lite extra olivolja till middagen (0–6 tsk), valda så att dagen kommer
// så nära målen för kcal, protein, kolhydrater och fett som möjligt, utan att gå över taken för socker och
// mättat fett. Det är minsta kvadrat-anpassning med gränser, löst med koordinatsökning (en liten
// konvex optimering, så den hittar alltid samma bästa svar). Små avvikelser från receptet kostar lite
// extra, så portionerna bara ändras när det behövs.
const FIT = ['kcal', 'protein', 'carbs', 'fat'];
const WEIGHT = { kcal: 6, protein: 4, carbs: 1, fat: 1 };
const SCALE = [0.7, 1.4];
const SHAKE = [0, 8]; // i 10 g pulver
const OIL = [0, 6]; // i teskedar (4,5 g)
const CAPS = ['sugar', 'satfat'];
const CAP = 8; // att gå över ett tak väger tyngre än att missa ett mål
// och lösaren siktar under taken (sockret, som du vill undvika, lite extra), så att avrundningen inte tar dem över
const MARGIN = { sugar: 0.85, satfat: 0.95 };
const KEEP = 0.04; // hur mycket det kostar att ändra en portion från receptet

function fitDay(day, goals, shake, oil, powder) {
  const free = day.meals.map((meal, m) => m).filter(m => day.meals[m].recipe !== 'huel');
  const fixed = contents(day.meals.filter(meal => meal.recipe === 'huel').flatMap(meal => meal.items));
  const parts = [...free.map(m => contents(day.meals[m].items)), contents([[powder || 'whey', 10]]), contents([['olja', 4.5]])];
  const n = free.length;
  const bounds = [...free.map(() => SCALE), shake ? SHAKE : [0, 0], oil ? OIL : [0, 0]];
  const start = [...free.map(() => 1), 0, 0];
  const x = [...start];
  const total = (key, at = x) => fixed[key] + at.reduce((sum, value, j) => sum + value * parts[j][key], 0);
  // Hur långt från målen (och över taken) dagen hamnar, plus en liten kostnad för att ändra recepten.
  const loss = at => FIT.reduce((sum, key) => sum + WEIGHT[key] * ((total(key, at) - goals[key]) / goals[key]) ** 2, 0)
    + CAPS.reduce((sum, key) => sum + CAP * Math.max(0, (total(key, at) - goals[key] * MARGIN[key]) / goals[key]) ** 2, 0)
    + at.reduce((sum, value, j) => sum + (j < n ? KEEP : KEEP / 100) * (value - start[j]) ** 2 / 2, 0);
  // Summorna hålls uppdaterade medan x ändras, och sökningen slutar när inget rör sig längre.
  const sums = Object.fromEntries([...FIT, ...CAPS].map(key => [key, total(key)]));
  for (let round = 0, moved = 1; round < 200 && moved > 1e-7; round++) {
    moved = 0;
    for (let j = 0; j < x.length; j++) {
      let gradient = 0, curve = 0;
      for (const key of FIT) {
        const c = WEIGHT[key] / goals[key] ** 2;
        gradient += c * (sums[key] - goals[key]) * parts[j][key];
        curve += c * parts[j][key] ** 2;
      }
      for (const key of CAPS) {
        if (sums[key] <= goals[key] * MARGIN[key]) continue;
        const c = CAP / goals[key] ** 2;
        gradient += c * (sums[key] - goals[key] * MARGIN[key]) * parts[j][key];
        curve += c * parts[j][key] ** 2;
      }
      const keep = j < n ? KEEP : KEEP / 100;
      gradient += keep * (x[j] - start[j]);
      curve += keep;
      const next = Math.min(bounds[j][1], Math.max(bounds[j][0], x[j] - gradient / curve));
      const change = next - x[j];
      if (!change) continue;
      for (const key in sums) sums[key] += change * parts[j][key];
      x[j] = next;
      moved = Math.max(moved, Math.abs(change));
    }
  }
  // Avrunda till steg man kan laga efter (5 % portion, 5 g pulver, 1 tsk olja) och putsa sedan ett steg i
  // taget så länge det kommer närmare målen.
  const steps = [...free.map(() => 0.05), 0.5, 1];
  const grid = x.map((value, j) => Math.round(value / steps[j]) * steps[j]);
  for (let improved = true; improved;) {
    improved = false;
    for (let j = 0; j < grid.length; j++) {
      for (const step of [-steps[j], steps[j]]) {
        const next = grid.with(j, Math.round((grid[j] + step) * 100) / 100);
        if (next[j] < bounds[j][0] - 1e-9 || next[j] > bounds[j][1] + 1e-9 || loss(next) >= loss(grid) - 1e-12) continue;
        grid[j] = next[j];
        improved = true;
      }
    }
  }
  const scales = day.meals.map(() => 1);
  free.forEach((m, j) => { scales[m] = Math.round(grid[j] * 100) / 100; });
  return { scales, shake: Math.round(grid[n] * 10), oil: Math.round(grid[n + 1]) };
}

// En måltid i en annan storlek: gram och näring räknas om; texterna byts mot mängder när det skiljer.
function scaled(meal, scale) {
  if (scale === 1) return { ...meal, scale };
  const items = meal.items.map(([food, grams, text]) => [food, grams * scale, `${cookAmount(food, grams * scale)} ${lower(FOODS[food].name)}`, text]);
  return { ...meal, items, scale, ...rounded(contents(items)) };
}

// Planen med dina val: exclude = livsmedel du inte äter, swaps = { "2026-11-02:middag": "lasagne" },
// goals = dagliga mål (GOALS), fit = justera portionerna efter målen, vegan = inget från djur, ratings =
// { recept: { r: 1 (favorit) | -1 (aldrig mer) | 0 (ångrat), at: "ÅÅÅÅ-MM-DD" } }. Matlådorna följer middagarna.
export function makePlan({ exclude = [], swaps = {}, goals = GOALS, fit = true, vegan = false, ratings = {} } = {}) {
  goals = { ...GOALS, ...goals };
  const without = excludedFoods({ exclude, vegan });
  // Byten som bara beror på att du är vegan (inte på något du själv valt bort) visas som veganska.
  const mine = new Set(exclude);
  const veganOnly = foods => vegan && foods.length > 0 && foods.every(food => ANIMAL.includes(food) && !mine.has(food));
  // "Aldrig mer" gäller från dagen du satte det, en favorit från veckan efter (så att veckan du redan
  // handlat för står kvar). En favorit tar en annan rätts plats i samma måltid: en middag högst en gång i veckan,
  // annat två gånger (middagar högst var tionde dag, annat var tredje) och bara om den är ungefär lika stor.
  const rated = Object.entries(ratings).filter(([id, rating]) => RECIPES[id] && /^\d{4}-\d{2}-\d{2}$/.test(rating?.at));
  const nextMonday = date => iso(parseIso(date) + (7 - (new Date(parseIso(date)).getUTCDay() + 6) % 7) * DAY);
  const dislikes = rated.filter(([, rating]) => rating.r === -1).map(([id, rating]) => [id, rating.at]);
  const favourites = rated.filter(([, rating]) => rating.r === 1).map(([id, rating]) => [id, nextMonday(rating.at)]).sort(([a], [b]) => a.localeCompare(b));
  const days = [];
  const lastUsed = new Map(), uses = new Map(), perWeek = new Map();
  BASE.forEach((base, index) => {
    const avoid = dislikes.filter(([, from]) => base.date >= from).map(([id]) => id);
    const liked = favourites.filter(([, from]) => base.date >= from).map(([id]) => id);
    const meals = MEALS.map((slot, m) => {
      const chosen = swaps[`${base.date}:${slot.id}`];
      const manual = POOLS[slot.id].includes(chosen) ? chosen : null;
      const source = !manual && base.ids[m] === '<' ? leftoverSource(days, index) : null;
      if (source) {
        source.extra++;
        const { extra, portions, ...dish } = source;
        return { ...dish, ...slot, leftover: true, from: days.find(day => day.meals[3] === source).date, swapped: false };
      }
      // En matlåda utan middag att ta från (du har bytt bort den): en vanlig lunch nära i kcal.
      const planned = base.ids[m] === '<' ? alternatives('lunch', 600, without, base.ids)[0]?.recipe ?? 'grekisk' : base.ids[m];
      let wanted = manual || planned, favourite = false;
      if (!manual && base.ids[m] !== '<' && wanted !== 'huel' && POOLS[slot.id].includes(wanted) && !liked.includes(wanted)) {
        const size = nutrition(wanted).kcal, storkok = Boolean(RECIPES[wanted].storkok);
        const fav = liked.find(id => POOLS[slot.id].includes(id) && !(slot.id === 'lunch' && POOLS.middag.includes(id))
          && !avoid.includes(id) && !base.ids.includes(id) && Boolean(RECIPES[id].storkok) === storkok
          && Math.abs(nutrition(id).kcal - size) <= 300 && (perWeek.get(`${base.week}:${id}`) || 0) < (POOLS.middag.includes(id) ? 1 : 2)
          && index - (lastUsed.get(id) ?? -99) >= (POOLS.middag.includes(id) ? 10 : 3) && adapt(id, without).ok);
        if (fav) { wanted = fav; favourite = true; }
      }
      let dish = adapt(wanted, without);
      let replaced = null;
      const unwanted = !manual && avoid.includes(wanted);
      if (!dish.ok || unwanted) {
        // Närmast i kcal, men inte samma rätt som de senaste dagarna: annars blir det samma ersättning överallt.
        const target = adapt(wanted).kcal;
        // Ett storkok ersätts helst av ett annat storkok, så att matlådorna räcker som planerat.
        const storkok = Boolean(RECIPES[wanted].storkok);
        // Rätter som redan valts många gånger hamnar lite längre bak i kön.
        const score = option => Math.abs(option.kcal - target) + (index - (lastUsed.get(option.recipe) ?? -99) < 4 ? 400 : 0)
          + (Boolean(option.storkok) !== storkok ? 250 : 0) + 30 * (uses.get(option.recipe) || 0) - (liked.includes(option.recipe) ? 100 : 0);
        const pick = alternatives(slot.id, target, without, [...base.ids, ...avoid]).sort((a, b) => score(a) - score(b))[0];
        if (pick) {
          replaced = { from: wanted, because: dish.blocking, vegan: !unwanted && veganOnly(dish.blocking), disliked: unwanted };
          dish = pick;
          favourite = liked.includes(pick.recipe);
        }
      }
      lastUsed.set(dish.recipe, index);
      perWeek.set(`${base.week}:${dish.recipe}`, (perWeek.get(`${base.week}:${dish.recipe}`) || 0) + 1);
      if (replaced) uses.set(dish.recipe, (uses.get(dish.recipe) || 0) + 1);
      return { ...slot, ...dish, vegan: veganOnly(dish.touched), favourite, leftover: false, swapped: Boolean(manual), planned, replaced, extra: 0 };
    });
    days.push({ week: base.week, weekday: base.weekday, date: base.date, note: base.note, meals });
  });
  // Proteinpulvret: whey, eller veganskt om du är vegan. Väljer du bort proteinpulver blir det ingen shake.
  const powder = mine.has('whey') ? null : vegan ? 'veganprotein' : 'whey';
  days.forEach(day => {
    const dinner = day.meals[3];
    dinner.portions = 1 + dinner.extra;
    dinner.batch = dinner.extra > 0;
    if (fit) {
      const { scales, shake, oil } = fitDay(day, goals, powder && !without.has(powder), !without.has('olja'), powder);
      day.meals = day.meals.map((meal, m) => scaled(meal, scales[m]));
      if (oil) {
        const dinner = day.meals[3];
        const items = [...dinner.items, ['olja', oil * 4.5, `${oil} tsk olivolja extra (ringla över eller stek i)`]];
        day.meals[3] = { ...dinner, items, oil, ...rounded(contents(items)) };
      }
      if (shake) {
        const dish = adapt(vegan ? 'veganshake' : 'shake');
        const items = [[powder, shake, `${shake} g ${vegan ? 'veganskt ' : ''}proteinpulver (ca ${half(Math.max(0.5, Math.round(shake / 15) / 2))} skopa à 30 g)`]];
        day.meals.push({ id: 'shake', name: 'Proteinshake', until: 24, ...dish, title: vegan ? 'Proteinshake (veganskt pulver)' : 'Proteinshake med Star Nutrition Banana', items, ...rounded(contents(items)), leftover: false, swapped: false, scale: 1 });
      }
    }
    Object.assign(day, rounded(day.meals.reduce((sum, meal) => {
      for (const key of Object.keys(sum)) sum[key] += meal[key];
      return sum;
    }, { kcal: 0, protein: 0, carbs: 0, sugar: 0, fat: 0, satfat: 0 })));
  });
  return {
    days,
    without,
    vegan,
    favourites: favourites.map(([id]) => id),
    disliked: dislikes.map(([id]) => id),
    day: date => days.find(day => day.date === date),
    week: week => days.filter(day => day.week === week),
    shopping: week => shoppingList(days, week)
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

// Mängden att laga med (hela satsen av ett storkok): exakt, i styck, dl eller msk när det passar bättre.
const half = value => { const whole = Math.floor(value); const rest = value - whole; return `${whole || ''}${rest ? '½' : ''}` || '0'; };
export function cookAmount(food, grams) {
  const item = FOODS[food];
  if (item.each) {
    const count = Math.max(0.5, Math.round(grams / item.each * 2) / 2);
    return `${half(count)} ${plural(item.unit, count > 1 ? 2 : 1)}`;
  }
  if (item.dl) return `${half(Math.max(0.5, Math.round(grams / item.dl * 2) / 2))} dl`;
  if (item.spoon) return `${half(Math.max(0.5, Math.round(grams / item.spoon * 2) / 2))} msk`;
  return grams >= 1000 ? `${decimal((Math.round(grams / 50) * 50 / 1000).toString())} kg` : `${Math.round(grams / 5) * 5} g`;
}

// Veckans inköp: allt måltiderna innehåller. Matlådorna räknas med, så ett storkok handlas
// för så många portioner som äts av det.
function shoppingList(days, week) {
  const weekOf = date => days.find(day => day.date === date).week;
  const grams = new Map();
  for (const day of days) {
    for (const meal of day.meals) {
      // En matlåda handlas samma vecka som middagen den lagas till (ett söndagsstorkok räcker in i nästa vecka).
      if ((meal.leftover ? weekOf(meal.from) : day.week) !== week) continue;
      for (const [food, g] of meal.items) grams.set(food, (grams.get(food) || 0) + g);
    }
  }
  return SECTIONS.map(section => ({
    section,
    items: [...grams].filter(([food]) => FOODS[food].section === section)
      .map(([food, g]) => ({ food, name: FOODS[food].name, amount: amount(food, g), pantry: Boolean(FOODS[food].pantry) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
  })).filter(group => group.items.length);
}
