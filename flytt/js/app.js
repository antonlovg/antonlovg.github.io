// Flyttlistan: att göra (med datum räknat från flyttdagen) och att köpa (per rum, med pris), där varje rad kan ha
// en länk. Adressen bestämmer listan: #gora eller #kopa. #mer öppnar synk och data, och #synk/… läser in det du
// sparat på en annan enhet.
import { PHASES, ROOMS, SUGGESTIONS, cost, daysBetween, linkLabel, missingTemplate, phases, rooms, safeLink, shoppingText, splitEntry, todayIso, totals } from './list.js';
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

// Ritade ikoner (länk och penna).
const ICONS = {
  link: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  pencil: 'M4 20l1-5L16 4l4 4L9 19l-5 1ZM14 6l4 4'
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

// ---------- Tal, datum och länkar ----------
const kr = value => `${Math.round(value).toLocaleString('sv-SE')} kr`;
// Ett styckpris med ören om det har det (49,90 kr), annars utan.
const each = value => `${value.toLocaleString('sv-SE', { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })} kr`;
// "49,90" och "49.90" är samma sak; tomt är inget pris.
const amount = value => {
  const text = value.trim().replace(/\s/g, '').replace(',', '.');
  return text === '' ? null : /^\d+(\.\d+)?$/.test(text) ? Number(text) : NaN;
};
const format = (date, options) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'UTC', ...options }).format(new Date(`${date}T12:00:00Z`));
const dayMonth = date => format(date, { day: 'numeric', month: 'long', ...(date.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}) });
const weekday = date => format(date, { weekday: 'long' });
// Länkfältet: tomt är ingen länk (null), "ikea.se/…" utan https:// går också, och något annat är fel (undefined).
const linkFrom = text => {
  const value = text.trim();
  if (!value) return null;
  return safeLink(/^https?:\/\//i.test(value) ? value : `https://${value}`) ?? undefined;
};
const BAD_LINK = 'Länken ser inte ut som en webbadress. Klistra in hela adressen, till exempel https://www.ikea.se/…';

let today = todayIso();

// ---------- Listorna ----------
const VIEWS = ['gora', 'kopa'];
let view = 'gora';

function route() {
  const [name, arg] = location.hash.slice(1).split('/');
  if (name === 'synk' || name === 'mer') {
    // Ta bort datan ur adressen direkt (och ur historiken), och fråga innan något läses in.
    history.replaceState(null, '', `#${view}`);
    render();
    openMore();
    if (name === 'synk' && arg) offerSync(arg);
    return;
  }
  view = VIEWS.includes(name) ? name : 'gora';
  render();
}

function render() {
  for (const name of VIEWS) $(`view-${name}`).hidden = name !== view;
  for (const tab of document.querySelectorAll('.tabs a')) {
    if (tab.dataset.view === view) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
  }
  renderNote();
  const tasks = store.tasks(), items = store.items();
  $('tab-gora').textContent = `${tasks.filter(task => task.done).length} av ${tasks.length} klara`;
  $('tab-kopa').textContent = items.length ? `${items.filter(item => !item.done).length} kvar` : 'tom än';
  (view === 'gora' ? renderTasks : renderItems)();
}

// Lappen: flyttdagen och hur långt det är kvar.
function renderNote() {
  const date = store.date();
  $('move-date').value = date ?? '';
  if (!date) { $('countdown').replaceChildren('Välj dagen så får allt ett datum'); return; }
  const days = daysBetween(today, date);
  const day = `${weekday(date)} ${dayMonth(date)}`;
  $('countdown').replaceChildren(...(days > 1 ? [h('b', {}, `${days} dagar`), ` kvar, ${day}`]
    : days === 1 ? [h('b', {}, 'Imorgon!'), ` ${day[0].toUpperCase()}${day.slice(1)}`]
    : days === 0 ? [h('b', {}, 'Idag!'), ' Lycka till med flytten']
    : [`Flyttade ${day}, för ${-days} ${days === -1 ? 'dag' : 'dagar'} sedan`]));
}

$('move-date').addEventListener('change', event => {
  store.setDate(event.target.value || null);
  render();
  $(view === 'gora' ? 'task-status' : 'item-status').textContent = event.target.value ? `Flyttdagen är ${dayMonth(event.target.value)}.` : 'Ingen flyttdag vald.';
});

// Mätaren: ritad stapel med hur mycket som är klart (bredden i steg om 5 %, se .w0–.w100 i CSS:en).
function meter(id, parts, share, hint) {
  $(id).replaceChildren(
    h('p', { class: 'meter-text' }, parts),
    h('div', { class: 'meter-bar', 'aria-hidden': 'true' }, h('div', { class: `meter-fill w${Math.round(share * 20) * 5}` })),
    hint ? h('p', { class: 'hint' }, hint) : '');
}

// En rad: bockruta, text (med anteckning och länk) och en penna för att ändra.
function line({ key, id, title, done, note, link, label, onToggle, onEdit, extra }) {
  return h('li', { class: done ? 'line is-done' : 'line', [`data-${key}`]: id },
    h('button', { type: 'button', class: 'box', 'aria-pressed': String(done), 'aria-label': `${title}. ${label}`, onclick: onToggle }),
    h('div', { class: 'line-text' },
      h('span', { class: 'line-title' }, title, extra),
      note ? h('span', { class: 'line-note' }, note) : null,
      link ? h('a', { class: 'link', href: link, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${title}: öppna ${linkLabel(link)} (ny flik)` },
        icon('link'), h('span', {}, linkLabel(link))) : null),
    h('button', { type: 'button', class: 'edit-btn', 'aria-haspopup': 'dialog', 'aria-label': `Ändra ${title}`, onclick: onEdit }, icon('pencil')));
}

// Fokus tillbaka till samma rad (eller listans rubrik) när listan ritats om.
const refocus = (selector, fallback) => (document.querySelector(selector) ?? $(fallback)).focus();
// Varje grupp har sin egen krita (data-c 1–6), efter gruppens plats i PHASES eller ROOMS.
const crayon = index => String(index % 6 + 1);

// ---------- Att göra ----------
const phaseOptions = selected => PHASES.map(phase => h('option', { value: phase.days, selected: phase.days === selected }, phase.name));
$('task-form').elements.days.append(...phaseOptions(-28));

function renderTasks() {
  const date = store.date();
  const all = store.tasks(), done = all.filter(task => task.done).length;
  meter('gora-meter', [h('span', {}, h('b', {}, `${done} av ${all.length}`), ' klara'), all.length > done ? h('span', {}, `${all.length - done} kvar`) : null],
    all.length ? done / all.length : 0, date ? null : 'Välj flyttdag på lappen, så får varje grupp ett datum att vara klar till.');
  $('hide-tasks').checked = store.hide('tasks');
  const shown = store.hide('tasks') ? all.filter(task => !task.done) : all;
  const groups = phases(shown, date);
  $('tasks').replaceChildren(...groups.map(group => h('section', { class: 'group', 'data-c': crayon(PHASES.findIndex(phase => phase.days === group.days)) },
    h('div', { class: 'group-head' }, h('h3', {}, group.name),
      group.due ? h('span', { class: 'group-date' }, group.days === 0 ? dayMonth(group.due) : `senast ${dayMonth(group.due)}`) : null),
    h('ul', { class: 'rows' }, group.tasks.map(task => line({
      key: 'task', id: task.id, title: task.title, done: task.done, note: task.note, link: task.link, label: 'Klar',
      extra: group.due && group.due < today && !task.done ? h('span', { class: 'late' }, 'sent!') : null,
      onToggle: () => {
        store.setTask(task.id, { ...task, done: !task.done });
        render();
        refocus(`[data-task="${task.id}"] .box`, 'gora-title');
      },
      onEdit: () => editTask(task)
    }))))));
  if (!groups.length) $('tasks').append(h('p', { class: 'empty' }, all.length ? 'Allt är klart. Bra jobbat!' : 'Listan är tom. Skriv något ovan.'));
  $('restore').hidden = !missingTemplate(all).length;
}

// Det du skrev i rutan och i länkfältet: { title, link } eller ett fel och fältet det gäller. En länk i
// länkfältet går före en i rutan, och bara en länk ger ett namn ur adressen.
function readEntry(textInput, linkInput, max) {
  const entry = splitEntry(textInput.value);
  const typed = linkFrom(linkInput.value);
  if (typed === undefined) return { error: BAD_LINK, input: linkInput };
  const link = typed ?? entry.link;
  const title = entry.title || (typed ? splitEntry(typed).title : '');
  if (!title) return { error: 'Skriv vad det gäller.', input: textInput };
  if (title.length > max) return { error: `Skriv lite kortare, högst ${max} tecken.`, input: textInput };
  return { title, link };
}

$('task-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  const read = readEntry(form.elements.title, form.elements.link, 120);
  if (read.error) { $('task-status').textContent = read.error; read.input.focus(); return; }
  const days = Number(form.elements.days.value);
  store.setTask(store.id(), { title: read.title, note: '', link: read.link ?? '', days, done: false, made: Date.now() });
  form.elements.title.value = '';
  form.elements.link.value = '';
  render();
  $('task-status').textContent = `Lade till ${read.title} (${PHASES.find(phase => phase.days === days).name.toLowerCase()})${read.link ? ', med länk' : ''}.`;
  form.elements.title.focus();
});

$('hide-tasks').addEventListener('change', event => { store.setHide('tasks', event.target.checked); render(); });
$('restore').addEventListener('click', () => {
  const missing = missingTemplate(store.tasks());
  store.restoreTemplate(missing);
  render();
  $('task-status').textContent = `${missing.length} ${missing.length === 1 ? 'uppgift' : 'uppgifter'} från mallen är tillbaka.`;
  $('gora-title').focus();
});

// ---------- Rutan för att ändra en rad ----------
const sheet = $('sheet');
let sheetBack = null;
function openSheet(title, body, back) {
  sheetBack = back;
  $('sheet-title').textContent = title;
  $('sheet-body').replaceChildren(...body.filter(Boolean));
  if (!sheet.open) sheet.showModal();
  $('sheet-body').querySelector('input')?.focus();
}
const closeSheet = () => { if (sheet.open) sheet.close(); };
sheet.addEventListener('close', () => { const back = sheetBack; sheetBack = null; back?.()?.focus(); });
// Ett tryck utanför rutan (på bakgrunden) stänger den.
for (const dialog of [sheet, $('more')]) dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
$('sheet-close').addEventListener('click', closeSheet);

const field = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);
const linkInput = value => h('input', { type: 'url', inputmode: 'url', autocomplete: 'off', placeholder: 'https://…', value: value || '' });
const eraseButton = onclick => h('button', { type: 'button', class: 'crayon quiet danger', onclick }, 'Sudda ut');

function editTask(task) {
  const title = h('input', { type: 'text', maxlength: 2200, autocomplete: 'off', value: task.title });
  const days = h('select', {}, phaseOptions(task.days));
  const link = linkInput(task.link);
  const text = h('textarea', { rows: 3, maxlength: 500 });
  text.value = task.note;
  const status = h('p', { class: 'status', role: 'status' });
  const form = h('form', { class: 'edit', novalidate: true },
    field('Uppgift', title), field('När', days), field('Länk', link), field('Anteckning', text), status,
    h('div', { class: 'buttons' },
      h('button', { type: 'submit', class: 'crayon' }, 'Spara'),
      eraseButton(() => {
        store.setTask(task.id, null);
        render();
        closeSheet();
        $('task-status').textContent = `Suddade ut ${task.title}.`;
      })));
  form.addEventListener('submit', event => {
    event.preventDefault();
    const read = readEntry(title, link, 120);
    if (read.error) { status.textContent = read.error; read.input.focus(); return; }
    store.setTask(task.id, { ...task, title: read.title, link: read.link ?? '', days: Number(days.value), note: text.value.trim() });
    render();
    closeSheet();
    $('task-status').textContent = 'Sparat.';
  });
  openSheet('Ändra uppgift', [form], () => document.querySelector(`[data-task="${task.id}"] .edit-btn`) ?? $('gora-title'));
}

// ---------- Att köpa ----------
const roomOptions = selected => ROOMS.map(room => h('option', { value: room, selected: room === selected }, room));
$('item-form').elements.room.append(...roomOptions('Kök'));

// Antal och pris ur ett formulär: { qty, price } eller ett felmeddelande och fältet det gäller.
function readAmounts(qtyInput, priceInput) {
  const qty = Number(qtyInput.value.trim() || '1');
  if (!Number.isInteger(qty) || qty < 1 || qty > 999) return { error: 'Antal ska vara ett heltal från 1 till 999.', input: qtyInput };
  const price = amount(priceInput.value);
  if (Number.isNaN(price) || price > 1e6) return { error: 'Skriv priset i kronor, till exempel 49 eller 49,90, eller lämna det tomt.', input: priceInput };
  return { qty, price };
}

function renderItems() {
  const all = store.items();
  const sum = totals(all);
  const bought = all.filter(item => item.done).length;
  meter('kopa-meter', all.length
    ? [h('span', {}, 'Totalt ', h('b', {}, kr(sum.total))), h('span', {}, 'köpt ', h('b', {}, kr(sum.bought))), h('span', {}, 'kvar ', h('b', {}, kr(sum.left)))]
    : [h('span', {}, 'Inget på listan än')],
  all.length ? bought / all.length : 0,
  sum.unpriced === 1 ? '1 sak som inte är köpt saknar pris och räknas inte med.'
    : sum.unpriced ? `${sum.unpriced} saker som inte är köpta saknar pris och räknas inte med.` : null);
  $('hide-items').checked = store.hide('items');
  const shown = store.hide('items') ? all.filter(item => !item.done) : all;
  const groups = rooms(shown);
  $('items').replaceChildren(...groups.map(group => h('section', { class: 'group', 'data-c': crayon(ROOMS.indexOf(group.room)) },
    h('div', { class: 'group-head' }, h('h3', {}, group.room), group.total ? h('span', { class: 'group-date' }, kr(group.total)) : null),
    h('ul', { class: 'rows' }, group.items.map(item => {
      const price = cost(item);
      return line({
        key: 'item', id: item.id, title: item.name, done: item.done, link: item.link, label: 'Köpt',
        note: [item.qty > 1 ? `${item.qty} st` : null,
          price === null ? null : item.qty > 1 ? `à ${each(item.price)} = ${kr(price)}` : each(item.price),
          item.note || null].filter(Boolean).join(' · '),
        onToggle: () => {
          store.setItem(item.id, { ...item, done: !item.done });
          render();
          refocus(`[data-item="${item.id}"] .box`, 'kopa-title');
        },
        onEdit: () => editItem(item)
      });
    })))));
  if (!groups.length && all.length) $('items').append(h('p', { class: 'empty' }, 'Allt är köpt!'));
  $('copy-list').hidden = !all.some(item => !item.done);
  renderIdeas(all);
}

function renderIdeas(all) {
  const have = new Set(all.map(item => item.name.toLowerCase()));
  $('ideas').replaceChildren(...Object.entries(SUGGESTIONS).map(([room, names]) => h('div', { class: 'idea-room' },
    h('h3', {}, room),
    h('div', { class: 'chips', role: 'group', 'aria-label': room }, names.map(name => {
      const added = have.has(name.toLowerCase());
      return h('button', { type: 'button', class: 'chip', 'aria-pressed': String(added), disabled: added, onclick: event => {
        const at = [...document.querySelectorAll('#ideas .chip')].indexOf(event.currentTarget);
        store.setItem(store.id(), { name, room, qty: 1, price: null, note: '', link: '', done: false, made: Date.now() });
        render();
        $('item-status').textContent = `Lade till ${name} under ${room}.`;
        const chips = [...document.querySelectorAll('#ideas .chip')];
        (chips.slice(at).find(chip => !chip.disabled) ?? chips.find(chip => !chip.disabled) ?? $('kopa-title')).focus();
      } }, name);
    })))));
}

$('item-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target;
  const read = readEntry(form.elements.name, form.elements.link, 80);
  if (read.error) { $('item-status').textContent = read.error; read.input.focus(); return; }
  const amounts = readAmounts(form.elements.qty, form.elements.price);
  if (amounts.error) { $('item-status').textContent = amounts.error; amounts.input.focus(); return; }
  const room = form.elements.room.value;
  store.setItem(store.id(), { name: read.title, room, qty: amounts.qty, price: amounts.price, note: '', link: read.link ?? '', done: false, made: Date.now() });
  for (const name of ['name', 'price', 'link']) form.elements[name].value = '';
  form.elements.qty.value = '1';
  render();
  $('item-status').textContent = `Lade till ${read.title} under ${room}${read.link ? ', med länk' : ''}.`;
  form.elements.name.focus();
});

$('hide-items').addEventListener('change', event => { store.setHide('items', event.target.checked); render(); });

function editItem(item) {
  const name = h('input', { type: 'text', maxlength: 2200, autocomplete: 'off', value: item.name });
  const room = h('select', {}, roomOptions(item.room));
  const qty = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', value: item.qty });
  const price = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'kr', value: item.price === null ? '' : String(item.price).replace('.', ',') });
  const link = linkInput(item.link);
  const text = h('textarea', { rows: 3, maxlength: 500, placeholder: 'T.ex. mått, färg eller butik' });
  text.value = item.note;
  const status = h('p', { class: 'status', role: 'status' });
  const form = h('form', { class: 'edit', novalidate: true },
    field('Sak', name), field('Rum', room),
    h('div', { class: 'pair' }, field('Antal', qty), field('Pris/st (kr)', price)),
    field('Länk', link), field('Anteckning', text), status,
    h('div', { class: 'buttons' },
      h('button', { type: 'submit', class: 'crayon' }, 'Spara'),
      eraseButton(() => {
        store.setItem(item.id, null);
        render();
        closeSheet();
        $('item-status').textContent = `Suddade ut ${item.name}.`;
      })));
  form.addEventListener('submit', event => {
    event.preventDefault();
    const read = readEntry(name, link, 80);
    if (read.error) { status.textContent = read.error; read.input.focus(); return; }
    const amounts = readAmounts(qty, price);
    if (amounts.error) { status.textContent = amounts.error; amounts.input.focus(); return; }
    store.setItem(item.id, { ...item, name: read.title, room: room.value, qty: amounts.qty, price: amounts.price, link: read.link ?? '', note: text.value.trim() });
    render();
    closeSheet();
    $('item-status').textContent = 'Sparat.';
  });
  openSheet('Ändra sak', [form], () => document.querySelector(`[data-item="${item.id}"] .edit-btn`) ?? $('kopa-title'));
}

$('copy-list').addEventListener('click', async () => {
  const text = shoppingText(store.items());
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: 'Att köpa till flytten', text });
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
more.addEventListener('close', () => {
  disarm();
  $('open-more').focus();
});

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
  const tasks = Object.values(other.tasks).filter(task => !task.gone), items = Object.values(other.buy).filter(item => !item.gone);
  const done = tasks.filter(task => task.done).length, bought = items.filter(item => item.done).length;
  incoming = other;
  $('sync-summary').textContent = [
    other.date ? `flyttdag ${dayMonth(other.date)}` : null,
    `${tasks.length} ${tasks.length === 1 ? 'uppgift' : 'uppgifter'} (${done} ${done === 1 ? 'klar' : 'klara'})`,
    `${items.length} ${items.length === 1 ? 'sak' : 'saker'} att köpa (${bought} ${bought === 1 ? 'köpt' : 'köpta'})`
  ].filter(Boolean).join(', ').replace(/^./, c => c.toUpperCase()) + '.';
  $('sync-offer').hidden = false;
  $('sync-accept').focus();
}

$('sync-link').addEventListener('click', async () => {
  const status = $('sync-status');
  try {
    const link = `${location.origin}${location.pathname}#synk/${await pack(store.snapshot())}`;
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ title: 'Flytten: synklänk', url: link });
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
  const url = URL.createObjectURL(new Blob([fileText(store.snapshot(), today)], { type: 'application/json' }));
  const link = h('a', { href: url, download: `flytt-${today}.json` });
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
  $('sync-status').textContent = 'Inläst. Listorna är ihopslagna med den andra enhetens.';
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
    $('forget-status').textContent = 'Allt du skrivit, även länkarna, försvinner från den här enheten.';
    return;
  }
  forgetArmed = false;
  store.forget();
  $('forget').textContent = 'Sudda ut allt';
  render();
  $('forget-status').textContent = 'Allt är utsuddat. Att göra-listan är tillbaka som mallen.';
});
$('forget').addEventListener('blur', disarm);

// Över midnatt, eller när en annan flik ändrat något.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  today = todayIso();
  render();
});
window.addEventListener('storage', event => { if (event.key === store.KEY || event.key === null) { store.reload(); render(); } });
window.addEventListener('hashchange', route);

// Sparar sidan på enheten så att den öppnas utan nät (sw.js, bara /flytt/).
navigator.serviceWorker?.register('sw.js').catch(() => {});

route();
