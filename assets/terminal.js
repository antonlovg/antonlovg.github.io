// lovsh, the lovgren.dev terminal. Loaded on demand by site.js the first time the terminal opens.
// Uses ShellCore (parsing, files, completion, filters) and TerminalGames (Snake, The Homelab).
// All output is inserted as text; "open" only navigates to known site pages, never to typed URLs.
(() => {
  'use strict';

  const { parse, dir, file, normalize, lookup, display, list, tree, complete, FILTERS, HOME } = ShellCore;
  const REPO = 'https://github.com/antonlovg/antonlovg.github.io';
  const WORKFLOW = `${REPO}/actions/workflows/pipeline.yml`;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const THEME_LABELS = { system: 'System', light: 'Light', dark: 'Dark', ocean: 'Ocean', ember: 'Ember' };
  // Pages "open" may navigate to (by name or path).
  const PAGES = { home: '/', games: '/games/', ops: '/ops/', status: '/status/', changelog: '/changelog/', worldcup: '/wc2026/', privacy: '/privacy/', cookies: '/cookies/', island: '/island/' };
  // Site links stay in the visitor's language (/sv/…, /no/…).
  const localize = href => (globalThis.SiteI18n ? SiteI18n.path(href) : href);

  function init({ searchProviders, data, openWin98, openMinesweeper }) {
    // ---------- DOM ----------

    const el = (tag, { className = '', text = '', attrs = {} } = {}, ...children) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
      node.append(...children);
      return node;
    };

    // lovsh speaks English on every language version of the site, like a real shell.
    const dialog = el('dialog', { className: 'terminal', attrs: { id: 'terminal', lang: 'en', 'aria-labelledby': 'terminal-title' } });
    const log = el('div', { className: 'term-log', attrs: { id: 'term-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Terminal output' } });
    const promptText = el('span', { text: '~ $', attrs: { 'aria-hidden': 'true' } });
    const input = el('input', { className: 'term-input', attrs: { id: 'term-input', type: 'text', role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': 'term-suggestions', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'go' } });
    const suggestions = el('ul', { className: 'term-suggestions', attrs: { id: 'term-suggestions', role: 'listbox', 'aria-label': 'Suggestions', hidden: '' } });
    const form = el('form', { className: 'term-input-row' },
      el('label', { className: 'term-prompt', attrs: { for: 'term-input' } }, promptText, el('span', { className: 'sr-only', text: 'Command' })),
      input);
    const closeButton = el('button', { className: 'term-close', text: '×', attrs: { type: 'button', 'aria-label': 'Close terminal' } });
    const title = el('h2', { text: 'anton@lovgren.dev: ~', attrs: { id: 'terminal-title' } });
    dialog.append(
      el('div', { className: 'term-bar' }, el('span', { className: 'term-dots', attrs: { 'aria-hidden': 'true' } }, el('i'), el('i'), el('i')), title, closeButton),
      el('div', { className: 'term-body' }, log, form, suggestions),
      el('p', { className: 'term-hint' }, el('kbd', { text: 'Tab' }), ' complete · ', el('kbd', { text: '↑' }), ' ', el('kbd', { text: '↓' }), ' history · ', el('kbd', { text: 'Enter' }), ' run · ', el('kbd', { text: 'Esc' }), ' close · try ', el('kbd', { text: 'help' }))
    );
    document.body.append(dialog);

    // ---------- Output ----------

    // A line is a string, or { parts: [string | { text, href, external } | { key }], tone }.
    const asText = line => typeof line === 'string' ? line : (line.parts || []).map(part => typeof part === 'string' ? part : part.text ?? part.key ?? '').join('');

    function print(line, tone = '') {
      const entry = typeof line === 'string' ? { parts: [line], tone } : { tone, ...line };
      const node = el('p', { className: `term-line ${entry.tone || ''}`.trim() });
      for (const part of entry.parts) {
        if (typeof part === 'string') node.append(part);
        else if (part.href) node.append(el('a', { text: part.text, attrs: { href: part.external ? part.href : localize(part.href), ...(part.external ? { rel: 'noopener' } : {}) } }));
        // A real space after the label, so copied text and screen readers don't run words together.
        else if (part.key) node.append(el('span', { className: 'key', text: part.key }), ' ');
      }
      log.append(node);
      log.scrollTop = log.scrollHeight;
      return node;
    }
    const kv = (key, ...parts) => ({ parts: [{ key }, ...parts] });
    const link = (text, href, external = false) => ({ text, href, external });

    // ---------- File system ----------

    const projectsText = {
      'games.md': ['# Game library', 'A shared backlog of co-op and puzzle games with Steam info, trailers, euro prices,', 'sale badges and a spin-the-wheel picker. Published through the GitHub API.', '', 'open projects/games.md   →   /games/'],
      'pipeline.md': ['# This site’s pipeline', 'GitHub Actions tests, builds and audits every change (axe, cookies, trackers,', 'Lighthouse) and blocks the deploy if anything fails. DORA metrics live on /ops/.', '', 'open projects/pipeline.md   →   /ops/'],
      'worldcup.md': ['# World Cup 2026 group stage', 'Every group-stage fixture with kick-off times in CEST. Printable as A4.', '', 'open projects/worldcup.md   →   /wc2026/'],
      'status.md': ['# Status page', 'Hourly uptime checks for the site, the game library and the Steam proxy.', '', 'open projects/status.md   →   /status/']
    };

    const fs = dir({
      home: dir({
        anton: dir({
          'about.md': file(['# Anton Lövgren', 'DevOps engineer. I build small, useful things for the web and automate', 'everything around them. This site tests, audits and deploys itself.', '', 'Try: cat projects/games.md · neofetch · snake · adventure'].join('\n')),
          'contact.md': file(['# Contact', 'Email:  anton@lovgren.dev', 'GitHub: github.com/antonlovg'].join('\n')),
          projects: dir(Object.fromEntries(Object.entries(projectsText).map(([name, lines]) => [name, file(lines.join('\n'), { open: { 'games.md': '/games/', 'pipeline.md': '/ops/', 'worldcup.md': '/wc2026/', 'status.md': '/status/' }[name] })]))),
          'now-playing.txt': file(async () => {
            const games = await data.nowPlaying();
            return games.length ? games.map(game => `▶ ${game.title}${game.genre ? ` (${game.genre})` : ''}`).join('\n') : 'Nothing in progress right now.';
          }, { open: '/games/#in-progress' }),
          logs: dir({
            'changelog.log': file(async () => {
              const ops = await data.ops();
              return ops.changelog.map(entry => `${entry.sha}  ${entry.date.slice(0, 10)}  ${entry.label.padEnd(8)} ${entry.text}`).join('\n');
            }, { open: '/changelog/' }),
            'last-run.log': file(async () => {
              const ops = await data.ops();
              if (!ops.lastRun) return 'No pipeline run recorded yet.';
              return [`Run #${ops.lastRun.number} (${ops.lastRun.conclusion}) for ${ops.lastRun.sha}`, ...ops.lastRun.jobs.flatMap(job => [`[${job.name}]`, ...job.steps.map(step => `  ${step.conclusion === 'success' ? '✓' : '✗'} ${step.name} (${Math.round(step.durationMs / 1000)} s)`)])].join('\n');
            }, { open: '/ops/' })
          }),
          '.secret': file('You found the hidden file. Try the Konami code on any page: ↑ ↑ ↓ ↓ ← → ← → B A'),
          '.lovshrc': file('# lovsh configuration\nexport PS1="\\w $ "\nalias ll="ls -a"\n# No telemetry. Ever.')
        })
      }),
      etc: dir({ motd: file('Welcome to lovgren.dev. Be kind, and deploy on Fridays only with tests.') })
    });

    let cwd = HOME;

    async function readFile(path) {
      const node = lookup(fs, normalize(cwd, path));
      if (!node) throw new Error(`${path}: No such file or directory`);
      if (node.type === 'dir') throw new Error(`${path}: Is a directory`);
      return typeof node.content === 'function' ? node.content() : node.content;
    }

    function updatePrompt() {
      const where = display(cwd);
      promptText.textContent = mode?.type === 'adventure' ? '>' : `${where} $`;
      title.textContent = mode?.type === 'adventure' ? 'The Homelab' : `anton@lovgren.dev: ${where}`;
    }

    // ---------- Commands ----------

    const sessionHistory = [];
    let mode = null;
    let snakeBest = 0;

    function go(url, label) {
      print(`Opening ${label}…`, 'dim');
      setTimeout(() => { location.href = localize(url); }, 200);
    }

    const COMMANDS = {
      help: { group: 'Shell', usage: 'help', description: 'List commands', run: () => {
        const groups = {};
        for (const [name, command] of Object.entries(COMMANDS)) if (!command.hidden) (groups[command.group] ||= []).push(name);
        const lines = [{ parts: ['lovsh: a small shell. Pipes work too, e.g. ', { key: 'log | grep Fix' }], tone: 'dim' }];
        for (const [group, names] of Object.entries(groups)) lines.push(kv(group.toLowerCase(), names.join('  ')));
        lines.push({ parts: ['Type ', { key: 'man <command>' }, ' for details, or a game title to search the library.'], tone: 'dim' });
        return lines;
      } },
      man: { group: 'Shell', usage: 'man <command>', description: 'Show help for a command', run: ([name]) => {
        const command = COMMANDS[name?.toLowerCase()] || (FILTERS[name?.toLowerCase()] && FILTER_HELP[name.toLowerCase()]);
        if (!command) return [{ parts: [name ? `No manual entry for ${name}` : 'What manual page do you want? Try “man ls”.'], tone: 'err' }];
        return [kv(name.toLowerCase(), command.description), kv('usage', command.usage)];
      } },
      ls: { group: 'Files', usage: 'ls [-a] [path]', description: 'List a directory', run: args => {
        const all = args.includes('-a') || args.includes('-la') || args.includes('-al');
        const target = args.find(arg => !arg.startsWith('-')) || '.';
        const entries = list(fs, normalize(cwd, target), { all });
        if (!entries) return [{ parts: [`ls: cannot access '${target}': No such file or directory`], tone: 'err' }];
        return entries;
      } },
      cd: { group: 'Files', usage: 'cd [path]', description: 'Change directory', run: ([target = '~']) => {
        const path = normalize(cwd, target);
        const node = lookup(fs, path);
        if (!node) return [{ parts: [`cd: ${target}: No such file or directory`], tone: 'err' }];
        if (node.type !== 'dir') return [{ parts: [`cd: ${target}: Not a directory`], tone: 'err' }];
        cwd = path;
        updatePrompt();
        return [];
      } },
      pwd: { group: 'Files', usage: 'pwd', description: 'Print the current directory', run: () => [cwd] },
      cat: { group: 'Files', usage: 'cat <file>…', description: 'Print files', run: async args => {
        if (!args.length) return [{ parts: ['cat: missing file operand. Try “ls”.'], tone: 'err' }];
        const lines = [];
        for (const path of args) {
          try {
            lines.push(...(await readFile(path)).split('\n'));
          } catch (error) {
            lines.push({ parts: [`cat: ${error.message}`], tone: 'err' });
          }
        }
        return lines;
      } },
      tree: { group: 'Files', usage: 'tree [path]', description: 'Show the directory tree', run: ([target = '.']) => [display(normalize(cwd, target)), ...tree(fs, normalize(cwd, target))] },
      open: { group: 'Files', usage: 'open <file | page>', description: 'Open a file’s page or a site page', run: ([target]) => {
        if (!target) return [{ parts: ['usage: open <file | page>. Pages: ', Object.keys(PAGES).join(', ')], tone: 'dim' }];
        const page = PAGES[target.toLowerCase().replace(/^\/|\/$/g, '')] || Object.values(PAGES).find(path => path === target);
        if (page) { go(page, page); return []; }
        const node = lookup(fs, normalize(cwd, target));
        if (node?.open) { go(node.open, node.open); return []; }
        if (node) return [{ parts: [`open: ${target} has no page. Try “cat ${target}”.`], tone: 'dim' }];
        return [{ parts: [`open: ${target}: not a file or page on this site`], tone: 'err' }];
      } },
      echo: { group: 'Shell', usage: 'echo <text>', description: 'Print text', run: args => [args.join(' ')] },
      history: { group: 'Shell', usage: 'history', description: 'Show recent commands', run: () => sessionHistory.slice().reverse().map((line, index) => `${String(index + 1).padStart(4)}  ${line}`) },
      clear: { group: 'Shell', usage: 'clear', description: 'Clear the screen', run: () => { log.replaceChildren(); return []; } },
      exit: { group: 'Shell', usage: 'exit', description: 'Close the terminal', run: () => { close(); return []; } },
      date: { group: 'Shell', usage: 'date', description: 'Show the date and time', run: () => [new Date().toString()] },

      whoami: { group: 'About', usage: 'whoami', description: 'Who runs this site', run: () => ['anton: DevOps engineer, builder of small useful things.'] },
      neofetch: { group: 'About', usage: 'neofetch', description: 'System information, lovgren.dev style', run: async () => {
        const [ops, playing, library] = await Promise.all([data.ops().catch(() => null), data.nowPlaying().catch(() => []), data.library().catch(() => null)]);
        const dora = ops?.dora;
        const up = ops?.uptime?.components?.find(component => component.id === 'site')?.uptime?.day;
        const art = ['     ___    __ ', '    /   |  / / ', '   / /| | / /  ', '  / ___ |/ /___', ' /_/  |_/_____/', '               '];
        const info = [
          'anton@lovgren.dev',
          '-----------------',
          `OS:        lovgren.dev on GitHub Pages`,
          `Shell:     lovsh 2.0`,
          `Theme:     ${THEME_LABELS[globalThis.SiteTheme?.preference] || 'System'}`,
          `Pipeline:  ${ops?.lastRun ? `run #${ops.lastRun.number} ${ops.lastRun.conclusion}` : 'awaiting first run'}`,
          `DORA:      ${dora?.deploymentFrequency?.level ? `${dora.deploymentFrequency.level} · ${dora.deployments} deploys / ${dora.windowDays} d` : 'no data yet'}`,
          `Uptime:    ${up === null || up === undefined ? 'no data yet' : `${(up * 100).toFixed(up === 1 ? 0 : 2)}% (24 h)`}`,
          `Games:     ${library ? `${library.games.length} in library · ${playing.length} in progress` : `${playing.length} in progress`}`,
          `Packages:  0 trackers, 0 cookies`
        ];
        return info.map((text, index) => `${(art[index] || ''.padEnd(15))}   ${text}`);
      } },
      projects: { group: 'About', usage: 'projects', description: 'What I’ve built', run: () => [
        { parts: [{ key: 'games' }, link('Game library', '/games/'), ': shared backlog with prices and a wheel picker'] },
        { parts: [{ key: 'ops' }, link('Ops dashboard', '/ops/'), ': DORA metrics, deploys, architecture'] },
        { parts: [{ key: 'status' }, link('Status page', '/status/'), ': hourly uptime checks'] },
        { parts: [{ key: 'worldcup' }, link('World Cup 2026', '/wc2026/'), ': group-stage fixtures in CEST'] },
        { parts: [{ key: 'source' }, link('Source code', REPO, true)] }
      ] },
      contact: { group: 'About', usage: 'contact', description: 'How to reach me', run: () => [
        { parts: [{ key: 'email' }, link('anton@lovgren.dev', 'mailto:anton@lovgren.dev')] },
        { parts: [{ key: 'github' }, link('github.com/antonlovg', 'https://github.com/antonlovg', true)] }
      ] },
      playing: { group: 'About', usage: 'playing', description: 'What I’m playing now', run: async () => {
        const games = await data.nowPlaying().catch(() => []);
        if (!games.length) return [{ parts: ['Nothing in progress right now.'], tone: 'dim' }];
        return [...games.map(game => `▶ ${game.title}${game.genre ? `  (${game.genre})` : ''}`), { parts: [link('See the full library', '/games/#in-progress')] }];
      } },

      status: { group: 'Ops', usage: 'status', description: 'Latest pipeline and uptime results', run: async () => {
        const lines = [];
        try {
          const s = await data.status();
          lines.push({ parts: [{ key: 'commit' }, link(s.commit.short, s.commit.url, true), ` · ${s.commit.message}`] });
          lines.push(kv('deployed', data.timeAgo(s.generatedAt)));
          if (s.tests) lines.push({ ...kv('tests', `${s.tests.passed} passed, ${s.tests.failed} failed`), tone: s.tests.failed ? 'err' : 'ok' });
          if (s.accessibility) lines.push({ ...kv('a11y', `${s.accessibility.violations} issues on ${s.accessibility.pages} pages`), tone: s.accessibility.violations ? 'err' : 'ok' });
          if (s.privacy) lines.push({ ...kv('privacy', `${s.privacy.cookies} cookies, ${s.privacy.thirdPartyRequests} trackers`), tone: s.privacy.cookies || s.privacy.thirdPartyRequests ? 'err' : 'ok' });
          if (s.lighthouse) lines.push(kv('lighthouse', `perf ${s.lighthouse.performance} · a11y ${s.lighthouse.accessibility} · best practices ${s.lighthouse.bestPractices} · seo ${s.lighthouse.seo}`));
        } catch {
          lines.push({ parts: ['No pipeline results yet; they appear after the first automated deploy.'], tone: 'dim' });
        }
        lines.push(...(await COMMANDS.uptime.run([])));
        return lines;
      } },
      uptime: { group: 'Ops', usage: 'uptime', description: 'Uptime of the site and its services', run: async () => {
        const ops = await data.ops().catch(() => null);
        if (!ops?.uptime?.lastCheck) return [{ parts: ['No uptime checks yet. The monitor runs every hour.'], tone: 'dim' }];
        return [
          kv('uptime', `${ops.uptime.overall} · last check ${data.timeAgo(ops.uptime.lastCheck)}`),
          ...ops.uptime.components.map(component => ({
            ...kv(component.id, `${component.current?.ok ? 'up' : 'DOWN'} · ${component.uptime.day === null ? '–' : `${(component.uptime.day * 100).toFixed(component.uptime.day === 1 ? 0 : 2)}%`} (24 h)${component.averageMs ? ` · ${component.averageMs} ms` : ''}`),
            tone: component.current?.ok ? 'ok' : 'err'
          })),
          { parts: [link('Full status page', '/status/')] }
        ];
      } },
      replay: { group: 'Ops', usage: 'replay', description: 'Replay the last real pipeline run', run: async (_args, { piped }) => {
        const ops = await data.ops().catch(() => null);
        if (!ops?.lastRun) return [{ parts: ['No pipeline run recorded yet.'], tone: 'dim' }];
        const run = ops.lastRun;
        const header = { parts: [`Replaying run `, link(`#${run.number}`, run.url, true), ` for ${run.sha}: ${run.message}`], tone: 'dim' };
        const steps = run.jobs.flatMap(job => [{ job: job.name }, ...job.steps]);
        if (piped) return [header, ...steps.map(step => step.job ? `[${step.job}]` : `${step.conclusion === 'success' ? '✓' : '✗'} ${step.name} (${Math.round(step.durationMs / 1000)} s)`)];
        print(header);
        print('$ git push origin main', 'cmd-echo');
        for (const step of steps) {
          if (step.job) { print(`[${step.job}]`, 'dim'); continue; }
          const node = print(`▶ ${step.name}…`);
          if (!reducedMotion.matches) await sleep(Math.min(1500, Math.max(220, step.durationMs / 14)));
          node.textContent = `${step.conclusion === 'success' ? '✓' : '✗'} ${step.name} (${Math.round(step.durationMs / 1000)} s)`;
          node.className = `term-line ${step.conclusion === 'success' ? 'ok' : 'err'}`;
        }
        return [{ parts: [run.conclusion === 'success' ? '✓ Deployed to lovgren.dev' : '✗ Deploy blocked'], tone: run.conclusion === 'success' ? 'ok' : 'err' }];
      } },
      log: { group: 'Ops', usage: 'log [-n count]', description: 'Recent changes (git log)', run: async args => {
        const ops = await data.ops().catch(() => null);
        if (!ops?.changelog?.length) return [{ parts: ['No changelog yet.'], tone: 'dim' }];
        const count = Number(args[args.indexOf('-n') + 1]) || 10;
        return [...ops.changelog.slice(0, count).map(entry => `${entry.sha}  ${entry.label.padEnd(8)} ${entry.text}`), { parts: [link('Full changelog', '/changelog/')] }];
      } },

      home: { group: 'Site', usage: 'home', description: 'Go to the homepage', run: () => { go('/', 'the homepage'); return []; } },
      games: { group: 'Site', usage: 'games', description: 'Open the game library', run: () => { go('/games/', 'the game library'); return []; } },
      ops: { group: 'Site', usage: 'ops', description: 'Open the ops dashboard', run: () => { go('/ops/', 'the ops dashboard'); return []; } },
      worldcup: { group: 'Site', usage: 'worldcup', description: 'Open the World Cup page', run: () => { go('/wc2026/', 'the World Cup page'); return []; } },
      github: { group: 'Site', usage: 'github', description: 'Open my GitHub', run: () => { go('https://github.com/antonlovg', 'GitHub'); return []; } },
      theme: { group: 'Site', usage: 'theme [system | light | dark]', description: 'Change the theme', run: ([choice = '']) => {
        const value = choice.toLowerCase();
        if (!globalThis.SiteTheme || !SiteTheme.PREFERENCES.includes(value)) return [{ parts: [`Current theme: ${THEME_LABELS[globalThis.SiteTheme?.preference] || 'System'}. Usage: theme system | light | dark`], tone: 'dim' }];
        SiteTheme.set(value);
        return [{ parts: [`Theme set to ${THEME_LABELS[value]}.`], tone: 'ok' }];
      } },

      snake: { group: 'Games', usage: 'snake', description: 'Play Snake (arrow keys or WASD)', run: (_args, { piped }) => piped ? ['snake: not in a pipe, please.'] : (startSnake(), []) },
      adventure: { group: 'Games', usage: 'adventure', description: 'A tiny text adventure', run: (_args, { piped }) => piped ? ['adventure: not in a pipe, please.'] : (startAdventure(), []) },
      minesweeper: { group: 'Games', usage: 'minesweeper', description: 'Classic Minesweeper (Windows 98 edition)', run: () => { close(); openMinesweeper(); return []; } },
      win98: { group: 'Games', usage: 'win98', description: 'Travel back in time', run: () => { close(); openWin98(); return []; } },

      sudo: { hidden: true, usage: 'sudo', description: '', run: () => [{ parts: ['Permission denied. Nice try, though.'], tone: 'err' }] },
      rm: { hidden: true, usage: 'rm', description: '', run: () => [{ parts: ['rm: this file system is read-only. Production is safe today.'], tone: 'err' }] },
      vim: { hidden: true, usage: 'vim', description: '', run: () => ['You’d never get out. Try “cat” instead.'] },
      emacs: { hidden: true, usage: 'emacs', description: '', run: () => ['M-x butterfly. Try “cat” instead.'] },
      cookies: { hidden: true, usage: 'cookies', description: '', run: () => [{ parts: ['0 cookies here. Not even the edible kind.'], tone: 'dim' }] },
      ll: { hidden: true, usage: 'll', description: '', run: args => COMMANDS.ls.run(['-a', ...args]) },
      source: { hidden: true, usage: 'source', description: '', run: () => { go(REPO, 'the source code'); return []; } },
      pipeline: { hidden: true, usage: 'pipeline', description: '', run: () => { go(WORKFLOW, 'the pipeline'); return []; } }
    };

    const FILTER_HELP = {
      grep: { description: 'Print lines matching a pattern', usage: 'grep [-i] [-v] <pattern> [file…]' },
      head: { description: 'First lines of input', usage: 'head [-n] [file…]' },
      tail: { description: 'Last lines of input', usage: 'tail [-n] [file…]' },
      wc: { description: 'Count lines, words and characters', usage: 'wc [-l | -w] [file…]' },
      sort: { description: 'Sort lines', usage: 'sort [-r] [file…]' },
      uniq: { description: 'Drop repeated lines', usage: 'uniq [file…]' }
    };
    for (const [name, help] of Object.entries(FILTER_HELP)) COMMANDS[name] = { group: 'Filters', ...help, filter: true, run: null };
    const commandNames = Object.keys(COMMANDS).filter(name => !COMMANDS[name].hidden).sort();

    // Runs a pipeline: each stage gets the previous stage's output as text lines.
    async function execute(line) {
      const parsed = parse(line);
      if (parsed.error) { print(`lovsh: ${parsed.error}`, 'err'); return; }
      let lines = null;
      for (const [index, { name, args }] of parsed.pipeline.entries()) {
        const piped = index < parsed.pipeline.length - 1;
        const command = COMMANDS[name];
        if (!command) {
          // Not a command: maybe it's a game title (on the game library page).
          const found = !index && !piped ? searchProviders.flatMap(provider => { try { return provider(line.trim()) || []; } catch { return []; } }) : [];
          if (found.length) { print(`Opening ${found[0].label}…`, 'dim'); close(); found[0].run(); return; }
          print(`lovsh: command not found: ${name}. Type “help”.`, 'err');
          return;
        }
        try {
          if (command.filter) {
            let source = lines;
            let filterArgs = args;
            if (source === null) {
              // Standalone filter: read the file arguments (grep's first plain argument is the pattern).
              const plain = args.filter(arg => !/^-/.test(arg));
              const files = name === 'grep' ? plain.slice(1) : plain.filter(arg => !/^\d+$/.test(arg));
              if (!files.length) { print(`${name}: no input. Try “cat file | ${name} …”.`, 'err'); return; }
              source = [];
              for (const path of files) source.push(...(await readFile(path)).split('\n'));
              filterArgs = args.filter(arg => !files.includes(arg));
            }
            const result = FILTERS[name](source, filterArgs);
            if (result.error) { print(result.error, 'err'); return; }
            lines = result.lines;
          } else {
            const output = await command.run(args, { input: lines, piped });
            lines = (output || []).map(item => piped ? asText(item) : item);
          }
        } catch (error) {
          print(`${name}: ${error.message}`, 'err');
          return;
        }
      }
      for (const item of lines || []) print(item);
    }

    // ---------- Snake ----------

    let snake = null;
    let snakeTimer = null;
    let snakeBoard = null;
    let snakeScore = null;
    const SNAKE_KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };

    function startSnake() {
      const narrow = dialog.clientWidth < 520;
      snake = TerminalGames.createSnake({ width: narrow ? 16 : 28, height: narrow ? 12 : 12 });
      mode = { type: 'snake' };
      form.hidden = true;
      print('SNAKE: arrow keys or WASD to steer, Q or Esc to quit.', 'dim');
      snakeBoard = el('pre', { className: 'term-game', attrs: { 'aria-hidden': 'true' } });
      snakeScore = el('p', { className: 'term-line dim', text: 'Score: 0' });
      const pad = el('div', { className: 'term-pad', attrs: { 'aria-label': 'Snake controls', role: 'group' } });
      for (const [label, direction, name] of [['↑', 'up', 'Up'], ['←', 'left', 'Left'], ['↓', 'down', 'Down'], ['→', 'right', 'Right']]) {
        const button = el('button', { className: `pad-${direction}`, text: label, attrs: { type: 'button', 'aria-label': name } });
        button.addEventListener('click', () => snake?.turn(direction));
        pad.append(button);
      }
      const quit = el('button', { className: 'pad-quit', text: 'Quit', attrs: { type: 'button' } });
      quit.addEventListener('click', () => endSnake('Quit.'));
      pad.append(quit);
      log.append(snakeBoard, snakeScore, pad);
      snakeBoard.textContent = snake.render();
      log.scrollTop = log.scrollHeight;
      dialog.focus();
      const tick = () => {
        snake.step();
        snakeBoard.textContent = snake.render();
        snakeScore.textContent = `Score: ${snake.state.score}`;
        if (snake.state.over) { endSnake(snake.state.won ? 'You filled the board. Incredible.' : 'Game over.'); return; }
        snakeTimer = setTimeout(tick, Math.max(70, 150 - snake.state.score * 4));
      };
      snakeTimer = setTimeout(tick, 400);
    }

    function endSnake(message) {
      if (!snake) return;
      clearTimeout(snakeTimer);
      const score = snake.state.score;
      snakeBest = Math.max(snakeBest, score);
      snake = null;
      mode = null;
      log.querySelector('.term-pad')?.remove();
      print(`${message} Score: ${score} · best this visit: ${snakeBest}`, score ? 'ok' : 'dim');
      form.hidden = false;
      updatePrompt();
      input.focus();
    }

    // ---------- Adventure ----------

    function startAdventure() {
      mode = { type: 'adventure', game: TerminalGames.createAdventure() };
      for (const text of mode.game.intro()) print(text || ' ', text.startsWith('==') ? 'ok' : '');
      print('Type “quit” to leave the game.', 'dim');
      updatePrompt();
    }

    function adventureInput(line) {
      print(line, 'cmd-plain');
      if (['quit', 'exit', 'q'].includes(line.trim().toLowerCase())) {
        mode = null;
        print('You leave the homelab. The deploy can wait.', 'dim');
        updatePrompt();
        return;
      }
      const result = mode.game.command(line);
      for (const text of result.lines) print(text, result.won ? 'ok' : '');
      if (result.won) { mode = null; print('Back in lovsh.', 'dim'); updatePrompt(); }
    }

    // ---------- Suggestions (commands + page search) ----------

    let activeIndex = -1;
    let currentItems = [];
    let historyIndex = -1;

    function findItems(value) {
      const query = value.trim().toLowerCase();
      if (!query || mode || /\s|\|/.test(query)) return [];
      const commands = commandNames.filter(name => name.startsWith(query) && name !== query)
        .map(name => ({ label: name, description: COMMANDS[name].description, command: name }));
      const extra = query.length >= 2 ? searchProviders.flatMap(provider => { try { return provider(query) || []; } catch { return []; } }) : [];
      return [...commands, ...extra].slice(0, 8);
    }

    function renderSuggestions() {
      currentItems = findItems(input.value);
      activeIndex = Math.min(activeIndex, currentItems.length - 1);
      suggestions.replaceChildren(...currentItems.map((item, index) => {
        const option = el('li', { attrs: { role: 'option', id: `term-option-${index}`, 'aria-selected': String(index === activeIndex) } }, item.label);
        if (item.group) option.append(el('span', { className: 'term-group', text: item.group }));
        option.append(el('span', { text: item.description || '' }));
        option.addEventListener('mousedown', event => { event.preventDefault(); choose(item); });
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

    function choose(item) {
      closeSuggestions();
      if (item.command) { input.value = `${item.command} `; input.focus(); return; }
      input.value = '';
      print(item.label, 'cmd');
      sessionHistory.unshift(item.label);
      // Close first, so the dialog hands focus back before the page moves it (e.g. to a game card).
      close();
      item.run();
    }

    async function submit() {
      if (activeIndex >= 0 && currentItems[activeIndex]) { choose(currentItems[activeIndex]); return; }
      const line = input.value;
      input.value = '';
      closeSuggestions();
      if (mode?.type === 'adventure') { adventureInput(line); return; }
      if (!line.trim()) return;
      sessionHistory.unshift(line);
      sessionHistory.length = Math.min(sessionHistory.length, 100);
      historyIndex = -1;
      print(line, 'cmd');
      input.disabled = true;
      try {
        await execute(line);
      } finally {
        input.disabled = false;
        if (dialog.open && !snake) input.focus();
      }
    }

    form.addEventListener('submit', event => { event.preventDefault(); submit(); });
    input.addEventListener('input', () => { activeIndex = -1; renderSuggestions(); });
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (currentItems.length) {
          activeIndex = (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + currentItems.length) % currentItems.length;
          renderSuggestions();
        } else if (sessionHistory.length) {
          historyIndex = Math.max(-1, Math.min(sessionHistory.length - 1, historyIndex + (event.key === 'ArrowUp' ? 1 : -1)));
          input.value = historyIndex >= 0 ? sessionHistory[historyIndex] : '';
        }
      } else if (event.key === 'Tab') {
        event.preventDefault();
        if (activeIndex >= 0 && currentItems[activeIndex]) { choose(currentItems[activeIndex]); return; }
        const result = complete(input.value, { cwd, fs, commands: commandNames });
        closeSuggestions();
        if (result.options.length > 1 && result.line === input.value) print(result.options.join('   '), 'dim');
        input.value = result.line;
      } else if (event.key === 'Escape' && !suggestions.hidden) {
        event.preventDefault();
        closeSuggestions();
      } else if (event.key === 'l' && event.ctrlKey) {
        event.preventDefault();
        log.replaceChildren();
      }
    });

    // Snake keys are handled on the whole dialog while a game is running.
    dialog.addEventListener('keydown', event => {
      if (!snake) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (SNAKE_KEYS[key]) { event.preventDefault(); snake.turn(SNAKE_KEYS[key]); }
      else if (key === 'q' || key === 'Escape') { event.preventDefault(); endSnake('Quit.'); }
    });
    // Esc during Snake quits the game instead of closing the terminal.
    dialog.addEventListener('cancel', event => { if (snake) { event.preventDefault(); endSnake('Quit.'); } });
    dialog.addEventListener('close', () => { if (snake) endSnake('Quit.'); });
    dialog.setAttribute('tabindex', '-1');
    closeButton.addEventListener('click', () => close());
    dialog.addEventListener('click', event => { if (event.target === dialog) close(); });

    function open() {
      if (!dialog.open) dialog.showModal();
      if (!log.childElementCount) {
        print('Welcome to lovgren.dev. This is lovsh, a small shell.', 'ok');
        print({ parts: ['Try ', { key: 'help' }, ' ', { key: 'ls' }, ' ', { key: 'neofetch' }, ' ', { key: 'snake' }, ' or ', { key: 'adventure' }, '.'], tone: 'dim' });
      }
      updatePrompt();
      if (!snake) input.focus();
    }

    function close() {
      if (dialog.open) dialog.close();
    }

    return { open, close, get isOpen() { return dialog.open; } };
  }

  globalThis.SiteTerminal = Object.freeze({ init });
})();
