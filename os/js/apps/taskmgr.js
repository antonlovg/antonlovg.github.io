// Task Manager: the open windows (switch to, end task) and how busy, full and big things are.
// "Desktop load" is how late animation frames arrive: a rough measure of how hard the page works.
import { h, icon } from '../dom.js';
import * as wm from '../wm.js';
import * as vfs from '../vfs.js';
import { formatSize } from '../lib/path.js';
import { launch } from '../apps.js';

const started = performance.now();

export default async function open(ctx) {
  const win = ctx.window({ width: 460, height: 440, minWidth: 320, minHeight: 300 });
  const uid = win.id;
  const tabs = [['apps', 'Applications'], ['perf', 'Performance']];
  const tabButtons = tabs.map(([id, label], i) => h('button', { class: 'tab', type: 'button', role: 'tab', id: `tm-tab-${uid}-${id}`, 'aria-controls': `tm-panel-${uid}-${id}`, 'aria-selected': String(i === 0), tabIndex: i === 0 ? 0 : -1, text: label, onclick: () => select(id) }));
  const appList = h('ul', { class: 'tm-list', role: 'listbox', 'aria-label': 'Open windows', tabIndex: 0 });
  const endButton = h('button', { class: 'button', type: 'button', text: 'End Task', onclick: () => selectedWin()?.close({ force: true }) });
  const switchButton = h('button', { class: 'button', type: 'button', text: 'Switch To', onclick: () => selectedWin()?.focus() });
  const newButton = h('button', { class: 'button', type: 'button', text: 'New Task…', onclick: () => launch('cmd') });
  const appsPanel = h('div', { class: 'tab-panel tm-panel', role: 'tabpanel', id: `tm-panel-${uid}-apps`, 'aria-labelledby': `tm-tab-${uid}-apps` }, appList, h('div', { class: 'dialog-buttons tm-buttons' }, endButton, switchButton, newButton));
  const graph = h('canvas', { class: 'tm-graph', width: 400, height: 110, role: 'img', 'aria-label': 'Desktop load over the last minute' });
  const loadText = h('strong', { text: '0%' });
  const facts = h('dl', { class: 'props tm-facts' });
  const perfPanel = h('div', { class: 'tab-panel tm-panel', role: 'tabpanel', id: `tm-panel-${uid}-perf`, 'aria-labelledby': `tm-tab-${uid}-perf`, hidden: true },
    h('fieldset', {}, h('legend', { text: 'Desktop load' }), h('div', { class: 'tm-load' }, loadText, graph)),
    h('fieldset', {}, h('legend', { text: 'Totals' }), facts));
  const status = h('span', {});
  win.body.classList.add('taskmgr');
  win.body.append(h('div', { class: 'tab-list', role: 'tablist', 'aria-label': 'Task Manager' }, tabButtons), appsPanel, perfPanel, h('div', { class: 'statusbar' }, status));

  function select(id) {
    tabButtons.forEach(button => {
      const on = button.id.endsWith(id);
      button.setAttribute('aria-selected', String(on));
      button.tabIndex = on ? 0 : -1;
    });
    appsPanel.hidden = id !== 'apps';
    perfPanel.hidden = id !== 'perf';
  }
  tabButtons.forEach((button, i) => button.addEventListener('keydown', event => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const next = tabButtons[(i + (event.key === 'ArrowRight' ? 1 : -1) + tabButtons.length) % tabButtons.length];
    next.focus();
    next.click();
  }));

  // ---------- Applications ----------
  let selectedId = null;
  const selectedWin = () => wm.all().find(w => w.id === selectedId);
  function renderApps() {
    const wins = wm.all().filter(w => w !== win && !w.owner);
    if (!wins.some(w => w.id === selectedId)) selectedId = wins[0]?.id ?? null;
    appList.replaceChildren(...wins.map(w => {
      const li = h('li', { role: 'option', id: `tm-${uid}-${w.id}`, 'aria-selected': String(w.id === selectedId), class: w.id === selectedId ? 'selected' : '' },
        icon(w.iconName, 16), h('span', { class: 'tm-name', text: w.title }), h('span', { class: 'tm-state', text: w.state === 'min' ? 'Minimized' : 'Running' }));
      li.addEventListener('click', () => { selectedId = w.id; renderApps(); });
      li.addEventListener('dblclick', () => w.focus());
      return li;
    }));
    if (!wins.length) appList.append(h('li', { class: 'tm-empty', text: 'No other programs are running.' }));
    if (selectedId != null) appList.setAttribute('aria-activedescendant', `tm-${uid}-${selectedId}`);
    endButton.disabled = switchButton.disabled = selectedId == null;
    status.textContent = `Windows: ${wm.all().length}`;
  }
  appList.addEventListener('keydown', event => {
    const wins = wm.all().filter(w => w !== win && !w.owner);
    const index = wins.findIndex(w => w.id === selectedId);
    if (event.key === 'ArrowDown') selectedId = wins[Math.min(wins.length - 1, index + 1)]?.id ?? selectedId;
    else if (event.key === 'ArrowUp') selectedId = wins[Math.max(0, index - 1)]?.id ?? selectedId;
    else if (event.key === 'Delete') { selectedWin()?.close({ force: true }); }
    else if (event.key === 'Enter') { selectedWin()?.focus(); }
    else return;
    event.preventDefault();
    renderApps();
  });
  const onWm = () => { if (!win.closed) renderApps(); };
  for (const type of ['open', 'close', 'change']) wm.events.addEventListener(type, onWm);

  // ---------- Performance ----------
  const samples = new Array(120).fill(0);
  let last = performance.now();
  let rafId = 0;
  let frameMax = 0;
  const frame = now => {
    frameMax = Math.max(frameMax, now - last);
    last = now;
    rafId = requestAnimationFrame(frame);
  };
  rafId = requestAnimationFrame(frame);
  const g = graph.getContext('2d');
  async function tick() {
    const load = Math.round(Math.min(100, Math.max(0, (frameMax - 17) / 50 * 100)));
    frameMax = 0;
    samples.push(load);
    samples.shift();
    loadText.textContent = `${load}%`;
    if (perfPanel.hidden) return;
    const w = graph.width;
    const hh = graph.height;
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, hh);
    g.strokeStyle = '#008040';
    for (let x = 0; x < w; x += 20) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, hh); g.stroke(); }
    for (let y = 0; y < hh; y += 20) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke(); }
    g.strokeStyle = '#00ff00';
    g.lineWidth = 2;
    g.beginPath();
    samples.forEach((value, i) => { const x = i * w / (samples.length - 1); const y = hh - 2 - value / 100 * (hh - 4); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
    g.lineWidth = 1;
    const { bytes, files } = await vfs.usage();
    const estimate = await navigator.storage?.estimate?.().catch(() => null);
    const memory = performance.memory;
    const rows = [
      ['Open windows', String(wm.all().length)],
      ['Files on C:', `${files.toLocaleString()} (${formatSize(bytes)})`],
      ['Browser storage used', estimate?.quota ? `${formatSize(estimate.usage)} of ${formatSize(estimate.quota)}` : 'Unknown'],
      ['Page memory', memory ? `${formatSize(memory.usedJSHeapSize)} of ${formatSize(memory.jsHeapSizeLimit)}` : 'Not reported by this browser'],
      ['Up time', new Date(performance.now() - started).toISOString().slice(11, 19)]
    ];
    facts.replaceChildren(...rows.flatMap(([a, b]) => [h('dt', { text: a }), h('dd', { text: b })]));
  }
  const timer = setInterval(tick, 500);
  win.on('close', () => {
    clearInterval(timer);
    cancelAnimationFrame(rafId);
    for (const type of ['open', 'close', 'change']) wm.events.removeEventListener(type, onWm);
  });
  renderApps();
  tick();
}
