// The first time LövOS starts on a device, it sets up the C: drive: the usual folders, a welcome
// note, desktop shortcuts and a couple of DOS files to try. Later versions only add what's new.
import * as vfs from './vfs.js';

const SEED_VERSION = 1;

const WELCOME = `Welcome to LövOS!

LövOS is a little desktop that runs entirely in your web browser. Everything you save here stays in this browser on this device, unless you turn on GitHub Sync.

Things to try
-------------
* Double-click "Jazz Jackrabbit" on the desktop to install your own copy of the 1994 DOS game and play it, with sound, a gamepad or touch controls.
* MS-DOS Prompt starts a real DOS (DOSBox) with your C: drive mounted.
* Drag files from your computer onto the desktop or into a folder to copy them in. Right-click a file and choose "Download to computer" to get it out again.
* Control Panel > GitHub Sync keeps your drive (games and save games too) in a private GitHub repository, so you can carry on from another device.

Keyboard shortcuts
------------------
Alt+S   Start menu
Alt+R   Run
Alt+W   Close the window
Alt+\`   Switch window
Alt+M   Show the desktop
Alt+T   Task Manager
Alt+X   File Explorer
F2      Rename
Del     Delete
Ctrl+C, Ctrl+X, Ctrl+V   Copy, cut and paste

Have fun!
`;

const DOS_README = `LovOS DOS folder
================

MS-DOS Prompt mounts your whole C: drive, so this is C:\\DOS inside DOS.
Try:  CD DOS  then  HELLO

Tip: in DOS, folder names longer than 8 letters are shortened,
so "C:\\Documents" becomes C:\\DOCUME~1.
`;

const HELLO = '@echo off\r\necho.\r\necho  Hello from LovOS and DOSBox!\r\necho  Type DIR to list files, or EXIT to close this window.\r\necho.\r\n';

const shortcut = (app, args = {}, iconName = app) => JSON.stringify({ app, args, icon: iconName });

export async function seed() {
  const version = await vfs.getValue('seed-version', 0);
  if (version >= SEED_VERSION) return;
  await vfs.mkdir('C:/Desktop');
  await vfs.mkdir('C:/Documents');
  await vfs.mkdir('C:/Pictures');
  await vfs.mkdir('C:/Games');
  await vfs.mkdir('C:/DOS');
  await vfs.mkdir('C:/$Recycle.Bin');
  if (version < 1) {
    await vfs.writeMany([
      { path: 'C:/Documents/Welcome.txt', data: WELCOME.replace(/\n/g, '\r\n') },
      { path: 'C:/DOS/README.TXT', data: DOS_README.replace(/\n/g, '\r\n') },
      { path: 'C:/DOS/HELLO.BAT', data: HELLO },
      { path: 'C:/Desktop/Jazz Jackrabbit.lnk', data: shortcut('dos', { game: 'jazz' }, 'jazz') },
      { path: 'C:/Desktop/DOS Games.lnk', data: shortcut('dosgames', {}, 'games') },
      { path: 'C:/Desktop/MS-DOS Prompt.lnk', data: shortcut('dos', {}, 'dos') },
      { path: 'C:/Desktop/Notepad.lnk', data: shortcut('notepad') },
      { path: 'C:/Desktop/Paint.lnk', data: shortcut('paint') },
      { path: 'C:/Desktop/Minesweeper.lnk', data: shortcut('mines') },
      { path: 'C:/Desktop/Command Prompt.lnk', data: shortcut('cmd') }
    ]);
  }
  await vfs.setValue('seed-version', SEED_VERSION);
}
