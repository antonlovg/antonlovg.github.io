# LövOS (`/os/`)

A desktop operating system in the browser, styled after ReactOS and the desktops of the 1990s, with real DOS (DOSBox via [js-dos](https://js-dos.com)) for DOS games such as Jazz Jackrabbit. Plain ES modules, no build step, no dependencies besides the vendored DOSBox.

It is deliberately unlisted: nothing on the site links to it, the page is `noindex`, `robots.txt` disallows `/os/` and it is not in the sitemap. It is English only. The audit still checks it (axe, cookies, third-party requests) on every deploy.

## What's in it

| | |
| --- | --- |
| Desktop | Icons on a grid (drag to move, box-select, arrow keys, F2 rename, Del), right-click menus, files dropped in from the computer |
| Windows | Drag, resize from every edge, minimise, maximise (double-click the title), owned modal dialogs, phone layout (full-screen windows) |
| Taskbar | Start menu (built from `apps.json` and `games.json`), quick launch, window buttons, tray with GitHub Sync status, volume and a clock with a calendar |
| File Explorer | Icons/details views, thumbnails, search, cut/copy/paste, drag between windows, import from and download to the computer (folders as zip), Recycle Bin, zip extraction |
| Apps | Notepad (find/replace, go to), Paint, Calculator, Minesweeper (rules from `/assets/minesweeper.js`), Command Prompt (DIR, CD, COPY, START, …), Task Manager, Control Panel, Help |
| MS-DOS Prompt | DOSBox in a window with a C: drive folder mounted, sound, gamepads, touch D-pad and buttons, phone keyboard, speed presets, full screen |
| DOS Games | Install your own copy (zip or folder, also self-extracting .EXE archives inside a zip) of the games in `games.json`, or add any DOS game; changes (save games) are copied back to the drive. Jazz Jackrabbit's original shareware episode is included (`shareware/`) and installs with one click |
| GitHub Sync | Optional two-way sync of the drive with a folder in your own private repository |
| Offline | `sw.js` caches every file, so LövOS (and DOSBox) start without a connection; installable as an app |

## Files

| Path | |
| --- | --- |
| `index.html`, `os.css`, `icons.svg` | The page, all styles (three themes: Classic, Lautus, Mizu) and the icon sprite |
| `apps.json` | Every app: id, name, icon, module, start menu folder, Run names, file types it opens |
| `games.json` | DOS games: folder on C:, program, DOSBox settings, controls (keys, touch buttons, gamepad mapping), the game's own SETUP to run on first start (`setup`: program, the file it creates, the keys that answer it) and an included shareware release (`shareware`) |
| `shareware/` | Original shareware archives, unaltered (see its README for the licence) |
| `js/main.js` | Boot, Run dialog, Shut Down, global shortcuts, service worker registration; play mode (`?play=<game>`, add `&shareware` to install its shareware without asking): just that game's DOS window, for `/osv2/`, which shows it in a frame and is told (`lovos-play-closed`) when it closes |
| `js/wm.js`, `js/menu.js`, `js/dialogs.js` | Window manager, menus (context, menu bars, start menu), message boxes and the Open/Save dialog |
| `js/desktop.js`, `js/taskbar.js` | The desktop and the taskbar |
| `js/vfs.js` | The C: drive in IndexedDB (`lovgren-os`): files and folders keyed by lower-cased path, change events (also across tabs) |
| `js/apps.js` | Loads the JSON lists, launches apps, opens files with the right app, restores windows after a reload |
| `js/fileops.js`, `js/dnd.js` | Move/copy/paste, Recycle Bin, import/export, zips; drag and drop with mouse or touch |
| `js/sync.js` | GitHub Sync (Git Data API, one commit per sync) |
| `js/games.js`, `js/dos-audio.js` | Game install/uninstall; the AudioWorklet that plays DOSBox sound |
| `js/apps/*.js` | One module per app; each default-exports `async function open(ctx)` |
| `js/lib/*.js` | Pure, unit-tested logic: paths, zip, DOS keys and config, sync planning, calculator, command-line parsing |
| `vendor/js-dos/` | DOSBox (js-dos `emulators` 8.5.2, GPL-2.0) with a one-line CSP patch, see its README |

## Adding things

- **An app**: add a module in `js/apps/` that exports `async function open(ctx)` and calls `ctx.window({ … })`, add it to `apps.json`, and add the module to `PRECACHE` in `sw.js` (a test checks this). If it throws, only its window closes.
- **A DOS game**: add an entry to `games.json` with an 8.3 folder under `C:/Games`, the program to start, DOSBox settings and controls. Users install their own copy; the install finds the program in the zip or folder and drops any wrapping folders. If the game refuses to start until its SETUP has run, add `setup`: LövOS runs it first (pressing `keys`, if given) whenever the file it `creates` is missing. Only add a `shareware` release if its licence allows sharing it online, and keep the archive unaltered.
- **An icon**: add a `<symbol>` to `icons.svg` and its name to `ICONS` in `js/dom.js` (a test keeps them in sync).

## How DOS works

`apps/dos.js` loads `vendor/js-dos/emulators.js` on first use and starts DOSBox in a worker. The mounted folder's files are passed in as an initial file system together with a generated `dosbox.conf` (`lib/dos-config.js`): `mount c .`, then the program. Every minute and when the window closes, the DOS file system is compared with what was mounted and changed, new or deleted files are written back to the drive. When a game's program ends, the window closes by itself. `.jsdos` bundles run as-is, with their changes kept next to them as `.<name>.saves.zip`.

DOSBox's sound arrives at a different rate than it reports (about 49 kHz rather than 44.1 kHz in js-dos 8.5), so `dos-audio.js` measures the real rate and resamples from that; nothing is sent to it until the browser's audio is running.

The page's CSP allows exactly what DOSBox needs: `'wasm-unsafe-eval'` for WebAssembly and `worker-src blob:` for its worker. `connect-src` adds only `https://api.github.com`, used by GitHub Sync once it is set up.

## GitHub Sync

Set up in Control Panel → GitHub Sync with a fine-grained personal access token limited to one private repository (Contents: read and write, or read-only for download-only devices). The token is stored only in the browser's IndexedDB and sent only to `api.github.com`. Each sync compares the drive, the repository folder and the state of the last sync (`lib/sync-plan.js`): one-sided changes and deletions are copied across; a file changed on both sides keeps the device's version and saves GitHub's as "name (GitHub copy).ext". On a device's very first sync GitHub's version wins instead, so a fresh device never overwrites your real files. Each sync is a single commit; if another device pushed in between, it starts over once.

## Privacy

Everything stays in the browser (IndexedDB `lovgren-os`, Cache Storage `lovos-v1`, service worker `/os/sw.js`), listed on `/cookies/`. The GitHub API is listed on `/privacy/`. No requests leave the site unless GitHub Sync is set up.

## Testing

`tests/os.test.mjs` covers the libraries and the consistency checks (icons, app and game lists, the service worker's file list, the CSP and the vendored loader). The audit (`scripts/audit-site.mjs`) runs axe and the privacy checks on `/os/`.
