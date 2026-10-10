# Game Library

A small personal game backlog that runs as a static website. It uses only HTML, CSS, vanilla JavaScript, and this browser's `localStorage`.

## Open locally

Download or clone the project, then open `index.html` in a modern browser. No install, server, account, or build step is needed.

## Host on GitHub Pages

1. Create a GitHub repository and add `index.html`, `styles.css`, `app.js`, and `README.md` to it.
2. In the repository, open **Settings**, then **Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, select the branch and root folder, then save.
4. Open the Pages URL shown in the settings after deployment finishes.

The site is static. Game changes are saved in the browser and do not require Git commits or repository updates.

## Enable Steam lookup

Steam does not allow browser requests from this site's origin. The optional **Fetch Steam info** feature therefore uses a small Cloudflare Worker as a proxy. The rest of the site remains static, and no changes to Porkbun DNS or the GitHub Pages setup are needed.

1. In the Cloudflare dashboard, open **Workers & Pages**, create a Worker named `steam-appdetails-proxy`, and open its code editor.
2. Replace the starter code with the contents of [`steam-worker/index.mjs`](steam-worker/index.mjs), then deploy it.
3. Copy the Worker URL, which looks like `https://steam-appdetails-proxy.<account-subdomain>.workers.dev`.
4. In `app.js`, set `STEAM_PROXY_URL` near the top to that URL, keeping the quotes and omitting a trailing slash.
5. Push the updated site to GitHub Pages. Steam lookup will then go through the Worker.

The Worker only forwards numeric Steam app IDs to Steam's public appdetails endpoint. It accepts requests from `lovgren.dev`, `www.lovgren.dev`, the GitHub Pages origin, and local-file testing. No Steam API key is required.

## Your library and backups

The library is saved automatically in `localStorage` for the website's browser origin. The starter games are added only the first time the app is opened when no library has been saved. Later code updates do not reseed or replace your saved library.

Use **Export library** to download a JSON backup. Use **Import library** to choose a previous export. Import validates the file and, after confirmation, replaces the current library; export a backup first if you need to preserve the current one. **Reset library** asks for confirmation and replaces your list with the original starter games.

Browser storage belongs to that browser and device. It is not shared with other people, browsers, or devices. Clearing the browser's site data can delete the library, so regular exports are recommended.

## Manage games

- Select **Add game** to create an entry. Only the title is required.
- Use **Edit** on a card to change its information.
- Use **Start**, **Mark played**, or **Replay** to move it to the next status.
- Use **Delete** to remove one game; the site asks before deleting.
- Search looks through titles, descriptions, genres, tags, and notes. Genre, player-count, and priority filters combine with the selected view.
- Use **Markdown for Discord** to choose which status groups and details to include, then copy the preview or download it as a Markdown file. The preview warns when it exceeds Discord's 2,000-character message limit.
- Select **How-to** in the header for in-app steps covering game details, Steam links, cover images, status changes, and backups.
- Use the sort menu to order games by title, priority, or random order. **Pick a game** suggests a random game from the current view and filters; start it to move it to In Progress. The appearance menu offers Forest dark, Ocean dark, Ember dark, and Soft light themes. Theme and sort choices are saved in browser preferences separately from the game list.
- A Steam Store URL can be saved manually. **Fetch Steam info** uses the optional Worker described above. Steam genres and store categories are kept separate from community tags, and a warning appears before filled-in details are replaced.