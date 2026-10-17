// Every page must share the same shell (header + navigation) and follow the same security rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const PAGES = {
  'index.html': '/',
  'games/index.html': '/games/',
  'wc2026/index.html': '/wc2026/',
  'privacy/index.html': null,
  'cookies/index.html': null,
  '404.html': null
};

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const pages = Object.fromEntries(await Promise.all(Object.keys(PAGES).map(async file => [file, await read(file)])));

function navBlock(html) {
  const match = html.match(/<nav class="site-nav" aria-label="Main">[\s\S]*?<\/nav>/);
  assert.ok(match, 'missing main navigation');
  return match[0];
}

function csp(html) {
  const match = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  assert.ok(match, 'missing Content-Security-Policy');
  return Object.fromEntries(match[1].split(';').map(part => part.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));
}

test('every page has exactly one shared header with identical navigation', () => {
  const canonical = navBlock(pages['index.html']).replace(' aria-current="page"', '');
  for (const [file, html] of Object.entries(pages)) {
    assert.equal(html.match(/<header class="site-bar">/g)?.length, 1, `${file}: header count`);
    assert.equal(navBlock(html).replace(' aria-current="page"', ''), canonical, `${file}: navigation differs`);
    assert.match(html, /<a class="site-logo" href="\/">/, `${file}: logo must link home`);
  }
});

test('the current page is marked in the navigation', () => {
  for (const [file, current] of Object.entries(PAGES)) {
    const marked = [...navBlock(pages[file]).matchAll(/<a href="([^"]+)" aria-current="page">/g)].map(match => match[1]);
    assert.deepEqual(marked, current ? [current] : [], `${file}: aria-current`);
  }
});

test('every page loads the shared theme, shell styles and shell script', () => {
  for (const [file, html] of Object.entries(pages)) {
    const theme = html.indexOf('<script src="/assets/theme.js"></script>');
    const styles = html.indexOf('<link rel="stylesheet" href="/assets/site.css">');
    assert.ok(theme > 0, `${file}: theme.js must load without defer`);
    assert.ok(styles > theme, `${file}: theme.js must run before styles to avoid a flash`);
    assert.match(html, /<script src="\/assets\/site\.js" defer><\/script>/, `${file}: site.js`);
    assert.match(html, /<link rel="icon" href="\/assets\/favicon\.svg"/, `${file}: favicon`);
  }
});

test('every page has a strict Content-Security-Policy', () => {
  for (const [file, html] of Object.entries(pages)) {
    const policy = csp(html);
    assert.deepEqual(policy['default-src'], ["'self'"], `${file}: default-src`);
    assert.deepEqual(policy['object-src'], ["'none'"], `${file}: object-src`);
    assert.deepEqual(policy['base-uri'], ["'self'"], `${file}: base-uri`);
    assert.ok(policy['script-src'], `${file}: script-src`);
    for (const value of policy['script-src']) {
      assert.ok(["'self'", "'inline-speculation-rules'"].includes(value), `${file}: unexpected script source ${value}`);
    }
    assert.ok(!Object.values(policy).flat().includes("'unsafe-eval'"), `${file}: unsafe-eval`);
    if (file !== 'wc2026/index.html') assert.ok(!policy['style-src'].includes("'unsafe-inline'"), `${file}: unsafe-inline styles`);
  }
});

test('no inline event handlers or inline scripts (except speculation rules)', () => {
  for (const [file, html] of Object.entries(pages)) {
    assert.doesNotMatch(html, /\son[a-z]+\s*=\s*["']/i, `${file}: inline event handler`);
    assert.doesNotMatch(html, /javascript:/i, `${file}: javascript: URL`);
    for (const [tag] of html.matchAll(/<script\b[^>]*>/g)) {
      assert.ok(/\bsrc="/.test(tag) || tag === '<script type="speculationrules">', `${file}: inline script ${tag}`);
    }
  }
});

test('speculation rules are valid JSON and only prerender same-site pages', () => {
  for (const [file, html] of Object.entries(pages)) {
    const match = html.match(/<script type="speculationrules">([\s\S]*?)<\/script>/);
    assert.ok(match, `${file}: speculation rules`);
    const rules = JSON.parse(match[1]);
    const where = JSON.stringify(rules.prerender[0].where);
    assert.match(where, /"href_matches":"\/\*"/, `${file}: rules must be same-origin paths`);
  }
});

test('every page has a skip link to an element that exists', () => {
  for (const [file, html] of Object.entries(pages)) {
    const target = html.match(/<a class="skip-link" href="#([\w-]+)">/)?.[1];
    assert.ok(target, `${file}: skip link`);
    assert.match(html, new RegExp(`id="${target}"`), `${file}: skip link target #${target}`);
  }
});
