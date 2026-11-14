// Inköpslistan inför flytten: det du själv skriver in, med din egen länk och ett pris om det finns. Här finns
// det som räknas fram ur listan (summorna, listan som text) och hur en inklistrad länk blir en länk.

// ---------- Länkar ----------
// Bara vanliga webbadresser (http och https) blir länkar.
export function safeLink(text) {
  try {
    const url = new URL(text.trim());
    return /^https?:$/.test(url.protocol) && url.hostname.includes('.') && url.href.length <= 2000 ? url.href : null;
  } catch {
    return null;
  }
}

// Länkfältet: tomt är ingen länk (null), "ikea.se/…" utan https:// går också, och något annat är fel (undefined).
export function linkFrom(text) {
  const value = text.trim();
  if (!value) return null;
  return safeLink(/^https?:\/\//i.test(value) ? value : `https://${value}`) ?? undefined;
}

// Det som står på länkknappen: butikens eller sajtens namn ("ikea.com").
export const linkLabel = link => new URL(link).hostname.replace(/^www\d?\./, '');

// Ett namn ur själva adressen, när du bara klistrat in en länk: den sista delen av sökvägen som inte är ett
// artikelnummer ("…/p/fornuft-bestick-24-delar-60196930/" blir "Fornuft bestick 24 delar").
export function nameFromLink(link) {
  const url = new URL(link);
  const parts = url.pathname.split('/').map(part => { try { return decodeURIComponent(part); } catch { return part; } })
    .map(part => part.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[-_+]+/g, ' ').replace(/\b[a-z]*\d{5,}[a-z0-9]*\b/gi, '').replace(/\s+/g, ' ').trim())
    .filter(part => /\p{L}{3}/u.test(part));
  const name = (parts.at(-1) ?? linkLabel(link)).slice(0, 80).trim();
  return name[0].toUpperCase() + name.slice(1);
}

// Det du skrev i rutan: en länk var som helst i texten plockas ut, och resten blir namnet. Bara en länk ger
// ett namn ur adressen. { name, link } (link = null om det inte fanns någon).
export function splitEntry(text) {
  const found = text.match(/https?:\/\/\S+/i);
  const link = found ? safeLink(found[0].replace(/[),.;]+$/, '')) : null;
  const rest = (found ? text.replace(found[0], ' ') : text).replace(/\(\s*\)/g, ' ').replace(/\s+/g, ' ')
    .replace(/^[\s:–)-]+|[\s:–(-]+$/g, '').trim();
  return { name: rest || (link ? nameFromLink(link) : ''), link };
}

// ---------- Pris ----------
// "1 299,90", "1299.90" och "1299 kr" är samma sak; tomt är inget pris (null) och något annat är fel (NaN).
export function priceFrom(text) {
  const value = text.trim().replace(/\s|kr$|:-$/gi, '').replace(',', '.');
  return value === '' ? null : /^\d+(\.\d{1,2})?$/.test(value) && Number(value) <= 1e6 ? Number(value) : NaN;
}
export const cost = item => (item.price == null ? null : item.qty * item.price);

// Vad allt kostar, vad det köpta kostade och vad som är kvar; unpriced = saker kvar att köpa utan pris.
export function totals(items) {
  const sum = list => list.reduce((total, item) => total + (cost(item) ?? 0), 0);
  const bought = items.filter(item => item.done);
  return { total: sum(items), bought: sum(bought), left: sum(items) - sum(bought), unpriced: items.filter(item => item.price == null && !item.done).length };
}

// Listan i den ordning du skrev in den, det köpta sist.
export const ordered = items => [...items].sort((a, b) => Number(a.done) - Number(b.done) || a.made - b.made);

// Listan som text, att skicka till någon: det som inte är köpt, med antal, pris och länk.
export function shoppingText(items) {
  return ordered(items.filter(item => !item.done)).map(item => [
    `- ${item.name}${item.qty > 1 ? ` (${item.qty} st)` : ''}${item.price == null ? '' : `, ${Math.round(item.price * item.qty).toLocaleString('sv-SE')} kr`}`,
    item.link ? `  ${item.link}` : null
  ].filter(Boolean).join('\n')).join('\n');
}
