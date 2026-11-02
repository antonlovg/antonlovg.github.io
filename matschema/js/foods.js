// Livsmedlen: namn, kcal och protein per 100 g (ungefärliga svenska värden; råvikt för kött, torrvikt
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

  blabar: food('Blåbär (frysta)', 50, 0.7, 'Frysvaror'),
  hallon: food('Hallon (frysta)', 40, 1.2, 'Frysvaror'),
  mango: food('Mango (fryst)', 65, 0.6, 'Frysvaror'),
  wok: food('Wokgrönsaker (frysta)', 35, 2, 'Frysvaror'),
  arter: food('Gröna ärtor (frysta)', 80, 5.5, 'Frysvaror'),

  brod: food('Fullkornsbröd', 250, 9, 'Bröd'),
  knacke: food('Knäckebröd', 340, 10, 'Bröd'),
  tortilla: food('Fullkornstortilla', 300, 9, 'Bröd', st(40)),
  burgerbrod: food('Hamburgerbröd, fullkorn', 260, 9, 'Bröd', st(70)),
  lussekatt: food('Lussekatter', 330, 7, 'Bröd', st(60)),

  pasta: food('Fullkornspasta (torr)', 350, 13, 'Skafferi', { pantry: true }),
  lasagne: food('Lasagneplattor (torra)', 350, 12, 'Skafferi', { pantry: true }),
  ris: food('Ris, fullkorn/basmati (torrt)', 355, 8, 'Skafferi', { pantry: true }),
  grotris: food('Grötris', 350, 7, 'Skafferi', { pantry: true }),
  nudlar: food('Äggnudlar (torra)', 380, 13, 'Skafferi', { pantry: true }),
  bulgur: food('Bulgur (torr)', 350, 12, 'Skafferi', { pantry: true }),
  linser: food('Röda linser (torra)', 340, 24, 'Skafferi', { pantry: true }),
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
  majs: food('Majs', 90, 3, 'Skafferi'),
  salsa: food('Salsa', 40, 1.5, 'Skafferi'),
  rodkal: food('Rödkål (inlagd)', 50, 1, 'Skafferi'),
  lingon: food('Lingonsylt', 180, 0.4, 'Skafferi'),
  pesto: food('Pesto', 450, 5, 'Skafferi'),
  mandlar: food('Mandlar', 600, 21, 'Skafferi'),
  jordnot: food('Jordnötssmör', 600, 25, 'Skafferi'),
  honung: food('Honung', 300, 0.3, 'Skafferi', { pantry: true }),
  choklad: food('Mörk choklad 70 %', 580, 8, 'Skafferi'),
  pepparkakor: food('Pepparkakor', 470, 6, 'Skafferi'),
  olja: food('Olivolja', 900, 0, 'Skafferi', { pantry: true, spoon: 13.5 }),

  huel: food('Huel Black Edition Strawberry Banana', 80, 7, 'Kyl/övrigt', st(500, 'flaska', 'flaskor')),
  hummus: food('Hummus', 280, 7, 'Kyl/övrigt')
};

// Om du inte äter något byts det i recepten mot det här (samma vikt), "drop" tar bort det. Byten görs
// ett steg: äter du inte heller ersättningen, eller saknas den, tas små mängder (under 15 g) bort och
// annars byts hela måltiden.
export const SWAPS = {
  kyckling: 'kalkonfile', kalkonfile: 'kyckling', notfars: 'kycklingfars', kycklingfars: 'notfars', tonfisk: 'kyckling',
  kvarg: 'skyr', skyr: 'kvarg', keso: 'kvarg', creme: 'kvarg', mjolk: 'havredryck', havredryck: 'mjolk',
  feta: 'mozzarella', mozzarella: 'feta', parmesan: 'ost', ost: 'mozzarella',
  champinjon: 'zucchini', zucchini: 'paprika', paprika: 'zucchini', tomat: 'gurka', gurka: 'tomat', sallad: 'spenat', spenat: 'sallad',
  broccoli: 'arter', arter: 'broccoli', brysselkal: 'broccoli', majs: 'arter', potatis: 'sotpotatis', sotpotatis: 'potatis',
  blabar: 'hallon', hallon: 'blabar', mango: 'blabar', banan: 'apple', apple: 'clementin', clementin: 'apple',
  kidney: 'kikartor', kikartor: 'kidney', ris: 'bulgur', bulgur: 'ris', nudlar: 'ris', kokos: 'creme',
  rodlok: 'lok', lok: 'drop', avokado: 'drop', salsa: 'drop', lingon: 'drop', rodkal: 'drop', honung: 'drop', hummus: 'drop'
};

// Hur livsmedlen heter i rätternas namn, så att "Kycklingwok" blir "Kalkonwok" när kycklingen byts.
export const WORDS = {
  kyckling: 'kyckling', kalkonfile: 'kalkon', champinjon: 'champinjoner', zucchini: 'zucchini', tonfisk: 'tonfisk',
  keso: 'keso', kvarg: 'kvarg', skyr: 'skyr', feta: 'feta', mozzarella: 'mozzarella', banan: 'banan', apple: 'äpple',
  blabar: 'blåbär', hallon: 'hallon', mango: 'mango', clementin: 'clementiner', kidney: 'kidneybönor', kikartor: 'kikärtor'
};

// Behöver inte köpas in efter vikt och räknas inte: används fritt.
export const SPICES = 'Currypulver/currypasta, chilikrydda, spiskummin, tacokrydda, oregano, paprikapulver, kanel, vitlök, ingefära, soja, senap, citron, buljong, salt & peppar.';
