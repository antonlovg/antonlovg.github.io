# ReactOS (`/osv2/`)

The real [ReactOS](https://reactos.org) 0.4.16, running on a PC emulated in the browser by [v86](https://github.com/copy/v86), with Jazz Jackrabbit's shareware episode on its desktop. [LövOS](../os/) (`/os/`) is the ReactOS-*style* desktop written for the web; this is ReactOS itself.

Unlisted like LövOS: nothing links to it, the page is `noindex` and `robots.txt` disallows `/osv2/`. English only. The audit checks it (axe, cookies, third-party requests) on every deploy.

## How it starts

Booting ReactOS in v86 takes about a minute and a half and reads about 200 MB of the CD. So the page doesn't boot it: it downloads `reactos/state.bin.gz`, the whole machine saved at the desktop by `scripts/make-reactos.mjs` (about 45 MB gzipped, 166 MB unpacked), and restores it. The CD (`reactos/iso/`, the release ISO in 1 MB parts) is still attached, and v86 fetches only the parts ReactOS reads from then on.

Nothing is downloaded until you press **Start ReactOS**. What you change is lost on reload unless you press **Save**, which keeps the machine in IndexedDB (`lovgren-osv2`, listed on /cookies/).

## Jazz Jackrabbit

ReactOS can't run it. Its NTVDM takes Jazz's protected-mode program (Borland's RTM extender, an NE executable) for a 16-bit Windows app and offers WineVDM. And NTVDM emulates the CPU in software, which inside v86 would be far too slow to play anyway. So:

1. The C: drive has the shareware files in `C:\JAZZ` (unaltered, from `os/shareware/jazz.zip`, which is also there as `C:\JAZZ.ZIP`).
2. The **Jazz Jackrabbit** desktop shortcut runs `cmd /c echo PLAY JAZZ>COM1`, minimised.
3. The page reads that line from the emulated serial port, pauses ReactOS and opens `/os/?play=jazz&shareware` in a frame: LövOS's play mode. That's just LövOS's MS-DOS window (DOSBox) with Jazz, installed from the shareware with one step if it isn't yet, and its automatic SETUP, sound and controls. The game lives on LövOS's drive, so it's the same install and save games in both.
4. When the game's window closes (quitting Jazz, or **Back to ReactOS**, which asks LövOS to close it so it saves first), LövOS posts `lovos-play-closed` to the page, which removes the frame and resumes ReactOS.

## Files

| Path | |
| --- | --- |
| `index.html`, `osv2.css`, `icon.svg` | The page: a bar with the machine's buttons over the screen |
| `js/main.js` | Start screen, downloading and restoring the machine, screen scaling, the Jazz frame, Save/Restart/Ctrl+Alt+Del/full screen |
| `js/machine.js` | The emulated PC (memory, CD, disk, BIOS). Shared with `make-reactos.mjs`: a state only restores on the same machine |
| `js/saved.js` | Saved sessions in IndexedDB |
| `reactos/iso/` | ReactOS-0.4.16-i386.iso in 1 MB parts named `<start>-<end>.img`, as v86's `use_parts` expects |
| `reactos/state.bin.gz` | The saved machine, made by `scripts/make-reactos.mjs` |
| `vendor/v86/` | v86 (npm `v86` 0.5.472, BSD-2-Clause): `libv86.mjs`, `v86.wasm`; SeaBIOS 1.16.2 (`seabios.bin`, LGPL-3.0) and the Bochs VGA BIOS (`vgabios.bin`, LGPL-2.1) from [copy/v86 `bios/`](https://github.com/copy/v86/tree/cc37f35c43bf14865d74ad76879ecf9410f69eb1/bios) |

## Rebuilding the machine

```sh
# ReactOS-0.4.16-i386.iso, from ReactOS-0.4.16-i386.zip on github.com/reactos/reactos/releases/tag/0.4.16-release
node scripts/make-reactos.mjs path/to/ReactOS-0.4.16-i386.iso [screenshot.png]
```

It checks the ISO's size and SHA-256 against `js/machine.js`, writes the parts, builds C: (`scripts/lib/disk-image.mjs`: FAT16, the shortcut and its icon, drawn from LövOS's `jazz` icon), boots the CD in headless Chrome by typing at it, points the desktop and My Documents at `C:\Desktop` and `C:\Documents` (the live CD's own profile is read-only), saves the machine and writes its size into `js/machine.js`. Takes about five minutes. If you change the machine in `js/machine.js` (memory, devices), rebuild and bump `VERSION`, so sessions saved in browsers from the old machine aren't offered.

## Size

The CD parts are 407 MB and the state 45 MB, so this folder is most of the repository and of every Pages deploy (GitHub's limits: 100 MB per file, 1 GB per site). If deploys get slow, it can move to its own repository with Pages turned on, which GitHub serves at `lovgren.dev/<repo>/`, the same origin. Only the CD and state URLs in `js/machine.js` would change.

## Licences

ReactOS is GPL-2.0 (with parts under other free licences); the ISO is the unmodified release and its source is at [reactos/reactos@0.4.16-release](https://github.com/reactos/reactos/tree/0.4.16-release). The page's About dialog links the sources. Jazz Jackrabbit: see `os/shareware/README.md`.
