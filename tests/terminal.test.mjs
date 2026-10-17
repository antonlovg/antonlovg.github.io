import test from 'node:test';
import assert from 'node:assert/strict';
import shell from '../assets/shell-core.js';
import games from '../assets/terminal-games.js';

const { parse, dir, file, normalize, lookup, display, list, tree, complete, FILTERS, HOME } = shell;

const fs = dir({
  home: dir({
    anton: dir({
      'about.md': file('# About\nDevOps engineer'),
      projects: dir({ 'games.md': file('Game library'), 'pipeline.md': file('CI/CD') }),
      '.secret': file('shh')
    })
  })
});

test('parses commands, quotes and pipes', () => {
  assert.deepEqual(parse('ls -a ~/projects').pipeline, [{ name: 'ls', args: ['-a', '~/projects'] }]);
  assert.deepEqual(parse('echo "hello world" \'x y\'').pipeline, [{ name: 'echo', args: ['hello world', 'x y'] }]);
  assert.deepEqual(parse('cat about.md | grep -i devops | wc -l').pipeline.map(c => c.name), ['cat', 'grep', 'wc']);
  assert.deepEqual(parse('echo "a | b"').pipeline, [{ name: 'echo', args: ['a | b'] }]);
  assert.deepEqual(parse('  ').pipeline, []);
  assert.equal(parse('echo "open').error, 'unterminated quote');
  assert.equal(parse('ls | | wc').error, 'syntax error near |');
  assert.equal(parse('LS').pipeline[0].name, 'ls');
});

test('resolves paths like a real shell', () => {
  assert.equal(normalize(HOME, '~'), HOME);
  assert.equal(normalize(HOME, 'projects/../about.md'), `${HOME}/about.md`);
  assert.equal(normalize(`${HOME}/projects`, '..'), HOME);
  assert.equal(normalize(HOME, '/'), '/');
  assert.equal(normalize('/', '../../..'), '/');
  assert.equal(display(`${HOME}/projects`), '~/projects');
  assert.equal(display('/home'), '/home');
  assert.equal(lookup(fs, `${HOME}/projects/games.md`).type, 'file');
  assert.equal(lookup(fs, `${HOME}/missing`), null);
  assert.equal(lookup(fs, `${HOME}/about.md/x`), null);
  // Object prototype names must not resolve as files.
  assert.equal(lookup(fs, `${HOME}/constructor`), null);
  assert.equal(lookup(fs, `${HOME}/__proto__`), null);
});

test('lists directories, hides dotfiles unless asked', () => {
  assert.deepEqual(list(fs, HOME), ['about.md', 'projects/']);
  assert.deepEqual(list(fs, HOME, { all: true }), ['.secret', 'about.md', 'projects/']);
  assert.equal(list(fs, `${HOME}/nope`), null);
  assert.deepEqual(tree(fs, HOME), ['├── about.md', '└── projects/', '    ├── games.md', '    └── pipeline.md']);
});

test('tab completion for commands and paths', () => {
  const commands = ['cat', 'cd', 'clear', 'grep', 'ls'];
  assert.equal(complete('gr', { cwd: HOME, fs, commands }).line, 'grep ');
  assert.deepEqual(complete('c', { cwd: HOME, fs, commands }).options, ['cat', 'cd', 'clear']);
  assert.equal(complete('cat ab', { cwd: HOME, fs, commands }).line, 'cat about.md ');
  assert.equal(complete('cd pro', { cwd: HOME, fs, commands }).line, 'cd projects/');
  assert.equal(complete('cat projects/ga', { cwd: HOME, fs, commands }).line, 'cat projects/games.md ');
  assert.deepEqual(complete('cat projects/', { cwd: HOME, fs, commands }).options, ['projects/games.md', 'projects/pipeline.md']);
  assert.equal(complete('ls | gr', { cwd: HOME, fs, commands }).line, 'ls | grep ');
  assert.equal(complete('cat .s', { cwd: HOME, fs, commands }).line, 'cat .secret ');
  assert.equal(complete('cat zzz', { cwd: HOME, fs, commands }).line, 'cat zzz');
});

test('text filters behave like their Unix namesakes', () => {
  const lines = ['banana', 'Apple', 'cherry', 'apple pie', 'cherry'];
  assert.deepEqual(FILTERS.grep(lines, ['apple']).lines, ['apple pie']);
  assert.deepEqual(FILTERS.grep(lines, ['-i', 'apple']).lines, ['Apple', 'apple pie']);
  assert.deepEqual(FILTERS.grep(lines, ['-v', 'cherry']).lines, ['banana', 'Apple', 'apple pie']);
  assert.ok(FILTERS.grep(lines, []).error);
  assert.deepEqual(FILTERS.head(lines, ['-2']).lines, ['banana', 'Apple']);
  assert.deepEqual(FILTERS.tail(lines, ['1']).lines, ['cherry']);
  assert.deepEqual(FILTERS.wc(lines, ['-l']).lines, ['5']);
  assert.deepEqual(FILTERS.sort(['b', 'a']).lines, ['a', 'b']);
  assert.deepEqual(FILTERS.sort(['a', 'b'], ['-r']).lines, ['b', 'a']);
  assert.deepEqual(FILTERS.uniq(['a', 'a', 'b', 'a']).lines, ['a', 'b', 'a']);
});

test('snake moves, eats, grows and dies on walls', () => {
  let n = 0;
  const random = () => 0; // food always at the first free cell
  const game = games.createSnake({ width: 10, height: 5, random });
  const startLength = game.state.snake.length;
  assert.equal(game.state.food.join(), '0,0');
  game.turn('left'); // reversing is ignored
  game.step();
  assert.equal(game.state.direction, 'right');
  game.turn('up'); game.turn('left');
  game.step(); game.step();
  assert.equal(game.state.direction, 'left');
  game.state.food = [2, 1]; // on the snake's path along row 1
  while (!game.state.over && n++ < 50) game.step();
  assert.ok(game.state.over);
  assert.ok(game.state.score >= 1, 'ate the food on the way');
  assert.ok(game.state.snake.length > startLength);
  assert.match(game.render(), /^\+-{10}\+/);
});

test('snake detects running into itself', () => {
  const game = games.createSnake({ width: 10, height: 6, random: () => 0.99 });
  game.state.snake = [[5, 3], [4, 3], [3, 3], [2, 3], [1, 3]];
  for (const direction of ['up', 'left', 'down']) { game.turn(direction); game.step(); }
  assert.ok(game.state.over);
});

test('the text adventure can be won', () => {
  const adventure = games.createAdventure();
  assert.match(adventure.intro().join('\n'), /HOMELAB/);
  assert.match(adventure.command('e').lines.join(' '), /need a keycard/);
  adventure.command('s');
  assert.match(adventure.command('take keycard').lines[0], /Taken: keycard/);
  adventure.command('drink coffee');
  assert.match(adventure.command('take coffee').lines[0], /Taken/);
  assert.match(adventure.command('drink coffee').lines[0], /debugging/);
  adventure.command('north');
  adventure.command('n');
  adventure.command('take cable');
  assert.match(adventure.command('use cable').lines[0], /nothing to plug/);
  adventure.command('s');
  assert.match(adventure.command('e').lines.join(' '), /clicks open/);
  const end = adventure.command('use the network cable');
  assert.ok(end.won && end.done);
  assert.match(end.lines.join(' '), /caffeinated/);
  assert.match(adventure.command('look').lines[0], /game is over/);
});

test('the adventure handles nonsense gracefully', () => {
  const adventure = games.createAdventure();
  assert.match(adventure.command('dance').lines[0], /don’t understand/);
  assert.match(adventure.command('take unicorn').lines[0], /nothing like that/);
  assert.match(adventure.command('use duck').lines[0], /don’t have/);
  assert.deepEqual(adventure.command('   ').lines, []);
});
