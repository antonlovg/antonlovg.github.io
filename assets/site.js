// lovgren.dev shell behaviour, shared by every page:
// theme menu, the terminal (Ctrl+K), keyboard shortcuts, the Konami code, and shared data loaders.
// Builds its own controls so visitors without JavaScript never see dead buttons.
// Everything is same-origin; all text is inserted with textContent.
(() => {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const WORKFLOW_URL = 'https://github.com/antonlovg/antonlovg.github.io/actions/workflows/pipeline.yml';
  const REPO_URL = 'https://github.com/antonlovg/antonlovg.github.io';
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

  // ---------- Terminal ----------

  const terminal = el('dialog', { className: 'terminal', attrs: { id: 'terminal', 'aria-labelledby': 'terminal-title' } });
  const log = el('div', { className: 'term-log', attrs: { id: 'term-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Terminal output' } });
  const input = el('input', { className: 'term-input', attrs: { id: 'term-input', type: 'text', role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': 'term-suggestions', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go' } });
  const suggestions = el('ul', { className: 'term-suggestions', attrs: { id: 'term-suggestions', role: 'listbox', 'aria-label': 'Suggestions', hidden: '' } });
  const form = el('form', { className: 'term-input-row' },
    el('label', { className: 'term-prompt', attrs: { for: 'term-input' } }, el('span', { text: '~ $', attrs: { 'aria-hidden': 'true' } }), el('span', { className: 'sr-only', text: 'Command or search' })),
    input);
  const closeButton = el('button', { className: 'term-close', text: '×', attrs: { type: 'button', 'aria-label': 'Close terminal' } });
  terminal.append(
    el('div', { className: 'term-bar' }, el('span', { className: 'term-dots', attrs: { 'aria-hidden': 'true' } }, el('i'), el('i'), el('i')), el('h2', { text: 'anton@lovgren.dev: ~', attrs: { id: 'terminal-title' } }), closeButton),
    el('div', { className: 'term-body' }, log, form, suggestions),
    el('p', { className: 'term-hint' }, el('kbd', { text: 'Tab' }), ' complete · ', el('kbd', { text: '↑' }), ' ', el('kbd', { text: '↓' }), ' choose · ', el('kbd', { text: 'Enter' }), ' run · ', el('kbd', { text: 'Esc' }), ' close')
  );

  const history = [];
  let historyIndex = -1;
  let activeIndex = -1;
  let currentItems = [];
  const searchProviders = [];

  function print(content, tone = '') {
    const line = el('p', { className: `term-line ${tone}`.trim() });
    for (const part of [].concat(content)) {
      if (typeof part === 'string') line.append(part);
      else if (part.href) line.append(el('a', { text: part.text, attrs: { href: part.href, ...(part.external ? { rel: 'noopener' } : {}) } }));
      else if (part.key) line.append(el('span', { className: 'key', text: part.key }));
    }
    log.append(line);
    log.scrollTop = log.scrollHeight;
  }

  function go(url, label) {
    print(`Opening ${label}…`, 'dim');
    setTimeout(() => { location.href = url; }, 200);
  }

  function openWin98() {
    if ($('#win98')) document.dispatchEvent(new CustomEvent('site:win98'));
    else location.href = '/#win98';
  }

  const COMMANDS = {
    help: { description: 'List commands', run: () => {
      print('Commands (you can also type a game title to search the library):', 'dim');
      for (const [name, command] of Object.entries(COMMANDS)) if (!command.hidden) print([{ key: name }, command.description]);
    } },
    whoami: { description: 'About me', run: () => {
      print('Anton Lövgren, DevOps engineer.');
      print('I build small, useful things for the web and automate everything around them.', 'dim');
    } },
    projects: { description: 'What I’ve built', run: () => {
      print([{ key: 'games' }, { text: 'Game library', href: '/games/' }, ': a shared backlog with Steam info and trailers']);
      print([{ key: 'pipeline' }, { text: 'Site pipeline', href: WORKFLOW_URL, external: true }, ': tests, audits and deploys this site']);
      print([{ key: 'worldcup' }, { text: 'World Cup 2026', href: '/wc2026/' }, ': group-stage fixtures in CEST']);
      print([{ key: 'source' }, { text: 'Source code', href: REPO_URL, external: true }]);
    } },
    status: { description: 'Latest pipeline results', run: async () => {
      try {
        const s = await status();
        print([{ key: 'commit' }, { text: s.commit.short, href: s.commit.url, external: true }, ` · ${s.commit.message}`]);
        print([{ key: 'deployed' }, timeAgo(s.generatedAt)]);
        if (s.tests) print([{ key: 'tests' }, `${s.tests.passed} passed, ${s.tests.failed} failed`], s.tests.failed ? 'err' : 'ok');
        if (s.accessibility) print([{ key: 'a11y' }, `${s.accessibility.violations} issues on ${s.accessibility.pages} pages (${s.accessibility.standard})`], s.accessibility.violations ? 'err' : 'ok');
        if (s.privacy) print([{ key: 'privacy' }, `${s.privacy.cookies} cookies, ${s.privacy.thirdPartyRequests} trackers`], s.privacy.cookies || s.privacy.thirdPartyRequests ? 'err' : 'ok');
        if (s.lighthouse) print([{ key: 'lighthouse' }, `perf ${s.lighthouse.performance} · a11y ${s.lighthouse.accessibility} · best practices ${s.lighthouse.bestPractices} · seo ${s.lighthouse.seo}`]);
      } catch {
        print('No pipeline results yet. They appear after the first automated deploy.', 'dim');
      }
    } },
    playing: { description: 'What I’m playing now', run: async () => {
      try {
        const games = await nowPlaying();
        if (!games.length) { print('Nothing in progress right now.', 'dim'); return; }
        for (const game of games) print(`▶ ${game.title}${game.genre ? `  (${game.genre})` : ''}`);
        print([{ text: 'See the full library', href: '/games/#in-progress' }]);
      } catch {
        print('Couldn’t load the game library.', 'err');
      }
    } },
    contact: { description: 'How to reach me', run: () => {
      print([{ key: 'email' }, { text: 'anton@lovgren.dev', href: 'mailto:anton@lovgren.dev' }]);
      print([{ key: 'github' }, { text: 'github.com/antonlovg', href: 'https://github.com/antonlovg', external: true }]);
    } },
    theme: { description: 'theme system | light | dark', run: args => {
      const choice = (args[0] || '').toLowerCase();
      if (!globalThis.SiteTheme || !SiteTheme.PREFERENCES.includes(choice)) {
        print(`Current theme: ${THEME_LABELS[globalThis.SiteTheme?.preference] || 'System'}. Usage: theme system | light | dark`, 'dim');
        return;
      }
      SiteTheme.set(choice);
      print(`Theme set to ${THEME_LABELS[choice]}.`, 'ok');
    } },
    home: { description: 'Go to the homepage', run: () => go('/', 'the homepage') },
    games: { description: 'Open the game library', run: () => go('/games/', 'the game library') },
    worldcup: { description: 'Open the World Cup page', run: () => go('/wc2026/', 'the World Cup page') },
    github: { description: 'Open my GitHub', run: () => go('https://github.com/antonlovg', 'GitHub') },
    privacy: { description: 'Read the privacy policy', run: () => go('/privacy/', 'the privacy policy') },
    win98: { description: 'Travel back in time', run: () => { closeTerminal(); openWin98(); } },
    clear: { description: 'Clear the screen', run: () => log.replaceChildren() },
    exit: { description: 'Close the terminal', run: () => closeTerminal() },
    ls: { hidden: true, run: () => print('games/  now-playing/  projects/  contact/  privacy/  wc2026/') },
    cookies: { hidden: true, run: () => print('0 cookies here. Not even the edible kind.', 'dim') },
    sudo: { hidden: true, run: () => print('Permission denied. Nice try, though.', 'err') },
    date: { hidden: true, run: () => print(new Date().toString()) },
    source: { hidden: true, run: () => go(REPO_URL, 'the source code') },
    pipeline: { hidden: true, run: () => go(WORKFLOW_URL, 'the pipeline') }
  };

  function commandItem(name) {
    return { label: name, description: COMMANDS[name].description, run: () => runCommand(name, []) };
  }

  function findItems(value) {
    const query = value.trim().toLowerCase();
    if (!query) return [];
    const commands = Object.keys(COMMANDS).filter(name => !COMMANDS[name].hidden && name.startsWith(query) && name !== query).map(commandItem);
    const extra = query.length >= 2 && !COMMANDS[query.split(/\s+/)[0]]
      ? searchProviders.flatMap(provider => { try { return provider(query) || []; } catch { return []; } })
      : [];
    return [...commands, ...extra].slice(0, 8);
  }

  function renderSuggestions() {
    currentItems = findItems(input.value);
    activeIndex = Math.min(activeIndex, currentItems.length - 1);
    suggestions.replaceChildren(...currentItems.map((item, index) => {
      const option = el('li', { attrs: { role: 'option', id: `term-option-${index}`, 'aria-selected': String(index === activeIndex) } });
      option.append(item.label);
      if (item.group) option.append(el('span', { className: 'term-group', text: item.group }));
      option.append(el('span', { text: item.description || '' }));
      option.addEventListener('mousedown', event => { event.preventDefault(); runItem(item, item.label); });
      return option;
    }));
    const open = currentItems.length > 0;
    suggestions.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    if (open && activeIndex >= 0) input.setAttribute('aria-activedescendant', `term-option-${activeIndex}`);
    else input.removeAttribute('aria-activedescendant');
  }

  function closeSuggestions() {
    activeIndex = -1;
    currentItems = [];
    suggestions.hidden = true;
    suggestions.replaceChildren();
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function remember(line) {
    history.unshift(line);
    history.length = Math.min(history.length, 50);
    historyIndex = -1;
  }

  function runCommand(name, args, echo = [name, ...args].join(' ')) {
    input.value = '';
    closeSuggestions();
    remember(echo);
    print(echo, 'cmd');
    COMMANDS[name].run(args);
  }

  function runItem(item, echo) {
    input.value = '';
    closeSuggestions();
    remember(echo);
    print(echo, 'cmd');
    item.run();
  }

  function submit() {
    const line = input.value.trim();
    if (activeIndex >= 0 && currentItems[activeIndex]) { runItem(currentItems[activeIndex], currentItems[activeIndex].label); return; }
    if (!line) return;
    const [name, ...args] = line.split(/\s+/);
    if (COMMANDS[name.toLowerCase()]) { runCommand(name.toLowerCase(), args, line); return; }
    const items = findItems(line);
    if (items.length) { runItem(items[0], line); return; }
    input.value = '';
    closeSuggestions();
    remember(line);
    print(line, 'cmd');
    print(`command not found: ${name}. Type “help” to see what you can do.`, 'err');
  }

  function openTerminal() {
    if (terminal.open) { input.focus(); return; }
    terminal.showModal();
    if (!log.childElementCount) {
      print('Welcome to lovgren.dev.', 'ok');
      print('Type “help” for commands, or a game title to search the library.', 'dim');
    }
    input.focus();
  }

  function closeTerminal() {
    if (terminal.open) terminal.close();
  }

  form.addEventListener('submit', event => { event.preventDefault(); submit(); });
  input.addEventListener('input', () => { activeIndex = -1; renderSuggestions(); });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (currentItems.length) {
        activeIndex = (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + currentItems.length) % currentItems.length;
        renderSuggestions();
      } else if (history.length) {
        historyIndex = Math.max(-1, Math.min(history.length - 1, historyIndex + (event.key === 'ArrowUp' ? 1 : -1)));
        input.value = historyIndex >= 0 ? history[historyIndex] : '';
      }
    } else if (event.key === 'Tab' && currentItems.length) {
      event.preventDefault();
      const item = currentItems[Math.max(activeIndex, 0)];
      if (COMMANDS[item.label]) { input.value = item.label; closeSuggestions(); }
      else runItem(item, item.label);
    } else if (event.key === 'Escape' && !suggestions.hidden) {
      event.preventDefault();
      closeSuggestions();
    }
  });
  closeButton.addEventListener('click', closeTerminal);
  terminal.addEventListener('click', event => { if (event.target === terminal) closeTerminal(); });
  document.body.append(terminal);

  // ---------- Header controls ----------

  if (actions) {
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    const terminalButton = el('button', { className: 'shell-button is-outlined terminal-button', attrs: { type: 'button', id: 'terminal-open', 'aria-keyshortcuts': 'Control+K Meta+K' } },
      el('span', { className: 'prompt', text: '>_', attrs: { 'aria-hidden': 'true' } }),
      el('span', { className: 'label-optional', text: 'Terminal' }),
      el('kbd', { text: isMac ? '⌘ K' : 'Ctrl K', attrs: { 'aria-hidden': 'true' } }));
    terminalButton.addEventListener('click', openTerminal);
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
  const otherModalOpen = () => [...document.querySelectorAll('dialog[open]')].some(dialog => dialog !== terminal);

  document.addEventListener('keydown', event => {
    if (event.defaultPrevented) return;
    const typing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
      if (otherModalOpen()) return;
      event.preventDefault();
      openTerminal();
      return;
    }
    if (typing || terminal.open || otherModalOpen()) return;
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
