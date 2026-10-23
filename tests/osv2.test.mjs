// ReactOS in v86 (/osv2/): the CD parts add up to the release the machine expects, the saved
// machine fits GitHub's file limit, the page only allows what the emulator needs, and the disk,
// shortcut and icon writers that build its C: drive produce what Windows reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { ISO, STATE, STATE_SIZE, DISK_SIZE } from '../osv2/js/machine.js';
import { fat16, readFat16, shellLink, ico } from '../scripts/lib/disk-image.mjs';

const root = new URL('../', import.meta.url);
const read = file => readFile(new URL(file, root), 'utf8');

test('the CD parts are the ReactOS release, in the chunks v86 asks for', async () => {
  const names = await readdir(new URL('osv2/reactos/iso/', root));
  const count = Math.ceil(ISO.size / ISO.chunk);
  assert.equal(names.length, count);
  const hash = createHash('sha256');
  let size = 0;
  for (let i = 0; i < count; i++) {
    const start = i * ISO.chunk;
    const bytes = await readFile(new URL(`osv2/reactos/iso/${start}-${start + ISO.chunk}.img`, root));
    assert.ok(bytes.length === ISO.chunk || i === count - 1, `part ${i} is a whole chunk`);
    hash.update(bytes);
    size += bytes.length;
  }
  assert.equal(size, ISO.size);
  assert.equal(hash.digest('hex'), ISO.sha256);
});

test('the saved machine is there and under GitHub\'s 100 MB file limit', async () => {
  const { size } = await stat(new URL(`osv2/${STATE}`, root));
  assert.ok(size > 1e6 && size < 100 * 1024 * 1024, `${STATE} is ${size} bytes`);
  assert.equal(STATE_SIZE, size, 'STATE_SIZE in machine.js (the page shows it before downloading)');
});

test('the page allows WebAssembly, blob workers and worklets and same-site frames only, and stays unlisted', async () => {
  const html = await read('osv2/index.html');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  const policy = Object.fromEntries(csp.split(';').map(part => part.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));
  assert.deepEqual(policy['script-src'], ["'self'", "'wasm-unsafe-eval'", 'blob:']); // v86's sound worklet
  assert.deepEqual(policy['worker-src'], ["'self'", 'blob:']);
  assert.deepEqual(policy['connect-src'], ["'self'"]);
  assert.deepEqual(policy['frame-src'], ["'self'"]);
  assert.ok(!csp.includes("'unsafe-eval'"));
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(await read('scripts/build-site.mjs'), /Disallow: \/osv2\//);
  for (const file of ['index.html', 'games/index.html', 'assets/site.js']) assert.ok(!(await read(file)).includes('/osv2/'), `${file} links to /osv2/`);
  for (const file of ['LICENSE', 'libv86.mjs', 'v86.wasm', 'seabios.bin', 'vgabios.bin']) await assert.doesNotReject(stat(new URL(`osv2/vendor/v86/${file}`, root)));
});

test('the desktop icon and the page agree on how Jazz Jackrabbit is opened', async () => {
  const page = await read('osv2/js/main.js');
  const maker = await read('scripts/make-reactos.mjs');
  const lovos = await read('os/js/main.js');
  assert.ok(maker.includes('echo PLAY JAZZ>COM1') && page.includes("'PLAY JAZZ'"), 'serial command');
  assert.ok(page.includes('?play=jazz') && lovos.includes("get('play')"), 'LövOS play mode');
  for (const type of ['lovos-play-closed', 'lovos-play-close']) assert.ok(page.includes(type) && lovos.includes(type), type);
  const { games } = JSON.parse(await read('os/games.json'));
  assert.ok(games.some(game => game.id === 'jazz' && game.shareware), 'jazz has a shareware release');
});

test('FAT16 disks hold folders and files byte for byte', () => {
  const big = new Uint8Array(100000).map((_, i) => i * 7);
  const disk = fat16({ JAZZ: { 'JAZZ.EXE': new Uint8Array([0x4d, 0x5a, 1]), 'BIG.DAT': big, 'EMPTY.TXT': new Uint8Array(0) }, 'README.TXT': new TextEncoder().encode('hej') }, { size: DISK_SIZE });
  assert.equal(disk.length, DISK_SIZE);
  assert.equal(disk[510], 0x55);
  assert.equal(disk[511], 0xaa);
  assert.equal(disk[450], 0x06, 'FAT16 partition');
  const files = readFat16(disk);
  assert.deepEqual(Object.keys(files).sort(), ['JAZZ/BIG.DAT', 'JAZZ/EMPTY.TXT', 'JAZZ/JAZZ.EXE', 'README.TXT']);
  assert.deepEqual([...files['JAZZ/JAZZ.EXE']], [0x4d, 0x5a, 1]);
  assert.deepEqual(files['JAZZ/BIG.DAT'], big);
  assert.equal(files['JAZZ/EMPTY.TXT'].length, 0);
  assert.throws(() => fat16({ 'Long name.txt': new Uint8Array(1) }), /8\.3/);
});

test('shortcuts and icons have the headers Windows expects', () => {
  const link = shellLink({ target: 'X:\\reactos\\system32\\cmd.exe', args: '/c echo PLAY JAZZ>COM1', workingDir: 'C:\\JAZZ', icon: 'C:\\ICONS\\JAZZ.ICO', description: 'Jazz', show: 7 });
  const view = new DataView(link.buffer);
  assert.equal(view.getUint32(0, true), 0x4c);
  assert.deepEqual([...link.subarray(4, 8)], [0x01, 0x14, 0x02, 0x00]);
  assert.equal(view.getUint32(20, true), 0x2 | 0x4 | 0x10 | 0x20 | 0x40 | 0x80);
  assert.equal(view.getUint32(60, true), 7);
  assert.ok(Buffer.from(link).includes(Buffer.from('X:\\reactos\\system32\\cmd.exe\0', 'latin1')));
  assert.ok(Buffer.from(link).includes(Buffer.from('/c echo PLAY JAZZ>COM1', 'utf16le')));
  const icon = ico([{ size: 16, rgba: new Uint8Array(16 * 16 * 4).fill(255) }]);
  const iv = new DataView(icon.buffer);
  assert.deepEqual([iv.getUint16(0, true), iv.getUint16(2, true), iv.getUint16(4, true)], [0, 1, 1]);
  assert.equal(iv.getUint32(6 + 12, true), 22);
  assert.equal(iv.getUint32(22, true), 40, 'BITMAPINFOHEADER');
  assert.equal(icon.length, 22 + 40 + 16 * 16 * 4 + 16 * 4);
});
