import test from 'node:test';
import assert from 'node:assert/strict';
import urlState from '../url-state.js';

const { parse, build, sameState } = urlState;
const BASE = 'https://lovgren.dev/games/';

test('parses a full shareable link', () => {
  assert.deepEqual(parse(`${BASE}?q=portal&genre=Puzzle&players=2&priority=1&sale=1#in-progress`), {
    view: 'in-progress', q: 'portal', genre: 'Puzzle', players: '2', priority: true, sale: '1'
  });
});

test('defaults when nothing is set, and keeps old #view links working', () => {
  assert.deepEqual(parse(BASE), { view: 'to-play', q: '', genre: '', players: '', priority: false, sale: '' });
  assert.equal(parse(`${BASE}?sale=yes`).sale, '');
  assert.equal(parse(`${BASE}?sale=50`).sale, '50');
  assert.equal(parse(`${BASE}?sale=40`).sale, '');
  assert.equal(parse(`${BASE}#played`).view, 'played');
  assert.equal(parse(`${BASE}#all`).view, 'all');
});

test('rejects unknown or hostile values', () => {
  const state = parse(`${BASE}?players=99&priority=yes&q=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E#%3Cscript%3E`);
  assert.equal(state.view, 'to-play');
  assert.equal(state.players, '');
  assert.equal(state.priority, false);
  // Text is kept as plain text (the app only puts it in an input's value), but length-limited and without control characters.
  assert.equal(state.q, '<img src=x onerror=alert(1)>');
  assert.equal(parse(`${BASE}?q=${'a'.repeat(500)}`).q.length, 100);
  assert.equal(parse(`${BASE}?genre=a%00b%0Ac`).genre, 'abc');
  assert.equal(parse(`${BASE}#%E0%A4%A`).view, 'to-play');
  assert.equal(parse('not a url').view, 'to-play');
});

test('builds compact URLs and round-trips', () => {
  assert.equal(build(BASE, { view: 'to-play', q: '', genre: '', players: '', priority: false }), '/games/');
  const state = { view: 'in-progress', q: 'it takes two', genre: 'Puzzle', players: '2', priority: true, sale: '50' };
  const href = build(BASE, state);
  assert.equal(href, '/games/?q=it+takes+two&genre=Puzzle&players=2&priority=1&sale=50#in-progress');
  assert.ok(sameState(parse(new URL(href, BASE).href), state));
});

test('build drops invalid values and keeps unrelated parameters', () => {
  assert.equal(build(`${BASE}?ref=home&q=old`, { view: 'bogus', q: '  ', genre: '', players: '7', priority: false }), '/games/?ref=home');
});
