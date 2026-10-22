// Calculator: a classic pocket calculator. Works with the mouse or the keyboard
// (digits, + - * /, Enter or =, Backspace, Esc to clear, Delete for CE).
import { h } from '../dom.js';
import { menubar } from '../menu.js';
import { launch } from '../apps.js';
import { createCalculator, press } from '../lib/calc.js';

const LAYOUT = [
  ['MC', '7', '8', '9', '/', 'sqrt'],
  ['MR', '4', '5', '6', '*', '%'],
  ['MS', '1', '2', '3', '-', '1/x'],
  ['M+', '0', 'neg', '.', '+', '=']
];
const LABELS = { neg: '+/-', sqrt: '√', '*': '×', '/': '÷', '-': '−', back: 'Backspace' };
const NAMES = { neg: 'Change sign', sqrt: 'Square root', '1/x': 'Reciprocal', '%': 'Percent', '*': 'Multiply', '/': 'Divide', '-': 'Subtract', '+': 'Add', '=': 'Equals', '.': 'Decimal point', MC: 'Memory clear', MR: 'Memory recall', MS: 'Memory store', 'M+': 'Memory add', back: 'Backspace', CE: 'Clear entry', C: 'Clear' };

export default async function open(ctx) {
  const win = ctx.window({ width: 300, height: 'auto', resizable: false });
  const calc = createCalculator();
  const display = h('output', { class: 'calc-display', 'aria-live': 'polite', text: '0' });
  const memory = h('span', { class: 'calc-memory', role: 'status', 'aria-label': 'Memory', text: '' });
  const key = (k, cls = '') => h('button', { type: 'button', class: `button calc-key ${cls}`.trim(), 'aria-label': NAMES[k] || k, dataset: { key: k }, text: LABELS[k] || k, onclick: () => hit(k) });
  win.body.classList.add('calc');
  win.body.append(
    menubar([
      { label: 'Edit', items: [
        { label: 'Copy', shortcut: 'Ctrl+C', action: () => navigator.clipboard?.writeText(calc.display).catch(() => {}) },
        { label: 'Paste', shortcut: 'Ctrl+V', action: pasteNumber }
      ] },
      { label: 'Help', items: [{ label: 'About Calculator', action: () => launch('about') }] }
    ]),
    h('div', { class: 'calc-body', role: 'group', tabIndex: -1, 'aria-label': 'Calculator keys (type numbers and operators)', dataset: { autofocus: '' } },
      display,
      h('div', { class: 'calc-top' }, memory, key('back', 'calc-red wide'), key('CE', 'calc-red'), key('C', 'calc-red')),
      h('div', { class: 'calc-grid' }, LAYOUT.flat().map(k => key(k, /^M/.test(k) ? 'calc-red' : /^[+\-*/=]$/.test(k) ? 'calc-red' : ''))))
  );

  function hit(k) {
    press(calc, k);
    display.textContent = calc.display;
    memory.textContent = calc.memory ? 'M' : '';
    const button = win.body.querySelector(`[data-key="${CSS.escape(k)}"]`);
    if (button) { button.classList.add('pressed'); setTimeout(() => button.classList.remove('pressed'), 90); }
  }

  async function pasteNumber() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (/^-?\d*\.?\d+$/.test(text)) { hit('C'); [...text.replace('-', '')].forEach(hit); if (text.startsWith('-')) hit('neg'); }
    } catch { /* clipboard not allowed */ }
  }

  win.el.addEventListener('keydown', event => {
    if (event.target.closest('.menubar, .menu')) return;
    const ctrl = event.ctrlKey || event.metaKey;
    if (ctrl && event.key.toLowerCase() === 'c') { navigator.clipboard?.writeText(calc.display).catch(() => {}); event.preventDefault(); return; }
    if (ctrl && event.key.toLowerCase() === 'v') { pasteNumber(); event.preventDefault(); return; }
    if (ctrl || event.altKey) return;
    const map = { Enter: '=', '=': '=', Backspace: 'back', Escape: 'C', Delete: 'CE', ',': '.', '@': 'sqrt', F9: 'neg', r: '1/x', R: '1/x' };
    const k = map[event.key] || (/^[\d.+\-*/%]$/.test(event.key) ? event.key : null);
    if (!k) return;
    event.preventDefault();
    hit(k);
  });
}
