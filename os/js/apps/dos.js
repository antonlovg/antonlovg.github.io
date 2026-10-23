// MS-DOS Prompt: real DOS (DOSBox, compiled to WebAssembly by js-dos) in a window.
// A folder of the C: drive is mounted as DOS's C: (the whole drive for the plain prompt, the game's
// folder for games). Files DOS changes (save games, configs) are copied back to the drive every
// minute and when the window closes, so GitHub Sync can carry them to other devices.
// Input: keyboard, mouse, gamepads (Gamepad API) and on-screen touch controls.
import { h, icon, isTouch, pickFiles, capture } from '../dom.js';
import * as vfs from '../vfs.js';
import * as settings from '../settings.js';
import { menubar } from '../menu.js';
import { launch } from '../apps.js';
import { output as soundOutput, audioContext } from '../sound.js';
import { normalize, join, parent, basename, extension, display, isInside, RECYCLE, formatSize } from '../lib/path.js';
import { dosboxConf, runLines } from '../lib/dos-config.js';
import { dosKey, keyByName, keysForChar, SHIFT } from '../lib/dos-keys.js';
import { findGame, isInstalled, install, installShareware } from '../games.js';
import { errorBox, messageBox } from '../dialogs.js';
import { filesFromDataTransfer } from '../fileops.js';
import * as sync from '../sync.js';

const MAX_MOUNT = 256 * 1024 * 1024;
const SPEEDS = [
  { id: 'auto', label: 'Automatic', cycles: 'auto' },
  { id: '386', label: '386 (slow, for very old games)', cycles: 'fixed 6000' },
  { id: '486', label: '486', cycles: 'fixed 25000' },
  { id: 'pentium', label: 'Pentium', cycles: 'fixed 60000' },
  { id: 'max', label: 'As fast as possible', cycles: 'max' }
];
const DEFAULT_TOUCH = [{ label: 'Enter', key: 'Enter' }, { label: 'Esc', key: 'Esc' }, { label: 'Space', key: 'Space' }, { label: 'Y', key: 'Y', small: true }, { label: 'N', key: 'N', small: true }];

let emulatorsPromise = null;
function loadEmulators() {
  if (!emulatorsPromise) {
    emulatorsPromise = new Promise((resolve, reject) => {
      if (typeof WebAssembly !== 'object') { reject(new Error('This browser cannot run WebAssembly, which DOSBox needs.')); return; }
      const script = document.createElement('script');
      script.src = 'vendor/js-dos/emulators.js';
      script.onload = () => {
        globalThis.emulators.pathPrefix = new URL('vendor/js-dos/', document.baseURI).href;
        resolve(globalThis.emulators);
      };
      script.onerror = () => { emulatorsPromise = null; reject(new Error('DOSBox could not be loaded. Check your connection and try again.')); };
      document.head.append(script);
    });
  }
  return emulatorsPromise;
}

const sameBytes = (a, b) => {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

export default async function open(ctx) {
  const args = ctx.args || {};
  const game = args.game ? await findGame(args.game) : null;
  if (args.game && !game) { await errorBox(`There is no game called "${args.game}".`, { title: 'DOS Games' }); return; }
  const target = args.path ? await vfs.stat(args.path) : null;
  const title = game ? game.title : target ? `MS-DOS - ${target.name}` : 'MS-DOS Prompt';
  const win = ctx.window({ title, icon: game?.icon || 'dos', width: 680, height: 520, minWidth: 320, minHeight: 260, bodyClass: 'dos' });
  win.noSession = true;

  const canvas = h('canvas', { class: 'dos-canvas', width: 640, height: 400 });
  const overlay = h('div', { class: 'dos-overlay' });
  const screen = h('div', { class: 'dos-screen', tabIndex: 0, role: 'application', 'aria-label': `${title} screen. Click or focus to send keys to DOS.`, 'aria-roledescription': 'DOS screen' }, canvas, overlay);
  const touchLayer = h('div', { class: 'dos-touch', hidden: true });
  const stage = h('div', { class: 'dos-stage' }, screen, touchLayer);
  const statusText = h('span', { text: 'Starting…' });
  const soundStatus = h('button', { class: 'dos-sound-status', type: 'button', text: 'Sound: off', onclick: () => enableSound() });
  const statusbar = h('div', { class: 'statusbar' }, statusText, h('span', { class: 'fixed' }, soundStatus));
  const keyboardInput = h('input', { class: 'dos-keyboard-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, 'aria-label': 'Type to DOS', value: ' ' });
  let ci = null;
  let mountFolder = null;
  let firstSetup = false;
  let originals = new Map();
  let bundlePath = null;
  let closing = false;
  let paused = false;
  let smooth = settings.get('dosSmooth') || false;
  let speed = SPEEDS.find(s => s.id === settings.get(`dosSpeed:${game?.id || 'prompt'}`)) || null;
  const pressed = new Set();
  const timers = [];
  let audioNode = null;
  let rafId = 0;

  win.body.append(menubar([
    { label: 'Machine', items: () => [
      { label: paused ? 'Resume' : 'Pause', shortcut: 'Pause', disabled: !ci, action: togglePause },
      { label: 'Save files to C: now', disabled: !ci || !mountFolder, action: () => saveBack(true, true) },
      { label: 'Restart', disabled: !ci, action: restart },
      '-',
      { label: 'Speed', items: SPEEDS.map(s => ({ label: s.label, checked: (speed?.id || null) === s.id, radio: true, action: () => setSpeed(s) })) },
      { label: 'Send keys', disabled: !ci, items: [
        { label: 'Esc', action: () => tap([256]) },
        { label: 'Enter', action: () => tap([257]) },
        { label: 'F1', action: () => tap([290]) },
        { label: 'F10', action: () => tap([299]) },
        { label: 'Ctrl+C', action: () => tap([341, 67]) },
        { label: 'Alt+Enter', action: () => tap([342, 257]) }
      ] },
      '-',
      { label: 'Close', action: () => win.close() }
    ] },
    { label: 'View', items: () => [
      { label: 'Full screen', shortcut: 'Alt+Enter', action: fullscreen },
      { label: 'Smooth scaling', checked: smooth, action: () => { smooth = !smooth; settings.set({ dosSmooth: smooth }); canvas.classList.toggle('smooth', smooth); } },
      '-',
      { label: 'Touch controls', checked: !touchLayer.hidden, action: () => { touchLayer.hidden = !touchLayer.hidden; stage.classList.toggle('touch-on', !touchLayer.hidden); settings.set({ touchControls: touchLayer.hidden ? 'off' : 'on' }); fit(); } },
      { label: 'On-screen keyboard', action: showKeyboard }
    ] },
    { label: 'Help', items: [
      { label: game ? `${game.title} controls` : 'Using DOS', action: showHelp },
      { label: 'Help topics', action: () => launch('help', { topic: 'dos' }) }
    ] }
  ]), stage, keyboardInput, statusbar);
  canvas.classList.toggle('smooth', smooth);

  // ---------- Layout: keep a 4:3 picture, as big as the window allows ----------
  function fit() {
    const box = screen.getBoundingClientRect();
    if (!box.width || !box.height) return;
    let w = box.width;
    let hh = w * 3 / 4;
    if (hh > box.height) { hh = box.height; w = hh * 4 / 3; }
    canvas.style.width = `${Math.floor(w)}px`;
    canvas.style.height = `${Math.floor(hh)}px`;
  }
  const observer = new ResizeObserver(fit);
  observer.observe(screen);

  function setOverlay(content, { error = false } = {}) {
    overlay.replaceChildren(...(content ? [h('div', { class: `dos-message${error ? ' error' : ''}` }, ...[].concat(content))] : []));
    overlay.hidden = !content;
  }

  // ---------- Installing a game ----------
  async function showInstall() {
    statusText.textContent = `${game.title} is not installed yet.`;
    const chooseZip = h('button', { class: 'button', type: 'button', text: 'Choose a zip…' });
    const chooseFolder = h('button', { class: 'button', type: 'button', text: 'Choose a folder…' });
    const syncButton = h('button', { class: 'button', type: 'button', text: 'Get it from GitHub Sync' });
    const config = await sync.getConfig();
    syncButton.hidden = !(config.owner && config.repo && config.token);
    const problem = h('p', { class: 'dos-install-error', role: 'alert' });
    const run = async source => {
      if (!source || (Array.isArray(source) && !source.length)) return;
      problem.textContent = '';
      setButtons(true);
      statusText.textContent = `Installing ${game.title}…`;
      try {
        await install(game, source);
        if (!(await isInstalled(game))) throw new Error(`${game.program} is missing after installing.`);
        statusText.textContent = 'Installed.';
        start();
      } catch (error) {
        problem.textContent = error.message;
        statusText.textContent = 'Not installed.';
        setButtons(false);
      }
    };
    const shareware = game.shareware ? h('button', { class: 'button default', type: 'button', text: 'Play the shareware episode' }) : null;
    const playShareware = async () => {
      problem.textContent = '';
      setButtons(true);
      try {
        await installShareware(game, step => { statusText.textContent = step; });
        if (!(await isInstalled(game))) throw new Error(`${game.program} is missing after installing.`);
        statusText.textContent = 'Installed.';
        start();
      } catch (error) {
        problem.textContent = error.message;
        statusText.textContent = 'Not installed.';
        setButtons(false);
      }
    };
    shareware?.addEventListener('click', playShareware);
    const setButtons = disabled => [chooseZip, chooseFolder, syncButton, shareware].forEach(b => { if (b) b.disabled = disabled; });
    chooseZip.addEventListener('click', async () => run((await pickFiles({ accept: '.zip,application/zip', multiple: false }))[0]));
    chooseFolder.addEventListener('click', async () => run(await pickFiles({ folder: true })));
    syncButton.addEventListener('click', async () => {
      setButtons(true);
      statusText.textContent = 'Syncing with GitHub…';
      await sync.syncNow({ interactive: true });
      if (await isInstalled(game)) start();
      else { problem.textContent = `${game.title} is not in your GitHub folder yet. Install it on another device with sync turned on first.`; setButtons(false); statusText.textContent = 'Not installed.'; }
    });
    const panel = h('div', { class: 'dos-install' },
      icon(game.icon || 'dos', 32),
      h('h3', { text: `Install ${game.title}` }),
      ...(shareware ? [
        h('p', { text: game.shareware.notice }),
        h('div', { class: 'dialog-buttons' }, shareware),
        h('p', { class: 'dos-install-note', text: `${game.shareware.title}, ${formatSize(game.shareware.size)}.` }),
        h('h4', { text: 'Have the full game?' })
      ] : []),
      h('p', { text: game.install || `Choose a zip or folder containing ${game.program}.` }),
      h('p', { class: 'dos-install-note', text: `The files are copied to ${display(game.folder)} in this browser only.${shareware ? '' : " LövOS doesn't come with games: use your own copy."}` }),
      h('div', { class: 'dialog-buttons' }, chooseZip, chooseFolder, syncButton),
      h('p', { class: 'dos-install-note', text: 'You can also drop the zip or folder here.' }),
      problem);
    setOverlay(panel);
    // Asked to play the shareware (LövOS's play mode, from /osv2/): no need to ask again.
    if (shareware && args.shareware) playShareware();
    screen.ondragover = event => { event.preventDefault(); screen.classList.add('drop-hover'); };
    screen.ondragleave = () => screen.classList.remove('drop-hover');
    screen.ondrop = async event => {
      event.preventDefault();
      screen.classList.remove('drop-hover');
      const files = await filesFromDataTransfer(event.dataTransfer);
      run(files.length === 1 && /\.zip$/i.test(files[0].name) ? files[0] : files);
    };
  }

  // ---------- Starting DOSBox ----------
  async function collectFiles(folder) {
    const entries = (await vfs.walk(folder)).filter(entry => entry.type === 'file' && !isInside(entry.path, RECYCLE));
    const total = entries.reduce((sum, entry) => sum + entry.size, 0);
    if (total > MAX_MOUNT) return null;
    const prefix = folder.length + 1;
    const files = [];
    for (const entry of entries) {
      const bytes = new Uint8Array(await (entry.data || new Blob([])).arrayBuffer());
      files.push({ path: entry.path.slice(prefix), contents: bytes });
    }
    return files;
  }

  async function start() {
    screen.ondragover = screen.ondragleave = screen.ondrop = null;
    setOverlay(h('p', { text: 'Starting DOSBox…' }));
    statusText.textContent = 'Starting DOSBox…';
    try {
      const emulators = await loadEmulators();
      const init = [];
      let program = null;
      let gameConf = {};
      if (game) {
        mountFolder = game.folder;
        program = game.program;
        gameConf = game.dosbox || {};
      } else if (target?.type === 'file' && extension(target.name) === 'jsdos') {
        bundlePath = target.path;
      } else if (target?.type === 'file' && ['exe', 'com', 'bat'].includes(extension(target.name))) {
        mountFolder = parent(target.path);
        program = target.name;
      } else if (args.mount && (await vfs.stat(args.mount))?.type === 'dir') {
        mountFolder = normalize(args.mount);
      } else {
        mountFolder = 'C:';
      }
      const cycles = speed?.cycles || gameConf.cycles || 'auto';
      if (bundlePath) {
        init.push(await vfs.readBytes(bundlePath));
        const saves = await vfs.stat(savesPath());
        if (saves) init.push(await vfs.readBytes(saves.path));
        statusText.textContent = `Running ${basename(bundlePath)}`;
      } else {
        let files = await collectFiles(mountFolder);
        if (!files && mountFolder === 'C:') {
          mountFolder = 'C:/DOS';
          files = await collectFiles(mountFolder);
          statusText.textContent = 'The drive is too big to mount whole, so C:\\DOS is mounted.';
        }
        if (!files) throw new Error(`${display(mountFolder)} is larger than ${formatSize(MAX_MOUNT)}, which is too big to mount in DOS.`);
        originals = new Map(files.map(file => [file.path.toLowerCase(), file.contents]));
        const welcome = mountFolder === 'C:' ? ['echo LovOS DOS - your C: drive is mounted here.', 'echo Try: CD DOS and then HELLO. Type EXIT to close.', 'echo.'] : [`echo LovOS DOS - C: is ${display(mountFolder).replace(/[^ -~]/g, '?')}`, 'echo.'];
        // A game whose SETUP hasn't been run yet (no sound card chosen): run it first, then the game.
        firstSetup = Boolean(game?.setup && !(await vfs.stat(join(game.folder, game.setup.creates))));
        const autoexec = ['cls', ...(firstSetup ? runLines(game.setup.program) : []), ...(program ? runLines(program) : welcome)];
        init.push({ dosboxConf: dosboxConf({ ...gameConf, cycles, autoexec }), jsdosConf: { version: '8' } }, ...files);
      }
      ci = await emulators.dosboxWorker(init.length ? init : [{ dosboxConf: dosboxConf({ cycles }), jsdosConf: { version: '8' } }]);
      if (win.closed) { ci.exit().catch(() => {}); return; }
      wire(program);
      setOverlay(null);
      statusText.textContent = program ? `Running ${program}` : mountFolder ? `C: is ${display(mountFolder)}` : statusText.textContent;
      if (game) win.setTitle(`${game.title} - MS-DOS`);
      screen.focus({ preventScroll: true });
      enableSound();
      setupTouch();
      if (firstSetup) runSetup();
      if (mountFolder) timers.push(setInterval(() => saveBack(false), 60000));
      if (game && program) watchProgram(program);
    } catch (error) {
      console.error(error);
      statusText.textContent = 'DOSBox could not start.';
      setOverlay([h('p', { text: 'DOSBox could not start.' }), h('p', { class: 'small', text: error.message || String(error) })], { error: true });
    }
  }

  const savesPath = () => join(parent(bundlePath), `.${basename(bundlePath)}.saves.zip`);

  function wire() {
    const g = canvas.getContext('2d', { alpha: false });
    let image = null;
    ci.events().onFrameSize((w, hh) => { canvas.width = w; canvas.height = hh; image = null; fit(); });
    ci.events().onFrame((rgb, rgba) => {
      const w = ci.width();
      const hh = ci.height();
      if (!w || !hh) return;
      if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; image = null; fit(); }
      if (!image) image = g.createImageData(w, hh);
      const data = image.data;
      if (rgba) data.set(rgba.subarray(0, data.length));
      else if (rgb) {
        for (let i = 0, j = 0; j < data.length; i += 3, j += 4) { data[j] = rgb[i]; data[j + 1] = rgb[i + 1]; data[j + 2] = rgb[i + 2]; data[j + 3] = 255; }
      }
      g.putImageData(image, 0, 0);
    });
    // Only while the audio is running: sound queued up before the first click would play late.
    ci.events().onSoundPush(samples => { if (audioNode?.context.state === 'running') audioNode.port.postMessage(samples); });
    ci.events().onExit(() => { if (!closing) { statusText.textContent = 'DOS has exited.'; win.close({ force: true }); } });
    fit();
  }

  // When you quit the game and DOS is back at its own prompt (DOSBox reports "DOSBOX" then),
  // save its files and close the window. Helper programs a game starts don't count as quitting,
  // and the prompt has to show twice in a row, so the moment between SETUP and the game doesn't.
  function watchProgram(program) {
    let started = false;
    let idle = 0;
    timers.push(setInterval(async () => {
      if (!ci || closing || paused) return;
      const running = String(await ci.getRunningProgram().catch(() => '')).toUpperCase();
      if (!running) return;
      if (running !== 'DOSBOX') { started = true; idle = 0; return; }
      if (started && ++idle >= 2) { started = false; statusText.textContent = `${program} has finished.`; win.close(); }
    }, 1500));
  }

  // The game's own SETUP, answered with the keys in games.json (setup.keys). If it doesn't get
  // through (another version of SETUP), it stays on screen with the hint so you can finish it.
  async function runSetup() {
    const { program: setupProgram, keys = [], hint } = game.setup;
    statusText.textContent = hint || `Choose your settings in ${setupProgram}.`;
    if (!keys.length) return;
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const name = setupProgram.toUpperCase().replace(/\.[^.]*$/, '');
    for (let i = 0; i < 40; i++) {
      if (!ci || closing) return;
      if (String(await ci.getRunningProgram().catch(() => '')).toUpperCase().startsWith(name)) break;
      await wait(250);
    }
    await wait(1500);
    for (const key of keys) {
      if (!ci || closing) return;
      const code = keyByName(key);
      if (code != null) tap([code]);
      await wait(700);
    }
    const gameName = game.program.toUpperCase().replace(/\.[^.]*$/, '');
    for (let i = 0; i < 40; i++) {
      if (!ci || closing) return;
      if (String(await ci.getRunningProgram().catch(() => '')).toUpperCase().startsWith(gameName)) { statusText.textContent = `Running ${game.program}`; return; }
      await wait(500);
    }
  }

  // ---------- Saving files back to the drive ----------
  let saving = null;
  function saveBack(full, manual = false) {
    if (!saving) saving = doSave(full, manual).finally(() => { saving = null; });
    return saving;
  }

  async function doSave(full, manual) {
    if (!ci || !mountFolder) return 0;
    const tree = await ci.fsTree();
    const found = [];
    const walkTree = (node, prefix) => {
      for (const child of node.nodes || []) {
        const path = prefix ? `${prefix}/${child.name}` : child.name;
        if (!prefix && child.name === '.jsdos') continue;
        if (child.nodes) walkTree(child, path);
        else found.push({ path, size: child.size });
      }
    };
    walkTree(tree, '');
    const changed = [];
    const seen = new Set();
    for (const file of found) {
      const lower = file.path.toLowerCase();
      seen.add(lower);
      const before = originals.get(lower);
      // Quick saves skip big files whose size hasn't changed; the save on close checks everything.
      if (!full && before && before.length === file.size && file.size > 256 * 1024) continue;
      if (before && before.length === file.size && file.size === 0) continue;
      const bytes = await ci.fsReadFile(file.path);
      if (!sameBytes(before, bytes)) {
        changed.push({ path: join(mountFolder, file.path), data: bytes });
        originals.set(lower, bytes);
      }
    }
    const removed = full ? [...originals.keys()].filter(path => !seen.has(path)) : [];
    if (changed.length) await vfs.writeMany(changed);
    for (const path of removed) {
      await vfs.remove(join(mountFolder, path)).catch(() => {});
      originals.delete(path);
    }
    const count = changed.length + removed.length;
    if (count || manual) statusText.textContent = `${count} file(s) saved to ${display(mountFolder)} · ${new Date().toLocaleTimeString()}`;
    return count;
  }

  async function shutdown() {
    if (closing) return true;
    closing = true;
    statusText.textContent = 'Saving…';
    let changes = 0;
    try {
      if (ci && mountFolder) changes = await saveBack(true);
      if (ci && bundlePath) {
        const persisted = await ci.persist(true);
        if (persisted?.length) { await vfs.write(savesPath(), persisted); changes++; }
      }
    } catch (error) {
      console.error(error);
      const answer = await messageBox('Some files could not be saved back to the C: drive.', { title, kind: 'warning', buttons: ['Close anyway', 'Cancel'], detail: error.message });
      if (answer !== 'Close anyway') { closing = false; return false; }
    }
    try { await ci?.exit(); } catch { /* already stopped */ }
    cleanup();
    if (changes && sync.status().state !== 'off') sync.syncNow();
    return true;
  }

  function cleanup() {
    timers.forEach(clearInterval);
    cancelAnimationFrame(rafId);
    observer.disconnect();
    audioNode?.disconnect();
    audioNode = null;
    if (document.fullscreenElement && win.body.contains(document.fullscreenElement)) document.exitFullscreen().catch(() => {});
  }
  win.on('close', shutdown);

  // ---------- Sound ----------
  async function enableSound() {
    if (audioNode || !ci) return;
    try {
      const ctx2 = audioContext();
      if (!ctx2?.audioWorklet) { soundStatus.textContent = 'Sound: not supported'; return; }
      await ctx2.audioWorklet.addModule('js/dos-audio.js');
      audioNode = new AudioWorkletNode(ctx2, 'lovos-dos-audio', { outputChannelCount: [2] });
      audioNode.port.postMessage({ type: 'init', rate: ci.soundFrequency() || 44100 });
      audioNode.connect(soundOutput());
      const update = () => { soundStatus.textContent = ctx2.state === 'running' ? 'Sound: on' : 'Sound: click to enable'; };
      update();
      ctx2.addEventListener('statechange', update);
      if (ctx2.state !== 'running') ctx2.resume().then(update).catch(update);
    } catch (error) {
      console.error(error);
      soundStatus.textContent = 'Sound: unavailable';
    }
  }
  const wake = () => { const c = audioContext(); if (c?.state === 'suspended') c.resume().catch(() => {}); };
  win.el.addEventListener('pointerdown', wake);
  win.el.addEventListener('keydown', wake);

  // ---------- Keyboard and mouse ----------
  const send = (code, down) => {
    if (!ci || paused) return;
    if (down) pressed.add(code); else pressed.delete(code);
    ci.sendKeyEvent(code, down);
  };
  const releaseAll = () => { for (const code of [...pressed]) send(code, false); };
  function tap(codes) {
    codes.forEach(code => send(code, true));
    setTimeout(() => [...codes].reverse().forEach(code => send(code, false)), 80);
    screen.focus({ preventScroll: true });
  }

  screen.addEventListener('keydown', event => {
    if (event.altKey && event.key === 'Enter') { event.preventDefault(); fullscreen(); return; }
    if (event.key === 'Pause') { event.preventDefault(); togglePause(); return; }
    const code = dosKey(event.code);
    if (code == null) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) send(code, true);
  });
  screen.addEventListener('keyup', event => {
    const code = dosKey(event.code);
    if (code == null) return;
    event.preventDefault();
    event.stopPropagation();
    send(code, false);
  });
  screen.addEventListener('blur', releaseAll);
  win.on('deactivate', releaseAll);

  const mousePoint = event => {
    const r = canvas.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (event.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (event.clientY - r.top) / r.height))];
  };
  canvas.addEventListener('pointermove', event => { if (ci && !paused && event.pointerType === 'mouse') ci.sendMouseMotion(...mousePoint(event)); });
  canvas.addEventListener('pointerdown', event => {
    screen.focus({ preventScroll: true });
    if (!ci || paused || event.pointerType !== 'mouse') return;
    ci.sendMouseMotion(...mousePoint(event));
    ci.sendMouseButton(event.button === 2 ? 1 : event.button === 1 ? 2 : 0, true);
  });
  canvas.addEventListener('pointerup', event => { if (ci && !paused && event.pointerType === 'mouse') ci.sendMouseButton(event.button === 2 ? 1 : event.button === 1 ? 2 : 0, false); });
  canvas.addEventListener('contextmenu', event => event.preventDefault());

  // ---------- Pause, speed, full screen ----------
  function togglePause() {
    if (!ci) return;
    paused = !paused;
    if (paused) { releaseAll(); ci.pause(); audioNode?.port.postMessage({ type: 'clear' }); statusText.textContent = 'Paused — choose Machine › Resume to continue.'; }
    else { ci.resume(); statusText.textContent = 'Running'; screen.focus({ preventScroll: true }); }
  }
  win.on('minimize', () => { if (ci && !paused) { ci.pause(); audioNode?.port.postMessage({ type: 'clear' }); } });
  win.on('restore', () => { if (ci && !paused) ci.resume(); });

  async function restart() {
    if (!ci) return;
    const answer = await messageBox('Restart DOS? Files are saved to the C: drive first.', { title, kind: 'question', buttons: ['Restart', 'Cancel'], owner: win });
    if (answer !== 'Restart') return;
    await saveBack(true);
    timers.forEach(clearInterval);
    timers.length = 0;
    const old = ci;
    ci = null;
    audioNode?.disconnect();
    audioNode = null;
    await old.exit().catch(() => {});
    start();
  }

  async function setSpeed(next) {
    speed = next;
    settings.set({ [`dosSpeed:${game?.id || 'prompt'}`]: next.id });
    if (ci) restart();
  }

  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else stage.requestFullscreen?.({ navigationUI: 'hide' }).then(() => screen.focus({ preventScroll: true })).catch(() => {});
  }
  stage.addEventListener('fullscreenchange', () => setTimeout(fit, 50));

  // ---------- Gamepads ----------
  const padState = new Map();
  const mapping = { a: 'Enter', b: 'Esc', x: 'Space', y: 'Ctrl', lb: 'Shift', rb: 'Alt', start: 'Enter', back: 'Esc', ...(game?.controls?.gamepad || {}) };
  const BUTTONS = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, back: 8, start: 9 };
  function pollPads() {
    rafId = requestAnimationFrame(pollPads);
    if (!ci || paused || win.state === 'min' || !navigator.getGamepads) return;
    const pad = [...navigator.getGamepads()].find(Boolean);
    if (!pad) return;
    const wanted = new Map();
    const ax = pad.axes[0] || 0;
    const ay = pad.axes[1] || 0;
    const btn = i => Boolean(pad.buttons[i]?.pressed);
    wanted.set(265, btn(12) || ay < -0.5);
    wanted.set(264, btn(13) || ay > 0.5);
    wanted.set(263, btn(14) || ax < -0.5);
    wanted.set(262, btn(15) || ax > 0.5);
    for (const [name, index] of Object.entries(BUTTONS)) {
      const code = keyByName(mapping[name]);
      if (code != null) wanted.set(code, (wanted.get(code) || false) || btn(index));
    }
    for (const [code, down] of wanted) {
      if (Boolean(padState.get(code)) !== down) { padState.set(code, down); send(code, down); }
    }
  }
  rafId = requestAnimationFrame(pollPads);

  // ---------- Touch controls ----------
  function setupTouch() {
    const mode = settings.get('touchControls');
    touchLayer.hidden = !(mode === 'on' || (mode === 'auto' && isTouch()));
    stage.classList.toggle('touch-on', !touchLayer.hidden);
    const pad = h('div', { class: 'dos-dpad', 'aria-hidden': 'true' }, h('span', { class: 'dpad-up' }), h('span', { class: 'dpad-down' }), h('span', { class: 'dpad-left' }), h('span', { class: 'dpad-right' }));
    let active = new Set();
    const setDirections = next => {
      for (const code of active) if (!next.has(code)) send(code, false);
      for (const code of next) if (!active.has(code)) send(code, true);
      active = next;
      pad.dataset.dir = [...next].join(' ');
    };
    const onPad = event => {
      event.preventDefault();
      const r = pad.getBoundingClientRect();
      const dx = event.clientX - (r.left + r.width / 2);
      const dy = event.clientY - (r.top + r.height / 2);
      const next = new Set();
      if (Math.hypot(dx, dy) > r.width * 0.12) {
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        if (angle > -157.5 && angle < -22.5) next.add(265);
        if (angle > 22.5 && angle < 157.5) next.add(264);
        if (angle > 112.5 || angle < -112.5) next.add(263);
        if (angle > -67.5 && angle < 67.5) next.add(262);
      }
      setDirections(next);
    };
    pad.addEventListener('pointerdown', event => { capture(pad, event.pointerId); onPad(event); });
    pad.addEventListener('pointermove', event => { if (pad.hasPointerCapture(event.pointerId)) onPad(event); });
    const padUp = () => setDirections(new Set());
    pad.addEventListener('pointerup', padUp);
    pad.addEventListener('pointercancel', padUp);
    const buttons = h('div', { class: 'dos-buttons' }, (game?.controls?.touch || DEFAULT_TOUCH).map(item => {
      const code = keyByName(item.key);
      const b = h('button', { type: 'button', class: `dos-action${item.small ? ' small' : ''}`, text: item.label, 'aria-label': `${item.label} (${item.key})` });
      const down = event => { event.preventDefault(); capture(b, event.pointerId); b.classList.add('down'); if (code != null) send(code, true); };
      const up = () => { b.classList.remove('down'); if (code != null) send(code, false); };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('contextmenu', event => event.preventDefault());
      return b;
    }), h('button', { type: 'button', class: 'dos-action small keyboard', 'aria-label': 'On-screen keyboard', onclick: showKeyboard }, icon('keyboard', 16)));
    touchLayer.replaceChildren(pad, buttons);
    fit();
  }

  // ---------- Phone keyboard (typed text becomes key presses) ----------
  function showKeyboard() {
    keyboardInput.value = ' ';
    keyboardInput.focus();
  }
  keyboardInput.addEventListener('beforeinput', event => {
    event.preventDefault();
    if (event.inputType === 'deleteContentBackward') tap([259]);
    else if (event.inputType === 'insertLineBreak' || event.inputType === 'insertParagraph') tap([257]);
    else if (event.data) {
      let delay = 0;
      for (const char of event.data) {
        const k = keysForChar(char);
        if (!k) continue;
        setTimeout(() => tap(k.shift ? [SHIFT, k.key] : [k.key]), delay);
        delay += 90;
      }
    }
    setTimeout(() => keyboardInput.focus({ preventScroll: true }), 0);
  });
  keyboardInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); tap([257]); }
    else if (event.key === 'Escape') { event.preventDefault(); tap([256]); }
  });

  function showHelp() {
    const text = game?.controls?.keys || 'Click the DOS screen first, then type. DIR lists files, CD changes folder, and typing a program\'s name runs it. Your C: drive (or the folder you opened) is mounted as C:. Files changed in DOS are copied back every minute and when you close this window.';
    messageBox(text, { title: game ? `${game.title} controls` : 'MS-DOS Prompt', owner: win, detail: 'Alt+Enter: full screen · Pause: pause · Gamepads work too: the D-pad and left stick are the arrow keys.' });
  }

  win.onArgs = () => win.focus();
  if (game && !(await isInstalled(game))) showInstall();
  else start();
}

