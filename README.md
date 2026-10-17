# lovgren.dev

Personal site for Anton Lövgren, deployed to GitHub Pages by a GitHub Actions pipeline (custom domain in `CNAME`). Plain HTML, CSS and JavaScript, with no framework and no build tools beyond two small Node scripts.

| Path | What it is |
| --- | --- |
| `/` | Homepage: live pipeline panel, now playing, projects, terminal (`index.html`, `style.css`, `home.js`) |
| `/privacy/`, `/cookies/` | Privacy and cookie policies (share `style.css`) |
| `/games/` | Shared game library, see [`games/README.md`](games/README.md) |
| `/wc2026/` | World Cup 2026 group-stage schedule in CEST (archive) |
| `/secret/` | Redirect to `/games/` (old address) |
| `/assets/` | The shared shell (`site.css`, `site.js`, `theme.js`), favicon, self-hosted fonts and the social preview image |
| `404.html` | Not-found page |
| `scripts/` | Build and audit scripts used by the pipeline (not deployed) |

## Shared shell

Every page uses the same header, navigation and behaviour from `/assets/`:

- **`theme.js`** runs in `<head>` (not deferred) and applies the sitewide theme before the first paint. The choice (System, Light, Dark, plus Ocean and Ember in the game library) is stored as `lovgren-theme`, and only when it isn't System. Pages read `data-scheme` (light/dark) and the game library also reads `data-theme`.
- **`site.css`** styles the header, the mobile tab bar, the terminal and theme menu, and the page transitions (cross-document View Transitions; unsupported browsers just navigate normally).
- **`site.js`** builds the JavaScript-only controls (terminal button, theme menu), the terminal on <kbd>Ctrl</kbd>+<kbd>K</kbd>, the <kbd>/</kbd> shortcut (focuses the page's `[data-page-search]`, otherwise opens the terminal) and the Konami code. Pages can add terminal results with `SiteShell.registerSearch()`; the game library adds game titles.
- Each page has a `<script type="speculationrules">` block so same-site links are prerendered on hover. It's the only inline script, allowed by the CSP keyword `'inline-speculation-rules'`.

The header markup is repeated in each page. `tests/site-pages.test.mjs` checks that it's identical everywhere, that the current page is marked, and that every page keeps a strict CSP with no inline scripts or event handlers.

## Pipeline

`.github/workflows/pipeline.yml` runs on every push and pull request:

1. **Test**: unit tests (shared library, URL state, page consistency and security rules; also validates `games/shared-library.json`) and a syntax check of all scripts.
2. **Build**: `scripts/build-site.mjs` copies only git-tracked files into `_site/`, so ignored local files can never be deployed. It also writes `now-playing.json` (the in-progress games, with cover URLs on Steam's image CDN) and a provisional `status.json`.
3. **Audit**: `scripts/audit-site.mjs` serves `_site/`, runs axe-core (WCAG 2.1 AA) on every page, counts cookies and third-party requests, and runs Lighthouse on the homepage. Results go into `status.json`, which the homepage's pipeline panel shows. **Any accessibility violation, cookie, or third-party request on the homepage, policy, 404 or World Cup pages fails the run and blocks the deploy.** The only allowed exception is images from `*.steamstatic.com` on the homepage (the “Now playing” covers), which the homepage's CSP also limits to.
4. **Deploy**: pushes to `main` publish `_site/` with GitHub Pages. Pull requests stop after the audit.

One-time setup: in the repository on GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**. Until then the old branch deploy keeps serving the repository as-is, and the homepage panel shows “Awaiting first run”.

## Run it locally

```bash
node --test --test-reporter=tap tests/*.test.mjs games/tests/*.test.mjs > test-report.tap
TEST_REPORT=test-report.tap node scripts/build-site.mjs _site
npm install --no-save --no-package-lock --prefix .audit axe-core@4.10.2
node scripts/audit-site.mjs _site --axe .audit/node_modules/axe-core/axe.min.js --lighthouse --gate
python -m http.server 8000 --directory _site
```

Then open <http://localhost:8000/>. For a quick look without the pipeline, serve the repository root instead; the homepage falls back to reading the game library directly, without covers. The audit needs Chrome (set `CHROME_PATH` if it isn't found) and `--lighthouse` downloads Lighthouse with `npx`.

## Homepage extras

- **Terminal**: press <kbd>Ctrl</kbd>+<kbd>K</kbd> (or <kbd>/</kbd>), or use the button in the header. Try `help`, `status` and `playing`.
- **Easter egg**: type `win98` in the terminal, or enter the Konami code (↑ ↑ ↓ ↓ ← → ← → B A).

## Privacy rules for this repo

- No analytics, trackers, cookies or third-party scripts and fonts. Self-host anything you need. The pipeline enforces this for the homepage and info pages; to allow a new image host, add it to `ALLOWED_IMAGE_HOSTS` in `scripts/audit-site.mjs`, the page's CSP and `/privacy/`.
- Anything a page stores in the browser must be listed on `/cookies/`. Any new outside service must be listed on `/privacy/`.
- Third-party embeds (such as YouTube) load only after the visitor chooses to load them.
