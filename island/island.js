// lovgren.dev as a pixel-art island: every page is a building you can fly to.
// The scene is drawn by a tiny rasterizer into a 480×320 pixel buffer (no anti-aliasing, so edges
// stay crisp pixel art) and scaled up with image-rendering: pixelated. Shared by the browser and the
// tests (tests/island.test.mjs): the layout, rasterizer and live-state rules are pure functions.
// Live state comes from the site's own data: the lighthouse is lit while /status is operational,
// the control tower's beacon shows the last pipeline run, the arcade lights a window per game in
// progress, and it's day, dusk or night (with rain or snow) as it is in Stockholm right now.
// The map itself is for pointers; the list of places under it is the accessible way around.
(function attachIsland(root, createApi) {
  const api = createApi(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteIsland = api;
})(globalThis, root => {
  const N_ = text => text;
  const W = 480;
  const H = 320;
  const GRID = 28;
  const OX = 240;
  const OY = 82;
  const HALF_W = 8; // a tile is 16×8 pixels: classic 2:1 isometric
  const HALF_H = 4;
  const GRASS_Z = 5;
  const SAND_Z = 3;

  const project = (x, y, z = 0) => [OX + (x - y) * HALF_W, OY + (x + y) * HALF_H - z];

  // ---------- Layout ----------

  // Every page is a building. `door` is the tile the path leads to.
  const BUILDINGS = [
    { id: 'home', kind: 'cottage', href: '/', label: N_('Home'), x: 11, y: 11, w: 3, d: 3, door: [12, 14] },
    { id: 'games', kind: 'arcade', href: '/games/', label: N_('Game library'), x: 5, y: 14, w: 4, d: 3, door: [9, 15] },
    { id: 'ops', kind: 'tower', href: '/ops/', label: N_('Ops dashboard'), x: 17, y: 7, w: 2, d: 2, door: [17, 9] },
    { id: 'status', kind: 'lighthouse', href: '/status/', label: N_('Status'), x: 4, y: 4, w: 2, d: 2, door: [6, 5] },
    { id: 'changelog', kind: 'cabin', href: '/changelog/', label: N_('Changelog'), x: 16, y: 15, w: 3, d: 2, door: [17, 17] },
    { id: 'privacy', kind: 'vault', href: '/privacy/', label: N_('Privacy policy'), x: 7, y: 10, w: 2, d: 2, door: [8, 12] },
    { id: 'cookies', kind: 'bakery', href: '/cookies/', label: N_('Cookie policy'), x: 11, y: 18, w: 2, d: 2, door: [11, 20] },
    { id: 'terminal', kind: 'shed', action: 'terminal', label: N_('Terminal'), x: 15, y: 11, w: 1, d: 1, door: [15, 12] },
    { id: 'wc2026', kind: 'stadium', href: '/wc2026/', label: N_('World Cup 2026'), x: 21, y: 21, w: 3, d: 3, door: [21, 20] }
  ];
  const ISLET = [22.5, 22.5, 2.9];
  const BRIDGE = [[20, 19], [20, 20], [21, 20]];
  const POINTS = [[5, 5, 2.6]]; // the lighthouse's rocky point

  const center = b => [b.x + b.w / 2, b.y + b.d / 2];
  const hash = (x, y, seed = 0) => {
    let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  function landAt(x, y) {
    const cx = x + 0.5;
    const cy = y + 0.5;
    const dx = cx - 12.5;
    const dy = cy - 12.5;
    const angle = Math.atan2(dy, dx);
    const radius = 9.4 + 1.0 * Math.sin(3 * angle + 0.6) + 0.6 * Math.sin(5 * angle + 2.1);
    if (Math.hypot(dx, dy) < radius) return true;
    if (Math.hypot(cx - ISLET[0], cy - ISLET[1]) < ISLET[2]) return true;
    return POINTS.some(([px, py, r]) => Math.hypot(cx - px, cy - py) < r);
  }

  // Paths from the cottage to every door: along x, then along y.
  function pathTiles() {
    const tiles = new Set();
    const [hx, hy] = BUILDINGS[0].door;
    const add = (x, y) => tiles.add(`${x},${y}`);
    for (const b of BUILDINGS.slice(1)) {
      if (b.id === 'wc2026') continue; // reached over the bridge
      const [tx, ty] = b.door;
      for (let x = Math.min(hx, tx); x <= Math.max(hx, tx); x += 1) add(x, hy);
      for (let y = Math.min(hy, ty); y <= Math.max(hy, ty); y += 1) add(tx, y);
    }
    const [bx, by] = BRIDGE[0];
    for (let x = Math.min(hx, bx); x <= Math.max(hx, bx); x += 1) add(x, hy);
    for (let y = Math.min(hy, by - 1); y <= Math.max(hy, by - 1); y += 1) add(bx, y);
    for (const b of BUILDINGS) for (let x = b.x; x < b.x + b.w; x += 1) for (let y = b.y; y < b.y + b.d; y += 1) tiles.delete(`${x},${y}`);
    return tiles;
  }

  function buildMap() {
    const tiles = [];
    const paths = pathTiles();
    const bridge = new Set(BRIDGE.map(([x, y]) => `${x},${y}`));
    const occupied = new Set();
    for (const b of BUILDINGS) for (let x = b.x - 1; x <= b.x + b.w; x += 1) for (let y = b.y - 1; y <= b.y + b.d; y += 1) occupied.add(`${x},${y}`);
    for (let y = 0; y < GRID; y += 1) {
      for (let x = 0; x < GRID; x += 1) {
        const key = `${x},${y}`;
        const land = landAt(x, y);
        let type = 'water';
        if (bridge.has(key)) type = 'bridge';
        else if (land) {
          const shore = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !landAt(x + dx, y + dy));
          type = paths.has(key) ? 'path' : shore ? 'sand' : 'grass';
        } else {
          let near = false;
          for (let dy = -2; dy <= 2 && !near; dy += 1) for (let dx = -2; dx <= 2 && !near; dx += 1) near = Math.hypot(dx, dy) <= 2 && landAt(x + dx, y + dy);
          type = near ? 'shallow' : 'water';
        }
        const tree = type === 'grass' && !occupied.has(key) && hash(x, y, 7) < 0.3;
        tiles.push({ x, y, type, tree, rock: type === 'sand' && hash(x, y, 3) < 0.18 });
      }
    }
    return tiles;
  }

  // ---------- Live state ----------

  // Data from /ops/data.json, /now-playing.json and the weather mood → what the island shows.
  function stateFrom({ ops = null, playing = null, mood = null, hour = 12 } = {}) {
    const phase = mood?.phase || (hour >= 21 || hour < 6 ? 'night' : hour >= 19 || hour < 8 ? 'twilight' : 'day');
    const conclusion = ops?.lastRun?.conclusion;
    return {
      phase,
      weather: mood ? { kind: mood.kind, intensity: mood.intensity, wind: mood.wind } : { kind: 'clear', intensity: 0, wind: 3 },
      lighthouse: { operational: 'on', degraded: 'flicker', outage: 'off' }[ops?.uptime?.overall] || 'dim',
      beacon: conclusion === 'success' ? 'ok' : conclusion === 'failure' || conclusion === 'cancelled' ? 'fail' : 'unknown',
      playing: Math.max(0, Math.min(8, Array.isArray(playing) ? playing.length : 0))
    };
  }

  // ---------- Rasterizer ----------

  function createSurface(width = W, height = H) {
    return { width, height, data: new Uint32Array(width * height), water: new Uint8Array(width * height) };
  }

  const rgb = hex => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const pack = ([r, g, b]) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;

  function blendPixel(surface, index, [r, g, b], alpha, add = false) {
    const old = surface.data[index];
    if (add) {
      const glow = (shift, value) => Math.min(255, ((old >>> shift) & 255) + Math.round(value * alpha));
      surface.data[index] = pack([glow(0, r), glow(8, g), glow(16, b)]);
      return;
    }
    if (alpha >= 1) { surface.data[index] = pack([r, g, b]); return; }
    const mix = (shift, value) => Math.round(((old >>> shift) & 255) * (1 - alpha) + value * alpha);
    surface.data[index] = pack([mix(0, r), mix(8, g), mix(16, b)]);
  }

  // Scanline fill sampled at pixel centres: shared edges never overlap or leave gaps.
  // `add` brightens instead of covering, for light (the lighthouse beam).
  function fillPoly(surface, points, color, { alpha = 1, water = false, add = false } = {}) {
    let top = Infinity;
    let bottom = -Infinity;
    for (const [, y] of points) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
    const y0 = Math.max(0, Math.floor(top));
    const y1 = Math.min(surface.height - 1, Math.ceil(bottom));
    const crossings = [];
    for (let y = y0; y <= y1; y += 1) {
      const sy = y + 0.5;
      crossings.length = 0;
      for (let i = 0; i < points.length; i += 1) {
        const [ax, ay] = points[i];
        const [bx, by] = points[(i + 1) % points.length];
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) crossings.push(ax + ((sy - ay) * (bx - ax)) / (by - ay));
      }
      crossings.sort((a, b) => a - b);
      for (let i = 0; i + 1 < crossings.length; i += 2) {
        const x0 = Math.max(0, Math.ceil(crossings[i] - 0.5));
        const x1 = Math.min(surface.width - 1, Math.floor(crossings[i + 1] - 0.5));
        for (let x = x0; x <= x1; x += 1) {
          const index = y * surface.width + x;
          blendPixel(surface, index, color, alpha, add);
          if (!add) surface.water[index] = water ? 1 : 0;
        }
      }
    }
  }

  function rect(surface, x, y, width, height, color, alpha = 1) {
    for (let py = Math.max(0, Math.round(y)); py < Math.min(surface.height, Math.round(y + height)); py += 1) {
      for (let px = Math.max(0, Math.round(x)); px < Math.min(surface.width, Math.round(x + width)); px += 1) {
        blendPixel(surface, py * surface.width + px, color, alpha);
        surface.water[py * surface.width + px] = 0;
      }
    }
  }

  // ---------- Palette ----------

  const BASE = {
    deep: '#1f4677', water: '#2a5f98', shallow: '#3f86bf', foam: '#bfe3f5',
    sand: '#e4cd8c', sandSide: '#b8995a', grass: '#5ca84b', grassAlt: '#529c43', tuft: '#74c25e', grassSide: '#7a5532', dirt: '#5e4127',
    path: '#c2b9a4', pathAlt: '#b1a891', plank: '#9c6a3c', plankDark: '#7a5030',
    rock: '#8d929c', rockDark: '#6b707a',
    pine: '#2e6b3c', pineDark: '#23553a', trunk: '#5a3a22',
    red: '#a3352a', redDark: '#7f281f', white: '#f1eee6', whiteDark: '#cbc6ba', roof: '#3c3d4a', roofDark: '#2c2d38',
    glass: '#8cc4ef', glassDark: '#5f93c2', window: '#33405a', lit: '#ffd66e',
    purple: '#45307a', purpleDark: '#33235e', concrete: '#cfd2d9', concreteDark: '#a5a9b3', metal: '#4a4f5c',
    stone: '#9a9da6', stoneDark: '#767983', gold: '#d9b23c',
    log: '#8d5b33', logDark: '#6c4426', logLine: '#553419', turf: '#4f8a3c', turfDark: '#3f7230',
    cream: '#f2dcbc', creamDark: '#d6bc97', awning: '#e05d5d',
    shed: '#2b303c', shedDark: '#1f232c', screen: '#7dffa0',
    pitch: '#3f9c45', pitchAlt: '#38903e', stand: '#c9ccd6', standDark: '#a2a6b2', seat: '#5458e0',
    snow: '#eef3f8', snowSide: '#c9d4e0', flag: '#6266ea'
  };
  // Light sources keep their colour at night.
  const GLOWS = new Set(['lit', 'screen', 'gold']);

  function palette({ phase, weather }) {
    const shade = phase === 'night' ? [0.36, 0.42, 0.62] : phase === 'twilight' ? [0.78, 0.66, 0.74] : [1, 1, 1];
    const grey = ['rain', 'thunder', 'fog', 'sleet'].includes(weather.kind) || (weather.kind === 'clouds' && weather.intensity > 0.6) ? 0.82 : 1;
    const result = {};
    for (const [name, hex] of Object.entries(BASE)) {
      const [r, g, b] = rgb(hex);
      if (GLOWS.has(name)) { result[name] = [r, g, b]; continue; }
      const mean = (r + g + b) / 3;
      const desaturate = value => mean + (value - mean) * grey;
      result[name] = [desaturate(r) * shade[0], desaturate(g) * shade[1], desaturate(b) * shade[2]].map(value => Math.max(0, Math.min(255, Math.round(value))));
    }
    if (weather.kind === 'snow') {
      for (const name of ['grass', 'grassAlt', 'tuft', 'turf', 'roof', 'pitch', 'pitchAlt']) result[name] = result.snow;
      for (const name of ['grassSide', 'turfDark', 'roofDark']) result[name] = result.snowSide;
    }
    return result;
  }

  // ---------- Drawing ----------

  function painter(surface, colors) {
    let collected = null;
    const at = (x, y, z) => {
      const point = project(x, y, z);
      collected?.push(point);
      return point;
    };
    const poly = (points, color, options) => fillPoly(surface, points, colors[color] || color, options);
    const quad = (a, b, c, d, color, options) => poly([at(...a), at(...b), at(...c), at(...d)], color, options);

    function box(x, y, z, w, d, h, top, left, right = left) {
      const z1 = z + h;
      if (h > 0) {
        quad([x, y + d, z], [x + w, y + d, z], [x + w, y + d, z1], [x, y + d, z1], left);
        quad([x + w, y, z], [x + w, y + d, z], [x + w, y + d, z1], [x + w, y, z1], right);
      }
      if (top) quad([x, y, z1], [x + w, y, z1], [x + w, y + d, z1], [x, y + d, z1], top);
    }
    // Rectangles on the two visible walls: u along the wall in tiles, v up the wall in pixels.
    const onLeft = (b, z, u0, u1, v0, v1, color) => quad([b.x + u0, b.y + b.d, z + v0], [b.x + u1, b.y + b.d, z + v0], [b.x + u1, b.y + b.d, z + v1], [b.x + u0, b.y + b.d, z + v1], color);
    const onRight = (b, z, u0, u1, v0, v1, color) => quad([b.x + b.w, b.y + u0, z + v0], [b.x + b.w, b.y + u1, z + v0], [b.x + b.w, b.y + u1, z + v1], [b.x + b.w, b.y + u0, z + v1], color);

    // A gable roof with its ridge along x.
    function gable(x, y, z, w, d, rise, slope, back, end, overhang = 0.2) {
      const o = overhang;
      const ridge = y + d / 2;
      quad([x - o, y - o, z], [x + w + o, y - o, z], [x + w + o, ridge, z + rise], [x - o, ridge, z + rise], back);
      poly([at(x + w, y, z), at(x + w, y + d, z), at(x + w, ridge, z + rise)], end);
      quad([x - o, ridge, z + rise], [x + w + o, ridge, z + rise], [x + w + o, y + d + o, z], [x - o, y + d + o, z], slope);
    }

    function pyramid(x, y, z, w, d, rise, left, right) {
      const apex = [x + w / 2, y + d / 2, z + rise];
      poly([at(x, y + d, z), at(x + w, y + d, z), at(...apex)], left);
      poly([at(x + w, y, z), at(x + w, y + d, z), at(...apex)], right);
    }

    return {
      at, poly, quad, box, onLeft, onRight, gable, pyramid,
      collect() { collected = []; },
      take() { const points = collected; collected = null; return points; }
    };
  }

  function drawTerrain(p, tiles, colors) {
    // Back to front: x + y grows towards the viewer.
    const ordered = [...tiles].sort((a, b) => a.x + a.y - (b.x + b.y) || a.x - b.x);
    for (const tile of ordered) {
      const { x, y, type } = tile;
      if (type === 'water' || type === 'shallow' || type === 'bridge') {
        p.quad([x, y, 0], [x + 1, y, 0], [x + 1, y + 1, 0], [x, y + 1, 0], type === 'water' ? 'deep' : 'shallow', { water: true });
        if (type === 'bridge') {
          p.box(x, y + 0.2, 1, 1, 0.6, 2, 'plank', 'plankDark');
          p.quad([x + 0.5, y + 0.2, 3], [x + 0.55, y + 0.2, 3], [x + 0.55, y + 0.8, 3], [x + 0.5, y + 0.8, 3], 'plankDark');
        }
        continue;
      }
      if (type === 'sand') {
        p.box(x, y, 0, 1, 1, SAND_Z, 'sand', 'sandSide');
        if (tile.rock) p.box(x + 0.3, y + 0.35, SAND_Z, 0.35, 0.3, 2, 'rock', 'rockDark');
        continue;
      }
      const top = type === 'path' ? (hash(x, y, 2) < 0.5 ? 'path' : 'pathAlt') : hash(x, y, 2) < 0.5 ? 'grass' : 'grassAlt';
      p.box(x, y, 0, 1, 1, GRASS_Z, top, 'grassSide', 'dirt');
      if (type === 'grass' && hash(x, y, 4) < 0.35) {
        const u = 0.2 + hash(x, y, 5) * 0.6;
        const v = 0.2 + hash(x, y, 6) * 0.6;
        p.quad([x + u, y + v, GRASS_Z], [x + u + 0.12, y + v, GRASS_Z], [x + u + 0.12, y + v + 0.12, GRASS_Z], [x + u, y + v + 0.12, GRASS_Z], 'tuft');
      }
    }
  }

  function drawTree(p, surface, colors, x, y, snowy) {
    const [sx, sy] = project(x + 0.5, y + 0.5, GRASS_Z);
    const left = Math.round(sx);
    const base = Math.round(sy);
    rect(surface, left, base - 3, 1, 3, colors.trunk);
    // Three tiers, widest at the bottom.
    [[7, 4, 4], [5, 4, 7], [3, 3, 10]].forEach(([width, height, lift], tier) => {
      for (let row = 0; row < height; row += 1) {
        const half = Math.round(((row + 1) / height) * (width / 2));
        rect(surface, left - half, base - lift - height + row, half * 2 + 1, 1, row === height - 1 ? colors.pineDark : colors.pine);
      }
      if (snowy) rect(surface, left - (tier === 2 ? 0 : 1), base - lift - height, tier === 2 ? 1 : 3, 1, colors.snow);
    });
  }

  function drawBuilding(p, surface, colors, b, state) {
    const z = GRASS_Z;
    const night = state.phase !== 'day';
    const win = night ? 'lit' : 'glass';
    switch (b.kind) {
      case 'cottage': {
        p.box(b.x, b.y, z, b.w, b.d, 14, null, 'red', 'redDark');
        for (const u of [0, b.w - 0.12]) p.onLeft(b, z, u, u + 0.12, 0, 14, 'white');
        for (const u of [0, b.d - 0.12]) p.onRight(b, z, u, u + 0.12, 0, 14, 'whiteDark');
        p.onLeft(b, z, 1.25, 1.75, 0, 9, 'white');
        p.onLeft(b, z, 1.33, 1.67, 0, 8, 'redDark');
        for (const u of [0.35, 2.15]) { p.onLeft(b, z, u, u + 0.5, 5, 10, 'white'); p.onLeft(b, z, u + 0.07, u + 0.43, 6, 9, win); }
        for (const u of [0.5, 1.9]) { p.onRight(b, z, u, u + 0.6, 5, 10, 'whiteDark'); p.onRight(b, z, u + 0.08, u + 0.52, 6, 9, win); }
        p.box(b.x + 2.1, b.y + 0.5, z + 14, 0.4, 0.4, 13, 'redDark', 'red', 'redDark');
        p.gable(b.x, b.y, z + 14, b.w, b.d, 10, 'roof', 'roofDark', 'red');
        break;
      }
      case 'arcade': {
        p.box(b.x, b.y, z, b.w, b.d, 17, 'purpleDark', 'purple', 'purpleDark');
        // A window per game in progress, lit in its own colour like a cabinet screen.
        const slots = [[0, 0.25], [0, 0.95], [0, 2.6], [0, 3.3], [1, 0.25], [1, 0.95], [1, 1.65], [1, 2.35]];
        const screens = ['#ff6fd8', '#6ff6ff', '#ffe36f', '#8dff7a', '#ff9b5c', '#b28cff', '#ff6f8a', '#6fb3ff'];
        slots.forEach(([side, u], index) => {
          const color = index < state.playing ? rgb(screens[index]) : colors.window;
          const wall = side ? p.onRight : p.onLeft;
          wall(b, z, u, u + 0.45, 9, 14, color);
        });
        p.onLeft(b, z, 1.75, 2.35, 0, 8, 'purpleDark');
        p.onLeft(b, z, 1.85, 2.25, 0, 7, night ? 'lit' : 'window');
        p.box(b.x + 0.4, b.y + 2.4, z + 17, 3.2, 0.25, 7, 'roofDark', 'roofDark');
        break;
      }
      case 'tower': {
        p.box(b.x, b.y, z, b.w, b.d, 9, 'concrete', 'concrete', 'concreteDark');
        p.onLeft(b, z, 0.7, 1.3, 0, 7, 'metal');
        p.box(b.x + 0.6, b.y + 0.6, z + 9, 0.8, 0.8, 24, null, 'concrete', 'concreteDark');
        p.box(b.x + 0.15, b.y + 0.15, z + 33, 1.7, 1.7, 2, 'metal', 'metal');
        p.box(b.x + 0.15, b.y + 0.15, z + 35, 1.7, 1.7, 7, null, night ? 'lit' : 'glass', night ? 'lit' : 'glassDark');
        for (const u of [0, 0.82, 1.62]) { p.onLeft({ ...b, x: b.x + 0.15, d: 1.85 }, z + 35, u, u + 0.08, 0, 7, 'metal'); }
        p.box(b.x + 0.05, b.y + 0.05, z + 42, 1.9, 1.9, 2, 'roof', 'roofDark');
        p.box(b.x + 0.95, b.y + 0.95, z + 44, 0.1, 0.1, 9, null, 'metal');
        break;
      }
      case 'lighthouse': {
        p.box(b.x, b.y, SAND_Z, b.w, b.d, 4, 'rock', 'rock', 'rockDark');
        const x = b.x + 0.45;
        const y = b.y + 0.45;
        for (let index = 0; index < 5; index += 1) p.box(x, y, SAND_Z + 4 + index * 7, 1.1, 1.1, 7, null, index % 2 ? 'red' : 'white', index % 2 ? 'redDark' : 'whiteDark');
        p.onLeft({ x, y, w: 1.1, d: 1.1 }, SAND_Z + 4, 0.35, 0.75, 0, 6, 'roofDark');
        p.box(x - 0.2, y - 0.2, SAND_Z + 39, 1.5, 1.5, 2, 'metal', 'metal');
        p.box(x + 0.1, y + 0.1, SAND_Z + 41, 0.9, 0.9, 6, null, 'glass', 'glassDark');
        p.pyramid(x - 0.05, y - 0.05, SAND_Z + 47, 1.2, 1.2, 6, 'red', 'redDark');
        break;
      }
      case 'cabin': {
        p.box(b.x, b.y, z, b.w, b.d, 12, null, 'log', 'logDark');
        for (let v = 2; v < 12; v += 3) { p.onLeft(b, z, 0, b.w, v, v + 1, 'logLine'); p.onRight(b, z, 0, b.d, v, v + 1, 'logLine'); }
        p.onLeft(b, z, 1.25, 1.75, 0, 9, 'logLine');
        p.onLeft(b, z, 0.4, 0.85, 5, 9, win);
        p.onLeft(b, z, 2.15, 2.6, 5, 9, win);
        p.onRight(b, z, 0.7, 1.3, 5, 9, win);
        p.gable(b.x, b.y, z + 12, b.w, b.d, 7, 'turf', 'turfDark', 'log');
        p.box(b.x + 3.15, b.y + 1.9, z, 0.1, 0.1, 26, null, 'metal');
        break;
      }
      case 'vault': {
        p.box(b.x - 0.1, b.y - 0.1, z, b.w + 0.2, b.d + 0.2, 2, 'stoneDark', 'stoneDark');
        p.box(b.x, b.y, z + 2, b.w, b.d, 12, null, 'stone', 'stoneDark');
        for (const u of [0.15, 0.6, 1.4, 1.85]) p.onLeft(b, z + 2, u - 0.08, u + 0.08, 0, 12, 'white');
        p.onLeft(b, z + 2, 0.82, 1.18, 0, 8, 'metal');
        p.onLeft(b, z + 2, 0.92, 1.08, 3, 5, 'gold');
        p.onRight(b, z + 2, 0.7, 1.3, 6, 9, 'roofDark');
        p.box(b.x - 0.1, b.y - 0.1, z + 14, b.w + 0.2, b.d + 0.2, 2, 'stoneDark', 'stone', 'stoneDark');
        p.gable(b.x, b.y, z + 16, b.w, b.d, 5, 'stone', 'stoneDark', 'white', 0.1);
        break;
      }
      case 'bakery': {
        p.box(b.x, b.y, z, b.w, b.d, 11, null, 'cream', 'creamDark');
        p.onLeft(b, z, 0.25, 1.15, 2, 7, win);
        p.onLeft(b, z, 1.35, 1.8, 0, 8, 'logDark');
        for (let index = 0; index < 8; index += 1) p.onLeft(b, z, index * 0.25, index * 0.25 + 0.25, 8, 10, index % 2 ? 'white' : 'awning');
        for (let index = 0; index < 8; index += 1) p.onRight(b, z, index * 0.25, index * 0.25 + 0.25, 8, 10, index % 2 ? 'whiteDark' : 'awning');
        p.gable(b.x, b.y, z + 11, b.w, b.d, 7, 'roof', 'roofDark', 'cream');
        break;
      }
      case 'shed': {
        p.box(b.x + 0.1, b.y + 0.1, z, 0.8, 0.8, 9, 'shedDark', 'shed', 'shedDark');
        p.onLeft({ ...b, x: b.x + 0.1, d: 0.9 }, z, 0.12, 0.68, 3, 7, 'shedDark');
        p.box(b.x + 0.45, b.y + 0.45, z + 9, 0.08, 0.08, 6, null, 'metal');
        break;
      }
      case 'stadium': {
        p.box(b.x, b.y, z, b.w, b.d, 1, 'stand', 'standDark');
        for (let index = 0; index < 6; index += 1) p.quad([b.x + 0.5 + index * 0.333, b.y + 0.5, z + 1], [b.x + 0.833 + index * 0.333, b.y + 0.5, z + 1], [b.x + 0.833 + index * 0.333, b.y + 2.5, z + 1], [b.x + 0.5 + index * 0.333, b.y + 2.5, z + 1], index % 2 ? 'pitch' : 'pitchAlt');
        p.quad([b.x + 1.48, b.y + 0.5, z + 1], [b.x + 1.52, b.y + 0.5, z + 1], [b.x + 1.52, b.y + 2.5, z + 1], [b.x + 1.48, b.y + 2.5, z + 1], 'white');
        p.box(b.x, b.y, z + 1, b.w, 0.4, 4, 'seat', 'stand', 'standDark');
        p.box(b.x, b.y + 0.4, z + 1, 0.4, b.d - 0.4, 4, 'seat', 'stand', 'standDark');
        p.box(b.x, b.y + b.d - 0.3, z + 1, b.w, 0.3, 2, 'stand', 'stand', 'standDark');
        p.box(b.x + b.w - 0.3, b.y + 0.4, z + 1, 0.3, b.d - 0.7, 2, 'stand', 'stand', 'standDark');
        for (const [u, v] of [[b.w - 0.2, 0.1], [0.1, b.d - 0.2]]) p.box(b.x + u, b.y + v, z, 0.1, 0.1, 16, 'metal', 'metal');
        break;
      }
      default:
    }
  }

  function drawScene(surface, { tiles = buildMap(), state = stateFrom() } = {}) {
    const colors = palette(state);
    const p = painter(surface, colors);
    surface.data.fill(pack(colors.deep));
    surface.water.fill(1);
    drawTerrain(p, tiles, colors);
    // Trees and buildings back to front, each building's outline kept for hit-testing.
    const items = [
      ...tiles.filter(tile => tile.tree).map(tile => ({ depth: tile.x + tile.y + 1, draw: () => drawTree(p, surface, colors, tile.x, tile.y, state.weather.kind === 'snow') })),
      ...BUILDINGS.map(b => ({ depth: b.x + b.y + (b.w + b.d) / 2 + 0.5, building: b }))
    ].sort((a, b) => a.depth - b.depth);
    const shapes = {};
    for (const item of items) {
      if (!item.building) { item.draw(); continue; }
      p.collect();
      drawBuilding(p, surface, colors, item.building, state);
      shapes[item.building.id] = hull(p.take());
    }
    return { colors, shapes, frame: frameOf(tiles, shapes) };
  }

  // The part of the buffer worth looking at: every land tile and building, with a little sea.
  function frameOf(tiles, shapes) {
    const points = Object.values(shapes).flat();
    for (const { x, y, type } of tiles) {
      if (type === 'water' || type === 'shallow') continue;
      points.push(project(x, y), project(x + 1, y + 1), project(x + 1, y), project(x, y + 1));
    }
    const box = bounds(points);
    const margin = 12;
    return { x: box.x, y: box.y, width: box.right - box.left + margin * 2, height: box.bottom - box.top + margin * 2 };
  }

  // ---------- Geometry ----------

  function hull(points) {
    const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (sorted.length < 3) return sorted;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const point of sorted) {
      while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
      lower.push(point);
    }
    const upper = [];
    for (const point of sorted.reverse()) {
      while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
      upper.push(point);
    }
    return [...lower.slice(0, -1), ...upper.slice(0, -1)];
  }

  function inside(points, x, y) {
    let result = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) result = !result;
    }
    return result;
  }

  // The building under a point in buffer pixels; the front-most wins where outlines overlap.
  function hitTest(shapes, x, y) {
    let found = null;
    for (const b of BUILDINGS) {
      if (shapes[b.id] && inside(shapes[b.id], x, y) && (!found || b.x + b.y > found.x + found.y)) found = b;
    }
    return found;
  }

  function bounds(points) {
    const xs = points.map(point => point[0]);
    const ys = points.map(point => point[1]);
    return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys), x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  }

  const shared = { W, H, GRID, BUILDINGS, BRIDGE, project, landAt, buildMap, pathTiles, stateFrom, createSurface, fillPoly, palette, drawScene, hull, inside, hitTest, bounds, hash };
  if (typeof document === 'undefined' || !root.document) return Object.freeze(shared);

  // ---------- Browser ----------

  const $ = selector => document.querySelector(selector);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const ZONE = 'Europe/Stockholm';
  const FPS = 12;

  function stockholmHour(date = new Date()) {
    return Number(new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hour: 'numeric', hourCycle: 'h23' }).format(date));
  }

  const weatherEffectsOn = () => { try { return localStorage.getItem('lovgren-weather') !== 'off'; } catch { return true; } };

  // Things that move: water sparkles, the lighthouse beam, smoke, the beacon, a boat, gulls and weather.
  function drawOverlay(surface, base, scene, state, time, hover) {
    surface.data.set(base.data);
    const { colors, shapes } = scene;
    const put = (x, y, color, alpha = 1) => {
      x = Math.round(x); y = Math.round(y);
      if (x >= 0 && y >= 0 && x < W && y < H) blendPixel(surface, y * W + x, color, alpha);
    };
    const slot = Math.floor(time * 2);
    for (let index = 0; index < 260; index += 1) {
      const x = Math.floor(hash(index, slot, 11) * W);
      const y = Math.floor(hash(index, slot, 12) * H);
      if (base.water[y * W + x]) { put(x, y, colors.foam, 0.55); put(x + 1, y, colors.foam, 0.35); }
    }

    // Lighthouse: lamp and a slowly sweeping beam while the site is up.
    const lighthouse = BUILDINGS.find(b => b.id === 'status');
    const [lx, ly] = project(lighthouse.x + 1, lighthouse.y + 1, SAND_Z + 44);
    const lamp = state.lighthouse === 'off' ? null : state.lighthouse === 'flicker' ? (hash(Math.floor(time * 6), 1, 9) < 0.5 ? 0.9 : 0.15) : state.lighthouse === 'dim' ? 0.35 : 1;
    if (lamp) {
      for (let dy = -2; dy <= 1; dy += 1) for (let dx = -2; dx <= 1; dx += 1) put(lx + dx, ly + dy, colors.lit, lamp);
      if (state.lighthouse === 'on') {
        const angle = time * 0.9;
        const reach = state.phase === 'day' ? 60 : 110;
        const alpha = state.phase === 'day' ? 0.05 : 0.09;
        for (const side of [0, Math.PI]) {
          const a = angle + side;
          const tip = (spread, distance) => [lx + Math.cos(a + spread) * distance, ly + Math.sin(a + spread) * distance * 0.5];
          // Three overlapping wedges: bright near the lamp, fading out towards the end.
          for (const length of [0.45, 0.75, 1]) fillPoly(surface, [[lx, ly], tip(-0.16, reach * length), tip(0.16, reach * length)], colors.lit, { alpha, add: true });
        }
      }
    }

    // Control tower beacon: green after a passing run, red after a failing one.
    const tower = BUILDINGS.find(b => b.id === 'ops');
    const [tx, ty] = project(tower.x + 1, tower.y + 1, GRASS_Z + 53);
    const beacon = { ok: [92, 255, 130], fail: [255, 72, 72], unknown: [255, 196, 70] }[state.beacon];
    if (Math.floor(time * 1.5) % 2 === 0 || reducedMotion.matches) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) put(tx + dx - 1, ty + dy - 1, beacon);

    // Arcade sign: a neon stripe that flickers now and then.
    const arcade = BUILDINGS.find(b => b.id === 'games');
    const neon = hash(Math.floor(time * 8), 2, 5) < 0.06 ? null : (Math.floor(time) % 2 ? [255, 111, 216] : [111, 246, 255]);
    if (neon) {
      for (let u = 0.6; u < 3.5; u += 0.06) {
        const [nx, ny] = project(arcade.x + u, arcade.y + 2.65, GRASS_Z + 20);
        put(nx, ny, neon);
        put(nx, ny + 1, neon, 0.5);
      }
    }

    // Terminal shed: a blinking cursor.
    const shed = BUILDINGS.find(b => b.id === 'terminal');
    if (Math.floor(time * 2) % 2 === 0) {
      const [cx, cy] = project(shed.x + 0.45, shed.y + 1, GRASS_Z + 5);
      put(cx, cy, colors.screen); put(cx + 1, cy, colors.screen); put(cx, cy + 1, colors.screen); put(cx + 1, cy + 1, colors.screen);
    }

    // Chimney smoke, blown by the wind; the flag on the log cabin.
    const home = BUILDINGS[0];
    const [sx, sy] = project(home.x + 2.3, home.y + 0.7, GRASS_Z + 27);
    const wind = Math.min(12, state.weather.wind || 0);
    for (let puff = 0; puff < 5; puff += 1) {
      const age = (time * 0.35 + puff / 5) % 1;
      const px = sx + age * (6 + wind * 2) + Math.sin(age * 6 + puff) * 1.5;
      const py = sy - age * 22;
      const alpha = 0.55 * (1 - age);
      const size = 1 + Math.round(age * 2);
      for (let dy = 0; dy < size; dy += 1) for (let dx = 0; dx < size; dx += 1) put(px + dx, py + dy, colors.whiteDark, alpha);
    }
    const cabin = BUILDINGS.find(b => b.id === 'changelog');
    const [fx, fy] = project(cabin.x + 3.2, cabin.y + 1.95, GRASS_Z + 31);
    for (let u = 0; u < 7; u += 1) {
      const wave = Math.round(Math.sin(time * 5 + u * 0.9) * (u / 6));
      for (let v = 0; v < 4; v += 1) put(fx + 1 + u, fy + v + wave, colors.flag);
    }

    // A small boat sailing back and forth off the west shore.
    const sail = (Math.sin(time * 0.12) + 1) / 2;
    const [bx, by] = project(2 + sail * 2, 21 + sail * 4.5, 0);
    const facing = Math.cos(time * 0.12) > 0 ? 1 : -1;
    for (let dx = -4; dx <= 4; dx += 1) { put(bx + dx, by, colors.logDark); if (Math.abs(dx) < 4) put(bx + dx, by + 1, colors.logDark); }
    for (let row = 0; row < 7; row += 1) for (let dx = 0; dx <= Math.floor(row / 2); dx += 1) put(bx + facing * dx, by - 8 + row, colors.white);
    for (let dy = -9; dy < 0; dy += 1) put(bx, by + dy, colors.logLine);
    for (let dx = -6; dx <= 6; dx += 2) put(bx + dx + (Math.floor(time * 3) % 2), by + 2, colors.foam, 0.6);

    // Two gulls by day.
    if (state.phase === 'day' && !['rain', 'thunder', 'snow', 'sleet'].includes(state.weather.kind)) {
      for (let gull = 0; gull < 2; gull += 1) {
        const gx = ((time * (9 + gull * 3) + gull * 170) % (W + 40)) - 20;
        const gy = 40 + gull * 22 + Math.sin(time * 0.8 + gull) * 6;
        const flap = Math.floor(time * 4 + gull) % 2;
        for (const [dx, dy] of [[-2, flap ? -1 : 0], [-1, 0], [0, 1], [1, 0], [2, flap ? -1 : 0]]) put(gx + dx, gy + dy, colors.white);
      }
    }

    // Weather in pixels (unless the visitor turned weather effects off).
    if (state.weatherOn) {
      const { kind, intensity } = state.weather;
      const lean = Math.max(-0.5, Math.min(0.5, (state.weather.wind || 0) / 20));
      if (['rain', 'thunder', 'sleet'].includes(kind)) {
        const drops = Math.round(120 + 260 * intensity);
        for (let index = 0; index < drops; index += 1) {
          const x0 = hash(index, 0, 21) * (W + 40) - 20;
          const speed = 140 + hash(index, 0, 22) * 80;
          const y = ((hash(index, 0, 23) * H + time * speed) % (H + 10)) - 5;
          const x = x0 + y * lean;
          for (let step = 0; step < 3; step += 1) put(x - step * lean, y - step, colors.foam, 0.45);
        }
      }
      if (['snow', 'sleet'].includes(kind)) {
        const flakes = Math.round(90 + 180 * intensity);
        for (let index = 0; index < flakes; index += 1) {
          const speed = 12 + hash(index, 1, 24) * 14;
          const y = ((hash(index, 1, 25) * H + time * speed) % (H + 4)) - 2;
          const x = (hash(index, 1, 26) * W + Math.sin(time + index) * 3 + y * lean) % W;
          put(x, y, colors.snow, 0.9);
        }
      }
      if (kind === 'fog') {
        for (let band = 0; band < 4; band += 1) {
          const y = 60 + band * 55 + Math.sin(time * 0.2 + band) * 8;
          fillPoly(surface, [[0, y], [W, y - 12], [W, y + 18], [0, y + 30]], colors.white, { alpha: 0.12 });
        }
      }
    }

    // The building under the pointer (or focused in the list) gets a bobbing marker.
    if (hover && shapes[hover]) {
      const box = bounds(shapes[hover]);
      const bob = reducedMotion.matches ? 0 : Math.round(Math.sin(time * 5) * 1.5);
      const top = Math.round(box.top) - 9 + bob;
      const mid = Math.round(box.x);
      for (let row = 0; row < 5; row += 1) for (let dx = -(4 - row); dx <= 4 - row; dx += 1) put(mid + dx, top + row, row === 4 || Math.abs(dx) === 4 - row ? [20, 22, 34] : [255, 255, 255]);
    }
  }

  // ---------- Camera ----------

  function mount() {
    const viewport = $('#island-view');
    const world = $('#island-world');
    const canvas = $('#island-canvas');
    const tip = $('#island-tip');
    if (!viewport || !canvas) return;
    const { t } = SiteI18n;
    const ctx = canvas.getContext('2d');
    canvas.width = W;
    canvas.height = H;
    const image = ctx.createImageData(W, H);
    const surface = { width: W, height: H, data: new Uint32Array(image.data.buffer), water: new Uint8Array(W * H) };
    const base = createSurface();
    const tiles = buildMap();
    let state = stateFrom({ hour: stockholmHour() });
    state.weatherOn = weatherEffectsOn();
    let scene = drawScene(base, { tiles, state });
    let hover = null;
    let frame = 0;
    let last = 0;
    const started = performance.now();
    const camera = { x: W / 2, y: H / 2, scale: 1 };
    let flight = null;

    viewport.hidden = false;
    $('#island-controls').hidden = false;
    // The shed opens the terminal, which needs JavaScript, so it's only listed now.
    $('[data-island-place="terminal"]').hidden = false;

    function redraw() {
      scene = drawScene(base, { tiles, state });
      viewport.style.setProperty('--island-sea', `rgb(${scene.colors.deep.join(' ')})`);
    }
    redraw();

    // ----- Live data -----
    const data = SiteShell.data;
    Promise.all([
      fetch('/ops/data.json', { cache: 'no-cache' }).then(response => (response.ok ? response.json() : null)).catch(() => null),
      data.nowPlaying().catch(() => []),
      data.weather().catch(() => ({ mood: null }))
    ]).then(([ops, playing, weather]) => {
      state = { ...stateFrom({ ops, playing, mood: weather.mood, hour: stockholmHour() }), weatherOn: weatherEffectsOn() };
      redraw();
      describePlaces(ops, playing);
      paint(performance.now());
    });

    function describePlaces(ops, playing) {
      const texts = {
        status: t({ on: N_('All systems operational'), flicker: N_('Partial outage'), off: N_('Major outage'), dim: N_('Monitoring starts with the first hourly check') }[state.lighthouse]),
        ops: t({ ok: N_('The last pipeline run passed'), fail: N_('The last pipeline run failed'), unknown: N_('No pipeline runs yet') }[state.beacon]),
        games: t('{n} in progress', { n: playing.length }),
        changelog: ops?.changelog?.[0] ? t('Latest: {text}', { text: ops.changelog[0].text }) : '',
        home: `${new Intl.DateTimeFormat(SiteI18n.locale, { timeZone: ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())} ${t('in Sweden')}`
      };
      for (const [id, text] of Object.entries(texts)) {
        const node = document.querySelector(`[data-island-state="${id}"]`);
        if (node && text) { node.textContent = text; node.hidden = false; }
      }
    }

    // ----- Camera -----
    const fit = () => Math.min(viewport.clientWidth / scene.frame.width, viewport.clientHeight / scene.frame.height);
    const limits = () => ({ min: fit() * 0.8, max: fit() * 6 });
    function apply() {
      const { min, max } = limits();
      camera.scale = Math.max(min, Math.min(max, camera.scale));
      camera.x = Math.max(0, Math.min(W, camera.x));
      camera.y = Math.max(0, Math.min(H, camera.y));
      const tx = viewport.clientWidth / 2 - camera.x * camera.scale;
      const ty = viewport.clientHeight / 2 - camera.y * camera.scale;
      world.style.transform = `translate(${tx}px, ${ty}px) scale(${camera.scale})`;
      if (hover) placeTip();
    }
    const ease = value => 1 - (1 - value) ** 3;
    function flyTo(target, duration, done) {
      if (reducedMotion.matches || !duration) { Object.assign(camera, target); apply(); done?.(); return; }
      flight = { from: { ...camera }, to: target, start: performance.now(), duration, done };
      wake();
    }
    function stepFlight(now) {
      if (!flight) return;
      const progress = Math.min(1, (now - flight.start) / flight.duration);
      const k = flight.easeIn ? progress ** 3 : ease(progress);
      for (const key of ['x', 'y', 'scale']) camera[key] = flight.from[key] + (flight.to[key] - flight.from[key]) * k;
      apply();
      if (progress === 1) { const { done } = flight; flight = null; done?.(); }
    }
    const home = () => ({ x: scene.frame.x, y: scene.frame.y, scale: fit() });

    // Fly in from high above when the page opens.
    camera.scale = fit() * 0.5;
    camera.x = scene.frame.x - 30;
    camera.y = scene.frame.y + 70;
    apply();
    flyTo(home(), 1600);

    // ----- Pointer: drag to pan, pinch or Ctrl + wheel to zoom, click a building to enter -----
    const pointers = new Map();
    let drag = null;
    const toBuffer = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      return [((clientX - rect.left) * W) / rect.width, ((clientY - rect.top) * H) / rect.height];
    };
    function zoomAround(clientX, clientY, factor) {
      const [bx, by] = toBuffer(clientX, clientY);
      const { min, max } = limits();
      const scale = Math.max(min, Math.min(max, camera.scale * factor));
      camera.x = bx - (bx - camera.x) * (camera.scale / scale);
      camera.y = by - (by - camera.y) * (camera.scale / scale);
      camera.scale = scale;
      apply();
    }

    viewport.addEventListener('pointerdown', event => {
      flight = null;
      pointers.set(event.pointerId, [event.clientX, event.clientY]);
      viewport.setPointerCapture(event.pointerId);
      drag = { x: event.clientX, y: event.clientY, cx: camera.x, cy: camera.y, moved: 0, pinch: pointers.size === 2 ? pinchDistance() : 0, scale: camera.scale };
    });
    function pinchDistance() {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a[0] - b[0], a[1] - b[1]);
    }
    viewport.addEventListener('pointermove', event => {
      if (pointers.has(event.pointerId)) pointers.set(event.pointerId, [event.clientX, event.clientY]);
      if (drag && pointers.size === 2 && drag.pinch) {
        const [a, b] = [...pointers.values()];
        zoomAround((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (drag.scale * (pinchDistance() / drag.pinch)) / camera.scale);
        drag.moved = 99;
        return;
      }
      if (drag && pointers.has(event.pointerId)) {
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
        if (drag.moved > 4) {
          viewport.classList.add('is-dragging');
          camera.x = drag.cx - dx / camera.scale;
          camera.y = drag.cy - dy / camera.scale;
          apply();
        }
        return;
      }
      setHover(hitTest(scene.shapes, ...toBuffer(event.clientX, event.clientY))?.id || null);
    });
    const release = event => {
      pointers.delete(event.pointerId);
      viewport.classList.remove('is-dragging');
      if (pointers.size === 0) {
        const tapped = drag && drag.moved <= 4;
        drag = null;
        if (tapped) {
          const b = hitTest(scene.shapes, ...toBuffer(event.clientX, event.clientY));
          if (b) enter(b);
        }
      }
    };
    viewport.addEventListener('pointerup', release);
    viewport.addEventListener('pointercancel', event => { pointers.delete(event.pointerId); drag = null; viewport.classList.remove('is-dragging'); });
    viewport.addEventListener('pointerleave', () => { if (!drag) setHover(null); });
    viewport.addEventListener('wheel', event => {
      if (!event.ctrlKey && !event.metaKey) {
        showHint();
        return;
      }
      event.preventDefault();
      zoomAround(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.002));
    }, { passive: false });

    let hintTimer = 0;
    function showHint() {
      const hint = $('#island-hint');
      hint.hidden = false;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => { hint.hidden = true; }, 1400);
    }

    // ----- Hover tip and the list of places -----
    function placeTip() {
      const shape = scene.shapes[hover];
      if (!shape) return;
      const box = bounds(shape);
      const rect = canvas.getBoundingClientRect();
      const view = viewport.getBoundingClientRect();
      const above = rect.top - view.top + ((box.top - 12) * rect.height) / H;
      const below = rect.top - view.top + ((box.bottom + 4) * rect.height) / H;
      const flip = above - tip.offsetHeight < 8;
      tip.classList.toggle('is-below', flip);
      tip.style.left = `${Math.max(8 + tip.offsetWidth / 2, Math.min(view.width - 8 - tip.offsetWidth / 2, rect.left - view.left + (box.x * rect.width) / W))}px`;
      tip.style.top = `${flip ? below : above}px`;
    }
    function setHover(id) {
      if (id === hover) return;
      hover = id;
      viewport.classList.toggle('is-pointing', Boolean(id));
      for (const item of document.querySelectorAll('[data-island-place]')) item.classList.toggle('is-active', item.dataset.islandPlace === id);
      const b = BUILDINGS.find(building => building.id === id);
      tip.hidden = !b;
      if (b) {
        const state = document.querySelector(`[data-island-state="${id}"]`);
        tip.replaceChildren(Object.assign(document.createElement('strong'), { textContent: t(b.label) }));
        if (state && !state.hidden) tip.append(Object.assign(document.createElement('span'), { textContent: state.textContent }));
        placeTip();
      }
      wake();
    }

    // Zoom into the building, then go there. The next page arrives with the site's view transition.
    function enter(b) {
      if (b.action === 'terminal') { SiteShell.openTerminal(); return; }
      const href = SiteI18n.path(b.href);
      if (reducedMotion.matches) { location.href = href; return; }
      const box = bounds(scene.shapes[b.id]);
      setHover(b.id);
      flight = { from: { ...camera }, to: { x: box.x, y: box.y, scale: limits().max }, start: performance.now(), duration: 520, easeIn: true, done: () => { location.href = href; } };
      wake();
    }

    for (const item of document.querySelectorAll('[data-island-place]')) {
      const b = BUILDINGS.find(building => building.id === item.dataset.islandPlace);
      if (!b) continue;
      const focus = () => {
        setHover(b.id);
        const box = bounds(scene.shapes[b.id]);
        if (!flight) flyTo({ x: box.x, y: box.y, scale: Math.max(camera.scale, fit() * 1.6) }, 600);
      };
      item.addEventListener('pointerenter', () => setHover(b.id));
      item.addEventListener('pointerleave', () => setHover(null));
      item.addEventListener('focusin', focus);
      item.addEventListener('focusout', () => setHover(null));
      const control = item.querySelector('a, button');
      control?.addEventListener('click', event => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        enter(b);
      });
    }

    $('#island-zoom-in').addEventListener('click', () => flyTo({ ...camera, scale: Math.min(limits().max, camera.scale * 1.5) }, 250));
    $('#island-zoom-out').addEventListener('click', () => flyTo({ ...camera, scale: Math.max(limits().min, camera.scale / 1.5) }, 250));
    $('#island-reset').addEventListener('click', () => flyTo(home(), 700));
    addEventListener('resize', () => { if (!flight) Object.assign(camera, { scale: Math.max(limits().min, Math.min(limits().max, camera.scale)) }); apply(); }, { passive: true });
    document.addEventListener('site:themechange', () => paint(performance.now()));
    document.addEventListener('site:weatherchange', event => { state.weatherOn = event.detail.on; wake(); });
    // Coming back with the back button: start from the overview again.
    addEventListener('pageshow', event => { if (event.persisted) { flight = null; Object.assign(camera, home()); apply(); } });

    // ----- Animation: 12 frames a second (it's pixel art), paused when hidden -----
    function paint(now) {
      drawOverlay(surface, base, scene, state, reducedMotion.matches ? 4 : (now - started) / 1000, hover);
      ctx.putImageData(image, 0, 0);
    }
    function loop(now) {
      frame = 0;
      stepFlight(now);
      if (now - last >= 1000 / FPS || flight) { last = now; paint(now); }
      if (!document.hidden && (!reducedMotion.matches || flight)) frame = requestAnimationFrame(loop);
    }
    function wake() {
      if (!frame) frame = requestAnimationFrame(loop);
      if (reducedMotion.matches) paint(performance.now());
    }
    document.addEventListener('visibilitychange', wake);
    reducedMotion.addEventListener('change', wake);
    wake();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  return Object.freeze({ ...shared, mount });
});
