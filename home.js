// Homepage: live pipeline panel, "now playing" and the Windows 98 easter egg.
// The terminal, theme menu and shortcuts come from /assets/site.js (SiteShell), which also loads the shared data.
// Everything is same-origin except cover images from Steam's CDN; nothing is stored in the browser.
(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const WORKFLOW_URL = 'https://github.com/antonlovg/antonlovg.github.io/actions/workflows/pipeline.yml';
  const { status: loadStatus, nowPlaying: loadNowPlaying, timeAgo, steamCover } = SiteShell.data;

  function el(tag, { className = '', text = '', attrs = {} } = {}, ...children) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    node.append(...children);
    return node;
  }

  // ---------- Pipeline panel ----------

  function setValue(id, content, tone = '') {
    const node = $(id);
    node.replaceChildren(content instanceof Node ? content : document.createTextNode(content));
    node.className = tone;
  }

  function stageResults(status) {
    const audit = status.accessibility && status.privacy
      ? status.accessibility.violations === 0 && status.privacy.cookies === 0 && status.privacy.thirdPartyRequests === 0
      : null;
    // status.json only exists on the live site once a deploy has finished.
    return { test: status.tests ? status.tests.failed === 0 : null, audit, deploy: true };
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

    setValue('#status-deploy', el('span', {}, el('a', { text: status.commit.short, attrs: { href: status.commit.url, rel: 'noopener', title: status.commit.message } }), ` · ${timeAgo(status.generatedAt)}`));

    if (status.tests) setValue('#status-tests', status.tests.failed ? `${status.tests.failed} failed` : `${status.tests.passed} passed`, status.tests.failed ? 'fail' : 'ok');
    else setValue('#status-tests', 'No data', 'dim');

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
    $('#status-foot').replaceChildren('Live results appear here after the pipeline’s first deploy. ', el('a', { text: 'View pipeline ↗', attrs: { href: WORKFLOW_URL, rel: 'noopener' } }));
  }

  // ---------- Now playing ----------

  function monogram(title) {
    return title.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toUpperCase();
  }

  function renderNowPlaying(games) {
    $('#now-playing').replaceChildren(...games.map(game => {
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
    SiteShell.closeTerminal();
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

  win98.addEventListener('close', () => {
    clearInterval(clockTimer);
    if (location.hash === '#win98') history.replaceState(null, '', location.pathname + location.search);
  });
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

  // Opened by the terminal's "win98" command, the Konami code, or a /#win98 link from another page.
  document.addEventListener('site:win98', openWin98);
  if (location.hash === '#win98') openWin98();

  const hint = $('#footer-hint');
  hint.hidden = matchMedia('(pointer: coarse)').matches;
  if (/Mac|iPhone|iPad/.test(navigator.platform)) hint.querySelectorAll('kbd').forEach(kbd => { kbd.textContent = kbd.textContent.replace('Ctrl', '⌘'); });

  loadStatus().then(renderStatus).catch(renderStatusUnavailable);
  loadNowPlaying().then(games => { if (games.length) renderNowPlaying(games); }).catch(() => {});
})();
