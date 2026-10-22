// Help: how LövOS works, keyboard shortcuts, files, DOS games and GitHub Sync.
import { h } from '../dom.js';

const TOPICS = [
  { id: 'start', title: 'Getting started', body: [
    'LövOS is a desktop that runs entirely in your browser. Open programs from the Start menu, the desktop icons or the quick-launch buttons next to Start.',
    'Windows can be moved by their title bar, resized from their edges, minimised to the taskbar, maximised (double-click the title bar) and closed. On a phone, windows open full-screen.',
    'Your files, games and settings are stored in this browser on this device. They stay when you close the tab, but clearing the site\'s data removes them, so use GitHub Sync or Control Panel → Storage → Back up.'
  ] },
  { id: 'keys', title: 'Keyboard shortcuts', table: [
    ['Alt+S or Ctrl+Esc', 'Open the Start menu'], ['Alt+R', 'Run…'], ['Alt+W', 'Close the active window'], ['Alt+`', 'Switch to the next window (Alt+Shift+` goes back)'],
    ['Alt+M', 'Show the desktop (minimise everything)'], ['Alt+T', 'Task Manager'], ['Alt+X', 'File Explorer'], ['F2', 'Rename the selected file'],
    ['Del / Shift+Del', 'Delete (to the Recycle Bin / for good)'], ['Ctrl+C, Ctrl+X, Ctrl+V', 'Copy, cut and paste files'], ['Ctrl+A', 'Select everything'],
    ['Shift+F10 or the Menu key', 'Right-click menu'], ['Enter', 'Open'], ['Backspace', 'Up one folder (File Explorer)']
  ], note: 'Browsers keep Alt+Tab, Alt+F4 and the Windows key for themselves, which is why LövOS uses Alt with letters.' },
  { id: 'files', title: 'Files and folders', body: [
    'Drag files or whole folders from your computer onto the desktop or into a File Explorer window to copy them in. To get files out, right-click and choose "Download to computer" (folders download as a zip).',
    'Drag icons to move them, or hold Ctrl while dropping to copy. Drop them on the Recycle Bin to delete them. Zip files can be extracted by opening them.',
    'Text files open in Notepad and pictures in Paint. DOS programs (.exe, .com, .bat) and .jsdos game bundles open in the MS-DOS Prompt.'
  ] },
  { id: 'dos', title: 'DOS and DOS games', body: [
    'MS-DOS Prompt starts real DOS (DOSBox) with your C: drive mounted as C:. Click the DOS screen before typing. Long names are shortened DOS-style, e.g. Documents becomes DOCUME~1.',
    'To play Jazz Jackrabbit, open it from the desktop or DOS Games and choose your own copy of the game (a zip of the game folder, or the folder itself). LövOS does not include games.',
    'Anything a game saves is copied back to the C: drive every minute and when you close its window, so save games survive and GitHub Sync can carry them to your other devices.',
    'Gamepads work (D-pad and left stick are the arrow keys). On touch screens a D-pad and game buttons appear over the game; the keyboard button brings up your phone\'s keyboard for typing.',
    'If a game runs too fast or too slow, change Machine → Speed. Alt+Enter (or View → Full screen) fills the screen.'
  ] },
  { id: 'sync', title: 'GitHub Sync', body: [
    'GitHub Sync copies your C: drive to a folder in a private GitHub repository of yours, and back. Set it up in Control Panel → GitHub Sync with a fine-grained personal access token that can only reach that one repository.',
    'Each sync is a single commit. Files changed on only one side are copied to the other; if a file changed on both, the device\'s version is uploaded and GitHub\'s is kept next to it as "(GitHub copy)".',
    'The token is stored only in this browser and only ever sent to api.github.com. Use a private repository: everything you sync is visible to anyone who can see the repository.'
  ] },
  { id: 'mines', title: 'Minesweeper', body: [
    'Open squares without hitting a mine. A number tells you how many of the eight squares around it hide mines. Right-click (or long-press, or use Flag mode) to mark a mine; click a number whose mines are all flagged to open its other neighbours.'
  ] },
  { id: 'privacy', title: 'Privacy', body: [
    'LövOS has no trackers, no cookies and no ads. Files and settings live in this browser\'s IndexedDB storage, and offline support uses a cache of LövOS\'s own files.',
    'The only outside service LövOS can talk to is GitHub\'s API, and only when you set up GitHub Sync. The lovgren.dev privacy page has the details.'
  ] }
];

export default async function open(ctx) {
  const win = ctx.window({ width: 600, height: 460, minWidth: 320, minHeight: 260 });
  const nav = h('nav', { class: 'help-nav', 'aria-label': 'Help topics' });
  const article = h('article', { class: 'help-article', tabIndex: -1 });
  win.body.classList.add('help');
  win.body.append(h('div', { class: 'help-layout' }, nav, article));

  function show(id) {
    const topic = TOPICS.find(t => t.id === id) || TOPICS[0];
    win.sessionArgs = { topic: topic.id };
    nav.replaceChildren(h('ul', {}, TOPICS.map(t => h('li', {}, h('button', { type: 'button', class: `help-link${t === topic ? ' current' : ''}`, 'aria-current': t === topic ? 'page' : null, text: t.title, onclick: () => { show(t.id); article.focus(); } })))));
    article.replaceChildren(h('h2', { text: topic.title }),
      ...(topic.body || []).map(text => h('p', { text })),
      topic.table ? h('table', { class: 'help-table' }, h('tbody', {}, topic.table.map(([k, v]) => h('tr', {}, h('th', { scope: 'row' }, h('kbd', { text: k })), h('td', { text: v }))))) : null,
      topic.note ? h('p', { class: 'help-note', text: topic.note }) : null,
      topic.id === 'privacy' ? h('p', {}, h('a', { href: '/privacy/', target: '_blank', rel: 'noopener', text: 'Read the lovgren.dev privacy page' })) : null);
  }

  win.onArgs = args => show(args.topic);
  show(ctx.args.topic);
}
