// Flyttlistan: en inköpslista där du själv skriver in vad du behöver, med din egen länk och ett pris om det
// finns. Det köpta hamnar sist. #mer öppnar synk och data, och #synk/… läser in listan från en annan enhet.
import { cost, linkFrom, linkLabel, ordered, priceFrom, shoppingText, splitEntry, totals } from './list.js';
import { pack, unpack, fileText, readFile } from './sync.js';
import * as store from './store.js';

const $ = id => document.getElementById(id);

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (name === 'class') node.className = value;
    else if (name.startsWith('on')) node.addEventListener(name.slice(2), value);
    else node.setAttribute(name, value === true ? '' : value);
  }
  node.append(...children.flat().filter(child => child != null && child !== false));
  return node;
}
const SVG = 'http://www.w3.org/2000/svg';
function svg(viewBox, ...children) {
  const node = document.createElementNS(SVG, 'svg');
  node.setAttribute('viewBox', viewBox);
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('focusable', 'false');
  node.append(...children);
  return node;
}
// Länkpilen, och kritan (#crayon i index.html) som ändra-knappen är ritad med.
const arrow = () => { const path = document.createElementNS(SVG, 'path'); path.setAttribute('d', 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'); return svg('0 0 24 24', path); };
const crayon = () => { const use = document.createElementNS(SVG, 'use'); use.setAttribute('href', '#crayon'); return svg('0 0 24 100', use); };

const kr = value => `${Math.round(value).toLocaleString('sv-SE')} kr`;
// Ett pris med ören om det har det (49,90 kr), annars utan.
const each = value => `${value.toLocaleString('sv-SE', { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })} kr`;
const today = () => new Date().toISOString().slice(0, 10);

// Kritan för en sak: kritorna i tur och ordning, efter när sakerna skrevs in.
let colors = new Map();
const crayonFor = item => String((colors.get(item.id) ?? 0) % 8 + 1);

// ---------- Utseendet: kritor, mörkt, gulligt eller busigt ----------
const BAR = { light: '#fffaf0', dark: '#1b1923', cute: '#ffe3ef', punk: '#1a1422' };
function applyTheme() {
  const look = store.theme();
  document.documentElement.dataset.theme = look;
  document.querySelector('meta[name="theme-color"]').setAttribute('content', BAR[look]);
  for (const button of document.querySelectorAll('.look')) button.setAttribute('aria-pressed', String(button.dataset.look === look));
}
for (const button of document.querySelectorAll('.look')) button.addEventListener('click', () => {
  store.setTheme(button.dataset.look);
  applyTheme();
});

// ---------- Listan ----------
function render() {
  applyTheme();
  const all = store.items();
  colors = new Map([...all].sort((a, b) => a.made - b.made).map((item, i) => [item.id, i]));
  renderSum(all);
  const list = ordered(all);
  const open = list.filter(item => !item.done), done = list.filter(item => item.done);
  $('list').replaceChildren(...open.map(card));
  $('done').replaceChildren(...(done.length ? [h('li', { class: 'done-title-row' }, h('h3', { class: 'done-title' }, `Köpt (${done.length})`)), ...done.map(card)] : []));
  $('empty').hidden = all.length > 0;
  $('copy-list').hidden = !open.length;
}

// Summan: totalt och kvar, och en krita som ritar hur mycket som är köpt.
function renderSum(all) {
  if (!all.length) { $('sum').replaceChildren(); return; }
  const sum = totals(all);
  const bought = all.filter(item => item.done).length;
  const share = bought / all.length;
  $('sum').replaceChildren(
    h('p', { class: 'sum-line' },
      h('span', {}, 'Totalt ', h('b', {}, kr(sum.total))),
      h('span', { class: 'left' }, 'kvar att köpa ', h('b', {}, kr(sum.left)))),
    h('div', { class: 'track', role: 'img', 'aria-label': `${bought} av ${all.length} köpta` },
      h('div', { class: `stroke w${Math.round(share * 20) * 5}` })),
    h('p', { class: 'hint' }, `${bought} av ${all.length} köpta${sum.bought ? `, för ${kr(sum.bought)}` : ''}.`,
      sum.unpriced ? ` ${sum.unpriced === 1 ? '1 sak saknar' : `${sum.unpriced} saker saknar`} pris och räknas inte med.` : ''));
}

function card(item) {
  const price = cost(item);
  return h('li', { class: item.done ? 'item is-done' : 'item', 'data-c': crayonFor(item), 'data-item': item.id },
    h('button', { type: 'button', class: 'box', 'aria-pressed': String(item.done), 'aria-label': `${item.name}. Köpt`, onclick: () => {
      store.setItem(item.id, { ...item, done: !item.done });
      render();
      $('status').textContent = item.done ? `${item.name} är inte köpt längre.` : `${item.name} är köpt!`;
      (document.querySelector(`[data-item="${item.id}"] .box`) ?? $('list-title')).focus();
    } }),
    h('div', { class: 'item-text' },
      h('span', { class: 'item-name' }, item.name),
      h('div', { class: 'item-extras' },
        price === null ? null : item.qty > 1 ? h('span', { class: 'price' }, kr(price), h('small', {}, `${item.qty} × ${each(item.price)}`))
          : h('span', { class: 'price' }, each(item.price)),
        item.link ? h('a', { class: 'link', href: item.link, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${item.name}: öppna ${linkLabel(item.link)} (ny flik)` },
          arrow(), h('span', {}, linkLabel(item.link))) : null),
      item.note ? h('span', { class: 'item-note' }, item.note) : null),
    h('button', { type: 'button', class: 'edit', 'aria-haspopup': 'dialog', 'aria-label': `Ändra ${item.name}`, onclick: () => edit(item) }, crayon()));
}

// Namn och länk ur två fält: en länk i länkfältet går före en som klistrats in efter namnet, och bara en länk
// ger ett namn ur adressen. { name, link } eller ett fel och fältet det gäller.
function readEntry(nameInput, linkInput) {
  const entry = splitEntry(nameInput.value);
  const typed = linkFrom(linkInput.value);
  if (typed === undefined) return { error: 'Länken ser inte ut som en webbadress. Klistra in hela adressen, till exempel https://www.ikea.se/…', input: linkInput };
  const name = entry.name || (typed ? splitEntry(typed).name : '');
  if (!name) return { error: 'Skriv vad du behöver.', input: nameInput };
  if (name.length > 80) return { error: 'Skriv lite kortare, högst 80 tecken.', input: nameInput };
  return { name, link: typed ?? entry.link };
}
const BAD_PRICE = 'Skriv priset i kronor, till exempel 199 eller 49,90, eller lämna det tomt.';

$('add').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  const read = readEntry(form.elements.name, form.elements.link);
  if (read.error) { $('status').textContent = read.error; read.input.focus(); return; }
  const price = priceFrom(form.elements.price.value);
  if (Number.isNaN(price)) { $('status').textContent = BAD_PRICE; form.elements.price.focus(); return; }
  store.setItem(store.id(), { name: read.name, link: read.link ?? '', price, qty: 1, note: '', done: false, made: Date.now() });
  form.reset();
  render();
  $('status').textContent = [`${read.name} står på listan`, read.link ? 'med länk' : null, price === null ? null : `för ${each(price)}`].filter(Boolean).join(', ') + '.';
  form.elements.name.focus();
});

// ---------- Ändra en sak ----------
const sheet = $('sheet');
let sheetBack = null;
const closeSheet = () => { if (sheet.open) sheet.close(); };
sheet.addEventListener('close', () => { const back = sheetBack; sheetBack = null; back?.()?.focus(); });
$('sheet-close').addEventListener('click', closeSheet);
// Ett tryck utanför rutan (på bakgrunden) stänger den.
for (const dialog of [sheet, $('more')]) dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });

const field = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);

function edit(item) {
  const name = h('input', { type: 'text', maxlength: 2200, autocomplete: 'off', value: item.name });
  const link = h('input', { type: 'url', inputmode: 'url', autocomplete: 'off', placeholder: 'https://…', value: item.link || '' });
  const price = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'kr', value: item.price === null ? '' : (Number.isInteger(item.price) ? String(item.price) : item.price.toFixed(2).replace('.', ',')) });
  const qty = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', value: item.qty });
  const note = h('textarea', { rows: 3, maxlength: 500, placeholder: 'Mått, färg, butik…' });
  note.value = item.note || '';
  const status = h('p', { class: 'status', role: 'status' });
  const form = h('form', { class: 'form', novalidate: true },
    field('Vad', name), field('Länk', link),
    h('div', { class: 'pair' }, field('Pris/st (kr)', price), field('Antal', qty)),
    field('Anteckning', note), status,
    h('div', { class: 'buttons' },
      h('button', { type: 'submit', class: 'pill solid' }, 'Spara'),
      h('button', { type: 'button', class: 'pill danger', onclick: () => {
        store.setItem(item.id, null);
        render();
        sheetBack = () => $('add-name');
        closeSheet();
        $('status').textContent = `Suddade ut ${item.name}.`;
      } }, 'Sudda ut')));
  form.addEventListener('submit', event => {
    event.preventDefault();
    const read = readEntry(name, link);
    if (read.error) { status.textContent = read.error; read.input.focus(); return; }
    const amount = priceFrom(price.value);
    if (Number.isNaN(amount)) { status.textContent = BAD_PRICE; price.focus(); return; }
    const count = Number(qty.value.trim() || '1');
    if (!Number.isInteger(count) || count < 1 || count > 999) { status.textContent = 'Antal ska vara ett heltal från 1 till 999.'; qty.focus(); return; }
    store.setItem(item.id, { ...item, name: read.name, link: read.link ?? '', price: amount, qty: count, note: note.value.trim() });
    render();
    closeSheet();
    $('status').textContent = `${read.name} är ändrad.`;
  });
  sheetBack = () => document.querySelector(`[data-item="${item.id}"] .edit`) ?? $('add-name');
  $('sheet-title').textContent = `Ändra ${item.name}`;
  $('sheet-body').replaceChildren(form);
  sheet.showModal();
  name.focus();
}

$('copy-list').addEventListener('click', async () => {
  const text = shoppingText(store.items());
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: 'Flyttlistan', text });
    else { await navigator.clipboard.writeText(text); $('copy-status').textContent = 'Listan är kopierad. Klistra in den där du vill.'; }
  } catch (error) {
    if (error.name !== 'AbortError') $('copy-status').textContent = 'Det gick inte att kopiera listan.';
  }
});

// ---------- Synk och data ----------
const more = $('more');
function openMore() {
  $('offline').textContent = navigator.serviceWorker?.controller ? 'Listan är sparad på den här enheten och öppnas även utan nät.' : 'Öppna sidan en gång till med nät så sparas den på enheten.';
  if (!more.open) more.showModal();
  $('more-title').focus();
}
$('open-more').addEventListener('click', openMore);
$('more-close').addEventListener('click', () => more.close());
more.addEventListener('close', () => { disarm(); $('open-more').focus(); });

let incoming = null; // det som väntar på att läsas in från en annan enhet

async function offerSync(code) {
  try {
    showOffer(await unpack(code));
  } catch {
    $('sync-status').textContent = 'Länken gick inte att läsa. Kopiera en ny synklänk på den andra enheten.';
  }
}

function showOffer(value) {
  const other = store.clean(value);
  const items = Object.values(other.items).filter(item => !item.gone);
  const bought = items.filter(item => item.done).length;
  incoming = other;
  $('sync-summary').textContent = `${items.length} ${items.length === 1 ? 'sak' : 'saker'} på listan, ${bought} ${bought === 1 ? 'köpt' : 'köpta'}.`;
  $('sync-offer').hidden = false;
  $('sync-accept').focus();
}

$('sync-link').addEventListener('click', async () => {
  const status = $('sync-status');
  try {
    const link = `${location.origin}${location.pathname}#synk/${await pack(store.snapshot())}`;
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ title: 'Flyttlistan: synklänk', url: link });
      status.textContent = '';
    } else {
      await navigator.clipboard.writeText(link);
      status.textContent = 'Synklänken är kopierad. Öppna den på den andra enheten.';
    }
  } catch (error) {
    if (error.name !== 'AbortError') status.textContent = 'Det gick inte att skapa länken. Spara som fil i stället.';
  }
});
$('sync-save').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([fileText(store.snapshot(), today())], { type: 'application/json' }));
  const link = h('a', { href: url, download: `flyttlistan-${today()}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('sync-status').textContent = 'Filen är sparad. Läs in den på den andra enheten.';
});
$('sync-open').addEventListener('click', () => $('sync-file').click());
$('sync-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    showOffer(readFile(await file.text()));
  } catch {
    $('sync-status').textContent = 'Filen gick inte att läsa. Välj en fil som sparats här.';
  }
});
$('sync-accept').addEventListener('click', () => {
  if (incoming) store.merge(incoming);
  incoming = null;
  $('sync-offer').hidden = true;
  render();
  $('sync-status').textContent = 'Inläst. Listan är ihopslagen med den andra enhetens.';
  $('more-title').focus();
});
$('sync-cancel').addEventListener('click', () => {
  incoming = null;
  $('sync-offer').hidden = true;
  $('sync-status').textContent = 'Inget lästes in.';
  $('more-title').focus();
});

// Sudda ut allt kräver två tryck, så att listan inte försvinner av misstag.
let forgetArmed = false;
function disarm() {
  if (!forgetArmed) return;
  forgetArmed = false;
  $('forget').textContent = 'Sudda ut allt';
  $('forget-status').textContent = '';
}
$('forget').addEventListener('click', () => {
  if (!forgetArmed) {
    forgetArmed = true;
    $('forget').textContent = 'Tryck igen för att sudda ut allt';
    $('forget-status').textContent = 'Hela listan, även länkarna, försvinner från den här enheten.';
    return;
  }
  forgetArmed = false;
  store.forget();
  $('forget').textContent = 'Sudda ut allt';
  render();
  $('forget-status').textContent = 'Allt är utsuddat.';
});
$('forget').addEventListener('blur', disarm);

// #mer öppnar synk och data; #synk/… läser in från en annan enhet. Datan tas bort ur adressen direkt (och ur
// historiken), och inget läses in innan du sagt ja.
function route() {
  const [name, arg] = location.hash.slice(1).split('/');
  if (name !== 'mer' && name !== 'synk') return;
  history.replaceState(null, '', location.pathname);
  openMore();
  if (name === 'synk' && arg) offerSync(arg);
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
window.addEventListener('storage', event => { if (event.key === store.KEY || event.key === null) { store.reload(); render(); } });
window.addEventListener('hashchange', route);

// Sparar sidan på enheten så att den öppnas utan nät (sw.js, bara /flytt/).
navigator.serviceWorker?.register('sw.js').catch(() => {});

render();
route();
