// Minesweeper for the Windows 98 easter egg. createGame() is pure and unit-tested;
// mount() renders an accessible board: a grid of buttons with arrow-key navigation,
// Enter/Space to reveal, F (or right-click / long-press) to flag, and a live status line.
(function attachMinesweeper(root, createApi) {
  const api = createApi();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Minesweeper = api;
})(globalThis, () => {
  function createGame({ width = 9, height = 9, mines = 10, random = Math.random } = {}) {
    const size = width * height;
    const cells = Array.from({ length: size }, () => ({ mine: false, revealed: false, flagged: false, count: 0 }));
    const state = { width, height, mines, cells, started: false, over: false, won: false, revealedCount: 0, exploded: -1 };

    const neighbours = index => {
      const x = index % width;
      const y = Math.floor(index / width);
      const result = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height) result.push(ny * width + nx);
        }
      }
      return result;
    };

    // Mines are placed on the first reveal, never on or next to the first cell, so it always opens an area.
    function placeMines(safeIndex) {
      const forbidden = new Set([safeIndex, ...neighbours(safeIndex)]);
      const candidates = [...Array(size).keys()].filter(index => !forbidden.has(index));
      const pool = candidates.length >= mines ? candidates : [...Array(size).keys()].filter(index => index !== safeIndex);
      for (let i = 0; i < Math.min(mines, pool.length); i++) {
        const j = i + Math.floor(random() * (pool.length - i));
        [pool[i], pool[j]] = [pool[j], pool[i]];
        cells[pool[i]].mine = true;
      }
      cells.forEach((cell, index) => { cell.count = neighbours(index).filter(n => cells[n].mine).length; });
      state.started = true;
    }

    function reveal(index) {
      if (state.over || cells[index].flagged || cells[index].revealed) return state;
      if (!state.started) placeMines(index);
      if (cells[index].mine) {
        cells[index].revealed = true;
        state.over = true;
        state.exploded = index;
        cells.forEach(cell => { if (cell.mine) cell.revealed = true; });
        return state;
      }
      const stack = [index];
      while (stack.length) {
        const current = stack.pop();
        const cell = cells[current];
        if (cell.revealed || cell.flagged) continue;
        cell.revealed = true;
        state.revealedCount++;
        if (cell.count === 0) stack.push(...neighbours(current).filter(n => !cells[n].revealed && !cells[n].mine));
      }
      if (state.revealedCount === size - mines) {
        state.over = true;
        state.won = true;
        cells.forEach(cell => { if (cell.mine) cell.flagged = true; });
      }
      return state;
    }

    function toggleFlag(index) {
      if (state.over || cells[index].revealed) return state;
      cells[index].flagged = !cells[index].flagged;
      return state;
    }

    // Revealing a number with the right amount of flags around it opens the rest ("chording").
    function chord(index) {
      const cell = cells[index];
      if (state.over || !cell.revealed || !cell.count) return state;
      const around = neighbours(index);
      if (around.filter(n => cells[n].flagged).length !== cell.count) return state;
      for (const n of around) if (!cells[n].flagged && !cells[n].revealed) reveal(n);
      return state;
    }

    const flags = () => cells.filter(cell => cell.flagged).length;

    return { state, neighbours, reveal, toggleFlag, chord, flags };
  }

  function mount(container, { width = 9, height = 9, mines = 10 } = {}) {
    let game;
    let timer = null;
    let seconds = 0;
    let focusIndex = 0;

    const el = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    const counter = el('span', 'ms-counter', '010');
    counter.setAttribute('aria-hidden', 'true');
    const face = el('button', 'ms-face', '🙂');
    face.type = 'button';
    face.setAttribute('aria-label', 'New game');
    const clock = el('span', 'ms-counter', '000');
    clock.setAttribute('aria-hidden', 'true');
    const header = el('div', 'ms-header');
    header.append(counter, face, clock);
    const grid = el('div', 'ms-grid');
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', `Minesweeper, ${width} by ${height}, ${mines} mines. Arrow keys move, Enter reveals, F flags.`);
    const status = el('p', 'ms-status', 'Click any square to start.');
    status.setAttribute('role', 'status');
    container.replaceChildren(header, grid, status);

    const pad = number => String(Math.max(-99, Math.min(999, number))).padStart(3, '0');

    function cellLabel(cell, index) {
      const position = `Row ${Math.floor(index / width) + 1}, column ${(index % width) + 1}`;
      if (cell.flagged && !cell.revealed) return `${position}, flagged`;
      if (!cell.revealed) return `${position}, hidden`;
      if (cell.mine) return `${position}, mine`;
      return `${position}, ${cell.count ? `${cell.count} ${cell.count === 1 ? 'mine' : 'mines'} nearby` : 'empty'}`;
    }

    function render() {
      const buttons = grid.querySelectorAll('.ms-cell');
      game.state.cells.forEach((cell, index) => {
        const button = buttons[index];
        button.className = `ms-cell${cell.revealed ? ' is-revealed' : ''}${cell.flagged && !cell.revealed ? ' is-flagged' : ''}${index === game.state.exploded ? ' is-exploded' : ''}${cell.revealed && cell.count && !cell.mine ? ` n${cell.count}` : ''}`;
        button.textContent = cell.revealed ? (cell.mine ? '✹' : cell.count || '') : cell.flagged ? '⚑' : '';
        button.setAttribute('aria-label', cellLabel(cell, index));
        button.tabIndex = index === focusIndex ? 0 : -1;
      });
      counter.textContent = pad(mines - game.flags());
      face.textContent = game.state.over ? (game.state.won ? '😎' : '😵') : '🙂';
    }

    function stopTimer() { clearInterval(timer); timer = null; }

    function finish() {
      stopTimer();
      status.textContent = game.state.won ? `You win! Cleared in ${seconds} seconds.` : 'Boom. You hit a mine. Press the face to try again.';
    }

    function act(index, action) {
      if (game.state.over) return;
      if (!game.state.started && action === 'reveal') {
        timer = setInterval(() => { seconds++; clock.textContent = pad(seconds); }, 1000);
        status.textContent = 'Good luck.';
      }
      if (action === 'reveal') {
        if (game.state.cells[index].revealed) game.chord(index);
        else game.reveal(index);
      } else {
        game.toggleFlag(index);
      }
      render();
      if (game.state.over) finish();
    }

    function newGame() {
      stopTimer();
      seconds = 0;
      clock.textContent = '000';
      game = createGame({ width, height, mines });
      grid.replaceChildren();
      for (let y = 0; y < height; y++) {
        const row = el('div', 'ms-row');
        row.setAttribute('role', 'row');
        for (let x = 0; x < width; x++) {
          const index = y * width + x;
          const wrapper = el('span', 'ms-gridcell');
          wrapper.setAttribute('role', 'gridcell');
          const button = el('button', 'ms-cell');
          button.type = 'button';
          button.dataset.index = String(index);
          wrapper.append(button);
          row.append(wrapper);
        }
        grid.append(row);
      }
      status.textContent = 'Click any square to start.';
      render();
    }

    let pressTimer = null;
    let longPressed = false;
    grid.addEventListener('click', event => {
      const button = event.target.closest('.ms-cell');
      if (!button) return;
      if (longPressed) { longPressed = false; return; }
      focusIndex = Number(button.dataset.index);
      act(focusIndex, 'reveal');
    });
    grid.addEventListener('contextmenu', event => {
      const button = event.target.closest('.ms-cell');
      if (!button) return;
      event.preventDefault();
      focusIndex = Number(button.dataset.index);
      act(focusIndex, 'flag');
    });
    // Long-press flags on touch screens.
    grid.addEventListener('pointerdown', event => {
      const button = event.target.closest('.ms-cell');
      if (!button || event.pointerType !== 'touch') return;
      pressTimer = setTimeout(() => { longPressed = true; act(Number(button.dataset.index), 'flag'); }, 450);
    });
    for (const type of ['pointerup', 'pointerleave', 'pointercancel']) grid.addEventListener(type, () => clearTimeout(pressTimer));
    grid.addEventListener('keydown', event => {
      const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: width, ArrowUp: -width };
      if (moves[event.key] !== undefined) {
        event.preventDefault();
        const next = focusIndex + moves[event.key];
        const sameRow = Math.abs(moves[event.key]) !== 1 || Math.floor(next / width) === Math.floor(focusIndex / width);
        if (next >= 0 && next < width * height && sameRow) focusIndex = next;
        render();
        grid.querySelectorAll('.ms-cell')[focusIndex].focus();
      } else if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        act(focusIndex, 'flag');
      }
    });
    // Keep the keyboard position in sync however a cell got focus (Tab, click, screen reader).
    grid.addEventListener('focusin', event => {
      const button = event.target.closest('.ms-cell');
      if (button) focusIndex = Number(button.dataset.index);
    });
    face.addEventListener('click', newGame);
    newGame();
    return { newGame, stop: stopTimer };
  }

  return { createGame, mount };
});
