# Flyttlistan (/flytt/)

A private, unlisted shopping list for a move, drawn with crayons. Swedish only. It starts empty: you write
what you need, add your own link to the thing you want and a price if there is one.

- **Adding**: name, link and price (all but the name optional). A link pasted right after the name is split out
  (`splitEntry` in `js/list.js`); only a link gives a name from the address (`nameFromLink`). The link field
  takes `ikea.se/…` without `https://` (`linkFrom`). Only `http(s)` links are kept (`safeLink`), and they open in
  a new tab with `noopener noreferrer`. Prices take `199`, `49,90`, `1 299 kr` (`priceFrom`).
- **The list**: one crayon card per thing, the crayons in turn in the order you added them (`data-c` 1–8). Each
  shows the price tag and the link as a large button with the site's name. Tap the box when it's bought; bought
  things move to *Köpt* at the bottom. The crayon button edits the name, link, price per item, quantity and a note,
  or erases it. The sum shows the total and what's left to buy, with a crayon drawing how much is bought.
  *Kopiera listan som text* copies (or shares) what's left, with prices and links.
- **Look**: light paper by default; dark mode (black drawing paper, not the system setting) is a button and
  `js/theme.js` applies it before the page is drawn. Handwriting fonts Caveat and Patrick Hand are self-hosted
  in `fonts/` (SIL OFL, licences next to them). Everything drawn is CSS and inline SVG: the crayon (`#crayon`
  symbol) in the box at the top, on the edit buttons and drawing the progress, uneven corners, a grain and
  doodles in the background.
- **Storage**: `js/store.js` keeps the list in `localStorage` under `lovgren-flytt`, only once you change
  something. Every thing has an id and a timestamp (`at`); erasing leaves `{ gone: true, at }` so a sync doesn't
  bring it back. Lists saved by the earlier version (`buy`, with rooms) are read in without the rooms.
- **Sync**: a `#synk/…` link or a JSON file (`js/sync.js`, deflate + base64url after `#`, never sent to the
  server), opened from *Synk & data*. Reading one in merges per thing: the newest change wins.
- **Offline**: `sw.js` keeps a copy (cache `flytt-v3`, scope `/flytt/`, both listed on /cookies/). Network first
  with a 3 s timeout, then the copy.
- **Unlisted**: `noindex`, `Disallow: /flytt/` in robots.txt, not linked from the site. Strict CSP
  (`script-src 'self'`, no inline styles).

Tests: `tests/flytt.test.mjs`.
