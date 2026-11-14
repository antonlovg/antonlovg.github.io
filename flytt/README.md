# Flyttlistan (/flytt/)

A private, unlisted page for a move: what to do before and after, and what to buy. Swedish only.

- **Look**: drawn with crayons on squared paper (dark mode: chalk on a blackboard). Handwriting fonts Caveat and Patrick Hand are self-hosted in `fonts/` (SIL OFL, licences next to them). Everything drawn is CSS: uneven corners, hatched fills and a grain texture from an inline SVG data URI. Each group gets its own crayon (`data-c` 1–6). The moving day sits on a taped sticky note; *Synk & data* is a dialog, not a tab.
- **Links**: every task and item can have a link, shown as a large button with the site's name. Paste a link anywhere in the text box and it's split out (`splitEntry` in `js/list.js`); only a link gives a name from the address (`nameFromLink`). Only `http(s)` links are kept (`safeLink`), and they open in a new tab with `noopener noreferrer`.

- **Att göra**: starts as a template of common tasks (`TEMPLATE` in `js/list.js`), grouped by phase from *3 månader före* to *Första månaden efter* (`PHASES`, in days from the moving day). Set the moving day and every phase gets a due date; unfinished tasks in a phase whose date has passed are tagged *sent!*. Tasks can be checked off, edited (title, phase, link, note), erased and added; removed template tasks can be brought back.
- **Att köpa**: things to buy per room (`ROOMS`), with quantity and an optional price per item (`49,90` or `49.90`). The summary shows the total, what's bought and what's left; items without a price are counted separately. One-tap suggestions per room (`SUGGESTIONS`), and *Kopiera listan som text* copies (or shares) what's left to buy.
- **Storage**: `js/store.js` keeps everything in `localStorage` under `lovgren-flytt`, only once you change something (until then the template is in memory). Every task and item has an id and a timestamp (`at`); deleting leaves `{ gone: true, at }` so a sync doesn't bring it back.
- **Sync**: like the meal plan, a `#synk/…` link or a JSON file (`js/sync.js`, deflate + base64url after `#`, never sent to the server). Reading one in merges per task and item: the newest change wins, and the incoming moving day applies if it has one.
- **Offline**: `sw.js` keeps a copy (cache `flytt-v2`, scope `/flytt/`, both listed on /cookies/). Network first with a 3 s timeout, then the copy.
- **Unlisted**: `noindex`, `Disallow: /flytt/` in robots.txt, not linked from the site. Strict CSP (`script-src 'self'`).

Tests: `tests/flytt.test.mjs`.
