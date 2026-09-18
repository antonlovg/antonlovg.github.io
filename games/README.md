# Game Library

A small personal game library for GitHub Pages, built with plain HTML, CSS, and vanilla JavaScript.

## Features

- Stores games in the browser's `localStorage`
- Search and combined filters for status, type, and genre
- Sorting by alphabet, recency, release year, or saved manual order
- Drag cards to manually reorder the library
- Switch between a cover grid and a compact list view
- Add, edit, and delete game cards from the website
- Create, switch between, and delete your own named lists
- Stats, recommendations, and a Play Together view
- Steam search shortcut that opens Steam's own search page
- Correct Steam CDN cover images for the example games

## Important limitation

This version does not use Supabase or any other database. Each browser profile and device has its own library. Changes made on one computer will not automatically appear for another person.

The default `My library` list cannot be deleted. When another list is deleted, its games move to `My library`. The data is stored locally under the browser keys `game-library-data`, `game-library-collections`, `game-library-active-list`, `game-library-sort`, and `game-library-view`. Clearing site data, using a different browser profile, or using private browsing can remove or hide the saved library.

## File structure

```text
/
├── index.html
├── style.css
├── script.js
└── README.md
```

## GitHub Pages setup

1. Push the project to a GitHub repository.
2. Open the repository settings.
3. Go to Pages.
4. Select the main branch and the root folder.
5. Save the site.
6. GitHub Pages will publish the static site at a URL like `https://<your-user>.github.io/<repo-name>/games/`.

No API key, database, backend, build system, or secret configuration is needed.

## Local testing

From the repository folder, run:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/games/
```

## Steam search

The Add Game form has a Steam search shortcut. Steam blocks direct browser API requests from GitHub Pages, so the button opens Steam's own search page in a new tab. Copy the selected Steam store URL into the form and add a cover URL if needed.
