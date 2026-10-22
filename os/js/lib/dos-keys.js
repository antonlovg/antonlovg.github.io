// Browser key codes (KeyboardEvent.code) → the key numbers DOSBox in js-dos expects (GLFW numbering).

const NAMED = {
  Space: 32, Quote: 39, Comma: 44, Minus: 45, Period: 46, Slash: 47, Semicolon: 59, Equal: 61,
  BracketLeft: 91, Backslash: 92, BracketRight: 93, Backquote: 96, IntlBackslash: 92,
  Escape: 256, Enter: 257, Tab: 258, Backspace: 259, Insert: 260, Delete: 261,
  ArrowRight: 262, ArrowLeft: 263, ArrowDown: 264, ArrowUp: 265, PageUp: 266, PageDown: 267, Home: 268, End: 269,
  CapsLock: 280, ScrollLock: 281, NumLock: 282, PrintScreen: 283, Pause: 284,
  NumpadDecimal: 330, NumpadDivide: 331, NumpadMultiply: 332, NumpadSubtract: 333, NumpadAdd: 334, NumpadEnter: 335, NumpadEqual: 336,
  ShiftLeft: 340, ControlLeft: 341, AltLeft: 342, MetaLeft: 343, ShiftRight: 344, ControlRight: 345, AltRight: 346, MetaRight: 347, ContextMenu: 348
};

export function dosKey(code) {
  if (code in NAMED) return NAMED[code];
  let match = /^Key([A-Z])$/.exec(code);
  if (match) return match[1].charCodeAt(0);
  match = /^Digit(\d)$/.exec(code);
  if (match) return 48 + Number(match[1]);
  match = /^F(\d{1,2})$/.exec(code);
  if (match && Number(match[1]) >= 1 && Number(match[1]) <= 12) return 289 + Number(match[1]);
  match = /^Numpad(\d)$/.exec(code);
  if (match) return 320 + Number(match[1]);
  return null;
}

// Friendly names used in games.json for touch and gamepad buttons ("Ctrl", "Alt", "Space", "Up", "F1", "Y", …).
const ALIASES = { ctrl: 'ControlLeft', control: 'ControlLeft', alt: 'AltLeft', shift: 'ShiftLeft', space: 'Space', enter: 'Enter', esc: 'Escape', escape: 'Escape',
  tab: 'Tab', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', backspace: 'Backspace', pgup: 'PageUp', pgdn: 'PageDown' };

export function keyByName(name) {
  const text = String(name).trim();
  const lower = text.toLowerCase();
  if (ALIASES[lower]) return dosKey(ALIASES[lower]);
  if (/^[a-z]$/i.test(text)) return text.toUpperCase().charCodeAt(0);
  if (/^\d$/.test(text)) return 48 + Number(text);
  return dosKey(text) ?? dosKey(text.replace(/^f/, 'F'));
}

// Characters typed on a phone's on-screen keyboard → key presses (with Shift when needed). US layout.
const SHIFTED = { '!': '1', '@': '2', '#': '3', $: '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0', _: '-', '+': '=', '{': '[', '}': ']', '|': '\\', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/', '~': '`' };
const PLAIN = { ' ': 32, "'": 39, ',': 44, '-': 45, '.': 46, '/': 47, ';': 59, '=': 61, '[': 91, '\\': 92, ']': 93, '`': 96, '\n': 257 };

export function keysForChar(char) {
  if (/^[a-z]$/.test(char)) return { key: char.toUpperCase().charCodeAt(0), shift: false };
  if (/^[A-Z]$/.test(char)) return { key: char.charCodeAt(0), shift: true };
  if (/^\d$/.test(char)) return { key: char.charCodeAt(0), shift: false };
  if (char in PLAIN) return { key: PLAIN[char], shift: false };
  if (char in SHIFTED) return { key: keysForChar(SHIFTED[char]).key, shift: true };
  return null;
}

export const SHIFT = NAMED.ShiftLeft;
