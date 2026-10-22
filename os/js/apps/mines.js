// Minesweeper. Left click (or tap) opens a square, right click (or long-press, or the flag mode
// button on touch screens) places a flag. Keyboard: arrows move, Space/Enter open, F flags, F2 new game.
// The game rules are the site's own tested module (/assets/minesweeper.js, also used by the 98 easter egg).
import { h, isTouch } from '../dom.js';
import * as settings from '../settings.js';
import { menubar } from '../menu.js';
import { launch } from '../apps.js';

const LEVELS = {
  beginner: { cols: 9, rows: 9, mines: 10 },
  intermediate: { cols: 16, rows: 16, mines: 40 },
  expert: { cols: 30, rows: 16, mines: 99 }
};

let rules = null;
function loadRules() {
  rules ||= new Promise((resolve, reject) => {
    if (globalThis.Minesweeper) { resolve(globalThis.Minesweeper); return; }
    const script = document.createElement('script');
    script.src = '/assets/minesweeper.js';
    script.onload = () => resolve(globalThis.Minesweeper);
    script.onerror = () => { rules = null; reject(new Error('The Minesweeper rules could not be loaded.')); };
    document.head.append(script);
  });
  return rules;
}
import { messageBox, promptBox } from '../dialogs.js';
import { play } from '../sound.js';

const COLORS = ['', '#0000ff', '#008000', '#ff0000', '#000080', '#800000', '#008080', '#000000', '#808080'];

export default async function open(ctx) {
  const { createGame } = await loadRules();
  const win = ctx.window({ width: 300, height: 'auto', resizable: false });
  let level = settings.get('minesLevel') in LEVELS ? settings.get('minesLevel') : 'beginner';
  let game = null;
  let cellEls = [];
  let timer = 0;
  let seconds = 0;
  let cursor = 0;
  let flagMode = false;
  const counter = h('output', { class: 'mines-led', 'aria-label': 'Mines left' });
  const clock = h('output', { class: 'mines-led', 'aria-label': 'Seconds' });
  const face = h('button', { class: 'mines-face', type: 'button', 'aria-label': 'New game', text: '🙂', onclick: () => newGame() });
  const flagButton = h('button', { class: 'tool-button mines-flag', type: 'button', 'aria-pressed': 'false', text: '🚩 Flag', onclick: () => { flagMode = !flagMode; flagButton.setAttribute('aria-pressed', String(flagMode)); } });
  flagButton.hidden = !isTouch();
  const grid = h('div', { class: 'mines-grid', role: 'grid', 'aria-label': 'Minefield', tabIndex: 0 });
  win.body.classList.add('mines');
  win.body.append(menubar([
    { label: 'Game', items: () => [
      { label: 'New', shortcut: 'F2', action: () => newGame() },
      '-',
      ...Object.entries(LEVELS).map(([id, l]) => ({ label: `${id[0].toUpperCase()}${id.slice(1)} (${l.cols}×${l.rows}, ${l.mines} mines)`, checked: level === id, radio: true, action: () => { level = id; settings.set({ minesLevel: id }); newGame(); } })),
      '-',
      { label: 'Best Times…', action: bestTimes },
      '-',
      { label: 'Exit', action: () => win.close() }
    ] },
    { label: 'Help', items: [{ label: 'How to play', action: () => launch('help', { topic: 'mines' }) }, { label: 'About Minesweeper', action: () => launch('about') }] }
  ]), h('div', { class: 'mines-board' }, h('div', { class: 'mines-head' }, counter, face, clock), grid, flagButton));

  const led = n => String(Math.max(-99, Math.min(999, n))).padStart(3, '0');

  function newGame() {
    clearInterval(timer);
    timer = 0;
    seconds = 0;
    const { cols, rows, mines } = LEVELS[level];
    const rulesGame = createGame({ width: cols, height: rows, mines });
    game = { cols, rows, mines, rules: rulesGame, cells: rulesGame.state.cells };
    grid.style.gridTemplateColumns = `repeat(${game.cols}, var(--cell))`;
    cellEls = game.cells.map((_, i) => h('div', { class: 'mines-cell', role: 'gridcell', id: `mc-${win.id}-${i}`, 'aria-label': 'Hidden', dataset: { i } }));
    // Rows only exist for screen readers (display: contents); the CSS grid lays out the cells.
    grid.replaceChildren(...Array.from({ length: rows }, (_, y) => h('div', { class: 'mines-row', role: 'row' }, cellEls.slice(y * cols, (y + 1) * cols))));
    cursor = 0;
    face.textContent = '🙂';
    update();
    requestAnimationFrame(() => {
      // The window hugs the board, so Expert gets a wider window than Beginner.
      win.rect.w = Math.max(240, grid.scrollWidth + 34);
      win.place();
      win.keepInside();
    });
  }

  const status = () => (game.rules.state.won ? 'won' : game.rules.state.over ? 'lost' : 'playing');

  function update() {
    counter.textContent = led(game.mines - game.rules.flags());
    clock.textContent = led(seconds);
    for (let i = 0; i < game.cells.length; i++) {
      const c = game.cells[i];
      const el = cellEls[i];
      el.className = 'mines-cell';
      el.textContent = '';
      el.style.color = '';
      let label = 'Hidden';
      if (c.revealed) {
        el.classList.add('open');
        if (c.mine) { el.textContent = '💣'; el.classList.add(game.rules.state.exploded === i ? 'boom' : 'mine'); label = 'Mine'; }
        else if (c.count) { el.textContent = c.count; el.style.color = COLORS[c.count]; label = `${c.count}`; }
        else label = 'Empty';
      } else if (c.flagged) {
        el.textContent = '🚩';
        label = 'Flagged';
        if (status() === 'lost' && !c.mine) { el.textContent = '❌'; label = 'Wrong flag'; }
      }
      el.setAttribute('aria-label', `${label}, row ${Math.floor(i / game.cols) + 1}, column ${(i % game.cols) + 1}`);
    }
    grid.querySelectorAll('.cursor').forEach(el => el.classList.remove('cursor'));
    cellEls[cursor]?.classList.add('cursor');
    grid.setAttribute('aria-activedescendant', `mc-${win.id}-${cursor}`);
  }

  function startClock() {
    if (timer) return;
    timer = setInterval(() => { seconds++; clock.textContent = led(seconds); if (seconds >= 999) clearInterval(timer); }, 1000);
  }

  async function finish() {
    clearInterval(timer);
    if (status() === 'won') {
      face.textContent = '😎';
      play('ding');
      update();
      const best = settings.get('minesBest') || {};
      if (!best[level] || seconds < best[level].time) {
        const name = await promptBox(`You have the fastest time for ${level} level. Please type your name:`, { title: 'Congratulations', value: best[level]?.name || 'Anonymous', owner: win });
        best[level] = { time: seconds, name: (name || 'Anonymous').slice(0, 30) };
        settings.set({ minesBest: best });
      }
    } else {
      face.textContent = '😵';
      play('error');
      update();
    }
  }

  function act(i, flag) {
    if (status() !== 'playing') return;
    if (flag) { game.rules.toggleFlag(i); update(); return; }
    if (game.cells[i].revealed) game.rules.chord(i);
    else if (!game.cells[i].flagged) game.rules.reveal(i);
    else return;
    startClock();
    update();
    if (status() !== 'playing') finish();
  }

  grid.addEventListener('contextmenu', event => event.preventDefault());
  let pressTimer = 0;
  let longPressed = false;
  grid.addEventListener('pointerdown', event => {
    const cell = event.target.closest('.mines-cell');
    if (!cell) return;
    cursor = Number(cell.dataset.i);
    if (status() === 'playing') face.textContent = '😮';
    longPressed = false;
    if (event.pointerType === 'touch') pressTimer = setTimeout(() => { longPressed = true; act(cursor, true); if (navigator.vibrate) navigator.vibrate(20); }, 450);
  });
  grid.addEventListener('pointerup', event => {
    clearTimeout(pressTimer);
    const cell = event.target.closest('.mines-cell');
    if (status() === 'playing') face.textContent = '🙂';
    if (!cell || longPressed) return;
    const i = Number(cell.dataset.i);
    act(i, event.button === 2 || flagMode);
  });
  grid.addEventListener('pointercancel', () => clearTimeout(pressTimer));

  grid.addEventListener('keydown', event => {
    const { cols, rows } = game;
    const x = cursor % cols;
    const y = Math.floor(cursor / cols);
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (moves[event.key]) {
      const [dx, dy] = moves[event.key];
      cursor = Math.min(rows - 1, Math.max(0, y + dy)) * cols + Math.min(cols - 1, Math.max(0, x + dx));
      update();
    } else if (event.key === ' ' || event.key === 'Enter') act(cursor, false);
    else if (event.key.toLowerCase() === 'f') act(cursor, true);
    else return;
    event.preventDefault();
  });
  win.el.addEventListener('keydown', event => { if (event.key === 'F2') { event.preventDefault(); newGame(); } });

  async function bestTimes() {
    const best = settings.get('minesBest') || {};
    const lines = Object.keys(LEVELS).map(id => `${id[0].toUpperCase()}${id.slice(1)}: ${best[id] ? `${best[id].time} seconds — ${best[id].name}` : '999 seconds — Anonymous'}`);
    const answer = await messageBox(lines.join('\n'), { title: 'Fastest Mine Sweepers', buttons: ['OK', 'Reset Scores'], owner: win });
    if (answer === 'Reset Scores') settings.set({ minesBest: {} });
  }

  win.on('close', () => clearInterval(timer));
  newGame();
  grid.focus();
}
