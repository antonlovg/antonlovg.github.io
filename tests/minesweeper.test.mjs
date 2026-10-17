import test from 'node:test';
import assert from 'node:assert/strict';
import minesweeper from '../assets/minesweeper.js';

const { createGame } = minesweeper;

function seeded(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

test('the first click is never a mine and always opens an area', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const game = createGame({ random: seeded(seed) });
    const first = Math.floor(seeded(seed + 1000)() * 81);
    game.reveal(first);
    assert.equal(game.state.over, false, `seed ${seed}`);
    assert.equal(game.state.cells[first].count, 0, 'first cell has no mines around it');
    assert.ok(game.state.revealedCount > 1, 'flood fill opened more than one cell');
    assert.equal(game.state.cells.filter(cell => cell.mine).length, 10);
  }
});

test('mine counts match the neighbours', () => {
  const game = createGame({ random: seeded(42) });
  game.reveal(40);
  game.state.cells.forEach((cell, index) => {
    if (!cell.mine) assert.equal(cell.count, game.neighbours(index).filter(n => game.state.cells[n].mine).length);
  });
  assert.equal(game.neighbours(0).length, 3);
  assert.equal(game.neighbours(40).length, 8);
});

test('revealing every safe cell wins; hitting a mine loses', () => {
  const win = createGame({ random: seeded(7) });
  win.reveal(0);
  win.state.cells.forEach((cell, index) => { if (!cell.mine) win.reveal(index); });
  assert.ok(win.state.over && win.state.won);
  assert.equal(win.flags(), 10, 'mines are flagged on a win');

  const lose = createGame({ random: seeded(7) });
  lose.reveal(0);
  const mine = lose.state.cells.findIndex(cell => cell.mine);
  lose.reveal(mine);
  assert.ok(lose.state.over && !lose.state.won);
  assert.equal(lose.state.exploded, mine);
  assert.ok(lose.state.cells.filter(cell => cell.mine).every(cell => cell.revealed));
  lose.reveal(0);
  assert.equal(lose.state.exploded, mine, 'no moves after the game ends');
});

test('flags block reveals, and chording opens the neighbours', () => {
  const game = createGame({ random: seeded(99) });
  game.reveal(40);
  const numbered = game.state.cells.findIndex((cell, index) => cell.revealed && cell.count > 0 && game.neighbours(index).some(n => !game.state.cells[n].revealed));
  assert.ok(numbered >= 0);
  const around = game.neighbours(numbered);
  for (const n of around) if (game.state.cells[n].mine) game.toggleFlag(n);
  const flagged = around.find(n => game.state.cells[n].flagged);
  game.reveal(flagged);
  assert.equal(game.state.cells[flagged].revealed, false, 'flagged cells cannot be revealed');
  game.chord(numbered);
  assert.ok(around.every(n => game.state.cells[n].mine || game.state.cells[n].revealed), 'chord opened every safe neighbour');
  assert.equal(game.state.won || !game.state.over, true);
});
