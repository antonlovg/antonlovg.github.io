# lovgren.dev

Personal site for Anton Lövgren, deployed to GitHub Pages by a GitHub Actions pipeline (custom domain in `CNAME`). Plain HTML, CSS and JavaScript, with no framework and no build tools beyond two small Node scripts.

| Path | What it is |
| --- | --- |
| `/` | Homepage: live pipeline panel, local time and weather, now playing, projects, terminal (`index.html`, `style.css`, `home.js`) |
| `/sv/…`, `/no/…` | Swedish and Norwegian versions of every page above except the World Cup archive, generated at build time |
| `/privacy/`, `/cookies/` | Privacy and cookie policies (share `style.css`) |
| `/games/` | Shared game library, see [`games/README.md`](games/README.md) |
| `/ops/`, `/status/`, `/changelog/` | DORA metrics, deploys, last-run replay, architecture; hourly uptime; changelog + RSS. Templates filled at build time |
| `/island/` | The whole site as a pixel-art island you can fly over, with live lights and Stockholm's weather (`island/`), see [The island](#the-island) |
| `/wc2026/` | World Cup 2026 group-stage schedule in CEST (archive) |
| `/secret/` | Redirect to `/games/` (old address) |
| `/assets/` | The shared shell (`site.css`, `site.js`, `theme.js`, `i18n.js`, `weather.js`), favicon and self-hosted fonts (Manrope, JetBrains Mono) |
| `404.html` | Not-found page for every language: guesses the page you meant (`assets/not-found.js`) |
| `i18n/` | Swedish and Norwegian translations (not deployed), see [Languages](#languages) |
| `scripts/` | Build, audit, uptime and price scripts used by the workflows (not deployed) |
| `status/incidents/` | Optional incident notes for the status page (not deployed) |

## Shared shell

Every page uses the same header, navigation and behaviour from `/assets/`:

- **`theme.js`** runs in `<head>` (not deferred) and applies the sitewide theme before the first paint. The choice (System, Light, Dark, plus Ocean and Ember in the game library) is stored as `lovgren-theme`, and only when it isn't System. Pages read `data-scheme` (light/dark) and the game library also reads `data-theme`.
- **`site.css`** styles the header, the mobile tab bar, the terminal and theme menu, and the page transitions (cross-document View Transitions; unsupported browsers just navigate normally).
- **`site.js`** builds the JavaScript-only controls (terminal button, theme menu), the terminal on <kbd>Ctrl</kbd>+<kbd>K</kbd>, the <kbd>/</kbd> shortcut (focuses the page's `[data-page-search]`, otherwise opens the terminal) and the Konami code. Pages can add terminal results with `SiteShell.registerSearch()`; the game library adds game titles.
- **`i18n.js`** knows the languages and gives scripts `SiteI18n.t()` for their text, plus the language menu's links. `site.js` also offers a visitor whose browser prefers Swedish, Norwegian or English the matching version once, without redirecting; the answer is stored as `lovgren-lang`.
- **`weather.js`** gives every page Stockholm's current weather as a mood: a tint and a canvas behind the page with rain, snow, clouds, fog or stars (twilight around sunrise and sunset, dimmer in the dark winter weeks, glowing midsummer nights). It's decorative only: still for reduced motion, paused in hidden tabs, off in the game library (`data-weather="off"`), and visitors can turn it off with **Weather effects** in the theme menu (stored as `lovgren-weather`). The homepage also shows the temperature next to the local time. Try any weather with `?weather=rain|snow|sleet|thunder|fog|clouds|clear`, optionally with `&phase=day|twilight|night`.
- Typography uses a fluid type scale (`--step--1` … `--step-5` in `site.css`), balanced headings and self-hosted JetBrains Mono for everything monospaced. Sections rise into place with CSS scroll-driven animations (transforms only, never opacity, and off for reduced motion).
- Each page has a `<script type="speculationrules">` block so same-site links are prerendered on hover. It's the only inline script, allowed by the CSP keyword `'inline-speculation-rules'`.

The header markup is repeated in each page. `tests/site-pages.test.mjs` checks that it's identical everywhere, that the current page is marked, and that every page keeps a strict CSP with no inline scripts or event handlers.

## Pipeline

`.github/workflows/pipeline.yml` runs on every push and pull request:

1. **Test**: unit tests (shared library, URL state, wheel, shell, games, Minesweeper, weather, DORA/uptime/changelog maths, HTML escaping, translations, 404 guesses, page consistency and security rules; also validates `games/shared-library.json`) and a syntax check of all scripts.
2. **Build**: `scripts/build-site.mjs` copies only git-tracked files into `_site/`, so ignored local files can never be deployed. It also writes `now-playing.json` (the in-progress games, with cover URLs on Steam's image CDN) and a provisional `status.json`.
3. **Prices**: `scripts/fetch-prices.mjs` fetches Steam prices for the game library: euro from the Swedish store into `games/prices.json` (English and Swedish pages) and Norwegian kroner from the Norwegian store into `games/prices-nok.json` (Norwegian pages). Visitors never contact Steam for prices; if Steam is unreachable the build continues without them.
4. **Weather**: `scripts/fetch-weather.mjs` fetches the current weather in Stockholm from [Open-Meteo](https://open-meteo.com/) (no key; data CC BY 4.0) into `weather.json`. The hourly uptime run keeps it fresh; data older than six hours is ignored, and if Open-Meteo is down the site just shows no weather.
5. **Social previews**: `scripts/make-og.mjs` renders a 1200×630 preview card for every page in every language in headless Chrome, with live numbers (games on sale, DORA level, uptime, commits), into `og/<lang>/<page>.png`.
6. **Audit**: `scripts/audit-site.mjs` serves `_site/`, runs axe-core (WCAG 2.1 AA) on every page in every language, checks that every page's preview image exists, counts cookies and third-party requests, and runs Lighthouse on the homepage. Results go into `status.json`, which the homepage's pipeline panel shows. **Any accessibility violation, cookie, or third-party request on the homepage, policy, 404 or World Cup pages fails the run and blocks the deploy.** The only allowed exception is images from `*.steamstatic.com` on the homepage (the “Now playing” covers), which the homepage's CSP also limits to.
7. **Deploy**: pushes to `main` publish `_site/` with GitHub Pages. Pull requests stop after the audit.

The build step also writes the Swedish and Norwegian pages, canonical/hreflang/Open Graph tags, `sitemap.xml` and `robots.txt`, and runs `scripts/build-ops.mjs`, which fills the `/ops`, `/status` and `/changelog` templates (between `<!-- build:name -->` markers) from the git history, this workflow's run history (via the GitHub API) and the uptime data. All of it is HTML-escaped, and every source may be missing without breaking the build.

## Languages

The English pages are the source. `scripts/build-site.mjs` builds each page again in Swedish (`/sv/`) and Norwegian Bokmål (`/no/`, `lang="nb"`) with `scripts/lib/i18n.mjs`, which looks up every piece of text in the tables in `i18n/` (each row is `[English, Swedish, Norwegian]`):

- `i18n/pages.mjs` and `i18n/legal.mjs`: text in the HTML. An element with only text and inline tags is translated as a whole, keyed by its HTML, so the translation can move a link; other text is translated piece by piece. Links to pages are pointed at the same language.
- `i18n/ui.mjs`: text made by scripts with `SiteI18n.t('…')` (or marked with `N_('…')` where it's defined). It ships to the browser as `/assets/i18n/<code>.js`.

**When you change English text, add or update its row.** The build stops and lists anything without a translation, and `tests/i18n.test.mjs` checks every page and script string, placeholders such as `{n}`, links and markup. Wrap a block in `data-i18n="off"` to keep it English (it's marked `lang="en"`), as the Windows 98 easter egg and the terminal are. Commit messages, game data from Steam and the World Cup archive stay English.

## Uptime monitor

`.github/workflows/uptime.yml` runs every hour: `scripts/check-uptime.mjs` checks the homepage (must contain the site header), the game library's data (must parse) and the Steam proxy (must return real game data). Results are kept for 90 days in `uptime.json` on the **`uptime-data`** branch, which is force-pushed as a single commit so history doesn't grow. The monitor then starts the pipeline to rebuild `/status`. DORA metrics count only pushes, so these refreshes don't skew them.

To publish a note about an incident, add `status/incidents/YYYY-MM-DD-short-name.md` with a `# Title` line and plain paragraphs; it appears on the status page after the next deploy.

GitHub pauses scheduled workflows in repositories with no activity for 60 days. If the status page stops updating, re-enable the workflow under **Actions → Uptime**.

One-time setup: in the repository on GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**. Until then the old branch deploy keeps serving the repository as-is, and the homepage panel shows “Awaiting first run”.

## Run it locally

```bash
node --test --test-reporter=tap tests/*.test.mjs games/tests/*.test.mjs > test-report.tap
TEST_REPORT=test-report.tap node scripts/build-site.mjs _site
node scripts/fetch-prices.mjs _site
node scripts/fetch-weather.mjs _site
node scripts/make-og.mjs _site
npm install --no-save --no-package-lock --prefix .audit axe-core@4.10.2
node scripts/audit-site.mjs _site --axe .audit/node_modules/axe-core/axe.min.js --lighthouse --gate
python -m http.server 8000 --directory _site
```

Then open <http://localhost:8000/>. For a quick look without the pipeline, serve the repository root instead; the homepage falls back to reading the game library directly, without covers. The audit needs Chrome (set `CHROME_PATH` if it isn't found) and `--lighthouse` downloads Lighthouse with `npx`.

## Not-found page

GitHub Pages serves one `404.html` for every address, so the page takes its language from the address (`/sv/…`, `/no/…`) and loads both dictionaries. `assets/not-found.js` compares the address with every page and common words for it (in all three languages, allowing a typo or two swapped letters), turns `/games/<title>` into a library search, and offers the terminal. The address is only ever shown as text.

## The island

`/island/` draws the site as a pixel-art island in which every page is a building: the red cottage (home), the arcade (game library), the control tower (ops), the lighthouse (status), the log cabin (changelog), the vault (privacy), the bakery (cookies), a shed that opens the terminal, and the World Cup stadium on its own islet. `island/island.js` rasterizes the scene itself into a 480×320 buffer without anti-aliasing and scales it up with `image-rendering: pixelated`, so edges stay real pixel art.

- **Live**: the lighthouse is lit while `/status` is operational, flickers during a partial outage and goes dark in an outage; the tower's beacon shows the last pipeline run; the arcade lights a window per game in progress. It's day, dusk or night with Stockholm's weather (rain, snow, fog), from the same `weather.json`.
- **Moving around**: drag to pan, pinch or <kbd>Ctrl</kbd>+scroll to zoom, or use the buttons. Clicking a building zooms into it and then opens the page. The map is for pointers; the list of places under it has the same links and live states for keyboards and screen readers, and focusing one flies the camera there.
- Still for reduced motion, paused in hidden tabs. `tests/island.test.mjs` checks that every page has a building on land with a path to its door, the rasterizer and the live-state rules.

## Terminal and games

- **lovsh**: press <kbd>Ctrl</kbd>+<kbd>K</kbd> (or <kbd>/</kbd> on pages without a search box), or use the button in the header. It's a small shell over a virtual file system: `ls`, `cd`, `cat`, `tree`, `open`, pipes (`log | grep Fix`, `ls -a | wc -l`), tab completion, `man`, `history`, `neofetch`, `status`, `uptime`, `replay` (the last real pipeline run) and `log`. It loads only when first opened (`assets/shell-core.js`, `assets/terminal-games.js`, `assets/terminal.js`).
- **Games**: `snake`, `adventure` (a tiny text adventure) and `minesweeper`.
- **Windows 98 easter egg**: `win98`, the Konami code (↑ ↑ ↓ ↓ ← → ← → B A), or `/#win98`. Minesweeper is on its desktop (`/#minesweeper` opens it directly).

## Privacy rules for this repo

- No analytics, trackers, cookies or third-party scripts and fonts. Self-host anything you need. The pipeline enforces this for the homepage and info pages; to allow a new image host, add it to `ALLOWED_IMAGE_HOSTS` in `scripts/audit-site.mjs`, the page's CSP and `/privacy/`.
- Anything a page stores in the browser must be listed on `/cookies/`. Any new outside service must be listed on `/privacy/`.
- Third-party embeds (such as YouTube) load only after the visitor chooses to load them.
