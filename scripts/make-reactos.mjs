// Builds the ReactOS machine that /osv2/ starts from: splits the ReactOS CD image into parts,
// makes the C: drive (Jazz Jackrabbit's shareware files, a desktop and a Documents folder), boots
// the CD in headless Chrome, sets the desktop up, and saves the running machine as
// osv2/reactos/state.bin.gz, so visitors land on the desktop instead of waiting for a boot.
//
//   node scripts/make-reactos.mjs ReactOS-0.4.16-i386.iso [screenshot.png]
//
// The ISO is the 0.4.16 release (github.com/reactos/reactos/releases/tag/0.4.16-release); its
// size and SHA-256 are checked against osv2/js/machine.js. Takes about five minutes.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync, constants } from 'node:zlib';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { findChrome, launchChrome, connect, sleep } from './lib/chrome.mjs';
import { fat16, shellLink, ico } from './lib/disk-image.mjs';
import { readZip } from '../os/js/lib/zip.js';
import { ISO, DISK_SIZE, STATE } from '../osv2/js/machine.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [, , isoPath, shotPath] = process.argv;
if (!isoPath) { console.error('Usage: node scripts/make-reactos.mjs <ReactOS-0.4.16-i386.iso> [screenshot.png]'); process.exit(1); }
const log = message => console.log(`[${new Date().toLocaleTimeString()}] ${message}`);

// ---------- The CD, in parts ----------
const iso = await readFile(isoPath);
if (iso.length !== ISO.size || createHash('sha256').update(iso).digest('hex') !== ISO.sha256) throw new Error(`${isoPath} is not the ReactOS image osv2/js/machine.js expects`);
const isoDir = path.join(root, 'osv2/reactos/iso');
await rm(isoDir, { recursive: true, force: true });
await mkdir(isoDir, { recursive: true });
for (let start = 0; start < iso.length; start += ISO.chunk) await writeFile(path.join(isoDir, `${start}-${start + ISO.chunk}.img`), iso.subarray(start, start + ISO.chunk));
log(`CD image: ${(await readdir(isoDir)).length} parts`);

// ---------- Text files on C: (CRLF, plain ASCII) ----------
const dosText = text => new Uint8Array(Buffer.from(text.trim().replace(/\n/g, '\r\n') + '\r\n', 'latin1'));
const ABOUT = `
ABOUT THIS COMPUTER
===================

This is ReactOS 0.4.16, a free and open-source operating system that runs
Windows programs, started from its live CD. The whole PC is emulated in your
browser by v86. Nothing is sent anywhere: there is no network.

  C:\\Desktop     this desktop
  C:\\Documents   My Documents
  C:\\JAZZ        Jazz Jackrabbit, the shareware episode (Epic MegaGames)

Changes are kept until you close or reload the page, unless you choose
Save in the bar above the screen.

JAZZ JACKRABBIT
---------------
The icon on the desktop starts the game. ReactOS can't run this DOS game
yet (its DOS support takes the game's protected-mode program for a 16-bit
Windows one), so the icon asks the page to open it in DOSBox, beside
ReactOS, at full speed.

Jazz Jackrabbit is shareware by Epic MegaGames, Inc., who own it. Shareware
is try-before-you-buy software: Epic let anyone share the first episode for
free, unaltered. C:\\JAZZ.ZIP is that original release; C:\\JAZZ holds its
files, unchanged. Read C:\\JAZZ\\LICENSE.DOC and ORDER.DOC.

ReactOS is free software under the GNU GPL: reactos.org
`;

// ---------- Chrome, with a page that runs the machine ----------
const BUILD_PAGE = `<!doctype html><meta charset="utf-8"><title>make-reactos</title>
<style>body{margin:0;background:#000}#screen div{white-space:pre;font:14px monospace;line-height:14px;color:#fff}</style>
<div id="screen"><div></div><canvas></canvas></div>
<script type="module">
import { V86 } from '/osv2/vendor/v86/libv86.mjs';
import { machine } from '/osv2/js/machine.js';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const SC = { a:0x1e,b:0x30,c:0x2e,d:0x20,e:0x12,f:0x21,g:0x22,h:0x23,i:0x17,j:0x24,k:0x25,l:0x26,m:0x32,n:0x31,o:0x18,p:0x19,q:0x10,r:0x13,s:0x1f,t:0x14,u:0x16,v:0x2f,w:0x11,x:0x2d,y:0x15,z:0x2c,
  '1':2,'2':3,'3':4,'4':5,'5':6,'6':7,'7':8,'8':9,'9':10,'0':11,' ':0x39,'.':0x34,'-':0x0c,'/':0x35,'\\n':0x1c,'=':0x0d,',':0x33,"'":0x28,'\\\\':0x2b };
const SHIFTED = { ':':0x27,'"':0x28,'>':0x34,'<':0x33,'&':8,'%':6,'_':0x0c,'?':0x35,'|':0x2b,'(':10,')':11 };
const down = c => emu.keyboard_send_scancodes(c > 0xff ? [0xe0, c & 0xff] : [c]);
const up = c => emu.keyboard_send_scancodes(c > 0xff ? [0xe0, (c & 0xff) | 0x80] : [c | 0x80]);
window.combo = async (...codes) => { for (const c of codes) { down(c); await wait(60); } await wait(100); for (const c of codes.reverse()) { up(c); await wait(60); } await wait(200); };
window.type = async text => {
  for (const ch of text) {
    const lower = ch.toLowerCase();
    let code = SC[ch], shift = false;
    if (code === undefined && SHIFTED[ch]) { code = SHIFTED[ch]; shift = true; }
    if (code === undefined && SC[lower] !== undefined) { code = SC[lower]; shift = true; }
    if (code === undefined) throw new Error('no key for ' + ch);
    if (shift) down(0x2a);
    down(code); await wait(40); up(code);
    if (shift) up(0x2a);
    await wait(60);
  }
};
window.icon = async sizes => {
  const sprite = await (await fetch('/os/icons.svg')).text();
  const symbol = sprite.match(/<symbol id="jazz" viewBox="([^"]+)">([\\s\\S]*?)<\\/symbol>/);
  const url = URL.createObjectURL(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + symbol[1] + '">' + symbol[2] + '</svg>'], { type: 'image/svg+xml' }));
  const image = new Image(); image.src = url; await image.decode();
  return sizes.map(size => { const c = new OffscreenCanvas(size, size), g = c.getContext('2d'); g.drawImage(image, 0, 0, size, size); return { size, rgba: [...g.getImageData(0, 0, size, size).data] }; });
};
window.serial = '';
window.graphics = false;
window.start = async () => {
  const disk = await (await fetch('/disk.img')).arrayBuffer();
  window.emu = new V86(machine({ screen: document.getElementById('screen'), disk }));
  emu.add_listener('serial0-output-byte', byte => { serial += String.fromCharCode(byte); });
  emu.add_listener('screen-set-size', ([width, , bpp]) => { if (width >= 800 && bpp) graphics = true; });
};
window.save = async () => {
  const state = await emu.save_state();
  const gz = await new Response(new Blob([state]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  await fetch('/upload', { method: 'POST', body: gz });
  return state.byteLength;
};
</script>`;

let disk = null;
let upload = null;
const TYPES = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://x').pathname;
  if (request.method === 'POST' && url === '/upload') {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    upload = Buffer.concat(chunks);
    response.writeHead(204).end();
    return;
  }
  if (url === '/') { response.writeHead(200, { 'Content-Type': 'text/html' }).end(BUILD_PAGE); return; }
  if (url === '/disk.img') { response.writeHead(200).end(disk); return; }
  const file = path.join(root, decodeURIComponent(url));
  if (!file.startsWith(path.join(root, 'osv2')) && !file.startsWith(path.join(root, 'os'))) { response.writeHead(403).end(); return; }
  try { response.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(await readFile(file)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = path.join(os.tmpdir(), `mr${Date.now().toString(36)}`);
const { child, wsUrl } = await launchChrome(findChrome(), profile);
const browser = await connect(wsUrl);
const page = browser.evaluate;
const until = async (expression, what, timeout) => {
  for (const end = Date.now() + timeout; Date.now() < end; await sleep(1000)) if (await page(expression)) return;
  throw new Error(`Timed out waiting for ${what}`);
};

try {
  await browser.send('Page.enable');
  await browser.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
  await until('typeof window.start === "function"', 'the build page', 30000);

  // ---------- The C: drive ----------
  const jazzZip = await readFile(path.join(root, 'os/shareware/jazz.zip'));
  const jazz = {};
  for (const entry of readZip(new Uint8Array(jazzZip))) jazz[entry.path.toUpperCase()] = await entry.bytes();
  const icons = await page('icon([32, 16])');
  disk = fat16({
    DESKTOP: {},
    'ABOUT.TXT': dosText(ABOUT),
    ICONS: { 'JAZZ.ICO': ico(icons.map(({ size, rgba }) => ({ size, rgba: new Uint8Array(rgba) }))) },
    JAZZ: jazz,
    'JAZZ.ZIP': new Uint8Array(jazzZip),
    // Opening it writes a line to the serial port; the page opens the game when it reads it.
    'JAZZ.LNK': shellLink({ target: 'X:\\reactos\\system32\\cmd.exe', args: '/c echo PLAY JAZZ>COM1', workingDir: 'C:\\JAZZ', icon: 'C:\\ICONS\\JAZZ.ICO', description: 'Jazz Jackrabbit (shareware, Epic MegaGames 1994)', show: 7 })
  }, { size: DISK_SIZE, label: 'REACTOS' });
  log(`C: drive: ${Object.keys(jazz).length} Jazz files`);

  // ---------- Boot ----------
  await page('start()');
  // With a hard disk attached, the CD asks for a key before it boots, and a key stops the boot
  // menu's countdown; then Enter picks its default, the live environment.
  for (let i = 0; i < 30; i++) { await page('type(" ")'); await sleep(400); }
  await page('type("\\n")');
  await until('graphics', 'the graphical boot', 240000);
  log('ReactOS is starting');
  await sleep(40000);
  await page('type("\\n")'); // Language: English (United States), keyboard US → Next
  await sleep(8000);
  await page('type("\\n")'); // Run ReactOS Live CD
  await sleep(60000);
  const cmd = async () => { await page('combo(0x15b, 0x13)'); await sleep(4000); await page('type("cmd\\n")'); await sleep(8000); };
  for (let attempt = 1; ; attempt++) {
    await cmd();
    await page('type("echo READY>COM1\\n")');
    try { await until('serial.includes("READY")', 'the command prompt', 20000); break; }
    catch (error) { if (attempt === 6) throw error; log('Desktop not ready yet'); await page('combo(0x01)'); await sleep(20000); }
  }
  log('Desktop is up; setting it up');

  // ---------- Desktop and Documents on C:, the Jazz shortcut ----------
  const folders = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer';
  const lines = [
    'cls',
    'mkdir C:\\Documents',
    'copy C:\\JAZZ.LNK "C:\\Desktop\\Jazz Jackrabbit.lnk" && del C:\\JAZZ.LNK',
    'copy C:\\ABOUT.TXT "C:\\Desktop\\About this computer.txt" && del C:\\ABOUT.TXT',
    ...['User Shell Folders', 'Shell Folders'].flatMap(key => [
      `reg add "${folders}\\${key}" /v Desktop /t ${key === 'Shell Folders' ? 'REG_SZ' : 'REG_EXPAND_SZ'} /d C:\\Desktop /f`,
      `reg add "${folders}\\${key}" /v Personal /t ${key === 'Shell Folders' ? 'REG_SZ' : 'REG_EXPAND_SZ'} /d C:\\Documents /f`
    ]),
    'echo SET>COM1',
    // Explorer reads the folders when it starts. One line, because the new Explorer takes the focus.
    'taskkill /f /im explorer.exe & start explorer & echo DONE>COM1 & exit'
  ];
  for (const line of lines.slice(0, -1)) { await page(`type(${JSON.stringify(line + '\n')})`); await sleep(1500); }
  await until('serial.includes("SET")', 'the settings', 30000);
  await page(`type(${JSON.stringify(lines.at(-1) + '\n')})`);
  await until('serial.includes("DONE")', 'Explorer to restart', 30000);
  await sleep(30000);

  // ---------- Save ----------
  const raw = await page('save()');
  const state = gzipSync(gunzipSync(upload), { level: constants.Z_BEST_COMPRESSION });
  await writeFile(path.join(root, 'osv2', STATE), state);
  const machineFile = path.join(root, 'osv2/js/machine.js');
  await writeFile(machineFile, (await readFile(machineFile, 'utf8')).replace(/STATE_SIZE = \d+/, `STATE_SIZE = ${state.length}`));
  log(`State: ${(raw / 1048576).toFixed(0)} MB, ${(state.length / 1048576).toFixed(1)} MB compressed`);
  if (shotPath) {
    const { data } = await browser.send('Page.captureScreenshot', { format: 'png' }).then(r => r.result);
    await writeFile(shotPath, Buffer.from(data, 'base64'));
  }
} finally {
  browser.close();
  child.kill();
  server.close();
  await sleep(500);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
log(`Done: ${path.relative(root, path.join(root, 'osv2', STATE))} (${((await stat(path.join(root, 'osv2', STATE))).size / 1048576).toFixed(1)} MB)`);
