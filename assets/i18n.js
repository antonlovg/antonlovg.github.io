// Site languages, shared by the browser and the build (scripts/lib/i18n.mjs).
// English is the source language at /; Swedish lives under /sv/ and Norwegian (Bokmål) under /no/.
// Pages are translated at build time. Text made by scripts goes through SiteI18n.t(english, vars):
// the build ships each language's dictionary as /assets/i18n/<code>.js, loaded before this file.
(function attachI18n(root, createApi) {
  const api = createApi(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SiteI18n = api;
})(globalThis, root => {
  const LANGS = Object.freeze([
    Object.freeze({ code: 'en', prefix: '', locale: 'en-GB', label: 'English', short: 'EN', currency: 'EUR' }),
    Object.freeze({ code: 'sv', prefix: '/sv', locale: 'sv-SE', label: 'Svenska', short: 'SV', currency: 'EUR' }),
    Object.freeze({ code: 'nb', prefix: '/no', locale: 'nb-NO', label: 'Norsk', short: 'NO', currency: 'NOK' })
  ]);
  // Pages that exist in every language. Everything else (the World Cup archive, files) is English only.
  const PAGES = Object.freeze(['/', '/games/', '/ops/', '/status/', '/changelog/', '/privacy/', '/cookies/']);

  const byCode = code => LANGS.find(lang => lang.code === code) || LANGS[0];

  // "/sv/games/" → { lang: 'sv', base: '/games/' }
  function split(pathname) {
    for (const lang of LANGS) {
      if (lang.prefix && (pathname === lang.prefix || pathname.startsWith(`${lang.prefix}/`))) {
        return { lang: lang.code, base: pathname.slice(lang.prefix.length) || '/' };
      }
    }
    return { lang: 'en', base: pathname };
  }

  const pageOf = base => {
    const path = base.replace(/index\.html$/, '');
    return PAGES.includes(path) ? path : null;
  };

  // Points a same-site page link at the given language; anything else is returned unchanged.
  function localize(href, code) {
    const value = String(href);
    if (!value.startsWith('/') || value.startsWith('//')) return value;
    const match = value.match(/^([^?#]*)(.*)$/);
    const { base } = split(match[1]);
    const page = pageOf(base);
    if (!page) return value;
    return `${byCode(code).prefix}${page}${match[2]}`;
  }

  function interpolate(text, vars) {
    if (!vars) return text;
    return String(text).replace(/\{(\w+)\}/g, (whole, name) => (Object.hasOwn(vars, name) ? String(vars[name]) : whole));
  }

  function create(code, dictionary = {}) {
    const lang = byCode(code);
    const t = (text, vars) => interpolate(Object.hasOwn(dictionary, text) ? dictionary[text] : text, vars);
    return Object.freeze({
      lang: lang.code,
      locale: lang.locale,
      currency: lang.currency,
      info: lang,
      t,
      path: href => localize(href, lang.code)
    });
  }

  const shared = { LANGS, PAGES, byCode, split, pageOf, localize, interpolate, create };
  if (typeof document === 'undefined' || !root.document) return Object.freeze(shared);

  // The 404 page is shared by all languages, so it takes its language from the address.
  const html = document.documentElement;
  if (html.hasAttribute('data-lang-from-path')) html.lang = split(location.pathname).lang;
  const code = byCode(html.lang).code;
  const current = create(code, (root.SiteDictionaries || {})[code]);
  return Object.freeze({ ...shared, ...current, base: split(location.pathname).base });
});
