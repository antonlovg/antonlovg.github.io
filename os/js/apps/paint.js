// Paint: draw with pencil, brush, airbrush and shapes, fill areas, pick colours, and open or save
// PNG/JPEG images on the C: drive. Left click paints with the first colour, right click the second.
import { h, capture } from '../dom.js';
import * as vfs from '../vfs.js';
import * as settings from '../settings.js';
import { menubar } from '../menu.js';
import { launch } from '../apps.js';
import { basename, extension } from '../lib/path.js';
import { fileDialog, messageBox, errorBox, promptBox } from '../dialogs.js';

const PALETTE = ['#000000', '#808080', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080', '#808040', '#004040', '#0080ff', '#004080', '#8000ff', '#804000',
  '#ffffff', '#c0c0c0', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffff80', '#00ff80', '#80ffff', '#8080ff', '#ff0080', '#ff8040'];
const TOOLS = [
  { id: 'pencil', label: 'Pencil' }, { id: 'brush', label: 'Brush' }, { id: 'spray', label: 'Airbrush' }, { id: 'eraser', label: 'Eraser' },
  { id: 'fill', label: 'Fill with colour' }, { id: 'picker', label: 'Pick colour' }, { id: 'line', label: 'Line' }, { id: 'rect', label: 'Rectangle' },
  { id: 'ellipse', label: 'Ellipse' }, { id: 'frect', label: 'Filled rectangle' }, { id: 'fellipse', label: 'Filled ellipse' }
];
const FILTERS = [{ label: 'PNG (*.png)', ext: ['png'] }, { label: 'JPEG (*.jpg)', ext: ['jpg', 'jpeg'] }, { label: 'All Picture Files', ext: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'] }];

// The little drawings on the tool buttons, as SVG paths on a 16×16 grid.
const TOOL_ART = {
  pencil: 'M3 13l1-3 7-7 2 2-7 7z M4 10l2 2',
  brush: 'M10 2l4 4-5 5-2-2z M7 9c-3 0-4 2-4 5 2 0 5-1 5-3',
  spray: 'M5 6h5v8H5z M6 3h3v3H6z M12 3h1v1h-1z M13 6h1v1h-1z M12 9h1v1h-1z',
  eraser: 'M2 11l6-6 6 6-3 3H5z M5 8l6 6',
  fill: 'M3 8l5-5 5 5-5 5z M13 10c1 2 1 3 0 3s-1-1 0-3z',
  picker: 'M10 2l4 4-2 2-4-4z M8 6l-5 5v2h2l5-5',
  line: 'M2 14L14 2',
  rect: 'M2.5 3.5h11v9h-11z',
  ellipse: 'M8 3c3.6 0 6 2.2 6 5s-2.4 5-6 5-6-2.2-6-5 2.4-5 6-5z',
  frect: 'M2 3h12v10H2z',
  fellipse: 'M8 3c3.6 0 6 2.2 6 5s-2.4 5-6 5-6-2.2-6-5 2.4-5 6-5z'
};

function toolIcon(id) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', TOOL_ART[id]);
  const filled = ['frect', 'fellipse', 'fill'].includes(id);
  path.setAttribute('fill', filled ? 'currentColor' : 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.2');
  svg.append(path);
  return svg;
}

export default async function open(ctx) {
  const win = ctx.window({ width: 720, height: 520, minWidth: 340, minHeight: 280 });
  let path = null;
  let dirty = false;
  let tool = 'pencil';
  let size = 3;
  let colors = ['#000000', '#ffffff'];
  const undo = [];
  const redo = [];
  const canvas = h('canvas', { class: 'paint-canvas', width: 640, height: 400, 'aria-label': 'Drawing canvas', tabIndex: 0 });
  const overlay = h('canvas', { class: 'paint-overlay', width: 640, height: 400, 'aria-hidden': 'true' });
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const og = overlay.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, canvas.width, canvas.height);

  const coords = h('span', { class: 'fixed', text: '' });
  const sizeLabel = h('span', { class: 'fixed', text: '640 × 400' });
  const toolButtons = TOOLS.map(t => h('button', { class: 'tool-button paint-tool', type: 'button', title: t.label, 'aria-label': t.label, 'aria-pressed': String(t.id === tool), dataset: { tool: t.id }, onclick: () => setTool(t.id) }, toolIcon(t.id)));
  const sizeSelect = h('select', { id: `paint-size-${win.id}`, class: 'paint-size' }, [1, 2, 3, 5, 8, 12, 20].map(s => h('option', { value: s, text: `${s}px`, selected: s === size })));
  sizeSelect.addEventListener('change', () => { size = Number(sizeSelect.value); });
  const swatchA = h('span', { class: 'paint-current a' });
  const swatchB = h('span', { class: 'paint-current b' });
  const custom = h('input', { type: 'color', value: colors[0], 'aria-label': 'Custom colour', class: 'paint-custom' });
  custom.addEventListener('input', () => setColor(0, custom.value));
  const palette = h('div', { class: 'paint-palette', role: 'group', 'aria-label': 'Colours (click: first colour, right-click: second colour)' },
    h('div', { class: 'paint-currents', 'aria-hidden': 'true' }, swatchB, swatchA),
    h('div', { class: 'paint-swatches' }, PALETTE.map(color => {
      const swatch = h('button', { type: 'button', class: 'paint-swatch', style: { background: color }, 'aria-label': `Colour ${color}`, title: color, onclick: () => setColor(0, color) });
      swatch.addEventListener('contextmenu', event => { event.preventDefault(); setColor(1, color); });
      return swatch;
    })), custom);
  const stage = h('div', { class: 'paint-stage' }, h('div', { class: 'paint-sheet' }, canvas, overlay));

  win.body.classList.add('paint');
  win.body.append(menubar([
    { label: 'File', items: [
      { label: 'New', shortcut: 'Ctrl+N', action: newImage },
      { label: 'Open…', shortcut: 'Ctrl+O', action: openImage },
      { label: 'Save', shortcut: 'Ctrl+S', action: save },
      { label: 'Save As…', action: saveAs },
      '-',
      { label: 'Set as desktop background', action: setWallpaper },
      '-',
      { label: 'Exit', action: () => win.close() }
    ] },
    { label: 'Edit', items: () => [
      { label: 'Undo', shortcut: 'Ctrl+Z', disabled: !undo.length, action: doUndo },
      { label: 'Redo', shortcut: 'Ctrl+Y', disabled: !redo.length, action: doRedo },
      '-',
      { label: 'Clear Image', shortcut: 'Ctrl+Shift+N', action: clearImage }
    ] },
    { label: 'Image', items: [
      { label: 'Flip horizontal', action: () => transform('flipX') },
      { label: 'Flip vertical', action: () => transform('flipY') },
      { label: 'Invert colours', shortcut: 'Ctrl+I', action: () => transform('invert') },
      '-',
      { label: 'Canvas size…', action: resizeCanvas }
    ] },
    { label: 'Help', items: [{ label: 'About Paint', action: () => launch('about') }] }
  ]), h('div', { class: 'paint-main' },
    h('div', { class: 'paint-tools', role: 'toolbar', 'aria-label': 'Tools', 'aria-orientation': 'vertical' }, toolButtons,
      h('label', { class: 'sr-only', for: `paint-size-${win.id}`, text: 'Brush size' }), sizeSelect),
    stage), palette, h('div', { class: 'statusbar' }, h('span', { text: 'Left click: first colour · Right click: second colour' }), coords, sizeLabel));
  updateSwatches();

  const updateTitle = () => win.setTitle(`${dirty ? '*' : ''}${path ? basename(path) : 'untitled'} - Paint`);
  updateTitle();

  function setTool(id) {
    tool = id;
    toolButtons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === id)));
    canvas.dataset.tool = id;
  }
  canvas.dataset.tool = tool;

  function setColor(index, color) {
    colors[index] = color;
    updateSwatches();
  }

  function updateSwatches() {
    swatchA.style.background = colors[0];
    swatchB.style.background = colors[1];
    custom.value = colors[0];
  }

  // ---------- Undo ----------
  function snapshot() {
    undo.push(g.getImageData(0, 0, canvas.width, canvas.height));
    if (undo.length > 25) undo.shift();
    redo.length = 0;
  }
  function restoreImage(data) {
    canvas.width = overlay.width = data.width;
    canvas.height = overlay.height = data.height;
    g.putImageData(data, 0, 0);
    sizeLabel.textContent = `${data.width} × ${data.height}`;
  }
  function doUndo() {
    if (!undo.length) return;
    redo.push(g.getImageData(0, 0, canvas.width, canvas.height));
    restoreImage(undo.pop());
    markDirty();
  }
  function doRedo() {
    if (!redo.length) return;
    undo.push(g.getImageData(0, 0, canvas.width, canvas.height));
    restoreImage(redo.pop());
    markDirty();
  }
  const markDirty = () => { dirty = true; updateTitle(); };

  // ---------- Drawing ----------
  const point = event => {
    const r = canvas.getBoundingClientRect();
    return { x: Math.floor((event.clientX - r.left) * canvas.width / r.width), y: Math.floor((event.clientY - r.top) * canvas.height / r.height) };
  };

  function stroke(ctx2, a, b, color, width) {
    ctx2.strokeStyle = color;
    ctx2.fillStyle = color;
    ctx2.lineWidth = width;
    ctx2.lineCap = 'round';
    ctx2.lineJoin = 'round';
    if (width <= 1) {
      // Pixel-exact line (Bresenham) for the 1px pencil.
      let x0 = a.x; let y0 = a.y;
      const dx = Math.abs(b.x - x0); const dy = -Math.abs(b.y - y0);
      const sx = x0 < b.x ? 1 : -1; const sy = y0 < b.y ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        ctx2.fillRect(x0, y0, 1, 1);
        if (x0 === b.x && y0 === b.y) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
      return;
    }
    ctx2.beginPath();
    ctx2.moveTo(a.x + 0.5, a.y + 0.5);
    ctx2.lineTo(b.x + 0.5, b.y + 0.5);
    ctx2.stroke();
  }

  function shape(ctx2, kind, a, b, color, width) {
    ctx2.strokeStyle = color;
    ctx2.fillStyle = color;
    ctx2.lineWidth = width;
    const x = Math.min(a.x, b.x); const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x); const hgt = Math.abs(b.y - a.y);
    ctx2.beginPath();
    if (kind === 'line') { ctx2.lineCap = 'round'; ctx2.moveTo(a.x + 0.5, a.y + 0.5); ctx2.lineTo(b.x + 0.5, b.y + 0.5); ctx2.stroke(); return; }
    if (kind === 'rect' || kind === 'frect') ctx2.rect(x + 0.5, y + 0.5, w, hgt);
    else ctx2.ellipse(x + w / 2, y + hgt / 2, Math.max(0.5, w / 2), Math.max(0.5, hgt / 2), 0, 0, Math.PI * 2);
    if (kind.startsWith('f')) ctx2.fill();
    else ctx2.stroke();
  }

  function spray(p, color) {
    g.fillStyle = color;
    const radius = size * 3 + 4;
    for (let i = 0; i < radius * 1.5; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      g.fillRect(Math.round(p.x + Math.cos(angle) * r), Math.round(p.y + Math.sin(angle) * r), 1, 1);
    }
  }

  function floodFill(p, color) {
    const { width, height } = canvas;
    const image = g.getImageData(0, 0, width, height);
    const data = new Uint32Array(image.data.buffer);
    const target = data[p.y * width + p.x];
    g.fillStyle = color;
    g.fillRect(0, 0, 1, 1);
    const probe = g.getImageData(0, 0, 1, 1);
    g.putImageData(image, 0, 0);
    const fill = new Uint32Array(probe.data.buffer)[0];
    if (target === fill) return;
    const stack = [p.y * width + p.x];
    while (stack.length) {
      let i = stack.pop();
      let x = i % width;
      const y = (i - x) / width;
      while (x > 0 && data[i - 1] === target) { i--; x--; }
      let up = false;
      let down = false;
      while (x < width && data[i] === target) {
        data[i] = fill;
        if (y > 0) { const above = data[i - width] === target; if (above && !up) stack.push(i - width); up = above; }
        if (y < height - 1) { const below = data[i + width] === target; if (below && !down) stack.push(i + width); down = below; }
        i++; x++;
      }
    }
    g.putImageData(image, 0, 0);
  }

  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    const color = colors[event.button === 2 ? 1 : 0];
    const start = point(event);
    if (tool === 'picker') {
      const [r, gg, b] = g.getImageData(start.x, start.y, 1, 1).data;
      setColor(event.button === 2 ? 1 : 0, `#${[r, gg, b].map(v => v.toString(16).padStart(2, '0')).join('')}`);
      return;
    }
    snapshot();
    if (tool === 'fill') {
      if (start.x >= 0 && start.y >= 0 && start.x < canvas.width && start.y < canvas.height) floodFill(start, color);
      markDirty();
      return;
    }
    capture(canvas, event.pointerId);
    let last = start;
    const width = tool === 'pencil' ? 1 : tool === 'eraser' ? size * 3 + 2 : size;
    const paintColor = tool === 'eraser' ? colors[1] : color;
    let sprayTimer = 0;
    if (['pencil', 'brush', 'eraser'].includes(tool)) stroke(g, start, start, paintColor, width);
    if (tool === 'spray') { spray(start, color); sprayTimer = setInterval(() => spray(last, color), 30); }
    const move = e => {
      const p = point(e);
      if (['pencil', 'brush', 'eraser'].includes(tool)) { stroke(g, last, p, paintColor, width); last = p; }
      else if (tool === 'spray') last = p;
      else {
        og.clearRect(0, 0, overlay.width, overlay.height);
        let end = p;
        if (e.shiftKey) {
          const d = Math.max(Math.abs(p.x - start.x), Math.abs(p.y - start.y));
          end = { x: start.x + Math.sign(p.x - start.x) * d, y: start.y + Math.sign(p.y - start.y) * d };
        }
        shape(og, tool, start, end, color, size);
        last = end;
      }
    };
    const up = () => {
      clearInterval(sprayTimer);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      if (['line', 'rect', 'ellipse', 'frect', 'fellipse'].includes(tool)) {
        og.clearRect(0, 0, overlay.width, overlay.height);
        shape(g, tool, start, last, color, size);
      }
      markDirty();
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  });
  canvas.addEventListener('pointermove', event => { const p = point(event); coords.textContent = `${p.x}, ${p.y}`; });
  canvas.addEventListener('pointerleave', () => { coords.textContent = ''; });

  // ---------- Image operations ----------
  function transform(kind) {
    snapshot();
    if (kind === 'invert') {
      const image = g.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < image.data.length; i += 4) { image.data[i] = 255 - image.data[i]; image.data[i + 1] = 255 - image.data[i + 1]; image.data[i + 2] = 255 - image.data[i + 2]; }
      g.putImageData(image, 0, 0);
    } else {
      const copy = document.createElement('canvas');
      copy.width = canvas.width;
      copy.height = canvas.height;
      copy.getContext('2d').drawImage(canvas, 0, 0);
      g.save();
      g.setTransform(kind === 'flipX' ? -1 : 1, 0, 0, kind === 'flipY' ? -1 : 1, kind === 'flipX' ? canvas.width : 0, kind === 'flipY' ? canvas.height : 0);
      g.drawImage(copy, 0, 0);
      g.restore();
    }
    markDirty();
  }

  function setCanvasSize(width, height, keep = true) {
    const copy = keep ? g.getImageData(0, 0, Math.min(width, canvas.width), Math.min(height, canvas.height)) : null;
    canvas.width = overlay.width = width;
    canvas.height = overlay.height = height;
    g.fillStyle = colors[1];
    g.fillRect(0, 0, width, height);
    if (copy) g.putImageData(copy, 0, 0);
    sizeLabel.textContent = `${width} × ${height}`;
  }

  async function resizeCanvas() {
    const answer = await promptBox('New size in pixels (width × height):', { title: 'Canvas Size', owner: win, value: `${canvas.width} x ${canvas.height}`,
      validate: v => (/^\s*\d{1,4}\s*[x×,]\s*\d{1,4}\s*$/i.test(v) && v.match(/\d+/g).every(n => n >= 1 && n <= 4096) ? '' : 'Type two numbers between 1 and 4096, like 800 x 600.') });
    if (!answer) return;
    const [w, hgt] = answer.match(/\d+/g).map(Number);
    snapshot();
    setCanvasSize(w, hgt);
    markDirty();
  }

  function clearImage() {
    snapshot();
    g.fillStyle = colors[1];
    g.fillRect(0, 0, canvas.width, canvas.height);
    markDirty();
  }

  // ---------- Files ----------
  async function confirmDiscard() {
    if (!dirty) return true;
    const answer = await messageBox(`Save changes to ${path ? basename(path) : 'untitled'}?`, { title: 'Paint', kind: 'warning', buttons: ['Save', "Don't Save", 'Cancel'], owner: win });
    if (answer === 'Save') return save();
    return answer === "Don't Save";
  }
  win.on('close', confirmDiscard);

  async function newImage() {
    if (!(await confirmDiscard())) return;
    undo.length = 0;
    redo.length = 0;
    setCanvasSize(640, 400, false);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    path = null;
    dirty = false;
    win.sessionArgs = {};
    updateTitle();
  }

  async function load(target) {
    try {
      const blob = await vfs.read(target);
      const bitmap = await createImageBitmap(blob);
      canvas.width = overlay.width = Math.min(4096, bitmap.width);
      canvas.height = overlay.height = Math.min(4096, bitmap.height);
      g.drawImage(bitmap, 0, 0);
      sizeLabel.textContent = `${canvas.width} × ${canvas.height}`;
      path = (await vfs.stat(target)).path;
      dirty = false;
      undo.length = 0;
      win.sessionArgs = { path };
      settings.addRecent(path);
      updateTitle();
    } catch (error) {
      await errorBox(`Paint cannot read this file. ${error.message || ''}`, { title: 'Paint', owner: win });
    }
  }

  async function openImage() {
    if (!(await confirmDiscard())) return;
    const target = await fileDialog({ owner: win, folder: 'C:/Pictures', filters: [FILTERS[2], { label: 'All Files (*.*)', ext: [] }] });
    if (target) await load(target);
  }

  async function writeTo(target) {
    const type = ['jpg', 'jpeg'].includes(extension(target)) ? 'image/jpeg' : 'image/png';
    const blob = await new Promise(resolve => canvas.toBlob(resolve, type, 0.92));
    try {
      await vfs.write(target, blob);
      path = (await vfs.stat(target)).path;
      dirty = false;
      win.sessionArgs = { path };
      updateTitle();
      return true;
    } catch (error) {
      await errorBox(error, { title: 'Paint', owner: win });
      return false;
    }
  }

  async function save() {
    return path && ['png', 'jpg', 'jpeg'].includes(extension(path)) ? writeTo(path) : saveAs();
  }

  async function saveAs() {
    const target = await fileDialog({ mode: 'save', owner: win, folder: 'C:/Pictures', name: path ? basename(path).replace(/\.[^.]+$/, '.png') : 'untitled.png', filters: FILTERS.slice(0, 2) });
    return target ? writeTo(target) : false;
  }

  async function setWallpaper() {
    if (!path || dirty) {
      const ok = await save();
      if (!ok) return;
    }
    settings.set({ wallpaper: 'image', wallpaperImage: path });
  }

  win.el.addEventListener('keydown', event => {
    const ctrl = event.ctrlKey || event.metaKey;
    const k = event.key.toLowerCase();
    if (ctrl && k === 'z') doUndo();
    else if (ctrl && k === 'y') doRedo();
    else if (ctrl && k === 's') save();
    else if (ctrl && k === 'o') openImage();
    else if (ctrl && event.shiftKey && k === 'n') clearImage();
    else if (ctrl && k === 'n') newImage();
    else if (ctrl && k === 'i') transform('invert');
    else return;
    event.preventDefault();
  });

  win.onArgs = async args => { if (args.path && (await confirmDiscard())) load(args.path); };
  if (ctx.args.path) await load(ctx.args.path);
}


