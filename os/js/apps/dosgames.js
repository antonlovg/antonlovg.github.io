// DOS Games: the game library. Install a game from your own copy (zip or folder), play it,
// see where its files are, remove it, or add any other DOS game.
import { h, icon, pickFiles } from '../dom.js';
import * as vfs from '../vfs.js';
import { launch } from '../apps.js';
import { allGames, isInstalled, install, uninstall, addCustomGame, removeCustomGame } from '../games.js';
import { join, display, formatSize, validName, extension } from '../lib/path.js';
import { readZip } from '../lib/zip.js';
import { confirmBox, errorBox, promptBox, messageBox } from '../dialogs.js';
import * as sync from '../sync.js';

export default async function open(ctx) {
  const win = ctx.window({ width: 560, height: 440, minWidth: 320, minHeight: 260 });
  const list = h('div', { class: 'games-list' });
  const addButton = h('button', { class: 'button', type: 'button', text: 'Add another DOS game…', onclick: addGame });
  const syncNote = h('p', { class: 'games-note' });
  win.body.classList.add('dosgames');
  win.body.append(h('div', { class: 'games-head' }, icon('games', 32), h('div', {}, h('h2', { text: 'DOS Games' }), h('p', { text: 'Bring your own copies. Games run in DOSBox and their files live on your C: drive.' }))), list, h('div', { class: 'games-foot' }, syncNote, addButton));

  async function render() {
    const games = await allGames();
    const cards = [];
    for (const game of games) {
      const installed = await isInstalled(game);
      let size = '';
      if (installed) size = formatSize((await vfs.walk(game.folder)).reduce((sum, entry) => sum + (entry.size || 0), 0));
      const play = h('button', { class: 'button default', type: 'button', text: installed ? 'Play' : 'Install…', onclick: () => launch('dos', { game: game.id }) });
      const more = [];
      if (installed) {
        more.push(h('button', { class: 'button small', type: 'button', text: 'Open folder', onclick: () => launch('explorer', { path: game.folder }) }));
        more.push(h('button', { class: 'button small', type: 'button', text: 'Desktop shortcut', onclick: () => shortcut(game) }));
        more.push(h('button', { class: 'button small', type: 'button', text: 'Remove…', onclick: () => remove(game) }));
      }
      if (game.custom) more.push(h('button', { class: 'button small', type: 'button', text: 'Forget game', onclick: () => forget(game) }));
      cards.push(h('article', { class: 'game-card' },
        icon(game.icon || 'dos', 32),
        h('div', { class: 'game-info' },
          h('h3', { text: game.title }),
          h('p', { class: 'game-meta', text: [game.year, game.publisher].filter(Boolean).join(' · ') || 'Your own game' }),
          game.description ? h('p', { text: game.description }) : null,
          h('p', { class: `game-state ${installed ? 'ok' : ''}`, text: installed ? `Installed in ${display(game.folder)} (${size})` : 'Not installed' }),
          game.controls?.keys ? h('p', { class: 'game-keys', text: game.controls.keys }) : null,
          h('div', { class: 'game-actions' }, play, ...more))));
    }
    list.replaceChildren(...cards);
    const config = await sync.getConfig();
    syncNote.textContent = config.owner && config.repo && config.token
      ? `GitHub Sync is on: games and saves follow you to ${config.owner}/${config.repo}.`
      : 'Tip: turn on GitHub Sync in Control Panel to play on any device with your saves.';
  }

  async function shortcut(game) {
    await vfs.write(join('C:/Desktop', await vfs.freeName('C:/Desktop', `${game.title}.lnk`)), JSON.stringify({ app: 'dos', args: { game: game.id }, icon: game.icon || 'dos' }));
    messageBox(`A shortcut to ${game.title} is on the desktop.`, { title: 'DOS Games', owner: win });
  }

  async function remove(game) {
    if (!(await confirmBox(`Remove ${game.title}? Its folder (${display(game.folder)}), including save games, goes to the Recycle Bin.`, { title: 'Remove game', kind: 'warning', owner: win }))) return;
    await uninstall(game);
    render();
  }

  async function forget(game) {
    if (!(await confirmBox(`Remove ${game.title} from this list? Its files stay on the drive.`, { title: 'DOS Games', owner: win }))) return;
    await removeCustomGame(game.id);
    render();
  }

  // Add any DOS game: choose its zip or folder, then which program starts it.
  async function addGame() {
    const choice = await messageBox('Choose your game as a zip file or as a folder.', { title: 'Add a DOS game', kind: 'question', buttons: ['Zip file…', 'Folder…', 'Cancel'], owner: win });
    if (choice === 'Cancel' || !choice) return;
    const files = choice === 'Zip file…' ? await pickFiles({ accept: '.zip', multiple: false }) : await pickFiles({ folder: true });
    if (!files.length) return;
    let names;
    try {
      names = choice === 'Zip file…'
        ? readZip(new Uint8Array(await files[0].arrayBuffer())).filter(entry => !entry.dir).map(entry => entry.path)
        : files.map(file => file.webkitRelativePath || file.name);
    } catch (error) { errorBox(error, { owner: win }); return; }
    const programs = [...new Set(names.filter(name => ['exe', 'com', 'bat'].includes(extension(name))).map(name => name.split('/').pop().toUpperCase()))];
    if (!programs.length) { errorBox('No DOS programs (.exe, .com or .bat) were found in it.', { owner: win }); return; }
    const guess = files[0].name.replace(/\.zip$/i, '') || (files[0].webkitRelativePath || '').split('/')[0] || 'My Game';
    const title = await promptBox('Name of the game:', { title: 'Add a DOS game', value: guess, owner: win, validate: v => (v.trim() ? '' : 'Type a name.') });
    if (!title) return;
    const program = programs.length === 1 ? programs[0] : await promptBox(`Which program starts the game? (${programs.slice(0, 12).join(', ')}${programs.length > 12 ? ', …' : ''})`, {
      title: 'Add a DOS game', owner: win, value: programs.find(p => !/^(setup|install|config)/i.test(p)) || programs[0],
      validate: v => (programs.includes(v.trim().toUpperCase()) ? '' : 'Type one of the program names listed.')
    });
    if (!program) return;
    const folderName = title.trim().replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || 'GAME';
    const folder = join('C:/Games', await vfs.freeName('C:/Games', folderName));
    if (!validName(folder.split('/').pop())) return;
    const game = { id: `custom-${Date.now().toString(36)}`, title: title.trim(), folder, program: program.trim().toUpperCase(), icon: 'dos', dosbox: { cycles: 'auto' } };
    try {
      await install(game, choice === 'Zip file…' ? files[0] : files);
      await addCustomGame(game);
      render();
      launch('dos', { game: game.id });
    } catch (error) { errorBox(error, { owner: win }); }
  }

  const onChange = event => { if (event.detail.dirs.some(dir => /^c:\/games/i.test(dir))) render(); };
  vfs.events.addEventListener('change', onChange);
  win.on('close', () => vfs.events.removeEventListener('change', onChange));
  await render();
}
