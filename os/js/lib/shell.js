// Parsing for the Command Prompt: splits a line into words, honouring "double quotes",
// and separates /switches from arguments ("dir /s Games" → { args: ['Games'], switches: ['s'] }).

export function tokenize(line) {
  const words = [];
  let current = '';
  let quoted = false;
  let started = false;
  for (const char of String(line)) {
    if (char === '"') { quoted = !quoted; started = true; continue; }
    if (!quoted && /\s/.test(char)) {
      if (started) { words.push(current); current = ''; started = false; }
      continue;
    }
    current += char;
    started = true;
  }
  if (started) words.push(current);
  return words;
}

export function parseCommand(line) {
  const trimmed = String(line).trim();
  // "cd.." and "cd\" work without a space, like in DOS.
  const match = /^(cd|chdir)([.\\/].*)$/i.exec(trimmed);
  const words = match ? [match[1], match[2]] : tokenize(trimmed);
  const [name = '', ...rest] = words;
  const switches = [];
  const args = [];
  for (const word of rest) {
    if (/^\/[a-z?]+$/i.test(word)) switches.push(...word.slice(1).toLowerCase().split(''));
    else args.push(word);
  }
  return { name: name.toLowerCase(), args, switches, rest: trimmed.slice(name.length).trim() };
}

// Simple DOS wildcards: *.txt, data?.bin
export function wildcard(pattern) {
  const source = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${source}$`, 'i');
}

export const hasWildcard = text => /[*?]/.test(text);
