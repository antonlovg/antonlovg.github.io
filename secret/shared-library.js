(function attachSharedLibrary(root, createApi) {
  const api = createApi();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.SharedLibrary = api;
  }
})(globalThis, () => {
  function normalizeTitle(title) {
    return title.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  }

  function getSteamAppId(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || !['store.steampowered.com', 'www.store.steampowered.com'].includes(url.hostname.toLowerCase())) return '';
      return url.pathname.match(/^\/app\/(\d+)(?:\/|$)/)?.[1] || '';
    } catch {
      return '';
    }
  }

  function prepareSharedLibraryReplacement(snapshot) {
    if (!snapshot || snapshot.schemaVersion !== 1) {
      throw new Error('Unsupported shared library format. No data was changed.');
    }
    if (!Array.isArray(snapshot.games)) {
      throw new Error('The shared library does not contain a game list. No data was changed.');
    }

    const ids = new Set();
    const titles = new Set();
    const steamAppIds = new Set();
    const games = snapshot.games.map(game => {
      if (!game || typeof game !== 'object' || Array.isArray(game)
        || typeof game.id !== 'string' || !game.id
        || typeof game.title !== 'string' || !game.title.trim()) {
        throw new Error('The shared library contains an invalid game entry. No data was changed.');
      }

      const title = normalizeTitle(game.title);
      if (ids.has(game.id) || titles.has(title)) {
        throw new Error(`The shared library contains duplicate games named "${game.title.trim()}". No data was changed.`);
      }
      ids.add(game.id);
      titles.add(title);

      const steamAppId = getSteamAppId(game.steamUrl || '');
      if (steamAppId && steamAppIds.has(steamAppId)) {
        throw new Error(`The shared library contains duplicate Steam app ${steamAppId}. No data was changed.`);
      }
      if (steamAppId) steamAppIds.add(steamAppId);

      return {
        ...game,
        trailerUrl: game.trailerUrl || '',
        steamCategories: Array.isArray(game.steamCategories) ? [...game.steamCategories] : []
      };
    });

    return games;
  }

  return { prepareSharedLibraryReplacement };
});