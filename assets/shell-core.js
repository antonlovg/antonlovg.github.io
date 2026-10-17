// lovsh core: the pure parts of the terminal (parsing, virtual file system, completion, text filters).
// No DOM access here, so it is unit-tested in Node (tests/shell-core.test.mjs).
(function attachShellCore(root, createApi) {
  const api = createApi();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ShellCore = api;
})(globalThis, () => {
  const HOME = '/home/anton';

  // Splits a command line into a pipeline: [{ name, args }], honouring "double" and 'single' quotes.
  function parse(line) {
    const commands = [];
    let args = [];
    let current = '';
    let quote = null;
    let hasToken = false;
    const push = () => { if (hasToken) args.push(current); current = ''; hasToken = false; };
    for (const char of String(line)) {
      if (quote) {
        if (char === quote) quote = null;
        else current += char;
        continue;
      }
      if (char === '"' || char === "'") { quote = char; hasToken = true; continue; }
      if (char === '|') { push(); commands.push(args); args = []; continue; }
      if (/\s/.test(char)) { push(); continue; }
      current += char;
      hasToken = true;
    }
    if (quote) return { error: 'unterminated quote' };
    push();
    commands.push(args);
    if (commands.length > 1 && commands.some(command => !command.length)) return { error: 'syntax error near |' };
    const pipeline = commands.filter(command => command.length).map(([name, ...rest]) => ({ name: name.toLowerCase(), args: rest }));
    return { pipeline };
  }

  // ---------- Virtual file system ----------
  // Nodes: { type: 'dir', children: {} } or { type: 'file', content: string | () => Promise<string>, open?: url }

  function dir(children) { return { type: 'dir', children }; }
  function file(content, extra = {}) { return { type: 'file', content, ...extra }; }

  function normalize(cwd, target = '~') {
    let path = String(target);
    if (path === '~' || path.startsWith('~/')) path = HOME + path.slice(1);
    else if (!path.startsWith('/')) path = `${cwd}/${path}`;
    const parts = [];
    for (const part of path.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') parts.pop();
      else parts.push(part);
    }
    return `/${parts.join('/')}`;
  }

  function lookup(fs, path) {
    let node = fs;
    for (const part of path.split('/').filter(Boolean)) {
      if (node?.type !== 'dir' || !Object.hasOwn(node.children, part)) return null;
      node = node.children[part];
    }
    return node;
  }

  function display(path) {
    return path === HOME ? '~' : path.startsWith(`${HOME}/`) ? `~${path.slice(HOME.length)}` : path;
  }

  function list(fs, path, { all = false } = {}) {
    const node = lookup(fs, path);
    if (!node) return null;
    if (node.type === 'file') return [path.split('/').pop()];
    return Object.entries(node.children)
      .filter(([name]) => all || !name.startsWith('.'))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, child]) => (child.type === 'dir' ? `${name}/` : name));
  }

  function tree(fs, path, prefix = '') {
    const node = lookup(fs, path);
    if (!node || node.type !== 'dir') return [];
    const entries = Object.entries(node.children).filter(([name]) => !name.startsWith('.')).sort(([a], [b]) => a.localeCompare(b));
    return entries.flatMap(([name, child], index) => {
      const last = index === entries.length - 1;
      const line = `${prefix}${last ? '└── ' : '├── '}${name}${child.type === 'dir' ? '/' : ''}`;
      return child.type === 'dir' ? [line, ...tree(fs, `${path}/${name}`, `${prefix}${last ? '    ' : '│   '}`)] : [line];
    });
  }

  // ---------- Tab completion ----------

  function longestCommonPrefix(words) {
    if (!words.length) return '';
    let prefix = words[0];
    for (const word of words.slice(1)) while (!word.startsWith(prefix)) prefix = prefix.slice(0, -1);
    return prefix;
  }

  // Completes the last word of `line`: a command name for the first word, otherwise a path.
  function complete(line, { cwd, fs, commands }) {
    // Only the part after the last pipe matters; its first word is a command, later words are paths.
    const segment = line.slice(line.lastIndexOf('|') + 1).replace(/^\s+/, '');
    const last = /\s$/.test(segment) ? '' : segment.split(/\s+/).at(-1);
    const isCommand = !/\s/.test(segment);
    let options;
    if (isCommand) {
      options = commands.filter(name => name.startsWith(last.toLowerCase()));
    } else {
      const slash = last.lastIndexOf('/');
      const base = slash >= 0 ? last.slice(0, slash + 1) : '';
      const partial = last.slice(slash + 1);
      const entries = list(fs, normalize(cwd, base || '.'), { all: partial.startsWith('.') }) || [];
      options = entries.filter(name => name.startsWith(partial)).map(name => base + name);
    }
    if (!options.length) return { line, options: [] };
    const common = longestCommonPrefix(options);
    // A single match is completed fully (with a trailing space unless it's a directory).
    const completed = options.length === 1 ? (options[0].endsWith('/') ? options[0] : `${options[0]} `) : common;
    if (completed.length < last.length) return { line, options };
    return { line: line.slice(0, line.length - last.length) + completed, options };
  }

  // ---------- Text filters (work on arrays of lines) ----------

  const FILTERS = {
    grep(lines, args = []) {
      const flags = args.filter(arg => /^-[a-z]+$/.test(arg)).join('');
      const pattern = args.find(arg => !/^-[a-z]+$/.test(arg));
      if (pattern === undefined) return { error: 'usage: grep [-i] [-v] pattern' };
      const insensitive = flags.includes('i');
      const invert = flags.includes('v');
      const needle = insensitive ? pattern.toLowerCase() : pattern;
      return { lines: lines.filter(line => (insensitive ? line.toLowerCase() : line).includes(needle) !== invert) };
    },
    head(lines, args = []) {
      const count = Number((args.find(arg => /^-?\d+$/.test(arg)) || '10').replace('-', ''));
      return { lines: lines.slice(0, count) };
    },
    tail(lines, args = []) {
      const count = Number((args.find(arg => /^-?\d+$/.test(arg)) || '10').replace('-', ''));
      return { lines: count ? lines.slice(-count) : [] };
    },
    wc(lines, args = []) {
      const text = lines.join('\n');
      if (args.includes('-l')) return { lines: [String(lines.length)] };
      if (args.includes('-w')) return { lines: [String(text.split(/\s+/).filter(Boolean).length)] };
      return { lines: [`${lines.length} ${text.split(/\s+/).filter(Boolean).length} ${text.length}`] };
    },
    sort(lines, args = []) {
      const sorted = [...lines].sort((a, b) => a.localeCompare(b));
      return { lines: args.includes('-r') ? sorted.reverse() : sorted };
    },
    uniq(lines) {
      return { lines: lines.filter((line, index) => line !== lines[index - 1]) };
    }
  };

  return { HOME, parse, dir, file, normalize, lookup, display, list, tree, complete, FILTERS };
});
