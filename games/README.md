# Game Library

A small personal game backlog that runs as a static website. It uses only HTML, CSS, vanilla JavaScript, and this browser's `localStorage`.

## Open locally

Download or clone the project, then open `index.html` in a modern browser. No install, server, account, or build step is needed.

## Host on GitHub Pages

1. Create a GitHub repository and add `index.html`, `styles.css`, `app.js`, and `README.md` to it.
2. In the repository, open **Settings**, then **Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select the branch and root folder, then save.
4. Open the Pages URL shown in the settings after deployment finishes.

The site is static. Personal game changes are saved in the browser. The public shared snapshot is `shared-library.json` in this folder.

## Tests

Run the shared snapshot tests with `node --test tests/*.test.mjs`. They also check that the committed `shared-library.json` is a valid snapshot. GitHub Actions (`.github/workflows/check.yml`) runs the same tests on every push, including commits made by **Publish to GitHub**.

## Enable Steam lookup

Steam does not allow browser requests from this site's origin. The optional **Fetch Steam info** feature therefore uses a small Cloudflare Worker as a proxy. The rest of the site remains static, and no changes to Porkbun DNS or the GitHub Pages setup are needed.

1. In the Cloudflare dashboard, open **Workers & Pages**, create a Worker named `steam-appdetails-proxy`, and open its code editor.
2. Replace the starter code with the contents of [`steam-worker/index.mjs`](steam-worker/index.mjs), then deploy it.
3. Copy the Worker URL, which looks like `https://steam-appdetails-proxy.<account-subdomain>.workers.dev`.
4. In `app.js`, set `STEAM_PROXY_URL` near the top to that URL, keeping the quotes and omitting a trailing slash.
5. Push the updated site to GitHub Pages. Steam lookup will then go through the Worker.

The Worker only forwards numeric Steam app IDs to Steam's public appdetails endpoint. It accepts requests from `lovgren.dev`, `www.lovgren.dev`, and the GitHub Pages origin. Opening the page as `file://` is not supported for Steam lookup because browsers send an opaque origin that the Worker rejects. No Steam API key is required.

## Your library and backups

The library is saved automatically in `localStorage` for the website's browser origin. The starter games are added only the first time the app is opened when no library has been saved. Later code updates do not reseed or replace your saved library.

Use **Export library** to download a JSON backup. Use **Import library** to choose a previous export. Import validates the file and, after confirmation, replaces the current library; export a backup first if you need to preserve the current one. **Reset library** asks for confirmation and replaces your list with the original starter games.

Browser storage belongs to that browser and device. It is not shared with other people, browsers, or devices. Clearing the browser's site data can delete the library, so regular exports are recommended.

## Publishing the shared library

New visitors start with a copy of `shared-library.json`. When a newer one is published, returning visitors see an **update available** notice showing how many games are new, changed or removed, and choose whether to load it. **Get shared update** in **Manage library** does the same on demand. Nothing replaces a browser's library without confirmation.

To publish from the browser (no manual JSON or git step):

1. Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) with **Repository access: Only select repositories → antonlovg.github.io** and **Permissions → Contents: Read and write**. Give it an expiry date.
2. On the site, open **Manage library → Publish to GitHub**. The dialog compares your library with the published one and lists what will be added, changed and removed.
3. Paste the token and select **Publish**. The app commits `games/shared-library.json` to `main` through the GitHub API, and GitHub Pages redeploys within a minute or two.

The token is sent only to `api.github.com`. By default it is kept in memory for the current visit; tick **Remember token on this device** to store it in this browser's local storage, and use **Forget saved token** to remove it. Only do that on your own device. The page's Content-Security-Policy blocks scripts from other origins, which limits what could read the token.

The manual way still works: export the library, replace `shared-library.json` with the export, and push it.

The snapshot is public, including personal notes, so don't put anything private in it.

## Manage games

- Select **Add game** to create an entry. Only the title is required.
- Select **Get shared update** in **Manage library** to replace this browser's library with the latest validated repository snapshot after confirmation.
- Duplicate titles are blocked regardless of capitalization or extra spaces. If a Steam URL is provided, duplicate Steam app IDs are blocked too. Edit the existing entry instead; imports containing duplicates are rejected without changing the library.
- Use the pencil button on a card to edit it. **More details** shows the full description, personal notes and Steam categories.
- The play button on each cover opens the trailer. In the editor, add the game's Steam Store URL and select **Fetch trailers** to load and choose from its official Steam trailers. The player handles Steam HLS streams natively or with a self-hosted copy of HLS.js (`vendor/`, loaded only when needed), and also accepts YouTube links or direct HTTPS MP4/WebM URLs. YouTube videos load only after the viewer selects **Load YouTube video**. Playback stops when the dialog closes. Steam lookup requires the deployed proxy and an allowed published site origin; YouTube embeds need an HTTP(S) page origin, so use the hosted site or localhost rather than opening the HTML as `file://` for playback.
- Use **Start**, **Mark played**, or **Replay** to move it to the next status.
- Use the **⋯** menu on a card, then **Delete game**, to remove one game; the site asks before deleting.
- Search looks through titles, descriptions, genres, tags, and notes. Genre, player-count, and priority filters combine with the selected view.
- Use **Markdown for Discord** to choose which status groups and details to include, then copy the preview or download it as a Markdown file. The preview warns when it exceeds Discord's 2,000-character message limit.
- Select **Help** in the header for in-app steps covering game details, Steam links, cover images, status changes, and backups.
- Use the sort menu to order games by title, priority, or random order. **Pick a game** suggests a random game from the current view and filters; start it to move it to In Progress. The appearance menu offers Midnight, Ocean and Ember (dark) and Daylight (light) themes; all meet WCAG AA contrast. Theme and sort choices are saved in browser preferences separately from the game list.
- A Steam Store URL can be saved manually. **Fetch Steam info** uses the optional Worker described above. Steam genres and store categories are kept separate from community tags, and a warning appears before filled-in details are replaced.
## Links and shortcuts

- The view and filters are kept in the address, so links can be shared and Back/Forward work: `/games/?q=portal&genre=Adventure&players=2&priority=1#in-progress`. Values from the address are validated in `url-state.js` (tested in `tests/url-state.test.mjs`) and only ever written into form controls.
- <kbd>/</kbd> focuses the search. <kbd>Ctrl</kbd>+<kbd>K</kbd> opens the sitewide terminal, which also finds games by title.
- Starting, finishing, deleting, importing and resetting can be undone from the notification. Bulk replacements ask first in a styled dialog instead of the browser's `confirm()`.
- If the browser blocks site storage, the library still loads and works for the visit, and says that changes won't be kept.

## Design

Plain CSS with design tokens per theme in `styles.css`; icons are an inline SVG sprite at the top of `index.html` (used from `app.js` via `makeIcon`). The UI font, Manrope, is self-hosted from `/assets/fonts/`. If you change a theme colour, keep text at 4.5:1 and control borders at 3:1 against their backgrounds.

## Privacy

The library is public and linked from the homepage. It sets no cookies and loads no third-party scripts or fonts. See the site's [privacy policy](../privacy/) and [cookie policy](../cookies/), which list every local-storage key the app uses; update them if you add new ones.
