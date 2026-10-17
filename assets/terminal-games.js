// Games for the terminal: Snake and a small text adventure ("The Homelab").
// Pure game logic only (no DOM), unit-tested in tests/terminal-games.test.mjs.
(function attachTerminalGames(root, createApi) {
  const api = createApi();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TerminalGames = api;
})(globalThis, () => {
  // ---------- Snake ----------

  const DIRECTIONS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

  function createSnake({ width = 24, height = 12, random = Math.random } = {}) {
    const middle = Math.floor(height / 2);
    const state = {
      width,
      height,
      snake: [[4, middle], [3, middle], [2, middle]],
      direction: 'right',
      queued: [],
      food: null,
      score: 0,
      over: false,
      won: false
    };

    function placeFood() {
      const free = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) if (!state.snake.some(([sx, sy]) => sx === x && sy === y)) free.push([x, y]);
      }
      if (!free.length) { state.over = true; state.won = true; state.food = null; return; }
      state.food = free[Math.floor(random() * free.length)];
    }

    // Queue turns so two quick key presses between ticks both count; reversing is ignored.
    function turn(direction) {
      if (!DIRECTIONS[direction]) return;
      const last = state.queued.at(-1) || state.direction;
      if (direction === last || direction === OPPOSITE[last] || state.queued.length >= 2) return;
      state.queued.push(direction);
    }

    function step() {
      if (state.over) return state;
      if (state.queued.length) state.direction = state.queued.shift();
      const [dx, dy] = DIRECTIONS[state.direction];
      const [hx, hy] = state.snake[0];
      const head = [hx + dx, hy + dy];
      const eating = state.food && head[0] === state.food[0] && head[1] === state.food[1];
      const body = eating ? state.snake : state.snake.slice(0, -1);
      const hitWall = head[0] < 0 || head[1] < 0 || head[0] >= width || head[1] >= height;
      const hitSelf = body.some(([x, y]) => x === head[0] && y === head[1]);
      if (hitWall || hitSelf) { state.over = true; return state; }
      state.snake = [head, ...body];
      if (eating) { state.score++; placeFood(); }
      return state;
    }

    function render() {
      const rows = [];
      const border = `+${'-'.repeat(width)}+`;
      rows.push(border);
      for (let y = 0; y < height; y++) {
        let row = '|';
        for (let x = 0; x < width; x++) {
          const index = state.snake.findIndex(([sx, sy]) => sx === x && sy === y);
          if (index === 0) row += '@';
          else if (index > 0) row += 'o';
          else if (state.food && state.food[0] === x && state.food[1] === y) row += '*';
          else row += ' ';
        }
        rows.push(`${row}|`);
      }
      rows.push(border);
      return rows.join('\n');
    }

    placeFood();
    return { state, turn, step, render };
  }

  // ---------- Text adventure: The Homelab ----------

  const ROOMS = {
    hallway: {
      name: 'Hallway',
      text: 'A narrow hallway with posters of old Linux distros. The office is north, the kitchen south. A heavy door to the east has a card reader.',
      exits: { north: 'office', south: 'kitchen', east: 'server' }
    },
    office: {
      name: 'Office',
      text: 'Two monitors glow. One shows the pipeline: a red ✗ on the deploy step. A desk drawer is slightly open.',
      exits: { south: 'hallway' },
      items: ['cable', 'duck']
    },
    kitchen: {
      name: 'Kitchen',
      text: 'The coffee machine gurgles. Someone left a keycard next to it.',
      exits: { north: 'hallway' },
      items: ['keycard', 'coffee']
    },
    server: {
      name: 'Server room',
      text: 'Fans roar. The rack’s uplink port blinks amber: its network cable is missing.',
      exits: { west: 'hallway' },
      locked: 'keycard'
    }
  };

  const ITEMS = {
    cable: { name: 'network cable', aliases: ['cable', 'ethernet', 'network cable'], text: 'A blue Cat6 cable.' },
    duck: { name: 'rubber duck', aliases: ['duck', 'rubber duck'], text: 'Every engineer’s best debugging partner.' },
    keycard: { name: 'keycard', aliases: ['keycard', 'card'], text: 'It says “SERVER ROOM”.' },
    coffee: { name: 'coffee', aliases: ['coffee', 'mug', 'cup'], text: 'Freshly brewed. Probably your fourth today.' }
  };

  const ALIASES = { n: 'north', s: 'south', e: 'east', w: 'west', north: 'north', south: 'south', east: 'east', west: 'west' };

  function createAdventure() {
    const state = { room: 'hallway', inventory: [], taken: new Set(), fixed: false, done: false, moves: 0, caffeinated: false };

    function itemsHere() {
      return (ROOMS[state.room].items || []).filter(id => !state.taken.has(id));
    }

    function findItem(words, pool) {
      const phrase = words.join(' ').replace(/^(the|a|an)\s+/, '');
      return pool.find(id => ITEMS[id].aliases.includes(phrase));
    }

    function describe() {
      const room = ROOMS[state.room];
      const lines = [`== ${room.name} ==`, room.text];
      const items = itemsHere();
      if (items.length) lines.push(`You see: ${items.map(id => ITEMS[id].name).join(', ')}.`);
      if (state.room === 'server' && state.fixed) lines.push('The uplink light is a calm, steady green… well, cyan.');
      lines.push(`Exits: ${Object.keys(room.exits).join(', ')}.`);
      return lines;
    }

    function intro() {
      return [
        'THE HOMELAB, a very small text adventure.',
        'The deploy is failing and it’s 23:58. Fix it before midnight.',
        'Commands: look, go <direction> (or n/s/e/w), take <item>, use <item>, inventory, help, quit.',
        '',
        ...describe()
      ];
    }

    function command(input) {
      const words = String(input).trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (!words.length) return { lines: [] };
      if (state.done) return { lines: ['The game is over. Type “quit” to leave.'], done: true };
      state.moves++;
      let [verb, ...rest] = words;
      if (ALIASES[verb] && !rest.length) { rest = [ALIASES[verb]]; verb = 'go'; }
      switch (verb) {
        case 'help':
          return { lines: ['look · go <north|south|east|west> · take <item> · use <item> · inventory · quit'] };
        case 'look':
        case 'l':
          return { lines: describe() };
        case 'inventory':
        case 'i':
          return { lines: [state.inventory.length ? `You carry: ${state.inventory.map(id => ITEMS[id].name).join(', ')}.` : 'Your pockets are empty.'] };
        case 'go':
        case 'walk': {
          const direction = ALIASES[rest[0]];
          const target = direction && ROOMS[state.room].exits[direction];
          if (!target) return { lines: ['You can’t go that way.'] };
          if (ROOMS[target].locked && !state.inventory.includes(ROOMS[target].locked)) return { lines: ['The card reader blinks red. You need a keycard.'] };
          state.room = target;
          return { lines: [ROOMS[target].locked ? 'The card reader beeps and the door clicks open.' : '', ...describe()].filter(Boolean) };
        }
        case 'take':
        case 'get':
        case 'grab': {
          const id = findItem(rest, itemsHere());
          if (!id) return { lines: ['There’s nothing like that here.'] };
          state.taken.add(id);
          state.inventory.push(id);
          return { lines: [`Taken: ${ITEMS[id].name}. ${ITEMS[id].text}`] };
        }
        case 'use':
        case 'plug':
        case 'drink':
        case 'ask':
        case 'talk': {
          const id = findItem(rest.filter(word => !['in', 'to', 'with'].includes(word)), state.inventory) || (verb === 'drink' ? 'coffee' : null);
          if (!id || !state.inventory.includes(id)) return { lines: ['You don’t have that.'] };
          if (id === 'coffee') {
            if (state.caffeinated) return { lines: ['The mug is empty.'] };
            state.caffeinated = true;
            return { lines: ['You drink the coffee. +10 debugging. The hallway looks slightly sharper.'] };
          }
          if (id === 'duck') return { lines: ['You explain the problem to the duck. Halfway through you realise: the server’s network cable is missing.'] };
          if (id === 'keycard') return { lines: [state.room === 'hallway' ? 'Just walk east; the reader will see it.' : 'Nothing here needs a keycard.'] };
          if (id === 'cable') {
            if (state.room !== 'server') return { lines: ['There’s nothing to plug it into here.'] };
            state.fixed = true;
            state.done = true;
            return {
              lines: [
                'You plug the cable into the uplink. The light turns steady.',
                'Somewhere, a pipeline retries… ✓ test ✓ audit ✓ deploy.',
                `You fixed production at 23:59 in ${state.moves} moves${state.caffeinated ? ', fully caffeinated' : ''}. Well done!`
              ],
              done: true,
              won: true
            };
          }
          return { lines: ['Nothing happens.'] };
        }
        default:
          return { lines: [`I don’t understand “${verb}”. Try “help”.`] };
      }
    }

    return { state, intro, command };
  }

  return { createSnake, createAdventure, ROOMS, ITEMS };
});
