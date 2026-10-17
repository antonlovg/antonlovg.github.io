// Build-time translation of the English source pages into the other site languages.
//
// The source pages stay plain English HTML. A small parser walks each page and looks up every
// "unit" in the dictionary (i18n/*.mjs, English → translation):
//   - an element that holds only text and inline formatting (a, strong, code, …) is one unit,
//     keyed by its inner HTML with whitespace collapsed, so a translation can reorder the words
//     around a link;
//   - otherwise each text node is its own unit (the "Pick a game" next to an icon);
//   - aria-label, placeholder, title, alt and the description/social <meta> values.
// script, style, svg, code, pre and kbd are never translated. data-i18n="off" keeps a block in
// English and marks it lang="en"; translate="no" keeps a block as is.
// Same-site page links are pointed at the page's language. Anything without a translation is
// reported, and the build (and the unit tests) fail on it.
import i18nApi from '../../assets/i18n.js';

const { LANGS, localize, byCode } = i18nApi;

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);
const SKIP = new Set(['script', 'style', 'svg', 'code', 'pre', 'kbd', 'textarea', 'template']);
const INLINE = new Set(['a', 'strong', 'em', 'b', 'i', 'code', 'kbd', 'small', 'abbr', 'time', 'span', 'br', 'sup', 'sub', 'mark', 'q', 'cite']);
const ATTRS = new Set(['aria-label', 'placeholder', 'title', 'alt']);
const META_KEYS = new Set(['description', 'og:title', 'og:description', 'og:image:alt', 'og:site_name', 'twitter:title', 'twitter:description']);
const URL_ATTRS = new Set(['href', 'src', 'action']);
const HAS_LETTERS = /\p{L}/u;

const collapse = text => text.replace(/\s+/g, ' ').trim();

// ---------- A strict little HTML parser for our own, well-formed pages ----------

const TOKEN = /<!--[\s\S]*?-->|<![^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseAttrs(source, offset) {
  const attrs = [];
  for (const match of source.matchAll(ATTR)) {
    const value = match[2] ?? match[3] ?? match[4] ?? null;
    let valueStart = -1;
    if (value !== null) {
      const quote = match[2] !== undefined ? '"' : match[3] !== undefined ? "'" : '';
      valueStart = offset + match.index + match[0].length - value.length - quote.length;
    }
    attrs.push({ name: match[1].toLowerCase(), value, valueStart, valueEnd: valueStart + (value?.length ?? 0) });
  }
  return attrs;
}

export function parseHtml(html) {
  const root = { type: 'root', children: [], start: 0, end: html.length };
  const stack = [root];
  let last = 0;
  const text = (start, end) => { if (end > start) stack.at(-1).children.push({ type: 'text', start, end }); };
  TOKEN.lastIndex = 0;
  let match;
  while ((match = TOKEN.exec(html))) {
    text(last, match.index);
    last = TOKEN.lastIndex;
    const [whole, closeName, openName, attrSource, selfClosing] = match;
    if (closeName) {
      const name = closeName.toLowerCase();
      const node = stack.pop();
      if (!node || node.name !== name) throw new Error(`Unexpected </${name}> at ${match.index} (open: <${node?.name}>)`);
      node.contentEnd = match.index;
      node.end = last;
      continue;
    }
    if (!openName) continue; // comment or doctype
    const name = openName.toLowerCase();
    const tagStart = match.index;
    const attrOffset = tagStart + 1 + openName.length;
    const node = { type: 'element', name, attrs: parseAttrs(attrSource, attrOffset), start: tagStart, tagEnd: last, contentStart: last, children: [], parent: stack.at(-1) };
    stack.at(-1).children.push(node);
    if (VOID.has(name) || selfClosing) { node.contentEnd = last; node.end = last; continue; }
    if (RAW.has(name)) {
      const close = html.toLowerCase().indexOf(`</${name}`, last);
      if (close === -1) throw new Error(`Unclosed <${name}>`);
      if (name === 'title' || name === 'textarea') node.children.push({ type: 'text', start: last, end: close });
      node.contentEnd = close;
      node.end = html.indexOf('>', close) + 1;
      TOKEN.lastIndex = last = node.end;
      continue;
    }
    stack.push(node);
  }
  text(last, html.length);
  if (stack.length !== 1) throw new Error(`Unclosed <${stack.at(-1).name}>`);
  return root;
}

const attr = (node, name) => node.attrs?.find(item => item.name === name);

// An element is one translation unit when everything inside it is text or inline formatting.
function inlineOnly(node) {
  return node.children.every(child => child.type === 'text' || (INLINE.has(child.name) && !attr(child, 'data-i18n') && inlineOnly(child)));
}

// ---------- Translation ----------

export function normalizeDictionary(entries) {
  const map = new Map();
  for (const [english, translation] of entries) map.set(collapse(english), translation);
  return map;
}

// Rewrites a URL for a page at pagePath in language code: relative paths become absolute and
// same-site pages point at the language. Absolute https://lovgren.dev URLs are localized too.
export function localizeUrl(value, pagePath, code, siteUrl = 'https://lovgren.dev') {
  if (!value || value.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(value) && !value.startsWith(siteUrl)) return value;
  if (value.startsWith(siteUrl)) return siteUrl + localize(value.slice(siteUrl.length) || '/', code);
  if (value.startsWith('//')) return value;
  const absolute = value.startsWith('/') ? value : new URL(value, `https://x${pagePath}`).pathname + (value.match(/[?#].*$/)?.[0] ?? '');
  return localize(absolute, code);
}

function localizeLinksIn(fragment, pagePath, code) {
  return fragment.replace(/(\s(?:href|src)=")([^"]*)"/g, (whole, prefix, value) => `${prefix}${localizeUrl(value, pagePath, code)}"`);
}

/**
 * Translates one page. pagePath is the page's English path ("/games/index.html").
 * Returns { html, missing } where missing lists English units without a translation.
 */
export function translatePage(html, { code, dictionary, pagePath }) {
  const tree = parseHtml(html);
  const edits = [];
  const missing = new Set();
  const lookup = key => (dictionary.has(key) ? dictionary.get(key) : (missing.add(key), null));
  const replace = (start, end, text) => edits.push({ start, end, text });

  function translateAttrs(node) {
    const isMeta = node.name === 'meta';
    const metaKey = isMeta && (attr(node, 'name')?.value || attr(node, 'property')?.value);
    for (const item of node.attrs) {
      if (item.value === null) continue;
      if (URL_ATTRS.has(item.name) && !attr(node, 'hreflang')) {
        const localized = localizeUrl(item.value, pagePath, code);
        if (localized !== item.value) replace(item.valueStart, item.valueEnd, localized);
        continue;
      }
          const translatable = ATTRS.has(item.name) || (isMeta && item.name === 'content' && META_KEYS.has(metaKey));
      if (!translatable || !HAS_LETTERS.test(item.value)) continue;
      const translated = lookup(collapse(item.value));
      if (translated !== null) replace(item.valueStart, item.valueEnd, translated.replace(/"/g, '&quot;'));
    }
  }

  function translateText(node) {
    const raw = html.slice(node.start, node.end);
    const key = collapse(raw);
    if (!HAS_LETTERS.test(key)) return;
    const translated = lookup(key);
    if (translated === null) return;
    const lead = raw.match(/^\s*/)[0];
    const trail = raw.match(/\s*$/)[0];
    replace(node.start, node.end, `${lead}${translated}${trail}`);
  }

  function localizeLinks(node) {
    for (const item of node.attrs || []) {
      if (!URL_ATTRS.has(item.name) || item.value === null || attr(node, 'hreflang')) continue;
      const localized = localizeUrl(item.value, pagePath, code);
      if (localized !== item.value) replace(item.valueStart, item.valueEnd, localized);
    }
    if (!SKIP.has(node.name)) node.children?.forEach(child => child.type === 'element' && localizeLinks(child));
  }

  function walk(node) {
    if (node.type === 'text') { translateText(node); return; }
    if (node.type === 'element') {
      if (node.name === 'html') {
        const lang = attr(node, 'lang');
        if (lang) replace(lang.valueStart, lang.valueEnd, code);
      }
      if (attr(node, 'data-i18n')?.value === 'off') {
        // Kept in English, but its links still lead to pages in the visitor's language.
        edits.push({ start: node.tagEnd - 1, end: node.tagEnd - 1, text: ' lang="en"' });
        localizeLinks(node);
        return;
      }
      if (attr(node, 'translate')?.value === 'no') return;
      translateAttrs(node);
      if (SKIP.has(node.name)) return;
      if (node.children.length && inlineOnly(node) && node.name !== 'html') {
        const inner = html.slice(node.contentStart, node.contentEnd);
        const key = collapse(inner);
        if (!HAS_LETTERS.test(key.replace(/<[^>]*>/g, ''))) return;
        const hasElements = node.children.some(child => child.type === 'element');
        const hasText = node.children.some(child => child.type === 'text' && html.slice(child.start, child.end).trim());
        // Only text, or elements side by side with no text of their own: translate the parts separately.
        if (!hasElements || !hasText) { node.children.forEach(walk); return; }
        const translated = lookup(key);
        if (translated !== null) replace(node.contentStart, node.contentEnd, localizeLinksIn(translated, pagePath, code));
        return;
      }
    }
    node.children.forEach(walk);
  }

  walk(tree);
  edits.sort((a, b) => b.start - a.start);
  let output = html;
  let floor = Infinity;
  for (const edit of edits) {
    if (edit.end > floor) throw new Error(`Overlapping translation edits at ${edit.start}`);
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    floor = edit.start;
  }
  return { html: output, missing: [...missing] };
}

// <link rel="alternate" hreflang> for every language plus x-default.
export function alternateLinks(basePath, siteUrl = 'https://lovgren.dev') {
  return [...LANGS.map(lang => `<link rel="alternate" hreflang="${lang.code}" href="${siteUrl}${localize(basePath, lang.code)}">`),
    `<link rel="alternate" hreflang="x-default" href="${siteUrl}${basePath}">`];
}

// The browser dictionary for one language, loaded before /assets/i18n.js.
export function dictionaryScript(code, entries) {
  const object = Object.fromEntries(entries.map(([english, translation]) => [english, translation]));
  return `// Generated by scripts/build-site.mjs from i18n/*.mjs. ${byCode(code).label} strings for page scripts.\n(globalThis.SiteDictionaries ||= {})[${JSON.stringify(code)}] = Object.freeze(${JSON.stringify(object)});\n`;
}

export function addDictionaryScript(html, code) {
  const tag = '<script src="/assets/i18n.js" defer></script>';
  if (!html.includes(tag)) throw new Error('Page does not load /assets/i18n.js');
  return html.replace(tag, `<script src="/assets/i18n/${code}.js" defer></script>\n  ${tag}`);
}

// ---------- Strings used by scripts ----------

// The JavaScript files whose t('…') and N_('…') strings must all be translated.
export const SCRIPT_SOURCES = ['assets/site.js', 'assets/not-found.js', 'home.js', 'ops/ops.js', 'games/app.js', 'games/shared-library.js', 'scripts/lib/render.mjs', 'scripts/lib/html.mjs', 'scripts/make-og.mjs'];

const LITERAL = String.raw`'((?:\\.|[^'\\])*)'`;
const CALLS = [
  new RegExp(String.raw`\b(?:t|N_)\(\s*${LITERAL}`, 'g'),
  // t(count === 1 ? 'one' : 'many', …)
  new RegExp(String.raw`\bt\(\s*(?:[^'"\x60()?]|'[^']*')*?\?\s*${LITERAL}\s*:\s*${LITERAL}`, 'g')
];

const unescape = text => text.replace(/\\(.)/g,(whole, character) => ({ n: '\n', t: '\t' })[character] ?? character);

export function extractScriptStrings(source) {
  const found = new Set();
  for (const pattern of CALLS) {
    for (const match of source.matchAll(pattern)) match.slice(1).filter(value => value !== undefined).forEach(value => found.add(unescape(value)));
  }
  return [...found];
}
