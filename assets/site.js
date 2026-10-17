// lovgren.dev shell behaviour, shared by every page:
// theme menu, the terminal button (lovsh loads on first use), keyboard shortcuts, the Konami code,
// and shared data loaders.
// Builds its own controls so visitors without JavaScript never see dead buttons.
// Everything is same-origin; all text is inserted with textContent.
(() => {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    system: ['M4 5h16v11H4z', 'M9 20h6M12 16v4'],
    light: ['M12 4V2M12 22v-2M4.9 4.9 3.5 3.5M20.5 20.5l-1.4-1.4M4 12H2M22 12h-2M4.9 19.1l-1.4 1.4M20.5 3.5l-1.4 1.4', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],
    dark: ['M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z']
  };
  const THEME_LABELS = { system: 'System', light: 'Light', dark: 'Dark', ocean: 'Ocean', ember: 'Ember' };

  const $ = selector => document.querySelector(selector);

  function el(tag, { className = '', text = '', attrs = {} } = {}, ...children) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    node.append(...children);
    return node;
  }

  function icon(name) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    for (const d of ICONS[name] || ICONS.system) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      svg.append(path);
    }
    return svg;
  }

  // ---------- Shared data (cached) ----------

  const cache = new Map();
  function getJson(url) {
    if (!cache.has(url)) {
      cache.set(url, fetch(url, { cache: 'no-cache', credentials: 'same-origin' }).then(response => {
        if (!response.ok) throw new Error(`${url} returned ${response.status}`);
        return response.json();
      }).catch(error => { cache.delete(url); throw error; }));
    }
    return cache.get(url);
  }

  // Only covers on Steam's image CDN are used (the homepage CSP allows just that host).
  function steamCover(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname.endsWith('.steamstatic.com') ? url.href : '';
    } catch {
      return '';
    }
  }

  async function nowPlaying() {
    try {
      const data = await getJson('/now-playing.json');
      return (data.games || []).map(game => ({ ...game, cover: steamCover(game.cover) }));
    } catch {
      // Before the pipeline's first deploy (or in a local preview): read the library directly.
      const library = await getJson('/games/shared-library.json');
      return library.games.filter(game => game.status === 'in-progress').slice(0, 8)
        .map(game => ({ title: game.title, genre: (game.genre || '').split(',')[0].trim(), players: game.players || '', cover: steamCover(game.coverUrl) }));
    }
  }

  const status = () => getJson('/status.json');

  function timeAgo(iso) {
    const seconds = (Date.parse(iso) - Date.now()) / 1000;
    if (Number.isNaN(seconds)) return 'unknown time';
    const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
    const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    for (const [unit, size] of units) {
      if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
    }
    return 'just now';
  }

  // ---------- Theme menu ----------

  const actions = $('.site-actions');
  const showThemeSwitch = document.documentElement.dataset.forceScheme !== 'dark' && globalThis.SiteTheme;

  function buildThemeMenu() {
    const button = el('button', { className: 'shell-button theme-button', attrs: { type: 'button', id: 'theme-button', popovertarget: 'theme-menu', 'aria-haspopup': 'true' } });
    const menu = el('div', { className: 'theme-menu', attrs: { id: 'theme-menu', popover: '', 'aria-label': 'Theme' } }, el('p', { text: 'Theme', attrs: { 'aria-hidden': 'true' } }));
    for (const preference of ['system', 'light', 'dark']) {
      const option = el('button', { className: 'theme-option', attrs: { type: 'button', 'data-theme-option': preference, 'aria-checked': 'false', role: 'menuitemradio' } }, icon(preference), THEME_LABELS[preference]);
      option.addEventListener('click', () => { SiteTheme.set(preference); menu.hidePopover(); button.focus(); });
      menu.append(option);
    }
    menu.setAttribute('role', 'menu');
    menu.addEventListener('keydown', event => {
      const options = [...menu.querySelectorAll('.theme-option')];
      const index = options.indexOf(document.activeElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        options[(index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length].focus();
      }
    });
    menu.addEventListener('toggle', event => {
      if (event.newState !== 'open') return;
      const rect = button.getBoundingClientRect();
      menu.style.top = `${Math.round(rect.bottom + 8)}px`;
      menu.style.left = `${Math.round(Math.max(8, Math.min(rect.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8)))}px`;
      (menu.querySelector('[aria-checked="true"]') || menu.querySelector('.theme-option')).focus();
    });
    function sync() {
      const preference = SiteTheme.preference;
      const shown = ICONS[preference] ? preference : 'dark';
      button.replaceChildren(icon(shown), el('span', { className: 'sr-only', text: `Theme: ${THEME_LABELS[preference]}` }));
      button.title = `Theme: ${THEME_LABELS[preference]}`;
      for (const option of menu.querySelectorAll('.theme-option')) option.setAttribute('aria-checked', String(option.dataset.themeOption === preference));
    }
    sync();
    document.addEventListener('site:themechange', sync);
    return [button, menu];
  }

  // ---------- Terminal (lovsh, loaded on first use) ----------

  const searchProviders = [];
  let terminalReady = null;
  let terminalInstance = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', () => { script.remove(); reject(new Error(`Could not load ${src}`)); }, { once: true });
      document.head.append(script);
    });
  }

  function openWin98() {
    if ($('#win98')) document.dispatchEvent(new CustomEvent('site:win98'));
    else location.href = '/#win98';
  }

  function openMinesweeper() {
    if ($('#win98')) document.dispatchEvent(new CustomEvent('site:minesweeper'));
    else location.href = '/#minesweeper';
  }

  const library = () => getJson('/games/shared-library.json');
  const ops = () => getJson('/ops/data.json');

  function loadTerminal() {
    terminalReady ||= loadScript('/assets/shell-core.js')
      .then(() => loadScript('/assets/terminal-games.js'))
      .then(() => loadScript('/assets/terminal.js'))
      .then(() => (terminalInstance = SiteTerminal.init({ searchProviders, data: { status, nowPlaying, ops, library, timeAgo }, openWin98, openMinesweeper })))
      .catch(error => { terminalReady = null; throw error; });
    return terminalReady;
  }

  async function openTerminal() {
    try {
      (await loadTerminal()).open();
    } catch {
      // Offline or blocked: the rest of the site keeps working.
    }
  }

  function closeTerminal() {
    terminalInstance?.close();
  }

  // ---------- Header controls ----------

  if (actions) {
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    const terminalButton = el('button', { className: 'shell-button is-outlined terminal-button', attrs: { type: 'button', id: 'terminal-open', 'aria-keyshortcuts': 'Control+K Meta+K' } },
      el('span', { className: 'prompt', text: '>_', attrs: { 'aria-hidden': 'true' } }),
      el('span', { className: 'label-optional', text: 'Terminal' }),
      el('kbd', { text: isMac ? '⌘ K' : 'Ctrl K', attrs: { 'aria-hidden': 'true' } }));
    terminalButton.addEventListener('click', openTerminal);
    // Start loading the terminal as soon as someone shows interest, so it opens instantly.
    for (const type of ['pointerenter', 'focus', 'touchstart']) terminalButton.addEventListener(type, () => { loadTerminal().catch(() => {}); }, { once: true, passive: true });
    actions.append(terminalButton);
    if (showThemeSwitch) {
      const [themeButton, themeMenu] = buildThemeMenu();
      // Kept inside the header landmark; as a popover it still renders in the top layer.
      actions.append(themeButton, themeMenu);
    }
  }

  // ---------- Keyboard shortcuts ----------

  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let konamiIndex = 0;
  const terminalOpen = () => Boolean($('#terminal')?.open);
  const otherModalOpen = () => [...document.querySelectorAll('dialog[open]')].some(dialog => dialog.id !== 'terminal');

  document.addEventListener('keydown', event => {
    if (event.defaultPrevented) return;
    const typing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
      if (otherModalOpen()) return;
      event.preventDefault();
      openTerminal();
      return;
    }
    if (typing || terminalOpen() || otherModalOpen()) return;
    // "/" focuses the page's own search when it has one, otherwise opens the terminal.
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const search = $('[data-page-search]');
      if (search) search.focus();
      else openTerminal();
      return;
    }
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    konamiIndex = key === KONAMI[konamiIndex] ? konamiIndex + 1 : key === KONAMI[0] ? 1 : 0;
    if (konamiIndex === KONAMI.length) {
      konamiIndex = 0;
      openWin98();
    }
  });

  globalThis.SiteShell = Object.freeze({
    openTerminal,
    closeTerminal,
    registerSearch: provider => { if (typeof provider === 'function') searchProviders.push(provider); },
    data: Object.freeze({ status, nowPlaying, timeAgo, steamCover })
  });
})();
