# Flyttlistan (/flytt/)

A private, unlisted page for a move: what to do before and after, and what to buy. Swedish only, like the meal plan.

- **Att göra**: starts as a template of common tasks (`TEMPLATE` in `js/list.js`), grouped by phase from *3 månader före* to *Första månaden efter* (`PHASES`, in days from the moving day). Set the moving day and every phase gets a due date; unfinished tasks in a phase whose date has passed are tagged *Sent*. Tasks can be checked off, edited (title, phase, note), removed and added; removed template tasks can be brought back.
- **Att köpa**: things to buy per room (`ROOMS`), with quantity and an optional price per item (`49,90` or `49.90`). The summary shows the total, what's bought and what's left; items without a price are counted separately. One-tap suggestions per room (`SUGGESTIONS`), and *Kopiera listan som text* copies (or shares) what's left to buy.
- **Storage**: `js/store.js` keeps everything in `localStorage` under `lovgren-flytt`, only once you change something (until then the template is in memory). Every task and item has an id and a timestamp (`at`); deleting leaves `{ gone: true, at }` so a sync doesn't bring it back.
- **Sync**: like the meal plan, a `#synk/…` link or a JSON file (`js/sync.js`, deflate + base64url after `#`, never sent to the server). Reading one in merges per task and item: the newest change wins, and the incoming moving day applies if it has one.
- **Offline**: `sw.js` keeps a copy (cache `flytt-v1`, scope `/flytt/`, both listed on /cookies/). Network first with a 3 s timeout, then the copy.
- **Unlisted**: `noindex`, `Disallow: /flytt/` in robots.txt, not linked from the site. Strict CSP (`script-src 'self'`).

Tests: `tests/flytt.test.mjs`.
