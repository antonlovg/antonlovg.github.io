// Translations: every table row is complete and consistent, every page and script string has a
// Swedish and Norwegian translation, and translated pages keep their links in the right language.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import i18nApi from '../assets/i18n.js';
import { TABLES, SAME, CODES, pageEntries, uiEntries } from '../i18n/index.mjs';
import { translatePage, normalizeDictionary, parseHtml, localizeUrl, extractScriptStrings, SCRIPT_SOURCES, dictionaryScript } from '../scripts/lib/i18n.mjs';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const PAGE_FILES = { '/': 'index.html', '/games/': 'games/index.html', '/ops/': 'ops/index.html', '/status/': 'status/index.html', '/changelog/': 'changelog/index.html', '/privacy/': 'privacy/index.html', '/cookies/': 'cookies/index.html', '/island/': 'island/index.html' };
const BROWSER_SCRIPTS = SCRIPT_SOURCES.filter(file => !file.startsWith('scripts/'));
const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
// Links within the site and email links must survive; external links may point at a local-language version.
const hrefs = text => [...text.matchAll(/href="([^"]*)"/g)].map(match => match[1]).filter(href => href.startsWith('/') || href.startsWith('mailto:'));
const codes = text => [...text.matchAll(/<code>([^<]*)<\/code>/g)].map(match => match[1]);

test('every row has English, Swedish and Norwegian text, with no duplicate keys', () => {
  const seen = new Set(SAME);
  for (const [name, rows] of Object.entries(TABLES)) {
    for (const row of rows) {
      assert.equal(row.length, 3, `${name}: ${row[0]}`);
      assert.ok(row.every(text => typeof text === 'string' && text.trim()), `${name}: empty text in ${row[0]}`);
      assert.ok(!seen.has(row[0]), `${name}: duplicate key ${row[0]}`);
      seen.add(row[0]);
    }
  }
});

test('translations keep the placeholders, links and code of the English text', () => {
  for (const [name, rows] of Object.entries(TABLES)) {
    for (const [english, ...translations] of rows) {
      for (const translation of translations) {
        assert.deepEqual(placeholders(translation), placeholders(english), `${name}: placeholders in “${translation}”`);
        for (const href of hrefs(english)) assert.ok(hrefs(translation).includes(href), `${name}: link ${href} missing in “${translation}”`);
        assert.deepEqual(codes(translation).sort(), codes(english).sort(), `${name}: <code> in “${translation}”`);
        if (translation.includes('<')) assert.doesNotThrow(() => parseHtml(translation), `${name}: broken HTML in “${translation}”`);
        assert.doesNotMatch(translation, /<script|on\w+=|javascript:/i, `${name}: unsafe HTML in “${translation}”`);
      }
    }
  }
});

test('every page translates completely into Swedish and Norwegian', async () => {
  for (const code of CODES) {
    const dictionary = normalizeDictionary(pageEntries(code));
    for (const [base, file] of Object.entries(PAGE_FILES)) {
      const { html, missing } = translatePage(await read(file), { code, dictionary, pagePath: `/${file}` });
      assert.deepEqual(missing, [], `${code}${base}: untranslated text`);
      assert.match(html, new RegExp(`<html lang="${code}"`), `${code}${base}: lang`);
      assert.doesNotThrow(() => parseHtml(html), `${code}${base}: output HTML`);
      // Every link to a page in all languages points at this language; only hreflang links may not.
      const prefix = i18nApi.byCode(code).prefix;
      for (const [tag, href] of html.matchAll(/<a\b[^>]*\shref="(\/[^"]*)"[^>]*>/g)) {
        if (/hreflang=/.test(tag) || !i18nApi.pageOf(href.replace(/[?#].*$/, ''))) continue;
        assert.fail(`${code}${base}: link ${href} is still English`);
      }
      assert.ok(html.includes(`href="${prefix}/`), `${code}${base}: has localized links`);
      assert.doesNotMatch(html, /\s(?:src|href)="(?!\/|#|https?:|mailto:)[^"]+"/, `${code}${base}: relative URLs must be made absolute`);
    }
  }
});

test('every script string has a translation, and browser strings ship to the browser', async () => {
  for (const code of CODES) {
    const ui = new Map(uiEntries(code));
    const all = normalizeDictionary(pageEntries(code));
    const same = new Set(SAME);
    for (const file of SCRIPT_SOURCES) {
      const strings = extractScriptStrings(await read(file));
      assert.ok(strings.length, `${file}: found no strings (is the extractor broken?)`);
      for (const text of strings) {
        if (BROWSER_SCRIPTS.includes(file)) assert.ok(ui.has(text) || same.has(text), `${code} ${file}: “${text}” must be in i18n/ui.mjs`);
        else assert.ok(all.has(text), `${code} ${file}: “${text}” has no translation`);
      }
    }
  }
});

test('the extractor finds plain calls, N_ markers and both sides of a ternary', () => {
  const found = extractScriptStrings(`t('One'); N_('Two'); t(count === 1 ? '{n} game' : '{n} games', { n }); t(players === '1' ? 'a' : 'b'); t(variable);`);
  assert.deepEqual(found.sort(), ['One', 'Two', '{n} game', '{n} games', 'a', 'b'].sort());
});

test('links are localized only for pages that exist in every language', () => {
  assert.equal(i18nApi.localize('/games/?q=portal#all', 'sv'), '/sv/games/?q=portal#all');
  assert.equal(i18nApi.localize('/sv/games/', 'nb'), '/no/games/');
  assert.equal(i18nApi.localize('/no/', 'en'), '/');
  assert.equal(i18nApi.localize('/games/index.html', 'nb'), '/no/games/');
  for (const href of ['/wc2026/', '/assets/site.css', '/games/prices.json', '/changelog/feed.xml', '//evil.example/', 'https://example.com/', '#main', 'mailto:a@b.c']) {
    assert.equal(i18nApi.localize(href, 'sv'), href, href);
  }
  assert.deepEqual(i18nApi.split('/no/status/'), { lang: 'nb', base: '/status/' });
  assert.deepEqual(i18nApi.split('/sverige/'), { lang: 'en', base: '/sverige/' });
  assert.equal(localizeUrl('styles.css', '/games/index.html', 'sv'), '/games/styles.css');
  assert.equal(localizeUrl('https://lovgren.dev/ops/', '/ops/index.html', 'nb'), 'https://lovgren.dev/no/ops/');
});

test('translatePage reports gaps, keeps English blocks marked and escapes attributes', () => {
  const dictionary = normalizeDictionary([['Hello', 'Hej'], ['Say "hi"', 'Säg "hej"'], ['A <a href="/games/">link</a> here', 'En <a href="/games/">länk</a> här']]);
  const source = '<html lang="en"><body><p>Hello</p><button aria-label="Say &quot;hi&quot;">×</button><p>A <a href="/games/">link</a> here</p><div data-i18n="off"><p>Stays</p><a href="/ops/">Ops</a></div><p translate="no">Name</p><p>Missing</p></body></html>';
  const { html, missing } = translatePage(source, { code: 'sv', dictionary: normalizeDictionary([...dictionary, ['Say &quot;hi&quot;', 'Säg "hej"']]), pagePath: '/index.html' });
  assert.match(html, /<html lang="sv">/);
  assert.match(html, /<p>Hej<\/p>/);
  assert.match(html, /aria-label="Säg &quot;hej&quot;"/);
  assert.match(html, /En <a href="\/sv\/games\/">länk<\/a> här/);
  assert.match(html, /<div data-i18n="off" lang="en"><p>Stays<\/p><a href="\/sv\/ops\/">Ops<\/a><\/div>/);
  assert.match(html, /<p translate="no">Name<\/p>/);
  assert.deepEqual(missing, ['Missing']);
});

test('the browser dictionary is a plain, valid script', () => {
  const script = dictionaryScript('sv', [['Hi', 'Hej'], ['</script><b>', 'x']]);
  const context = {};
  new Function('globalThis', script)(context);
  assert.equal(context.SiteDictionaries.sv.Hi, 'Hej');
  assert.ok(Object.isFrozen(context.SiteDictionaries.sv));
});

test('SiteI18n.create translates with placeholders and falls back to English', () => {
  const sv = i18nApi.create('sv', { '{n} games': '{n} spel' });
  assert.equal(sv.t('{n} games', { n: 3 }), '3 spel');
  assert.equal(sv.t('Untranslated {x}', { x: 1 }), 'Untranslated 1');
  assert.equal(sv.t('{n} games', { other: 1 }), '{n} spel');
  assert.equal(sv.path('/ops/'), '/sv/ops/');
  assert.equal(i18nApi.create('nb').currency, 'NOK');
  assert.equal(i18nApi.create('sv').currency, 'EUR');
});
