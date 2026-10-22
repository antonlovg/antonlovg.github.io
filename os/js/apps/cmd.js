// Command Prompt: a command line for the C: drive (DIR, CD, COPY, START, …). For real DOS programs
// it hands over to the MS-DOS Prompt (DOSBox). Up/Down recall history, Tab completes names.
import { h } from '../dom.js';
import * as vfs from '../vfs.js';
import { launch, openPath, apps, runCommand } from '../apps.js';
import { normalize, display, parent, join, basename, isRoot, extension, validName, RECYCLE, isInside } from '../lib/path.js';
import { parseCommand, wildcard, hasWildcard } from '../lib/shell.js';
import { moveInto, extractZip } from '../fileops.js';
import { syncNow } from '../sync.js';

const HELP = {
  cd: 'Displays or changes the current folder.   CD [path]   CD ..   CD \\',
  cls: 'Clears the screen.',
  copy: 'Copies files.   COPY source destination',
  date: 'Displays the date.',
  del: 'Deletes files (to the Recycle Bin).   DEL name   DEL *.txt',
  dir: 'Lists the files in a folder.   DIR [path] [/S for subfolders]',
  dos: 'Opens the MS-DOS Prompt (DOSBox) in the current folder.',
  echo: 'Displays a message.   ECHO text',
  exit: 'Closes the Command Prompt.',
  help: 'Lists the commands, or explains one.   HELP [command]',
  md: 'Creates a folder.   MD name',
  move: 'Moves files and folders.   MOVE source destination-folder',
  ren: 'Renames a file or folder.   REN old new',
  rd: 'Removes a folder.   RD name   RD /S name (with everything in it)',
  start: 'Opens a program, folder or document.   START notepad   START .',
  sync: 'Syncs the drive with GitHub now (if GitHub Sync is set up).',
  time: 'Displays the time.',
  title: 'Sets the window title.   TITLE text',
  tree: 'Shows the folder structure.   TREE [path]',
  type: 'Displays the contents of a text file.   TYPE name',
  unzip: 'Extracts a zip file into a new folder.   UNZIP name.zip',
  ver: 'Displays the LövOS version.'
};
const ALIASES = { chdir: 'cd', mkdir: 'md', rmdir: 'rd', erase: 'del', rename: 'ren', cp: 'copy', mv: 'move', ls: 'dir', rm: 'del', cat: 'type', clear: 'cls', pwd: 'cd', extract: 'unzip' };

export default async function open(ctx) {
  const win = ctx.window({ width: 640, height: 380, minWidth: 300, minHeight: 160 });
  let cwd = normalize(ctx.args.path && (await vfs.stat(ctx.args.path))?.type === 'dir' ? ctx.args.path : 'C:/Documents');
  const history = [];
  let historyIndex = 0;
  const output = h('div', { class: 'cmd-output', role: 'log', 'aria-live': 'polite' });
  const prompt = h('span', { class: 'cmd-prompt' });
  const input = h('input', { class: 'cmd-input', type: 'text', spellcheck: false, autocomplete: 'off', autocapitalize: 'off', 'aria-label': 'Command', dataset: { autofocus: '' } });
  const line = h('form', { class: 'cmd-line' }, prompt, input);
  const screen = h('div', { class: 'cmd-screen' }, output, line);
  win.body.classList.add('cmd');
  win.body.append(screen);
  screen.addEventListener('pointerup', () => { if (!window.getSelection()?.toString()) input.focus({ preventScroll: true }); });

  const print = (text = '', cls = '') => { output.append(h('div', { class: cls, text: text || '\u00a0' })); };
  const showPrompt = () => { prompt.textContent = `${display(cwd)}>`; };
  const scroll = () => { screen.scrollTop = screen.scrollHeight; };

  print('LövOS Command Prompt [Version 1.0]');
  print('Type HELP for a list of commands, or DOS to start the real MS-DOS Prompt.');
  print();
  showPrompt();

  const resolve = arg => normalize(arg, cwd);

  async function matching(arg) {
    const full = resolve(arg);
    if (!hasWildcard(basename(full))) {
      const entry = await vfs.stat(full);
      return entry ? [entry] : [];
    }
    const pattern = wildcard(basename(full));
    return (await vfs.list(parent(full))).filter(entry => pattern.test(entry.name));
  }

  const COMMANDS = {
    async help({ args }) {
      if (args[0]) {
        const name = ALIASES[args[0].toLowerCase()] || args[0].toLowerCase();
        print(HELP[name] || `This command is not supported by the help utility: ${args[0]}`);
        return;
      }
      print('For more information on a command, type HELP command-name');
      for (const [name, text] of Object.entries(HELP)) print(`${name.toUpperCase().padEnd(9)}${text.split('.')[0]}.`);
      print();
      print(`You can also type a program name: ${apps().flatMap(a => a.run?.[0] || []).join(', ')}.`);
    },
    async cls() { output.replaceChildren(); },
    async ver() { print(); print('LövOS [Version 1.0] — running on DOSBox via js-dos 8'); print(); },
    async echo({ rest }) { print(rest || 'ECHO is on.'); },
    async date() { print(`The current date is: ${new Date().toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' })}`); },
    async time() { print(`The current time is: ${new Date().toLocaleTimeString()}`); },
    async title({ rest }) { win.setTitle(rest || 'Command Prompt'); },
    async exit() { win.close(); },
    async cd({ args, name }) {
      if (!args[0] || name === 'pwd') { print(display(cwd)); return; }
      const target = resolve(args[0]);
      const entry = await vfs.stat(target);
      if (entry?.type !== 'dir') { print('The system cannot find the path specified.'); return; }
      cwd = entry.path;
      win.sessionArgs = { path: cwd };
    },
    async dir({ args, switches }) {
      const target = args[0] ? resolve(args[0]) : cwd;
      const pattern = args[0] && hasWildcard(basename(target)) ? wildcard(basename(target)) : null;
      const folder = pattern ? parent(target) : target;
      const entry = await vfs.stat(folder);
      if (entry?.type !== 'dir') { print('File Not Found'); return; }
      const recursive = switches.includes('s');
      const folders = recursive ? [entry, ...(await vfs.walk(folder)).filter(e => e.type === 'dir' && !isInside(e.path, RECYCLE))] : [entry];
      let files = 0;
      let dirs = 0;
      let bytes = 0;
      print(' Volume in drive C is LOVOS');
      for (const dir of folders) {
        const items = (await vfs.list(dir.path)).filter(e => !pattern || pattern.test(e.name));
        if (recursive && !items.length) continue;
        print();
        print(` Directory of ${display(dir.path)}`);
        print();
        for (const item of items) {
          const when = new Date(item.mtime).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
          print(`${when.padEnd(20)}  ${item.type === 'dir' ? '<DIR>         ' : item.size.toLocaleString().padStart(14)} ${item.name}`);
          if (item.type === 'dir') dirs++; else { files++; bytes += item.size; }
        }
      }
      print(`${String(files).padStart(16)} File(s) ${bytes.toLocaleString().padStart(14)} bytes`);
      print(`${String(dirs).padStart(16)} Dir(s)`);
    },
    async tree({ args }) {
      const root = args[0] ? resolve(args[0]) : cwd;
      if ((await vfs.stat(root))?.type !== 'dir') { print('Invalid path'); return; }
      print(display(root));
      const walkTree = async (dir, prefix) => {
        const folders = (await vfs.list(dir)).filter(e => e.type === 'dir' && !e.name.startsWith('$'));
        for (const [i, folder] of folders.entries()) {
          const last = i === folders.length - 1;
          print(`${prefix}${last ? '└───' : '├───'}${folder.name}`);
          await walkTree(folder.path, prefix + (last ? '    ' : '│   '));
        }
      };
      await walkTree(root, '');
    },
    async type({ args }) {
      if (!args[0]) { print('The syntax of the command is incorrect.'); return; }
      const entry = await vfs.stat(resolve(args[0]));
      if (entry?.type !== 'file') { print('The system cannot find the file specified.'); return; }
      if (entry.size > 256 * 1024) { print('That file is too big to show here. Try: notepad ' + args[0]); return; }
      const text = await vfs.readText(entry.path);
      text.replace(/\r\n/g, '\n').split('\n').forEach(l => print(l));
    },
    async md({ args }) {
      if (!args[0]) { print('The syntax of the command is incorrect.'); return; }
      const target = resolve(args[0]);
      if (await vfs.stat(target)) { print(`A subdirectory or file ${args[0]} already exists.`); return; }
      if (!validName(basename(target))) { print('The filename, directory name, or volume label syntax is incorrect.'); return; }
      await vfs.mkdir(target);
    },
    async rd({ args, switches }) {
      const entry = args[0] && await vfs.stat(resolve(args[0]));
      if (entry?.type !== 'dir') { print('The system cannot find the file specified.'); return; }
      if (isRoot(entry.path)) { print('Access is denied.'); return; }
      if ((await vfs.list(entry.path)).length && !switches.includes('s')) { print('The directory is not empty.'); return; }
      await vfs.recycle(entry.path);
      if (cwd.toLowerCase().startsWith(entry.path.toLowerCase())) cwd = parent(entry.path);
    },
    async del({ args }) {
      if (!args[0]) { print('The syntax of the command is incorrect.'); return; }
      const found = (await matching(args[0])).filter(e => e.type === 'file');
      if (!found.length) { print(`Could Not Find ${display(resolve(args[0]))}`); return; }
      for (const entry of found) await vfs.recycle(entry.path);
      print(`${found.length} file(s) sent to the Recycle Bin.`);
    },
    async copy({ args }) { await copyOrMove(args, true); },
    async move({ args }) { await copyOrMove(args, false); },
    async ren({ args }) {
      if (args.length < 2) { print('The syntax of the command is incorrect.'); return; }
      const entry = await vfs.stat(resolve(args[0]));
      if (!entry) { print('The system cannot find the file specified.'); return; }
      if (!validName(args[1])) { print('The syntax of the command is incorrect.'); return; }
      await vfs.move(entry.path, join(parent(entry.path), args[1]));
    },
    async start({ args, rest }) {
      if (!args[0]) { launch('cmd', { path: cwd }); return; }
      const target = resolve(args[0]);
      if (await vfs.stat(target)) { openPath(target); return; }
      runCommand(rest);
    },
    async dos() { launch('dos', { mount: cwd }); },
    async sync() {
      print('Syncing with GitHub…');
      const plan = await syncNow({ interactive: false });
      const { status } = await import('../sync.js');
      print(plan ? status().message : `Sync did not run: ${status().message}`);
    },
    async unzip({ args }) {
      const entry = args[0] && await vfs.stat(resolve(args[0]));
      if (entry?.type !== 'file' || extension(entry.name) !== 'zip') { print('Give the name of a .zip file.'); return; }
      const folder = await extractZip(entry.path);
      print(`Extracted to ${display(folder)}`);
    }
  };

  async function copyOrMove(args, copy) {
    if (args.length < 2) { print('The syntax of the command is incorrect.'); return; }
    const sources = await matching(args[0]);
    if (!sources.length) { print('The system cannot find the file specified.'); return; }
    const destination = resolve(args[1]);
    const destEntry = await vfs.stat(destination);
    if (destEntry?.type === 'dir') {
      await moveInto(sources.map(e => e.path), destination, { copy });
    } else if (sources.length === 1 && !destEntry) {
      if (!(await vfs.stat(parent(destination)))) { print('The system cannot find the path specified.'); return; }
      if (copy) await vfs.copy(sources[0].path, destination); else await vfs.move(sources[0].path, destination);
    } else {
      print(destEntry ? `${basename(destination)} already exists.` : 'The system cannot find the path specified.');
      return;
    }
    print(`${String(sources.length).padStart(8)} file(s) ${copy ? 'copied' : 'moved'}.`);
  }

  async function run(text) {
    print(`${display(cwd)}>${text}`, 'cmd-echo');
    const command = parseCommand(text);
    if (!command.name) return;
    const name = ALIASES[command.name] || command.name;
    command.name = command.name === 'pwd' ? 'pwd' : name;
    try {
      if (/^[a-z]:$/i.test(text.trim())) { if (text.trim().toUpperCase() !== 'C:') print('The system cannot find the drive specified.'); return; }
      if (command.switches.includes('?')) { print(HELP[name] || 'No help for that command.'); return; }
      if (COMMANDS[name]) { await COMMANDS[name](command); return; }
      const app = apps().find(a => a.id === command.name || a.run?.includes(command.name));
      if (app) { launch(app.id, command.args[0] ? { path: resolve(command.args[0]) } : (app.id === 'dos' ? { mount: cwd } : {})); return; }
      const file = await vfs.stat(resolve(command.name));
      if (file) { openPath(file.path); return; }
      for (const ext of ['exe', 'com', 'bat']) {
        const program = await vfs.stat(resolve(`${command.name}.${ext}`));
        if (program) { launch('dos', { path: program.path }); return; }
      }
      print(`'${command.name}' is not recognized as an internal or external command,`);
      print('operable program or batch file.');
    } catch (error) {
      print(error.message || String(error), 'cmd-error');
    } finally {
      print();
    }
  }

  line.addEventListener('submit', async event => {
    event.preventDefault();
    const text = input.value;
    input.value = '';
    if (text.trim()) history.push(text);
    historyIndex = history.length;
    input.disabled = true;
    await run(text);
    input.disabled = false;
    if (!win.closed) {
      showPrompt();
      scroll();
      input.focus({ preventScroll: true });
    }
  });

  input.addEventListener('keydown', async event => {
    if (event.key === 'ArrowUp' && history.length) {
      historyIndex = Math.max(0, historyIndex - 1);
      input.value = history[historyIndex];
    } else if (event.key === 'ArrowDown' && history.length) {
      historyIndex = Math.min(history.length, historyIndex + 1);
      input.value = history[historyIndex] || '';
    } else if (event.key === 'Tab') {
      const words = input.value.split(' ');
      const last = words.pop().replace(/"/g, '');
      const full = resolve(last || '.');
      const folder = last && !/[\\/]$/.test(last) ? parent(full) : full;
      const prefix = last && !/[\\/]$/.test(last) ? basename(full).toLowerCase() : '';
      const names = (await vfs.list(folder)).map(e => e.name).filter(n => n.toLowerCase().startsWith(prefix));
      if (names.length) {
        const base = last.includes('\\') || last.includes('/') ? last.slice(0, Math.max(last.lastIndexOf('\\'), last.lastIndexOf('/')) + 1) : '';
        const choice = names[(names.indexOf(input.dataset.tabLast || '') + 1) % names.length];
        input.dataset.tabLast = choice;
        const completed = base + choice;
        words.push(/\s/.test(completed) ? `"${completed}"` : completed);
        input.value = words.join(' ');
      }
    } else if (event.key === 'c' && event.ctrlKey && !input.selectionEnd) {
      print(`${display(cwd)}>${input.value}^C`);
      input.value = '';
    } else {
      if (event.key !== 'Shift') delete input.dataset.tabLast;
      return;
    }
    event.preventDefault();
  });

  win.onArgs = args => { if (args.path) { cwd = normalize(args.path); showPrompt(); } };
  input.focus();
}
