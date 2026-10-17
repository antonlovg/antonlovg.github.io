// The island (/island/): layout, rasterizer, live state and hit-testing.
import test from 'node:test';
import assert from 'node:assert/strict';
import island from '../island/island.js';
import i18nApi from '../assets/i18n.js';

const { BUILDINGS, W, H, landAt, buildMap, stateFrom, createSurface, fillPoly, drawScene, hitTest, bounds, project } = island;
const tiles = buildMap();
const tileAt = (x, y) => tiles.find(tile => tile.x === x && tile.y === y);

test('every page has a building, and the World Cup archive and terminal have one too', () => {
  const pages = BUILDINGS.map(b => b.href).filter(Boolean);
  for (const page of i18nApi.PAGES.filter(page => page !== '/island/')) assert.ok(pages.includes(page), `${page} has no building`);
  assert.ok(pages.includes('/wc2026/'));
  assert.ok(BUILDINGS.some(b => b.action === 'terminal'));
});

test('buildings stand on land, never on each other, and a path or bridge leads to every door', () => {
  const taken = new Map();
  for (const b of BUILDINGS) {
    for (let x = b.x; x < b.x + b.w; x += 1) {
      for (let y = b.y; y < b.y + b.d; y += 1) {
        assert.ok(landAt(x, y), `${b.id}: tile ${x},${y} is in the sea`);
        assert.ok(!taken.has(`${x},${y}`), `${b.id} overlaps ${taken.get(`${x},${y}`)}`);
        taken.set(`${x},${y}`, b.id);
      }
    }
    const door = tileAt(...b.door);
    assert.ok(['path', 'bridge'].includes(door.type) || b.id === 'home', `${b.id}: door ${b.door} is ${door.type}`);
  }
  assert.ok(tiles.filter(tile => tile.type === 'bridge').length >= 2, 'the stadium islet needs a bridge');
});

test('live data becomes lights: the lighthouse, the beacon and the arcade windows', () => {
  const ops = overall => ({ uptime: { overall }, lastRun: { conclusion: 'success' } });
  assert.equal(stateFrom({ ops: ops('operational') }).lighthouse, 'on');
  assert.equal(stateFrom({ ops: ops('degraded') }).lighthouse, 'flicker');
  assert.equal(stateFrom({ ops: ops('outage') }).lighthouse, 'off');
  assert.equal(stateFrom({}).lighthouse, 'dim');
  assert.equal(stateFrom({ ops: ops('operational') }).beacon, 'ok');
  assert.equal(stateFrom({ ops: { lastRun: { conclusion: 'failure' } } }).beacon, 'fail');
  assert.equal(stateFrom({}).beacon, 'unknown');
  assert.equal(stateFrom({ playing: [1, 2, 3] }).playing, 3);
  assert.equal(stateFrom({ playing: Array(20).fill(0) }).playing, 8);
  assert.equal(stateFrom({ hour: 23 }).phase, 'night');
  assert.equal(stateFrom({ hour: 13 }).phase, 'day');
  assert.equal(stateFrom({ hour: 3, mood: { phase: 'twilight', kind: 'snow', intensity: 1, wind: 2 } }).phase, 'twilight');
});

test('the rasterizer fills an isometric tile exactly, with no anti-aliasing', () => {
  const surface = createSurface(64, 32);
  const corners = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => project(x, y)).map(([x, y]) => [x - 240 + 32, y - 82 + 8]);
  fillPoly(surface, corners, [255, 0, 0]);
  const red = [...surface.data].filter(value => value === 0xff0000ff).length;
  assert.equal(red, 64); // a 16×8 diamond covers half its box
  assert.ok([...surface.data].every(value => value === 0 || value === 0xff0000ff), 'only fully filled pixels');
  // Two neighbouring tiles share an edge without overlapping or leaving a gap.
  const half = createSurface(64, 32);
  for (const dx of [0, 1]) fillPoly(half, [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => project(x + dx, y)).map(([x, y]) => [x - 240 + 24, y - 82 + 6]), [0, 0, 255], { alpha: 0.5 });
  const values = new Set([...half.data].filter(Boolean));
  assert.equal(values.size, 1, 'no pixel was painted twice');
});

test('the scene draws every building inside the picture, and a click finds it', () => {
  const surface = createSurface();
  const { shapes, frame } = drawScene(surface, { tiles, state: stateFrom({ hour: 12 }) });
  for (const b of BUILDINGS) {
    const box = bounds(shapes[b.id]);
    assert.ok(box.left >= 0 && box.right <= W && box.top >= 0 && box.bottom <= H, `${b.id} is outside the picture`);
    // Somewhere low on the building (its walls) is always that building.
    const [x, y] = project(b.x + b.w * 0.9, b.y + b.d * 0.9, 8);
    assert.equal(hitTest(shapes, x, y)?.id, b.id, `${b.id} can't be clicked`);
  }
  assert.equal(hitTest(shapes, 2, 2), null, 'open sea is nothing');
  assert.ok(frame.width < W && frame.height < H, 'the camera frames the island, not the empty sea');
});
