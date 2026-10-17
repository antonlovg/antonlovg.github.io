// Translations for lovgren.dev. Each row is [English, Swedish, Norwegian Bokmål].
//   ui.mjs     text made by page scripts (SiteI18n.t) and the build-time renderers; shipped to the
//              browser as /assets/i18n/<code>.js
//   pages.mjs  text in the HTML pages, applied at build time (scripts/lib/i18n.mjs)
//   legal.mjs  the privacy and cookie policies
// Keys are English text with whitespace collapsed; HTML keys must match the page markup exactly.
// tests/i18n.test.mjs checks that every row is complete, that placeholders and tags match, and that
// every page and script string has a translation.
import ui from './ui.mjs';
import pages from './pages.mjs';
import legal from './legal.mjs';

export const CODES = ['sv', 'nb'];
const COLUMN = { sv: 1, nb: 2 };

// Names and text that read the same in every language.
export const SAME = ['AL', 'lovgren.dev', 'Anton Lövgren', 'GitHub', 'Lighthouse', 'Ops', 'Steam', 'Minesweeper',
  'GitHub Pages', 'GitHub Actions', 'Cloudflare Worker', 'Dependabot', 'git push', 'pipeline.yml', 'audit-site.mjs',
  'dependabot.yml', 'uptime.yml', 'check-uptime.mjs', 'site.js', 'fetch-prices.mjs', 'CNAME', 'Markdown'];

export const TABLES = { ui, pages, legal };

const pick = (rows, code) => rows.map(row => [row[0], row[COLUMN[code]]]);

// Strings for page scripts and renderers.
export const uiEntries = code => pick(ui, code);

// Everything the build may use to translate a page.
export const pageEntries = code => [...SAME.map(text => [text, text]), ...pick(ui, code), ...pick(pages, code), ...pick(legal, code)];
