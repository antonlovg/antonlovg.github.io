// Homepage enhancements: live pipeline panel, "now playing", terminal and the Windows 98 easter egg.
// Everything is same-origin and nothing is stored in the browser.
(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const STATUS_URL = '/status.json';
  const NOW_PLAYING_URL = '/now-playing.json';
  const LIBRARY_URL = '/games/shared-library.json';
  const WORKFLOW_URL = 'https://github.com/antonlovg/antonlovg.github.io/actions/workflows/pipeline.yml';

  let pipelineStatus = null;
  let nowPlaying = [];

  async function getJson(url) {
    const response = await fetch(url, { cache: 'no-cache', credentials: 'same-origin' });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return response.json();
  }

  function el(tag, { className = '', text = '', attrs = {} } = {}, ...children) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    node.append(...children);
    return node;
  }

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

  // ---------- Pipeline panel ----------

  function setValue(id, text, tone = '') {
    const node = $(id);
    node.replaceChildren(text instanceof Node ? text : document.createTextNode(text));
    node.className = tone;
  }

  function stageResults(status) {
    const audit = status.accessibility && status.privacy
      ? status.accessibility.violations === 0 && status.privacy.cookies === 0 && status.privacy.thirdPartyRequests === 0
      : null;
    return {
      test: status.tests ? status.tests.failed === 0 : null,
      audit,
      deploy: true // status.json only exists on the live site once a deploy has finished
    };
  }

  function renderStatus(status) {
    const panel = $('#status-panel');
    const stages = stageResults(status);
    for (const [stage, ok] of Object.entries(stages)) {
      const item = panel.querySelector(`[data-stage="${stage}"]`);
      item.classList.toggle('is-ok', ok === true);
      item.classList.toggle('is-fail', ok === false);
      let state = item.querySelector('.sr-only');
      if (!state) item.append(state = el('span', { className: 'sr-only' }));
      state.textContent = `: ${ok === true ? 'passed' : ok === false ? 'failed' : 'no data'}`;
    }
    const values = Object.values(stages);
    const state = values.includes(false) ? 'fail' : values.every(value => value === true) ? 'ok' : 'unknown';
    panel.dataset.state = state;
    $('#status-badge').textContent = state === 'ok' ? 'All checks passing' : state === 'fail' ? 'Issues found' : 'Partial results';

    const commit = el('span', {}, el('a', { text: status.commit.short, attrs: { href: status.commit.url, rel: 'noopener', title: status.commit.message } }), ` · ${timeAgo(status.generatedAt)}`);
    setValue('#status-deploy', commit);

    if (status.tests) {
      setValue('#status-tests', status.tests.failed ? `${status.tests.failed} failed` : `${status.tests.passed} passed`, status.tests.failed ? 'fail' : 'ok');
    } else setValue('#status-tests', 'No data', 'dim');

    if (status.accessibility) {
      const issues = status.accessibility.violations;
      setValue('#status-a11y', `${issues} ${issues === 1 ? 'issue' : 'issues'} · ${status.accessibility.pages} pages`, issues ? 'fail' : 'ok');
    } else setValue('#status-a11y', 'No data', 'dim');

    if (status.privacy) {
      const { cookies, thirdPartyRequests } = status.privacy;
      setValue('#status-privacy', `${cookies} cookies · ${thirdPartyRequests} trackers`, cookies || thirdPartyRequests ? 'fail' : 'ok');
    } else setValue('#status-privacy', 'No data', 'dim');

    const lighthouse = status.lighthouse;
    $('#status-lighthouse').hidden = !lighthouse;
    if (lighthouse) {
      const scores = [['Performance', lighthouse.performance], ['Accessibility', lighthouse.accessibility], ['Best practices', lighthouse.bestPractices], ['SEO', lighthouse.seo]];
      $('#lighthouse-scores').replaceChildren(...scores.map(([label, value]) => {
        const ring = el('span', { className: `score-ring${value < 90 ? ' is-low' : ''}`, text: String(value), attrs: { 'aria-hidden': 'true' } });
        ring.style.setProperty('--score', value);
        return el('li', { className: 'score' }, ring, el('span', { text: label }), el('span', { className: 'sr-only', text: `: ${value} out of 100` }));
      }));
    }

    const link = el('a', { text: status.run ? `See run #${status.run.number} ↗` : 'View pipeline ↗', attrs: { href: status.run?.url || status.workflowUrl || WORKFLOW_URL, rel: 'noopener' } });
    $('#status-foot').replaceChildren('Checked automatically on every push. ', link);
    $('#w98-pipeline').textContent = state === 'ok' ? 'All checks passing' : 'See the homepage';
  }

  function renderStatusUnavailable() {
    $('#status-panel').dataset.state = 'unknown';
    $('#status-badge').textContent = 'Awaiting first run';
    for (const id of ['#status-deploy', '#status-tests', '#status-a11y', '#status-privacy']) setValue(id, 'Pending', 'dim');
    const link = el('a', { text: 'View pipeline ↗', attrs: { href: WORKFLOW_URL, rel: 'noopener' } });
    $('#status-foot').replaceChildren('Live results appear here after the pipeline’s first deploy. ', link);
  }

  async function loadStatus() {
    try {
      pipelineStatus = await getJson(STATUS_URL);
      renderStatus(pipelineStatus);
    } catch {
      renderStatusUnavailable();
    }
  }

  // ---------- Now playing ----------

  // Covers load from Steam's image CDN only; the page's CSP and the pipeline's privacy audit allow just that host.
  function steamCover(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname.endsWith('.steamstatic.com') ? url.href : '';
    } catch {
      return '';
    }
  }

  function monogram(title) {
    return title.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase();
  }

  function renderNowPlaying(games) {
    const list = $('#now-playing');
    list.replaceChildren(...games.map(game => {
      const cover = el('div', { className: 'np-cover' });
      const fallback = () => el('span', { className: 'np-cover-fallback', text: monogram(game.title), attrs: { 'aria-hidden': 'true' } });
      const src = steamCover(game.cover);
      if (src) {
        const image = el('img', { attrs: { src, alt: '', loading: 'lazy', decoding: 'async', width: '460', height: '215', referrerpolicy: 'no-referrer' } });
        image.addEventListener('error', () => image.replaceWith(fallback()), { once: true });
        cover.append(image);
      } else {
        cover.append(fallback());
      }
      cover.append(el('span', { className: 'np-live', text: 'Playing', attrs: { 'aria-hidden': 'true' } }));
      const meta = [game.genre, game.players ? `${game.players} ${game.players === '1' ? 'player' : 'players'}` : ''].filter(Boolean).join(' · ');
      const body = el('div', { className: 'np-body' }, el('h3', { className: 'np-title', text: game.title }));
      if (meta) body.append(el('p', { className: 'np-meta', text: meta }));
      return el('li', {}, el('a', { className: 'np-card', attrs: { href: '/games/#in-progress' } }, cover, body));
    }));
    $('#now-playing-note').hidden = games.length > 0;
  }

  async function loadNowPlaying() {
    try {
      nowPlaying = (await getJson(NOW_PLAYING_URL)).games || [];
    } catch {
      // Local preview or before the first pipeline deploy: read the library directly.
      try {
        const library = await getJson(LIBRARY_URL);
        nowPlaying = library.games.filter(game => game.status === 'in-progress').slice(0, 8)
          .map(game => ({ title: game.title, genre: (game.genre || '').split(',')[0].trim(), players: game.players || '', cover: game.coverUrl }));
      } catch {
        nowPlaying = [];
      }
    }
    if (nowPlaying.length) renderNowPlaying(nowPlaying);
  }

  // ---------- Terminal ----------

  const terminal = $('#terminal');
  const log = $('#term-log');
  const input = $('#term-input');
  const suggestions = $('#term-suggestions');
  const history = [];
  let historyIndex = -1;
  let activeIndex = -1;

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
    setTimeout(() => { window.location.href = url; }, 250);
  }

  const COMMANDS = {
    help: { description: 'List commands', run: () => {
      print('Available commands:', 'dim');
      for (const [name, command] of Object.entries(COMMANDS)) {
        if (!command.hidden) print([{ key: name }, command.description]);
      }
    } },
    whoami: { description: 'About me', run: () => {
      print('Anton Lövgren, DevOps engineer.');
      print('I build small, useful things for the web and automate everything around them.', 'dim');
    } },
    projects: { description: 'What I’ve built', run: () => {
      print([{ key: 'games' }, { text: 'Game library', href: '/games/' }, ': a shared backlog with Steam info and trailers']);
      print([{ key: 'pipeline' }, { text: 'Site pipeline', href: WORKFLOW_URL, external: true }, ': tests, audits and deploys this site']);
      print([{ key: 'worldcup' }, { text: 'World Cup 2026', href: '/wc2026/' }, ': group-stage fixtures in CEST']);
      print([{ key: 'source' }, { text: 'Source code', href: 'https://github.com/antonlovg/antonlovg.github.io', external: true }]);
    } },
    status: { description: 'Latest pipeline results', run: () => {
      if (!pipelineStatus) { print('No pipeline results yet. They appear after the first automated deploy.', 'dim'); return; }
      const s = pipelineStatus;
      const results = stageResults(s);
      print([{ key: 'commit' }, { text: s.commit.short, href: s.commit.url, external: true }, ` · ${s.commit.message}`]);
      print([{ key: 'deployed' }, timeAgo(s.generatedAt)]);
      if (s.tests) print([{ key: 'tests' }, `${s.tests.passed} passed, ${s.tests.failed} failed`], s.tests.failed ? 'err' : 'ok');
      if (s.accessibility) print([{ key: 'a11y' }, `${s.accessibility.violations} issues on ${s.accessibility.pages} pages (${s.accessibility.standard})`], results.audit === false ? 'err' : 'ok');
      if (s.privacy) print([{ key: 'privacy' }, `${s.privacy.cookies} cookies, ${s.privacy.thirdPartyRequests} third-party requests`], results.audit === false ? 'err' : 'ok');
      if (s.lighthouse) print([{ key: 'lighthouse' }, `perf ${s.lighthouse.performance} · a11y ${s.lighthouse.accessibility} · best practices ${s.lighthouse.bestPractices} · seo ${s.lighthouse.seo}`]);
    } },
    playing: { description: 'What I’m playing now', run: () => {
      if (!nowPlaying.length) { print('Nothing in progress right now.', 'dim'); return; }
      for (const game of nowPlaying) print(`▶ ${game.title}${game.genre ? `  (${game.genre})` : ''}`);
      print([{ text: 'See the full library', href: '/games/#in-progress' }]);
    } },
    contact: { description: 'How to reach me', run: () => {
      print([{ key: 'email' }, { text: 'anton@lovgren.dev', href: 'mailto:anton@lovgren.dev' }]);
      print([{ key: 'github' }, { text: 'github.com/antonlovg', href: 'https://github.com/antonlovg', external: true }]);
    } },
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
    date: { hidden: true, run: () => print(new Date().toString()) }
  };
  COMMANDS.source = { hidden: true, run: () => go('https://github.com/antonlovg/antonlovg.github.io', 'the source code') };
  COMMANDS.pipeline = { hidden: true, run: () => go(WORKFLOW_URL, 'the pipeline') };

  function matches(value) {
    const query = value.trim().toLowerCase();
    if (!query) return [];
    return Object.entries(COMMANDS).filter(([name, command]) => !command.hidden && name.startsWith(query) && name !== query);
  }

  function renderSuggestions() {
    const found = matches(input.value).slice(0, 6);
    activeIndex = Math.min(activeIndex, found.length - 1);
    suggestions.replaceChildren(...found.map(([name, command], index) => {
      const option = el('li', { attrs: { role: 'option', id: `term-option-${name}`, 'aria-selected': String(index === activeIndex), 'data-command': name } }, name, el('span', { text: command.description }));
      option.addEventListener('mousedown', event => { event.preventDefault(); run(name); });
      return option;
    }));
    const open = found.length > 0;
    suggestions.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    if (open && activeIndex >= 0) input.setAttribute('aria-activedescendant', `term-option-${found[activeIndex][0]}`);
    else input.removeAttribute('aria-activedescendant');
  }

  function closeSuggestions() {
    activeIndex = -1;
    suggestions.hidden = true;
    suggestions.replaceChildren();
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function run(raw) {
    const commandLine = raw.trim();
    input.value = '';
    closeSuggestions();
    if (!commandLine) return;
    history.unshift(commandLine);
    historyIndex = -1;
    print(commandLine, 'cmd');
    const [name] = commandLine.toLowerCase().split(/\s+/);
    const command = COMMANDS[name];
    if (command) command.run();
    else print(`command not found: ${name}. Type “help” to see what you can do.`, 'err');
  }

  function openTerminal() {
    if (terminal.open) { input.focus(); return; }
    terminal.showModal();
    if (!log.childElementCount) {
      print('Welcome to lovgren.dev.', 'ok');
      print('Type “help” to see what you can do, or try “status”.', 'dim');
    }
    input.focus();
  }

  function closeTerminal() {
    if (terminal.open) terminal.close();
  }

  $('#term-form').addEventListener('submit', event => {
    event.preventDefault();
    const selected = suggestions.querySelector('[aria-selected="true"]');
    run(selected ? selected.dataset.command : input.value);
  });
  input.addEventListener('input', () => { activeIndex = -1; renderSuggestions(); });
  input.addEventListener('keydown', event => {
    const options = [...suggestions.querySelectorAll('[role="option"]')];
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (options.length) {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        activeIndex = (activeIndex + step + options.length) % options.length;
        renderSuggestions();
      } else if (history.length) {
        historyIndex = Math.max(-1, Math.min(history.length - 1, historyIndex + (event.key === 'ArrowUp' ? 1 : -1)));
        input.value = historyIndex >= 0 ? history[historyIndex] : '';
      }
    } else if (event.key === 'Tab' && options.length) {
      event.preventDefault();
      input.value = options[Math.max(activeIndex, 0)].dataset.command;
      closeSuggestions();
    } else if (event.key === 'Escape' && !suggestions.hidden) {
      event.preventDefault();
      closeSuggestions();
    }
  });
  $('#terminal-close').addEventListener('click', closeTerminal);
  terminal.addEventListener('click', event => { if (event.target === terminal) closeTerminal(); });

  // ---------- Windows 98 easter egg ----------

  const win98 = $('#win98');
  const startButton = $('#w98-start');
  const startMenu = $('#w98-menu');
  let clockTimer = null;

  function bringToFront(windowEl) {
    win98.querySelectorAll('.w98-window').forEach(other => other.classList.toggle('is-front', other === windowEl));
  }

  function openWindow(id) {
    const windowEl = $(`#${id}`);
    windowEl.hidden = false;
    bringToFront(windowEl);
    windowEl.querySelector('.w98-button, .w98-control')?.focus();
  }

  function toggleStartMenu(open = startMenu.hidden) {
    startMenu.hidden = !open;
    startButton.setAttribute('aria-expanded', String(open));
    if (open) startMenu.querySelector('button, a').focus();
  }

  function updateClock() {
    $('#w98-clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function openWin98() {
    if (win98.open) return;
    win98.querySelectorAll('.w98-window').forEach(windowEl => { windowEl.hidden = windowEl.id !== 'w98-welcome'; });
    toggleStartMenu(false);
    win98.showModal();
    openWindow('w98-welcome');
    updateClock();
    clockTimer = setInterval(updateClock, 15000);
  }

  function closeWin98() {
    if (win98.open) win98.close();
  }

  win98.addEventListener('close', () => clearInterval(clockTimer));
  win98.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !startMenu.hidden) {
      event.preventDefault();
      toggleStartMenu(false);
      startButton.focus();
    }
  });
  win98.addEventListener('click', event => {
    const target = event.target.closest('[data-w98-open], [data-w98-close], [data-w98-action]');
    if (!event.target.closest('#w98-menu, #w98-start')) toggleStartMenu(false);
    if (!target) return;
    if (target.dataset.w98Open) { toggleStartMenu(false); openWindow(target.dataset.w98Open); }
    if (target.dataset.w98Close) $(`#${target.dataset.w98Close}`).hidden = true;
    if (target.dataset.w98Action === 'exit') closeWin98();
    if (target.dataset.w98Action === 'projects') { closeWin98(); $('#projects-title').scrollIntoView(); }
  });
  startButton.addEventListener('click', () => toggleStartMenu());

  // Drag windows by their title bar.
  for (const windowEl of win98.querySelectorAll('.w98-window')) {
    windowEl.addEventListener('pointerdown', () => bringToFront(windowEl));
    const bar = windowEl.querySelector('.w98-titlebar');
    bar.addEventListener('pointerdown', event => {
      if (event.target.closest('button')) return;
      const desktop = win98.querySelector('.w98-desktop').getBoundingClientRect();
      const rect = windowEl.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      bar.setPointerCapture(event.pointerId);
      const move = moveEvent => {
        const left = Math.min(Math.max(moveEvent.clientX - offsetX - desktop.left, 0), desktop.width - rect.width);
        const top = Math.min(Math.max(moveEvent.clientY - offsetY - desktop.top, 0), desktop.height - 40);
        windowEl.style.transform = 'none';
        windowEl.style.left = `${left}px`;
        windowEl.style.top = `${top}px`;
      };
      const stop = () => { bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', stop); bar.removeEventListener('pointercancel', stop); };
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', stop);
      bar.addEventListener('pointercancel', stop);
    });
  }

  // ---------- Keyboard shortcuts ----------

  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let konamiIndex = 0;

  document.addEventListener('keydown', event => {
    const typing = event.target.closest?.('input, textarea, select, [contenteditable="true"]');
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (!win98.open) openTerminal();
      return;
    }
    if (event.key === '/' && !typing && !terminal.open && !win98.open) {
      event.preventDefault();
      openTerminal();
      return;
    }
    if (typing || terminal.open || win98.open) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    konamiIndex = key === KONAMI[konamiIndex] ? konamiIndex + 1 : key === KONAMI[0] ? 1 : 0;
    if (konamiIndex === KONAMI.length) {
      konamiIndex = 0;
      openWin98();
    }
  });

  const trigger = $('#terminal-open');
  trigger.hidden = false;
  trigger.addEventListener('click', openTerminal);
  if (/Mac|iPhone|iPad/.test(navigator.platform)) document.querySelectorAll('kbd').forEach(kbd => { kbd.textContent = kbd.textContent.replace('Ctrl', '⌘'); });
  $('#footer-hint').hidden = matchMedia('(pointer: coarse)').matches;

  loadStatus();
  loadNowPlaying();
})();
