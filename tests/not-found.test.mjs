// The 404 page's guesses: typos, other-language words, language prefixes and game searches.
import test from 'node:test';
import assert from 'node:assert/strict';
import notFound from '../assets/not-found.js';

const { suggest, distance, ROUTES } = notFound;
const first = path => suggest(path).routes[0]?.path;

test('typos and swapped letters still find the page', () => {
  assert.equal(first('/gmaes'), '/games/');
  assert.equal(first('/game'), '/games/');
  assert.equal(first('/chnagelog/'), '/changelog/');
  assert.equal(first('/privcy'), '/privacy/');
  assert.equal(first('/statsu'), '/status/');
  assert.equal(first('/islnad'), '/island/');
  assert.equal(first('/karta'), '/island/');
  assert.equal(distance('gmaes', 'games'), 1);
});

test('Swedish, Norwegian and related words point at the right page', () => {
  assert.equal(first('/spel'), '/games/');
  assert.equal(first('/spill'), '/games/');
  assert.equal(first('/integritet'), '/privacy/');
  assert.equal(first('/personvern'), '/privacy/');
  assert.equal(first('/dora'), '/ops/');
  assert.equal(first('/uptime'), '/status/');
  assert.equal(first('/vm'), '/wc2026/');
  assert.equal(first('/cookie.html'), '/cookies/');
});

test('language prefixes are ignored when guessing', () => {
  assert.equal(first('/sv/spel/'), '/games/');
  assert.equal(first('/no/statsu'), '/status/');
  assert.deepEqual(suggest('/sv/').routes.length, 0);
});

test('a path under /games/ becomes a library search that keeps the title', () => {
  assert.equal(suggest('/games/portal-2').search, 'portal 2');
  assert.equal(suggest('/games/It%20Takes%20Two').search, 'It Takes Two');
  assert.equal(suggest('/sv/spel/Stardew_Valley').search, 'Stardew Valley');
  // Markup and other characters are dropped.
  assert.equal(suggest('/games/%3Cscript%3Ealert(1)%3C%2Fscript%3E').search, 'scriptalert1 script');
  assert.equal(suggest('/ops/portal').search, '');
});

test('nonsense gets no guesses, and bad encodings do not throw', () => {
  assert.deepEqual(suggest('/xyzzy/qwerty').routes, []);
  assert.doesNotThrow(() => suggest('/%E0%A4%A'));
  assert.ok(suggest('/' + 'a'.repeat(5000)).routes.length <= 3);
});

test('every page on the site is listed', () => {
  assert.deepEqual(ROUTES.map(route => route.path).sort(), ['/', '/changelog/', '/cookies/', '/games/', '/island/', '/ops/', '/privacy/', '/status/', '/wc2026/']);
});
