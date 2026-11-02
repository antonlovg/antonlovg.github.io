// Livsmedlen: namn, kcal och protein per 100 g (kolhydrater, socker, fett och mättat fett i MACROS) (ungefärliga svenska värden; råvikt för kött, torrvikt
// för ris, pasta och gryn), avdelning i butiken och hur de köps. Recepten anger alltid gram.
//   each: gram per styck → inköpslistan räknar i hela styck (unit: ental/flertal)
//   pack: gram per förpackning → listan räknar i paket
//   pantry: brukar finnas hemma (listan säger "kolla skafferiet")
export const SECTIONS = ['Kött & fågel', 'Mejeri & ägg', 'Frukt & grönt', 'Frysvaror', 'Bröd', 'Skafferi', 'Kyl/övrigt'];

const food = (name, kcal, protein, section, buy = {}) => ({ name, kcal, protein, section, ...buy });
const st = (each, one = 'st', many = one) => ({ each, unit: [one, many] });

export const FOODS = {
  kyckling: food('Kycklingfilé', 110, 23, 'Kött & fågel'),
  kalkonfile: food('Kalkonbröstfilé', 105, 23, 'Kött & fågel'),
  notfars: food('Nötfärs 10 %', 175, 19, 'Kött & fågel'),
  kycklingfars: food('Kycklingfärs', 130, 20, 'Kött & fågel'),
  oxfile: food('Oxfilé', 130, 22, 'Kött & fågel'),
  kalkon: food('Kalkonpålägg', 100, 20, 'Kött & fågel'),

  agg: food('Ägg', 140, 12.5, 'Mejeri & ägg', st(60)),
  kvarg: food('Kvarg naturell', 60, 11, 'Mejeri & ägg'),
  skyr: food('Skyr naturell', 63, 11, 'Mejeri & ägg'),
  keso: food('Keso mager', 75, 13, 'Mejeri & ägg'),
  ost: food('Hårdost 17 %', 270, 30, 'Mejeri & ägg'),
  feta: food('Fetaost', 260, 15, 'Mejeri & ägg'),
  parmesan: food('Parmesan', 390, 35, 'Mejeri & ägg'),
  mozzarella: food('Mozzarella light', 165, 20, 'Mejeri & ägg', st(125, 'förp', 'förp')),
  mjolk: food('Mjölk 1,5 %', 46, 3.5, 'Mejeri & ägg', { dl: 100 }),
  havredryck: food('Havredryck', 45, 1, 'Mejeri & ägg', { dl: 100 }),
  creme: food('Crème fraiche lätt', 165, 3, 'Mejeri & ägg'),
  sojadryck: food('Sojadryck osötad', 33, 3.3, 'Mejeri & ägg', { dl: 100 }),
  sojayoghurt: food('Sojayoghurt naturell, proteinrik', 60, 6, 'Mejeri & ägg'),
  havrefraiche: food('Havrefraiche (vegansk crème fraiche)', 150, 1, 'Mejeri & ägg'),
  vegost: food('Vegansk ost', 280, 1, 'Mejeri & ägg'),

  banan: food('Banan', 95, 1.1, 'Frukt & grönt', st(120)),
  apple: food('Äpple', 52, 0.3, 'Frukt & grönt', st(150)),
  clementin: food('Clementiner', 47, 0.9, 'Frukt & grönt', st(70)),
  avokado: food('Avokado', 160, 2, 'Frukt & grönt', st(140)),
  broccoli: food('Broccoli', 35, 3, 'Frukt & grönt'),
  brysselkal: food('Brysselkål', 43, 3.4, 'Frukt & grönt'),
  champinjon: food('Champinjoner', 25, 3, 'Frukt & grönt'),
  gurka: food('Gurka', 12, 0.7, 'Frukt & grönt', st(350)),
  lok: food('Gul lök', 40, 1.1, 'Frukt & grönt', st(100)),
  rodlok: food('Rödlök', 40, 1.1, 'Frukt & grönt', st(100)),
  morot: food('Morötter', 40, 0.7, 'Frukt & grönt', st(70)),
  paprika: food('Paprika', 30, 1, 'Frukt & grönt', st(150)),
  potatis: food('Potatis', 77, 2, 'Frukt & grönt'),
  sotpotatis: food('Sötpotatis', 85, 1.6, 'Frukt & grönt'),
  sallad: food('Sallad/ruccola', 15, 1.2, 'Frukt & grönt'),
  spenat: food('Spenat (färsk)', 23, 2.9, 'Frukt & grönt'),
  tomat: food('Tomater', 20, 0.9, 'Frukt & grönt'),
  zucchini: food('Zucchini', 17, 1.2, 'Frukt & grönt', st(250)),
  blomkal: food('Blomkål', 25, 2, 'Frukt & grönt'),

  blabar: food('Blåbär (frysta)', 50, 0.7, 'Frysvaror'),
  hallon: food('Hallon (frysta)', 40, 1.2, 'Frysvaror'),
  mango: food('Mango (fryst)', 65, 0.6, 'Frysvaror'),
  wok: food('Wokgrönsaker (frysta)', 35, 2, 'Frysvaror'),
  arter: food('Gröna ärtor (frysta)', 80, 5.5, 'Frysvaror'),
  edamame: food('Edamamebönor, skalade (frysta)', 125, 11.5, 'Frysvaror'),
  falafel: food('Falafel (frysta)', 230, 7, 'Frysvaror'),
  lax: food('Laxfilé (fryst)', 200, 20, 'Frysvaror'),
  torsk: food('Torskfilé (fryst)', 75, 17, 'Frysvaror'),
  rakor: food('Räkor, skalade (frysta)', 70, 16, 'Frysvaror'),

  brod: food('Fullkornsbröd', 250, 9, 'Bröd'),
  knacke: food('Knäckebröd', 340, 10, 'Bröd'),
  tortilla: food('Fullkornstortilla', 300, 9, 'Bröd', st(40)),
  burgerbrod: food('Hamburgerbröd, fullkorn', 260, 9, 'Bröd', st(70)),

  pasta: food('Fullkornspasta (torr)', 350, 13, 'Skafferi', { pantry: true }),
  lasagne: food('Lasagneplattor (torra)', 350, 12, 'Skafferi', { pantry: true }),
  ris: food('Ris, fullkorn/basmati (torrt)', 355, 8, 'Skafferi', { pantry: true }),
  grotris: food('Grötris', 350, 7, 'Skafferi', { pantry: true }),
  nudlar: food('Äggnudlar (torra)', 380, 13, 'Skafferi', { pantry: true }),
  bulgur: food('Bulgur (torr)', 350, 12, 'Skafferi', { pantry: true }),
  linser: food('Röda linser (torra)', 340, 24, 'Skafferi', { pantry: true }),
  gronalinser: food('Gröna linser (torra)', 330, 25, 'Skafferi', { pantry: true }),
  quinoa: food('Quinoa (torr)', 370, 14, 'Skafferi', { pantry: true }),
  risnudlar: food('Risnudlar (torra)', 360, 6, 'Skafferi', { pantry: true }),
  chiafron: food('Chiafrön', 490, 17, 'Skafferi', { pantry: true }),
  naringsjast: food('Näringsjäst', 360, 45, 'Skafferi', { pantry: true }),
  tahini: food('Tahini', 600, 18, 'Skafferi'),
  havre: food('Havregryn', 370, 13, 'Skafferi', { pantry: true }),
  musli: food('Müsli utan tillsatt socker', 370, 10, 'Skafferi'),
  riskaka: food('Riskakor', 380, 8, 'Skafferi'),
  kakao: food('Kakao', 350, 20, 'Skafferi', { pantry: true }),
  vetemjol: food('Vetemjöl', 340, 10, 'Skafferi', { pantry: true }),
  strobrod: food('Ströbröd', 380, 12, 'Skafferi', { pantry: true }),
  tonfisk: food('Tonfisk i vatten (avrunnen)', 110, 25, 'Skafferi', st(120, 'burk', 'burkar')),
  krossade: food('Krossade tomater', 25, 1.2, 'Skafferi', { pack: 400 }),
  kokos: food('Kokosmjölk lätt', 90, 1, 'Skafferi', { pack: 400, packName: ['burk', 'burkar'] }),
  kidney: food('Kidneybönor (kokta)', 110, 8, 'Skafferi', { pack: 380 }),
  kikartor: food('Kikärtor (kokta)', 120, 7, 'Skafferi', { pack: 380 }),
  svartabonor: food('Svarta bönor (kokta)', 115, 8, 'Skafferi', { pack: 380 }),
  majs: food('Majs', 90, 3, 'Skafferi'),
  salsa: food('Salsa', 40, 1.5, 'Skafferi'),
  rodkal: food('Rödkål (inlagd)', 50, 1, 'Skafferi'),
  lingon: food('Lingonsylt', 180, 0.4, 'Skafferi'),
  pesto: food('Pesto', 450, 5, 'Skafferi'),
  mandlar: food('Mandlar', 600, 21, 'Skafferi'),
  jordnot: food('Jordnötssmör', 600, 25, 'Skafferi'),
  olja: food('Olivolja', 900, 0, 'Skafferi', { pantry: true, spoon: 13.5 }),

  huel: food('Huel Black Edition Strawberry Banana', 80, 7, 'Kyl/övrigt', st(500, 'flaska', 'flaskor')),
  whey: food('Proteinpulver Star Nutrition Whey Banana', 375, 75, 'Kyl/övrigt', { pantry: true }),
  veganprotein: food('Veganskt proteinpulver (ärt/ris)', 380, 75, 'Kyl/övrigt', { pantry: true }),
  hummus: food('Hummus', 280, 7, 'Kyl/övrigt'),
  tofu: food('Tofu, fast', 145, 15, 'Kyl/övrigt'),
  sojabitar: food('Vegobitar av soja (kylda)', 150, 18, 'Kyl/övrigt'),
  sojafars: food('Vegofärs av soja', 160, 18, 'Kyl/övrigt'),
  tempeh: food('Tempeh', 200, 19, 'Kyl/övrigt')
};

// Det som kommer från djur (kött, fisk, ägg, mejeri, äggnudlar och pesto med parmesan): bort
// när du väljer vegan.
export const ANIMAL = ['kyckling', 'kalkonfile', 'notfars', 'kycklingfars', 'oxfile', 'kalkon', 'tonfisk', 'lax', 'torsk', 'rakor', 'agg', 'kvarg', 'skyr', 'keso',
  'ost', 'feta', 'parmesan', 'mozzarella', 'mjolk', 'creme', 'nudlar', 'pesto', 'whey'];

// Kolhydrater, varav socker, fett och varav mättat fett, gram per 100 g (ungefärliga svenska värden).
export const MACROS = {
  kyckling: [0, 0, 1.5, 0.4], kalkonfile: [0, 0, 1, 0.3], notfars: [0, 0, 10, 4.3], kycklingfars: [0, 0, 7, 2], oxfile: [0, 0, 5, 2],
  kalkon: [2, 1, 1.5, 0.5], agg: [0.7, 0.4, 10, 2.8], kvarg: [3.5, 3.5, 0.2, 0.1], skyr: [4, 4, 0.2, 0.1], keso: [3, 3, 1.5, 1],
  ost: [0, 0, 17, 11], feta: [1, 1, 21, 14], parmesan: [0, 0, 28, 18], mozzarella: [1, 1, 10, 6.5], mjolk: [4.8, 4.8, 1.5, 0.9],
  havredryck: [6.5, 4, 1.5, 0.2], creme: [3.5, 3.5, 15, 10],
  banan: [21, 17, 0.3, 0.1], apple: [11, 10, 0.2, 0], clementin: [10, 9, 0.2, 0], avokado: [2, 0.5, 15, 2.1], broccoli: [3.5, 1.5, 0.4, 0.1],
  brysselkal: [5, 2, 0.3, 0], champinjon: [1, 0.5, 0.3, 0], gurka: [2, 1.7, 0.1, 0], lok: [7, 5, 0.1, 0], rodlok: [7, 5, 0.1, 0],
  morot: [7, 5, 0.2, 0], paprika: [5, 4, 0.3, 0], potatis: [16, 0.6, 0.1, 0], sotpotatis: [18, 5, 0.1, 0], sallad: [1.5, 1, 0.2, 0],
  spenat: [1, 0.4, 0.4, 0.1], tomat: [3, 2.6, 0.2, 0], zucchini: [2.5, 2, 0.3, 0],
  blabar: [10, 8, 0.4, 0], hallon: [5, 4.5, 0.5, 0], mango: [14, 13, 0.3, 0.1], wok: [5, 3, 0.3, 0], arter: [10, 4, 0.5, 0.1],
  brod: [42, 4, 3.5, 0.6], knacke: [60, 1.5, 2, 0.3], tortilla: [48, 3, 7, 2.5], burgerbrod: [45, 5, 4.5, 1],
  pasta: [64, 3, 2.5, 0.5], lasagne: [70, 2, 1.5, 0.3], ris: [77, 0.3, 1, 0.2], grotris: [78, 0, 0.6, 0.1], nudlar: [70, 2, 4, 1],
  bulgur: [70, 0.5, 1.5, 0.2], linser: [50, 2, 1.5, 0.2], havre: [58, 1, 7, 1.2], musli: [60, 12, 7, 1.5], riskaka: [80, 0.5, 3, 0.6],
  kakao: [12, 1, 21, 13], vetemjol: [70, 0.5, 1.5, 0.2], strobrod: [72, 4, 4, 1], tonfisk: [0, 0, 1, 0.3], krossade: [4, 3.5, 0.2, 0],
  kokos: [3, 2, 8, 7], kidney: [15, 0.5, 0.5, 0.1], kikartor: [16, 0.5, 2.5, 0.3], majs: [15, 4, 1.2, 0.2], salsa: [7, 5, 0.2, 0],
  rodkal: [11, 10, 0.1, 0], lingon: [43, 40, 0.3, 0], pesto: [4, 2, 45, 7], mandlar: [7, 4, 50, 3.8], jordnot: [13, 5, 50, 10],
  olja: [0, 0, 100, 14],
  huel: [4.8, 0.8, 3.4, 0.7], hummus: [14, 1, 22, 2.5], whey: [7, 5, 5, 3],
  sojadryck: [0.5, 0.2, 1.8, 0.3], sojayoghurt: [2.5, 1.5, 2.8, 0.5], havrefraiche: [6, 1.5, 13, 1.2], vegost: [20, 0, 22, 19],
  blomkal: [3, 2, 0.3, 0], edamame: [7, 2, 5, 0.6], falafel: [25, 2, 11, 1.2], lax: [0, 0, 13, 2.5], torsk: [0, 0, 0.7, 0.1], rakor: [0, 0, 1, 0.2], gronalinser: [48, 2, 1.5, 0.2], quinoa: [64, 1, 6, 0.7],
  risnudlar: [80, 0.5, 0.6, 0.1], chiafron: [8, 0, 31, 3.3], naringsjast: [30, 1, 4, 0.6], tahini: [10, 0.5, 54, 7.5], svartabonor: [15, 0.3, 0.5, 0.1],
  veganprotein: [5, 1, 7, 1.5], tofu: [2, 0.7, 8.5, 1.3], sojabitar: [5, 1, 5.5, 0.6], sojafars: [4, 1, 7, 0.8], tempeh: [9, 0, 11, 2.2]
};

// Om du inte äter något byts det i recepten mot det här (samma vikt; i en lista det första du äter),
// "drop" tar bort det. Byten görs ett steg: äter du inte heller ersättningen, eller saknas den, tas små
// mängder (under 15 g) bort och annars byts hela måltiden. De veganska alternativen sist i listorna gör
// att mejeriet byts när du är vegan, medan kött, fisk och ägg ger veganska måltider i stället.
export const SWAPS = {
  kyckling: 'kalkonfile', kalkonfile: 'kyckling', notfars: 'kycklingfars', kycklingfars: 'notfars', tonfisk: 'kyckling', lax: 'torsk', torsk: 'lax', rakor: 'torsk',
  kvarg: ['skyr', 'sojayoghurt'], skyr: ['kvarg', 'sojayoghurt'], keso: 'kvarg', creme: ['kvarg', 'havrefraiche'],
  mjolk: ['sojadryck', 'havredryck'], havredryck: ['mjolk', 'sojadryck'], sojadryck: ['havredryck', 'mjolk'], sojayoghurt: ['kvarg', 'skyr'],
  feta: ['mozzarella', 'vegost'], mozzarella: ['feta', 'vegost'], parmesan: ['ost', 'naringsjast'], ost: ['mozzarella', 'vegost'],
  tofu: 'sojabitar', sojabitar: 'tofu', sojafars: 'sojabitar', tempeh: 'tofu', edamame: 'arter', svartabonor: 'kidney', gronalinser: 'linser',
  quinoa: 'bulgur', risnudlar: 'ris', blomkal: 'broccoli', falafel: 'kikartor', tahini: 'jordnot', chiafron: 'drop', naringsjast: 'drop', havrefraiche: 'kokos',
  champinjon: 'zucchini', zucchini: 'paprika', paprika: 'zucchini', tomat: 'gurka', gurka: 'tomat', sallad: 'spenat', spenat: 'sallad',
  broccoli: 'arter', arter: 'broccoli', brysselkal: 'broccoli', majs: 'arter', potatis: 'sotpotatis', sotpotatis: 'potatis',
  blabar: 'hallon', hallon: 'blabar', mango: 'blabar', banan: 'apple', apple: 'clementin', clementin: 'apple',
  kidney: 'kikartor', kikartor: 'kidney', ris: 'bulgur', bulgur: 'ris', nudlar: 'ris', kokos: 'creme',
  rodlok: 'lok', lok: 'drop', avokado: 'drop', salsa: 'drop', lingon: 'drop', rodkal: 'drop', hummus: 'drop'
};

// Hur livsmedlen heter i rätternas namn, så att "Kycklingwok" blir "Kalkonwok" när kycklingen byts.
export const WORDS = {
  kyckling: 'kyckling', kalkonfile: 'kalkon', champinjon: 'champinjoner', zucchini: 'zucchini', tonfisk: 'tonfisk',
  keso: 'keso', kvarg: 'kvarg', skyr: 'skyr', feta: 'feta', mozzarella: 'mozzarella', banan: 'banan', apple: 'äpple',
  blabar: 'blåbär', hallon: 'hallon', mango: 'mango', clementin: 'clementiner', kidney: 'kidneybönor', kikartor: 'kikärtor',
  sojayoghurt: 'sojayoghurt', mjolk: 'mjölk', sojadryck: 'sojadryck', havredryck: 'havredryck', tofu: 'tofu', svartabonor: 'svarta bönor',
  lax: 'lax', torsk: 'torsk', rakor: 'räkor'
};

// Det första i bytet för ett livsmedel som du äter ("drop", ett livsmedel eller null).
export const swapFor = (food, without) => [].concat(SWAPS[food] ?? []).find(swap => swap === 'drop' || (FOODS[swap] && !without.has(swap))) ?? null;

// Behöver inte köpas in efter vikt och räknas inte: används fritt.
export const SPICES = 'Currypulver/currypasta, chilikrydda, spiskummin, tacokrydda, oregano, paprikapulver, kanel, vitlök, ingefära, soja, senap, citron, buljong, salt & peppar.';
