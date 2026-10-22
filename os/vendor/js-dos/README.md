# js-dos emulators (vendored)

DOSBox for the browser, from the [`emulators`](https://www.npmjs.com/package/emulators) package (GPL-2.0, see `LICENSE` and `NOTICE.txt`). Only the plain DOSBox build is vendored; DOSBox-X is not needed for DOS games.

## Updating

1. `npm pack emulators@<version>` and unpack it somewhere outside the repo.
2. Copy `dist/emulators.js`, `dist/wdosbox.js`, `dist/wdosbox.wasm`, `dist/wlibzip.js`, `dist/wlibzip.wasm` and `LICENSE` here.
3. Re-apply the CSP patch in `emulators.js`: replace `return eval.call(window,p),` with a script-tag load (see the current file; `tests/os.test.mjs` checks that no `eval.call` is left) and keep the comment on the first line.
4. Update the version in `NOTICE.txt`, then bump `CACHE` in `os/sw.js` so offline copies refresh.
