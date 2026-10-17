// The 404 page: guesses what the visitor meant from the address they tried.
// suggest() is pure and unit-tested; in the browser the page is also shown in the language of the
// address (/sv/…, /no/…), since GitHub Pages has a single 404 page for the whole site.
(function attachNotFound(root, createApi) {
  const api = createApi();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NotFound = api;
  if (root.document && root.SiteI18n) api.mount();
})(globalThis, () => {
  const N_ = text => text;
  N_('Games'); // a navigation label, translated from the page
  // Every page, with words people might type for it (English, Swedish, Norwegian).
  const ROUTES = [
    { path: '/', label: N_('Home'), words: ['home', 'index', 'start', 'hem', 'hjem', 'about', 'om'] },
    { path: '/games/', label: N_('Game library'), words: ['games', 'game', 'spel', 'spill', 'library', 'bibliotek', 'backlog', 'secret', 'steam', 'wheel'] },
    { path: '/ops/', label: N_('Ops dashboard'), words: ['ops', 'dora', 'metrics', 'pipeline', 'ci', 'cd', 'deploy', 'deploys', 'dashboard', 'architecture'] },
    { path: '/status/', label: N_('Status'), words: ['status', 'uptime', 'health', 'monitor', 'drift', 'incidents'] },
    { path: '/island/', label: N_('The island'), words: ['island', 'map', 'explore', 'pixel', 'karta', 'kart', 'øya', 'oya'] },
    { path: '/changelog/', label: N_('Changelog'), words: ['changelog', 'changes', 'news', 'log', 'releases', 'history', 'rss', 'andringar', 'endringer'] },
    { path: '/privacy/', label: N_('Privacy policy'), words: ['privacy', 'gdpr', 'integritet', 'integritetspolicy', 'personvern', 'policy'] },
    { path: '/cookies/', label: N_('Cookie policy'), words: ['cookies', 'cookie', 'kakor', 'informasjonskapsler'] },
    { path: '/wc2026/', label: N_('World Cup 2026'), words: ['wc2026', 'wc', 'worldcup', 'world', 'cup', 'vm', 'fotboll', 'fotball', 'football', 'soccer'] }
  ];

  // Edit distance where swapping two neighbouring letters ("gmaes") counts as one typo.
  function distance(a, b) {
    if (a === b) return 0;
    const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) rows[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
    return rows[a.length][b.length];
  }

  const LANG_PREFIX = /^\/(sv|no)(?=\/|$)/;

  // pathname → { routes: up to 3 likely pages, search: a game-library query or '' }
  function suggest(pathname) {
    let original = '';
    try { original = decodeURIComponent(String(pathname)); } catch { original = String(pathname); }
    original = original.replace(LANG_PREFIX, '').replace(/\/index\.html?$|\.html?$/i, '');
    const kept = original.split('/').filter(Boolean).slice(0, 6);
    const segments = kept.map(segment => segment.toLowerCase());
    const tokens = segments.flatMap(segment => segment.split(/[-_.\s+]+/)).filter(token => token.length > 1 && token.length < 40);

    const scored = ROUTES.map(route => {
      let best = Infinity;
      for (const token of tokens) {
        for (const word of route.words) {
          const allowed = Math.max(1, Math.floor(word.length / 3));
          const d = distance(token, word);
          if (d <= allowed) best = Math.min(best, d / word.length);
        }
      }
      return { route, score: best };
    }).filter(item => item.score < Infinity).sort((a, b) => a.score - b.score);

    // /games/portal-2 → search the library for "portal 2".
    let search = '';
    const first = segments[0] || '';
    const gamesRoute = ROUTES[1];
    if (segments.length > 1 && gamesRoute.words.some(word => distance(first, word) <= 1)) {
      search = kept.slice(1).join(' ').replace(/[-_+.]+/g, ' ').replace(/[^\p{L}\p{N} :'&!]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    }
    return { routes: scored.slice(0, 3).map(item => item.route), search };
  }

  function mount() {
    const { t, path: localize } = globalThis.SiteI18n;
    const $ = selector => document.querySelector(selector);
    const el = (tag, attrs = {}, text = '') => {
      const node = document.createElement(tag);
      for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
      if (text) node.textContent = text;
      return node;
    };

    // The static page is English; translate it for /sv/ and /no/ addresses.
    document.title = t('Page not found · lovgren.dev');
    for (const link of document.querySelectorAll('.site-nav a, .site-logo')) {
      link.setAttribute('href', localize(link.getAttribute('href')));
      const label = [...link.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
      if (label) label.textContent = t(label.textContent.trim());
    }
    $('.site-logo .sr-only').textContent = t(', home');
    $('.site-nav').setAttribute('aria-label', t('Main'));
    $('.skip-link').textContent = t('Skip to content');
    $('#nf-eyebrow').textContent = t('error 404');
    $('#nf-title').textContent = t('That page doesn’t exist');

    // Shown decoded and as plain text; long addresses are shortened.
    let requested = location.pathname;
    try { requested = decodeURIComponent(requested); } catch { /* keep it encoded */ }
    if (requested.length > 120) requested = `${requested.slice(0, 119)}…`;
    $('#nf-path').replaceChildren(t('There’s nothing at'), ' ', el('code', {}, requested), '.');

    const { routes, search } = suggest(location.pathname);
    const list = $('#nf-suggestions');
    const item = (href, label, hint) => {
      const link = el('a', { href, class: 'nf-link' }, label);
      if (hint) link.append(el('span', { class: 'nf-hint' }, hint));
      const li = el('li');
      li.append(link);
      return li;
    };
    if (search) list.append(item(`${localize('/games/')}?q=${encodeURIComponent(search)}#all`, t('Search the game library for “{query}”', { query: search }), localize('/games/')));
    // A library search already leads to the library, so it isn't suggested twice.
    for (const route of routes) if (!(search && route.path === '/games/')) list.append(item(localize(route.path), t(route.label), localize(route.path)));
    $('#nf-suggest').hidden = list.children.length === 0;
    $('#nf-suggest-title').textContent = t('Did you mean…');

    $('#nf-pages-title').textContent = t('Everything on this site');
    $('#nf-pages').replaceChildren(...ROUTES.map(route => item(localize(route.path), t(route.label))));

    const terminal = $('#nf-terminal');
    terminal.replaceChildren(t('Or look around in the terminal:'), ' ');
    const open = el('button', { type: 'button', class: 'btn btn-secondary nf-terminal-button' }, t('Open the terminal'));
    open.addEventListener('click', () => globalThis.SiteShell?.openTerminal());
    terminal.append(open);
    terminal.hidden = false;
    $('#nf-home').replaceChildren(el('a', { href: localize('/') }, t('Go to the homepage')));
  }

  return { ROUTES, distance, suggest, mount };
});
