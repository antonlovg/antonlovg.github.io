// Flyttlistan: att göra (med datum räknat från flyttdagen) och att köpa (per rum, med pris), plus synk och din
// data. Adressen bestämmer vyn: #gora, #kopa och #mer. #synk/… läser in det du sparat på en annan enhet.
import { PHASES, ROOMS, SUGGESTIONS, daysBetween, missingTemplate, phases, rooms, shoppingText, todayIso, totals, cost } from './list.js';
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

// ---------- Tal och datum ----------
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
const countdown = days => days === 0 ? 'idag' : days === 1 ? 'imorgon' : days === -1 ? 'igår'
  : days > 0 ? `om ${days} dagar` : `för ${-days} dagar sedan`;

let today = todayIso();

// ---------- Vyerna ----------
const VIEWS = ['gora', 'kopa', 'mer'];
let view = 'gora';

function route() {
  const [name, arg] = location.hash.slice(1).split('/');
  if (name === 'synk' && arg) {
    // Ta bort datan ur adressen direkt (och ur historiken), och fråga innan något läses in.
    history.replaceState(null, '', '#mer');
    view = 'mer';
    render();
    offerSync(arg);
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
  renderHead();
  ({ gora: renderTasks, kopa: renderItems, mer: renderMore })[view]();
}

function renderHead() {
  const date = store.date();
  $('subtitle').textContent = date ? `Flyttdag ${weekday(date)} ${dayMonth(date)}, ${countdown(daysBetween(today, date))}` : 'Välj flyttdag under Att göra';
  const all = store.tasks(), done = all.filter(task => task.done).length;
  $('count').textContent = all.length ? `${done} av ${all.length} klara` : '';
}

// En bock i en lista: tryck för klar/inte klar.
const check = (label, done, onclick) => h('button', { type: 'button', class: 'check', 'aria-pressed': String(done), 'aria-label': label, onclick },
  h('span', { class: 'check-mark', 'aria-hidden': 'true' }));

// Fokus tillbaka till samma rad (eller listans rubrik) när listan ritats om.
const refocus = (selector, fallback) => (document.querySelector(selector) ?? $(fallback)).focus();

// ---------- Att göra ----------
const phaseOptions = selected => PHASES.map(phase => h('option', { value: phase.days, selected: phase.days === selected }, phase.name));
$('task-form').elements.days.append(...phaseOptions(-28));

function renderTasks() {
  const date = store.date();
  $('move-date').value = date ?? '';
  $('when-text').textContent = date
    ? `${countdown(daysBetween(today, date)).replace(/^./, c => c.toUpperCase())}. Datumen vid varje grupp är när uppgifterna bör vara klara.`
    : 'Välj flyttdagen så får varje uppgift ett datum att vara klar till.';
  $('hide-tasks').checked = store.hide('tasks');
  const all = store.tasks();
  const shown = store.hide('tasks') ? all.filter(task => !task.done) : all;
  const groups = phases(shown, date);
  $('tasks').replaceChildren(...groups.map(group => {
    const late = group.due && group.due < today;
    return h('section', { class: 'group' },
      h('h3', { class: 'group-head' }, group.name,
        group.due ? h('span', { class: 'group-date' }, group.days === 0 ? dayMonth(group.due) : `senast ${dayMonth(group.due)}`) : null),
      h('ul', { class: 'rows' }, group.tasks.map(task => h('li', { class: task.done ? 'row is-done' : 'row', 'data-task': task.id },
        check(`${task.title}. Klar`, task.done, () => {
          store.setTask(task.id, { ...task, done: !task.done });
          render();
          refocus(`[data-task="${task.id}"] .check`, 'gora-title');
        }),
        h('div', { class: 'row-text' },
          h('span', { class: 'row-title' }, task.title, late && !task.done ? h('span', { class: 'tag tag-late' }, 'Sent') : null),
          task.note ? h('span', { class: 'row-note' }, task.note) : null),
        h('button', { type: 'button', class: 'row-edit', 'aria-haspopup': 'dialog', 'aria-label': `Ändra ${task.title}`, onclick: () => editTask(task) }, 'Ändra')))));
  }));
  if (!groups.length) $('tasks').append(h('p', { class: 'empty' }, all.length ? 'Allt är klart. Bra jobbat!' : 'Listan är tom. Lägg till en uppgift ovan.'));
  $('restore').hidden = !missingTemplate(all).length;
}

$('move-date').addEventListener('change', event => {
  store.setDate(event.target.value || null);
  render();
  $('task-status').textContent = event.target.value ? `Flyttdagen är ${dayMonth(event.target.value)}.` : 'Ingen flyttdag vald.';
});

$('task-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target, title = form.elements.title.value.trim();
  if (!title) { $('task-status').textContent = 'Skriv vad som ska göras.'; form.elements.title.focus(); return; }
  const days = Number(form.elements.days.value);
  store.setTask(store.id(), { title, note: '', days, done: false, made: Date.now() });
  form.elements.title.value = '';
  render();
  $('task-status').textContent = `Lade till ${title} (${PHASES.find(phase => phase.days === days).name.toLowerCase()}).`;
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

// ---------- Bladet (ändra en uppgift eller sak) ----------
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
sheet.addEventListener('click', event => { if (event.target === sheet) closeSheet(); });
$('sheet-close').addEventListener('click', closeSheet);

const field = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);

function editTask(task) {
  const title = h('input', { type: 'text', maxlength: 120, autocomplete: 'off', value: task.title });
  const days = h('select', {}, phaseOptions(task.days));
  const text = h('textarea', { rows: 4, maxlength: 500 });
  text.value = task.note;
  const status = h('p', { class: 'fine', role: 'status' });
  const form = h('form', { class: 'edit', novalidate: true },
    field('Uppgift', title), field('När', days), field('Anteckning', text), status,
    h('div', { class: 'buttons' },
      h('button', { type: 'submit', class: 'button' }, 'Spara'),
      h('button', { type: 'button', class: 'button quiet', onclick: () => {
        store.setTask(task.id, null);
        render();
        closeSheet();
        $('task-status').textContent = `Tog bort ${task.title}.`;
      } }, 'Ta bort')));
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!title.value.trim()) { status.textContent = 'Skriv vad som ska göras.'; title.focus(); return; }
    store.setTask(task.id, { ...task, title: title.value.trim(), days: Number(days.value), note: text.value.trim() });
    render();
    closeSheet();
    $('task-status').textContent = 'Sparat.';
  });
  openSheet('Ändra uppgift', [form], () => document.querySelector(`[data-task="${task.id}"] .row-edit`) ?? $('gora-title'));
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
  $('sum').replaceChildren(all.length
    ? h('p', { class: 'sum-line' },
      h('span', {}, 'Totalt ', h('b', {}, kr(sum.total))),
      h('span', {}, 'Köpt ', h('b', {}, kr(sum.bought))),
      h('span', {}, 'Kvar ', h('b', {}, kr(sum.left))))
    : h('p', { class: 'sum-line' }, 'Inget på listan än. Lägg till saker nedan, eller ta något från förslagen.'),
  sum.unpriced ? h('p', { class: 'fine' }, sum.unpriced === 1 ? '1 sak som inte är köpt saknar pris och räknas inte med.'
    : `${sum.unpriced} saker som inte är köpta saknar pris och räknas inte med.`) : '');
  $('hide-items').checked = store.hide('items');
  const shown = store.hide('items') ? all.filter(item => !item.done) : all;
  const groups = rooms(shown);
  $('items').replaceChildren(...groups.map(group => h('section', { class: 'group' },
    h('h3', { class: 'group-head' }, group.room, group.total ? h('span', { class: 'group-date' }, kr(group.total)) : null),
    h('ul', { class: 'rows' }, group.items.map(item => {
      const price = cost(item);
      return h('li', { class: item.done ? 'row is-done' : 'row', 'data-item': item.id },
        check(`${item.name}. Köpt`, item.done, () => {
          store.setItem(item.id, { ...item, done: !item.done });
          render();
          refocus(`[data-item="${item.id}"] .check`, 'kopa-title');
        }),
        h('div', { class: 'row-text' },
          h('span', { class: 'row-title' }, item.name),
          h('span', { class: 'row-note' }, [
            item.qty > 1 ? `${item.qty} st` : null,
            price === null ? null : item.qty > 1 ? `à ${each(item.price)} = ${kr(price)}` : each(item.price),
            item.note || null
          ].filter(Boolean).join(' · '))),
        h('button', { type: 'button', class: 'row-edit', 'aria-haspopup': 'dialog', 'aria-label': `Ändra ${item.name}`, onclick: () => editItem(item) }, 'Ändra'));
    })))));
  if (!groups.length && all.length) $('items').append(h('p', { class: 'empty' }, 'Allt är köpt.'));
  $('copy-list').hidden = !all.some(item => !item.done);
  renderIdeas(all);
}

function renderIdeas(all) {
  const have = new Set(all.map(item => item.name.toLowerCase()));
  $('ideas').replaceChildren(...Object.entries(SUGGESTIONS).map(([room, names]) => h('div', { class: 'idea-room' },
    h('h4', {}, room),
    h('div', { class: 'chips', role: 'group', 'aria-label': room }, names.map(name => {
      const added = have.has(name.toLowerCase());
      return h('button', { type: 'button', class: 'chip', 'aria-pressed': String(added), disabled: added, onclick: event => {
        const at = [...document.querySelectorAll('#ideas .chip')].indexOf(event.currentTarget);
        store.setItem(store.id(), { name, room, qty: 1, price: null, note: '', done: false, made: Date.now() });
        render();
        $('item-status').textContent = `Lade till ${name} under ${room}.`;
        const chips = [...document.querySelectorAll('#ideas .chip')];
        (chips.slice(at).find(chip => !chip.disabled) ?? chips.find(chip => !chip.disabled) ?? $('kopa-title')).focus();
      } }, name);
    })))));
}

$('item-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target, name = form.elements.name.value.trim();
  if (!name) { $('item-status').textContent = 'Skriv vad du behöver.'; form.elements.name.focus(); return; }
  const read = readAmounts(form.elements.qty, form.elements.price);
  if (read.error) { $('item-status').textContent = read.error; read.input.focus(); return; }
  const room = form.elements.room.value;
  store.setItem(store.id(), { name, room, qty: read.qty, price: read.price, note: '', done: false, made: Date.now() });
  form.elements.name.value = '';
  form.elements.qty.value = '1';
  form.elements.price.value = '';
  render();
  $('item-status').textContent = `Lade till ${name} under ${room}.`;
  form.elements.name.focus();
});

$('hide-items').addEventListener('change', event => { store.setHide('items', event.target.checked); render(); });

function editItem(item) {
  const name = h('input', { type: 'text', maxlength: 80, autocomplete: 'off', value: item.name });
  const room = h('select', {}, roomOptions(item.room));
  const qty = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', value: item.qty });
  const price = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'kr', value: item.price === null ? '' : String(item.price).replace('.', ',') });
  const text = h('textarea', { rows: 3, maxlength: 500, placeholder: 'T.ex. butik, mått eller färg' });
  text.value = item.note;
  const status = h('p', { class: 'fine', role: 'status' });
  const form = h('form', { class: 'edit', novalidate: true },
    field('Sak', name), field('Rum', room),
    h('div', { class: 'pair' }, field('Antal', qty), field('Pris/st (kr)', price)),
    field('Anteckning', text), status,
    h('div', { class: 'buttons' },
      h('button', { type: 'submit', class: 'button' }, 'Spara'),
      h('button', { type: 'button', class: 'button quiet', onclick: () => {
        store.setItem(item.id, null);
        render();
        closeSheet();
        $('item-status').textContent = `Tog bort ${item.name}.`;
      } }, 'Ta bort')));
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!name.value.trim()) { status.textContent = 'Skriv vad du behöver.'; name.focus(); return; }
    const read = readAmounts(qty, price);
    if (read.error) { status.textContent = read.error; read.input.focus(); return; }
    store.setItem(item.id, { ...item, name: name.value.trim(), room: room.value, qty: read.qty, price: read.price, note: text.value.trim() });
    render();
    closeSheet();
    $('item-status').textContent = 'Sparat.';
  });
  openSheet('Ändra sak', [form], () => document.querySelector(`[data-item="${item.id}"] .row-edit`) ?? $('kopa-title'));
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

// ---------- Mer ----------
function renderMore() {
  $('offline').textContent = navigator.serviceWorker?.controller ? 'Listan är sparad på den här enheten och öppnas även utan nät.' : 'Öppna sidan en gång till med nät så sparas den på enheten.';
}

let incoming = null; // det som väntar på att läsas in från en annan enhet

async function offerSync(code) {
  try {
    showOffer(await unpack(code));
  } catch {
    $('sync-status').textContent = 'Länken gick inte att läsa. Kopiera en ny synklänk på den andra enheten.';
    $('sync-title').focus();
  }
}

function showOffer(value) {
  const other = store.clean(value);
  const tasks = Object.values(other.tasks).filter(task => !task.gone), items = Object.values(other.buy).filter(item => !item.gone);
  incoming = other;
  $('sync-summary').textContent = [
    other.date ? `flyttdag ${dayMonth(other.date)}` : null,
    `${tasks.length} ${tasks.length === 1 ? 'uppgift' : 'uppgifter'} (${tasks.filter(task => task.done).length} ${tasks.filter(task => task.done).length === 1 ? 'klar' : 'klara'})`,
    `${items.length} ${items.length === 1 ? 'sak' : 'saker'} att köpa (${items.filter(item => item.done).length} ${items.filter(item => item.done).length === 1 ? 'köpt' : 'köpta'})`
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
  $('sync-title').focus();
});
$('sync-cancel').addEventListener('click', () => {
  incoming = null;
  $('sync-offer').hidden = true;
  $('sync-status').textContent = 'Inget lästes in.';
  $('sync-title').focus();
});

// Radera kräver två tryck, så att listan inte försvinner av misstag.
let forgetArmed = false;
$('forget').addEventListener('click', () => {
  if (!forgetArmed) {
    forgetArmed = true;
    $('forget').textContent = 'Tryck igen för att radera allt';
    $('forget-status').textContent = 'Allt du skrivit in försvinner från den här enheten. Tryck igen för att radera.';
    return;
  }
  forgetArmed = false;
  store.forget();
  $('forget').textContent = 'Radera allt jag skrivit in';
  render();
  $('forget-status').textContent = 'Allt du skrivit in är raderat. Att göra-listan är tillbaka som mallen.';
});
$('forget').addEventListener('blur', () => {
  if (!forgetArmed) return;
  forgetArmed = false;
  $('forget').textContent = 'Radera allt jag skrivit in';
  $('forget-status').textContent = '';
});

// Över midnatt, eller när en annan flik ändrat något.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  today = todayIso();
  render();
});
window.addEventListener('storage', event => { if (event.key === store.KEY || event.key === null) { store.reload(); render(); } });
window.addEventListener('hashchange', route);

// Sparar sidan på enheten så att den öppnas utan nät (sw.js, bara /flytt/).
navigator.serviceWorker?.register('sw.js').then(() => navigator.serviceWorker.ready).then(() => { if (view === 'mer') renderMore(); }).catch(() => {});

route();
