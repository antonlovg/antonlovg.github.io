// ReactOS in v86. Starts from the saved state that scripts/make-reactos.mjs made (the desktop,
// already booted), or from a session saved in this browser. Jazz Jackrabbit's desktop icon writes
// "PLAY JAZZ" to the serial port; the page then pauses ReactOS and opens the game in LövOS's
// DOS window (/os/?play=jazz), which runs it at full speed.
import { V86 } from '../vendor/v86/libv86.mjs';
import { machine, BASE, STATE, STATE_SIZE, VERSION } from './machine.js';
import * as saved from './saved.js';

const $ = id => document.getElementById(id);
const status = text => { $('status').textContent = text; };
const buttons = ['jazz', 'keys', 'save', 'restart', 'full'].map($);
let emu = null;
let game = null;

const megabytes = bytes => `${Math.round(bytes / 1048576)} MB`;

// ---------- Start screen ----------
async function init() {
  $('size').textContent = megabytes(STATE_SIZE);
  const session = await saved.info().catch(() => null);
  if (session?.version === VERSION) {
    $('resume').hidden = $('forget').hidden = false;
    $('resume').textContent = `Resume saved session (${new Date(session.time).toLocaleString()})`;
  }
  $('go').addEventListener('click', () => start(() => download(new URL(STATE, BASE))));
  $('resume').addEventListener('click', () => start(() => saved.load()));
  $('forget').addEventListener('click', async () => {
    await saved.remove();
    $('resume').hidden = $('forget').hidden = true;
    $('go').focus();
  });
  if (new URLSearchParams(location.search).has('start')) start(() => download(new URL(STATE, BASE)));
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The machine could not be downloaded (${response.status}).`);
  const total = Number(response.headers.get('content-length')) || STATE_SIZE;
  let loaded = 0;
  const counted = response.body.pipeThrough(new TransformStream({ transform(chunk, controller) {
    loaded += chunk.length;
    status(total ? `Downloading ReactOS… ${Math.floor(loaded / total * 100)} %` : `Downloading ReactOS… ${megabytes(loaded)}`);
    controller.enqueue(chunk);
  } }));
  return new Response(counted.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

async function start(getState) {
  $('error').hidden = true;
  for (const id of ['go', 'resume', 'forget']) $(id).disabled = true;
  try {
    if (typeof WebAssembly !== 'object') throw new Error('This browser cannot run WebAssembly, which the emulator needs.');
    status('Downloading ReactOS…');
    const state = await getState();
    status('Starting the machine…');
    $('start').hidden = true;
    $('screen').hidden = false;
    emu = new V86(machine({ screen: $('screen'), state }));
    await new Promise(resolve => emu.add_listener('emulator-loaded', resolve));
    wire();
    status('Running');
    buttons.forEach(button => { button.disabled = false; });
    $('hint').hidden = false;
    fit();
  } catch (error) {
    console.error(error);
    emu?.destroy?.();
    emu = null;
    $('start').hidden = false;
    $('screen').hidden = true;
    $('error').textContent = `ReactOS could not start: ${error.message || error}`;
    $('error').hidden = false;
    status('Not started');
    for (const id of ['go', 'resume', 'forget']) $(id).disabled = false;
  }
}

// ---------- The screen: as big as fits, keeping the picture's shape ----------
function fit() {
  const canvas = $('screen').querySelector('canvas');
  const box = $('stage').getBoundingClientRect();
  const width = canvas.width || 800, height = canvas.height || 600;
  const scale = Math.min(box.width / width, box.height / height);
  const whole = scale >= 1 ? Math.floor(scale) : scale; // whole-number zoom keeps pixels sharp
  canvas.style.width = `${Math.floor(width * whole)}px`;
  canvas.style.height = `${Math.floor(height * whole)}px`;
}
new ResizeObserver(fit).observe($('stage'));

function wire() {
  emu.add_listener('screen-set-size', () => requestAnimationFrame(fit));
  let line = '';
  emu.add_listener('serial0-output-byte', byte => {
    const char = String.fromCharCode(byte);
    if (char !== '\n' && char !== '\r') { line = (line + char).slice(-64); return; }
    if (line.trim() === 'PLAY JAZZ') openGame();
    line = '';
  });
  let reading = 0;
  emu.add_listener('download-progress', event => {
    if (!/\/iso\//.test(event.file_name || '')) return;
    status('Reading the CD…');
    clearTimeout(reading);
    reading = setTimeout(() => status(game ? 'Paused while Jazz Jackrabbit runs' : 'Running'), 800);
  });
  $('screen').addEventListener('click', () => { if (!document.pointerLockElement) emu.lock_mouse(); });
}

// ---------- Jazz Jackrabbit, in LövOS's DOS window ----------
function openGame() {
  if (game || !emu) return;
  emu.stop();
  document.exitPointerLock?.();
  const frame = document.createElement('iframe');
  frame.src = new URL('../os/?play=jazz&shareware', BASE).href;
  frame.title = 'Jazz Jackrabbit';
  $('game').replaceChildren(frame);
  $('game').hidden = false;
  $('jazz').textContent = 'Back to ReactOS';
  game = frame;
  frame.addEventListener('load', () => frame.focus());
  status('Paused while Jazz Jackrabbit runs');
}

function closeGame() {
  if (!game) return;
  game.remove();
  game = null;
  $('game').hidden = true;
  $('jazz').textContent = 'Jazz Jackrabbit';
  emu.run();
  status('Running');
}

// LövOS says when the game's window has closed (it saves the game's files first).
window.addEventListener('message', event => {
  if (event.origin === location.origin && event.source === game?.contentWindow && event.data?.type === 'lovos-play-closed') closeGame();
});
$('jazz').addEventListener('click', () => {
  if (game) game.contentWindow.postMessage({ type: 'lovos-play-close' }, location.origin);
  else openGame();
});

// ---------- Machine buttons ----------
$('keys').addEventListener('click', () => emu?.keyboard_send_scancodes([0x1d, 0x38, 0xe0, 0x53, 0xe0, 0xd3, 0xb8, 0x9d]));

$('save').addEventListener('click', async () => {
  if (!emu || game) return;
  $('save').disabled = true;
  try {
    status('Saving…');
    const state = await emu.save_state();
    const gz = await new Response(new Blob([state]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
    await saved.store(gz, VERSION);
    status(`Saved in this browser · ${new Date().toLocaleTimeString()} (${megabytes(gz.size)})`);
  } catch (error) {
    console.error(error);
    status(`Could not save: ${error.message || error}`);
  } finally {
    $('save').disabled = false;
  }
});

$('restart').addEventListener('click', () => $('restart-dialog').showModal());
$('restart-dialog').addEventListener('close', () => {
  if ($('restart-dialog').returnValue === 'restart') location.replace(`${location.pathname}?start`);
});

$('full').addEventListener('click', async () => {
  if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
  await $('stage').requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
  try { await navigator.keyboard?.lock?.(); } catch { /* not supported */ }
});
document.addEventListener('fullscreenchange', () => setTimeout(fit, 50));

$('about').addEventListener('click', () => $('about-dialog').showModal());

init();
