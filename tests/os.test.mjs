// LövOS (/os/): the pure libraries (paths, zip, DOS keys and config, sync planning, calculator,
// command line) and checks that keep the app consistent: icons exist, every file is cached for
// offline use, apps.json and games.json point at real things, and DOSBox runs without eval().
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { normalize, display, parent, basename, join, extension, stem, isInside, validName, uniqueName, formatSize, key } from '../os/js/lib/path.js';
import { readZip, writeZip, crc32, commonFolder } from '../os/js/lib/zip.js';
import { dosKey, keyByName, keysForChar } from '../os/js/lib/dos-keys.js';
import { dosboxConf, runLines } from '../os/js/lib/dos-config.js';
import { planSync, planIsEmpty, conflictName, gitBlobSha, toRepoPath, fromRepoPath, cleanRepoFolder } from '../os/js/lib/sync-plan.js';
import { createCalculator, press } from '../os/js/lib/calc.js';
import { tokenize, parseCommand, wildcard } from '../os/js/lib/shell.js';
import { ICONS } from '../os/js/dom.js';

const root = new URL('../', import.meta.url);
const read = file => readFile(new URL(file, root), 'utf8');

// ---------- Paths ----------

test('paths are normalised, compared without case and shown DOS-style', () => {
  assert.equal(normalize('c:\\Games\\..\\Documents\\.\\note.txt'), 'C:/Documents/note.txt');
  assert.equal(normalize('notes.txt', 'C:/Documents'), 'C:/Documents/notes.txt');
  assert.equal(normalize('..', 'C:/Documents'), 'C:');
  assert.equal(normalize('../../..', 'C:/a'), 'C:');
  assert.equal(display('C:/Games/JAZZ'), 'C:\\Games\\JAZZ');
  assert.equal(display('C:'), 'C:\\');
  assert.equal(parent('C:/Games/JAZZ'), 'C:/Games');
  assert.equal(parent('C:'), null);
  assert.equal(basename('C:/Games/JAZZ.EXE'), 'JAZZ.EXE');
  assert.equal(join('C:/Games', 'JAZZ'), 'C:/Games/JAZZ');
  assert.equal(key('C:/Games/Jazz'), 'c:/games/jazz');
  assert.equal(extension('Archive.ZIP'), 'zip');
  assert.equal(extension('.games.json'), 'json');
  assert.equal(extension('README'), '');
  assert.equal(stem('notes.final.txt'), 'notes.final');
  assert.ok(isInside('C:/Games/JAZZ/SAVE.DAT', 'c:/games'));
  assert.ok(!isInside('C:/GamesOld', 'C:/Games'));
});

test('file names are checked like DOS and Windows do, and clashes get a number', () => {
  for (const name of ['Notes.txt', 'JAZZ.EXE', 'My Folder', '$Recycle.Bin']) assert.ok(validName(name), name);
  for (const name of ['', ' ', 'a/b', 'a\\b', 'what?', 'x:y', 'dot.', '..', ' padded']) assert.ok(!validName(name), name);
  assert.equal(uniqueName('New Folder', ['new folder']), 'New Folder (2)');
  assert.equal(uniqueName('Notes.txt', ['Notes.txt', 'notes (2).txt']), 'Notes (3).txt');
  assert.equal(uniqueName('Fresh.txt', ['Notes.txt']), 'Fresh.txt');
  assert.equal(formatSize(512), '512 bytes');
  assert.equal(formatSize(1536), '1.5 KB');
  assert.equal(formatSize(10 * 1024 * 1024), '10 MB');
});

// ---------- Zip ----------

test('zips written here can be read back, and the CRC matches the standard', async () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')).toString(16), 'cbf43926');
  const files = [
    { path: 'jazz/JAZZ.EXE', bytes: new Uint8Array([0x4d, 0x5a, 1, 2, 3]) },
    { path: 'jazz/Läs mig.txt', bytes: new TextEncoder().encode('hej') }
  ];
  const entries = readZip(writeZip(files));
  assert.deepEqual(entries.map(entry => entry.path), ['jazz/JAZZ.EXE', 'jazz/Läs mig.txt']);
  assert.deepEqual([...await entries[0].bytes()], [0x4d, 0x5a, 1, 2, 3]);
  assert.equal(new TextDecoder().decode(await entries[1].bytes()), 'hej');
  assert.equal(commonFolder(entries.map(entry => entry.path)), 'jazz');
  assert.equal(commonFolder(['JAZZ.EXE', 'jazz/x']), '');
});

test('deflated zip entries are inflated', async () => {
  // Build a zip with one deflated entry: store the deflated bytes, then mark the entry as method 8.
  const data = new Uint8Array(await new Response(new Blob([new TextEncoder().encode('aaaaaaaaaa')]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  const stored = writeZip([{ path: 'a.txt', bytes: data }]);
  // Turn the stored entry into a deflated one: method 8, real CRC and size of the plain text.
  const view = new DataView(stored.buffer);
  const plainCrc = crc32(new TextEncoder().encode('aaaaaaaaaa'));
  const central = stored.length - 22 - (46 + 5);
  for (const at of [8, central + 10]) view.setUint16(at, 8, true);
  view.setUint32(14, plainCrc, true);
  view.setUint32(22, 10, true);
  view.setUint32(central + 16, plainCrc, true);
  view.setUint32(central + 24, 10, true);
  const [entry] = readZip(stored);
  assert.equal(new TextDecoder().decode(await entry.bytes()), 'aaaaaaaaaa');
  assert.throws(() => readZip(new Uint8Array(30)), /not a zip/);
});

test('self-extracting archives (a program in front of the zip) are read', async () => {
  const zip = writeZip([{ path: 'JAZZ.EXE', bytes: new TextEncoder().encode('MZ game') }]);
  const sfx = new Uint8Array(1000 + zip.length);
  sfx.set(new TextEncoder().encode('MZ PKSFX stub'), 0);
  sfx.set(zip, 1000);
  const [entry] = readZip(sfx);
  assert.equal(entry.path, 'JAZZ.EXE');
  assert.equal(new TextDecoder().decode(await entry.bytes()), 'MZ game');
});

test('zip entries that try to escape the folder are dropped', () => {
  const entries = readZip(writeZip([{ path: '../evil.bat', bytes: new Uint8Array(1) }, { path: 'ok.txt', bytes: new Uint8Array(1) }]));
  assert.deepEqual(entries.map(entry => entry.path), ['ok.txt']);
});

// ---------- DOS ----------

test('browser keys map to the key numbers DOSBox expects', () => {
  assert.equal(dosKey('KeyA'), 65);
  assert.equal(dosKey('Digit0'), 48);
  assert.equal(dosKey('Enter'), 257);
  assert.equal(dosKey('Escape'), 256);
  assert.equal(dosKey('ArrowUp'), 265);
  assert.equal(dosKey('AltLeft'), 342);
  assert.equal(dosKey('ControlLeft'), 341);
  assert.equal(dosKey('Space'), 32);
  assert.equal(dosKey('F1'), 290);
  assert.equal(dosKey('F12'), 301);
  assert.equal(dosKey('Numpad5'), 325);
  assert.equal(dosKey('MediaPlayPause'), null);
  assert.equal(keyByName('Alt'), 342);
  assert.equal(keyByName('ctrl'), 341);
  assert.equal(keyByName('Space'), 32);
  assert.equal(keyByName('Esc'), 256);
  assert.equal(keyByName('y'), 89);
  assert.equal(keyByName('F10'), 299);
  assert.deepEqual(keysForChar('a'), { key: 65, shift: false });
  assert.deepEqual(keysForChar('A'), { key: 65, shift: true });
  assert.deepEqual(keysForChar('>'), { key: 46, shift: true });
  assert.deepEqual(keysForChar(':'), { key: 59, shift: true });
  assert.equal(keysForChar('é'), null);
});

test('dosbox.conf mounts the folder and runs the program, with safe settings only', () => {
  const conf = dosboxConf({ cycles: 'max', memsize: 99, sbtype: 'nonsense', autoexec: ['cls', ...runLines('JAZZ.EXE')] });
  assert.match(conf, /cycles=max/);
  assert.match(conf, /memsize=64/);
  assert.match(conf, /sbtype=sb16/);
  assert.match(conf, /\[autoexec\]\n@echo off\nmount c \.\nc:\ncls\nJAZZ\.EXE\n/);
  assert.match(dosboxConf({ cycles: 'fixed 25000' }), /cycles=fixed 25000/);
  assert.match(dosboxConf({ cycles: 'rm -rf' }), /cycles=auto/);
  assert.deepEqual(runLines('GO.BAT', { exitAfter: true }), ['call GO.BAT', 'exit']);
  assert.throws(() => runLines('JAZZ.EXE & del *.*'), /Can't start/);
  assert.ok(!dosboxConf({ autoexec: ['echo ok', 'echo \u00e5'] }).includes('\u00e5'), 'non-ASCII autoexec lines are dropped');
});

// ---------- GitHub sync ----------

const map = entries => new Map(entries.map(([p, sha]) => [p.toLowerCase(), { path: p, sha }]));

test('sync copies one-sided changes and deletions, and keeps both versions of a conflict', () => {
  const base = map([['C:/a.txt', '1'], ['C:/b.txt', '1'], ['C:/c.txt', '1'], ['C:/d.txt', '1'], ['C:/e.txt', '1']]);
  const local = map([['C:/a.txt', '2'], ['C:/b.txt', '1'], ['C:/d.txt', '1'], ['C:/e.txt', '3'], ['C:/new-here.txt', '9']]);
  const remote = map([['C:/a.txt', '1'], ['C:/b.txt', '2'], ['C:/c.txt', '1'], ['C:/e.txt', '4'], ['C:/new-there.txt', '8']]);
  const plan = planSync(local, remote, base);
  assert.deepEqual(plan.upload.map(item => item.path), ['C:/a.txt', 'C:/new-here.txt']);
  assert.deepEqual(plan.download.map(item => item.path), ['C:/b.txt', 'C:/new-there.txt']);
  assert.deepEqual(plan.deleteRemote.map(item => item.path), ['C:/c.txt']);
  assert.deepEqual(plan.deleteLocal.map(item => item.path), ['C:/d.txt']);
  assert.deepEqual(plan.conflicts.map(item => item.local.path), ['C:/e.txt']);
  assert.ok(!planIsEmpty(plan));
  assert.ok(planIsEmpty(planSync(map([['C:/x', '1']]), map([['C:/x', '1']]), new Map())));
});

test('a first sync never deletes anything', () => {
  const plan = planSync(map([['C:/mine.txt', '1'], ['C:/both.txt', '1']]), map([['C:/theirs.txt', '2'], ['C:/both.txt', '3']]), new Map());
  assert.equal(plan.deleteLocal.length + plan.deleteRemote.length, 0);
  assert.deepEqual(plan.upload.map(item => item.path), ['C:/mine.txt']);
  assert.deepEqual(plan.download.map(item => item.path), ['C:/theirs.txt']);
  assert.equal(plan.conflicts.length, 1);
});

test('sync paths and ids match git', async () => {
  assert.equal(await gitBlobSha(new TextEncoder().encode('hello\n')), 'ce013625030ba8dba906f756967f9e9ca394464a');
  assert.equal(await gitBlobSha(new Uint8Array()), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  assert.equal(conflictName('C:/Games/JAZZ/SAVE.DAT'), 'C:/Games/JAZZ/SAVE (GitHub copy).DAT');
  assert.equal(conflictName('C:/Docs/README', 'this device'), 'C:/Docs/README (this device)');
  assert.equal(toRepoPath('lovos', 'C:/Games/JAZZ.EXE'), 'lovos/Games/JAZZ.EXE');
  assert.equal(toRepoPath('', 'C:/a.txt'), 'a.txt');
  assert.equal(fromRepoPath('lovos', 'lovos/Games/JAZZ.EXE'), 'C:/Games/JAZZ.EXE');
  assert.equal(fromRepoPath('lovos', 'other/file.txt'), null);
  assert.equal(fromRepoPath('lovos', 'lovos/../x'), null);
  assert.equal(cleanRepoFolder(' /drive\\saves/../ '), 'drive/saves');
});

// ---------- Calculator and command line ----------

const calc = keys => keys.reduce((c, k) => press(c, k), createCalculator()).display;

test('the calculator chains operations and repeats with =', () => {
  assert.equal(calc(['1', '2', '+', '3', '=']), '15');
  assert.equal(calc(['2', '+', '3', '*', '4', '=']), '20');
  assert.equal(calc(['5', '+', '2', '=', '=']), '9');
  assert.equal(calc(['1', '/', '3', '=']), '0.333333333333');
  assert.equal(calc(['0', '.', '1', '+', '0', '.', '2', '=']), '0.3');
  assert.equal(calc(['9', 'sqrt']), '3');
  assert.equal(calc(['5', '/', '0', '=']), 'Cannot divide by zero');
  assert.equal(calc(['5', '/', '0', '=', 'C', '7']), '7');
  assert.equal(calc(['1', '2', '3', 'back']), '12');
  assert.equal(calc(['4', 'neg']), '-4');
  assert.equal(calc(['4', 'MS', 'C', 'MR']), '4');
});

test('command lines are split like DOS, with quotes and switches', () => {
  assert.deepEqual(tokenize('copy "My Notes.txt" backup'), ['copy', 'My Notes.txt', 'backup']);
  assert.deepEqual(tokenize('  echo   hi  '), ['echo', 'hi']);
  assert.deepEqual(tokenize('type ""'), ['type', '']);
  assert.deepEqual(parseCommand('DIR /S Games'), { name: 'dir', args: ['Games'], switches: ['s'], rest: '/S Games' });
  assert.equal(parseCommand('cd..').args[0], '..');
  assert.equal(parseCommand('cd\\games').args[0], '\\games');
  assert.ok(wildcard('*.txt').test('NOTES.TXT'));
  assert.ok(wildcard('save?.dat').test('SAVE1.DAT'));
  assert.ok(!wildcard('*.txt').test('notes.txt.bak'));
});

// ---------- Consistency checks ----------

async function listFiles(dir) {
  const out = [];
  for (const entry of await readdir(new URL(dir, root), { withFileTypes: true })) {
    const rel = `${dir}${entry.name}`;
    if (entry.isDirectory()) out.push(...await listFiles(`${rel}/`));
    else out.push(rel);
  }
  return out;
}

test('every icon used exists in icons.svg', async () => {
  const sprite = await read('os/icons.svg');
  const symbols = new Set([...sprite.matchAll(/<symbol id="([^"]+)"/g)].map(match => match[1]));
  assert.deepEqual([...symbols].sort(), [...ICONS].sort(), 'dom.js ICONS and icons.svg symbols differ');
  const sources = (await listFiles('os/js/')).filter(file => file.endsWith('.js'));
  for (const file of sources) {
    const text = await read(file);
    for (const match of text.matchAll(/\bicon\('([a-z-]+)'/g)) assert.ok(symbols.has(match[1]), `${file}: unknown icon ${match[1]}`);
  }
  const { apps } = JSON.parse(await read('os/apps.json'));
  const { games } = JSON.parse(await read('os/games.json'));
  for (const item of [...apps, ...games]) assert.ok(symbols.has(item.icon), `${item.id}: unknown icon ${item.icon}`);
});

test('apps.json and games.json describe real apps and safe games', async () => {
  const { apps } = JSON.parse(await read('os/apps.json'));
  const ids = new Set();
  const runNames = new Set();
  for (const app of apps) {
    assert.ok(/^[a-z]+$/.test(app.id) && !ids.has(app.id), `bad or duplicate id ${app.id}`);
    ids.add(app.id);
    await assert.doesNotReject(read(`os/${app.module}`), `${app.id}: missing ${app.module}`);
    for (const name of app.run || []) { assert.ok(!runNames.has(name), `run name ${name} used twice`); runNames.add(name); }
  }
  const { games } = JSON.parse(await read('os/games.json'));
  for (const game of games) {
    assert.match(game.folder, /^C:\/Games\/[A-Z0-9]{1,8}$/, `${game.id}: games live in an 8.3 folder under C:/Games`);
    assert.doesNotThrow(() => runLines(game.program), game.id);
    for (const button of game.controls?.touch || []) assert.notEqual(keyByName(button.key), null, `${game.id}: unknown key ${button.key}`);
    for (const [pad, name] of Object.entries(game.controls?.gamepad || {})) assert.notEqual(keyByName(name), null, `${game.id}: gamepad ${pad}`);
    if (game.setup) {
      assert.doesNotThrow(() => runLines(game.setup.program), `${game.id}: setup program`);
      assert.ok(game.setup.creates, `${game.id}: setup names the file it creates`);
      for (const name of game.setup.keys || []) assert.notEqual(keyByName(name), null, `${game.id}: setup key ${name}`);
    }
  }
});

test('the service worker caches every file LövOS needs offline', async () => {
  const sw = await read('os/sw.js');
  const list = sw.slice(sw.indexOf('PRECACHE'), sw.indexOf('];')).replace(/\/\/.*$/gm, '');
  const listed = new Set([...list.matchAll(/'([^']+)'/g)].map(match => match[1]));
  const files = (await listFiles('os/')).map(file => file.slice(3)).filter(file => !/(^|\/)README\.md$/.test(file) && file !== 'sw.js' && file !== 'index.html' && !file.startsWith('shareware/'));
  for (const file of files) assert.ok(listed.has(file), `os/sw.js does not cache ${file}`);
  for (const file of listed) {
    if (file === './' || file.startsWith('/')) continue;
    assert.ok(files.includes(file), `os/sw.js caches ${file}, which does not exist`);
  }
  for (const file of [...listed].filter(item => item.startsWith('/'))) await assert.doesNotReject(read(file.slice(1)), `${file} is missing`);
});

test('DOSBox is loaded without eval, under a policy that only allows what it needs', async () => {
  const loader = await read('os/vendor/js-dos/emulators.js');
  assert.ok(!loader.includes('eval.call('), 'the CSP patch in emulators.js is missing (see os/vendor/js-dos/README.md)');
  assert.ok(loader.startsWith('/* lovgren.dev patch'), 'the patch comment is missing');
  const html = await read('os/index.html');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  const policy = Object.fromEntries(csp.split(';').map(part => part.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));
  assert.deepEqual(policy['script-src'], ["'self'", "'wasm-unsafe-eval'"]);
  assert.deepEqual(policy['connect-src'], ["'self'", 'https://api.github.com']);
  assert.deepEqual(policy['object-src'], ["'none'"]);
  assert.ok(!csp.includes("'unsafe-eval'"));
  assert.match(html, /<meta name="robots" content="noindex">/);
  const notice = await read('os/vendor/js-dos/NOTICE.txt');
  const version = loader.match(/Build=\{version:"(\d+\.\d+\.\d+)/)?.[1];
  assert.ok(version && notice.includes(version), 'NOTICE.txt names the vendored js-dos version');
});

test('LövOS stays out of the site navigation and search engines', async () => {
  for (const file of ['index.html', 'games/index.html', 'assets/site.js']) {
    assert.ok(!(await read(file)).includes('/os/'), `${file} links to /os/`);
  }
  const build = await read('scripts/build-site.mjs');
  assert.match(build, /Disallow: \/os\//);
});

test('shareware archives are the unaltered originals that games.json describes', async () => {
  const { createHash } = await import('node:crypto');
  const { games } = JSON.parse(await read('os/games.json'));
  for (const game of games.filter(item => item.shareware)) {
    const { file, size, sha256, notice } = game.shareware;
    const bytes = await readFile(new URL(`os/${file}`, root));
    assert.equal(bytes.length, size, `${file} size`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256, `${file} is not the original archive`);
    const names = readZip(bytes).map(entry => entry.path.toUpperCase());
    assert.ok(names.includes(game.program.toUpperCase()), `${file} contains ${game.program}`);
    assert.ok(/shareware/i.test(notice) && /Epic MegaGames/.test(notice), 'the notice names the owner and says it is shareware');
  }
});
