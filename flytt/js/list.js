// Flyttlistan: uppgifterna inför flytten (en mall som du kan ändra), sakerna att köpa, och det som räknas fram
// ur dem: när en uppgift ska vara klar (räknat från flyttdagen), grupperna och summorna.

// När en uppgift ska göras, i dagar från flyttdagen (minus är före).
export const PHASES = [
  { days: -90, name: '3 månader före' },
  { days: -56, name: '8 veckor före' },
  { days: -28, name: '4 veckor före' },
  { days: -14, name: '2 veckor före' },
  { days: -7, name: 'Veckan före' },
  { days: 0, name: 'Flyttdagen' },
  { days: 7, name: 'Första veckan efter' },
  { days: 30, name: 'Första månaden efter' }
];
export const PHASE_DAYS = PHASES.map(phase => phase.days);

// Mallen: det de flesta behöver göra när de flyttar. Fasta id:n, så att den går att lägga tillbaka utan dubbletter.
export const TEMPLATE = [
  [-90, 'Säg upp nuvarande boende', 'En hyresrätt har oftast tre månaders uppsägningstid, som slutar vid ett månadsskifte. Säg upp skriftligt och spara beskedet.'],
  [-56, 'Boka flyttfirma eller hyr flyttbil', 'Fråga också vänner om hjälp. Flyttfirma och flyttstädning ger rutavdrag.'],
  [-56, 'Rensa: sälj, skänk eller släng det du inte vill ha med'],
  [-56, 'Beställ bredband till nya adressen', 'Installation kan ta några veckor. Säg upp eller flytta det gamla abonnemanget.'],
  [-28, 'Gör flyttanmälan till Skatteverket', 'Tidigast fyra veckor före och senast en vecka efter flytten. Myndigheter och många företag, som banker, får sedan nya adressen automatiskt.'],
  [-28, 'Beställ eftersändning av posten', 'Hos Svensk Adressändring, så att post till gamla adressen kommer fram.'],
  [-28, 'Teckna elavtal för nya bostaden och säg upp det gamla'],
  [-28, 'Flytta hemförsäkringen till nya adressen', 'Kolla att du är försäkrad i båda bostäderna under flytten, och att flyttgodset är försäkrat.'],
  [-28, 'Boka flyttstädning eller bestäm när du städar själv'],
  [-28, 'Skaffa flyttkartonger, tejp och märkpenna'],
  [-14, 'Börja packa det du inte använder varje dag', 'Märk varje kartong med rum och innehåll.'],
  [-14, 'Ge nya adressen till det som inte får den automatiskt', 'Arbetsgivare, gym, prenumerationer, nätbutiker, vårdcentral och tandläkare.'],
  [-14, 'Boka tid för nyckelöverlämning och besiktning'],
  [-7, 'Bekräfta flyttfirman eller flyttbilen och vilka som hjälper till'],
  [-7, 'Ät upp maten i frysen och frosta av den'],
  [-7, 'Packa en väska för första dygnet', 'Laddare, toalettpapper, tandborste, kläder, sängkläder, mediciner och lite verktyg.'],
  [0, 'Läs av elmätaren i båda bostäderna'],
  [0, 'Fotografera gamla bostaden när den är tom och städad'],
  [0, 'Lämna nycklarna'],
  [7, 'Sätt upp namn på dörren och brevlådan'],
  [7, 'Testa brandvarnarna och lär dig var elcentralen sitter'],
  [7, 'Kolla att flyttanmälan har gått igenom', 'Du får ett brev från Skatteverket till nya adressen.'],
  [30, 'Lämna tillbaka hyrda kartonger och släng emballage'],
  [30, 'Kolla att eftersändningen fungerar och att sista räkningarna för gamla bostaden är betalda']
].map(([days, title, note], i) => ({ id: `m${i + 1}`, title, note: note || '', days, made: i, done: false }));

// Rummen på inköpslistan, i den ordning de visas.
export const ROOMS = ['Kök', 'Badrum', 'Sovrum', 'Vardagsrum', 'Hall & förråd', 'Städ & tvätt', 'Verktyg & el', 'Flytten', 'Övrigt'];

// Sånt man ofta behöver i en ny bostad, att lägga till med ett tryck.
export const SUGGESTIONS = {
  'Kök': ['Diskmedel och diskborste', 'Disktrasor', 'Soppåsar', 'Hushållspapper', 'Skärbräda', 'Grytlappar', 'Folie och fryspåsar'],
  'Badrum': ['Toalettpapper', 'Duschdraperi och stång', 'Badrumsmatta', 'Tvål', 'Handdukskrokar'],
  'Sovrum': ['Gardiner eller mörkläggning', 'Galgar', 'Sänglampa'],
  'Vardagsrum': ['Gardinstänger', 'Lampor (LED)', 'Taklampa'],
  'Hall & förråd': ['Dörrmatta', 'Skohylla', 'Krokar', 'Namnskylt'],
  'Städ & tvätt': ['Allrengöring', 'Moppar och trasor', 'Dammsugarpåsar', 'Tvättmedel', 'Torkställning'],
  'Verktyg & el': ['Brandvarnare', 'Batterier', 'Grenuttag', 'Förlängningssladd', 'Skruvdragare', 'Väggpluggar och skruv'],
  'Flytten': ['Flyttkartonger', 'Packtejp', 'Bubbelplast', 'Märkpenna', 'Möbeltassar', 'Sopsäckar']
};

// ---------- Datum ----------
const pad = n => String(n).padStart(2, '0');
export const todayIso = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
export function addDays(date, days) {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}
export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);

// ---------- Uppgifterna ----------
// Uppgifterna per fas, i den ordning de lades till. Utan flyttdag har de inget datum.
export function phases(tasks, date) {
  return PHASES.map(phase => ({
    ...phase,
    due: date ? addDays(date, phase.days) : null,
    tasks: tasks.filter(task => task.days === phase.days).sort((a, b) => a.made - b.made)
  })).filter(phase => phase.tasks.length);
}

// Mallens uppgifter som inte finns (du har tagit bort dem).
export const missingTemplate = tasks => TEMPLATE.filter(task => !tasks.some(other => other.id === task.id));

// ---------- Inköpen ----------
export const cost = item => (item.price == null ? null : item.qty * item.price);

// Sakerna per rum, i rummens ordning, med vad rummet kostar.
export function rooms(items) {
  return ROOMS.map(room => {
    const here = items.filter(item => item.room === room).sort((a, b) => a.made - b.made);
    return { room, items: here, total: here.reduce((sum, item) => sum + (cost(item) ?? 0), 0) };
  }).filter(group => group.items.length);
}

// Vad allt kostar, vad det köpta kostade och vad som är kvar; unpriced = saker utan pris.
export function totals(items) {
  const sum = list => list.reduce((total, item) => total + (cost(item) ?? 0), 0);
  const bought = items.filter(item => item.done);
  return { total: sum(items), bought: sum(bought), left: sum(items) - sum(bought), unpriced: items.filter(item => item.price == null && !item.done).length };
}

// Listan som text, att skicka till någon: det som inte är köpt, per rum.
export function shoppingText(items) {
  return rooms(items.filter(item => !item.done)).map(group => [
    group.room,
    ...group.items.map(item => `- ${item.name}${item.qty > 1 ? ` (${item.qty} st)` : ''}${item.note ? `: ${item.note}` : ''}`)
  ].join('\n')).join('\n\n');
}
