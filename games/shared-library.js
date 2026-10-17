(function attachSharedLibrary(root, createApi) {
  const api = createApi();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.SharedLibrary = api;
  }
})(globalThis, () => {
  // Error messages are translated on the site (SiteI18n) and stay English in the unit tests.
  const t = (text, vars = {}) => (globalThis.SiteI18n ? globalThis.SiteI18n.t(text, vars) : text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole)));

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
      throw new Error(t('Unsupported shared library format. No data was changed.'));
    }
    if (!Array.isArray(snapshot.games)) {
      throw new Error(t('The shared library does not contain a game list. No data was changed.'));
    }

    const ids = new Set();
    const titles = new Set();
    const steamAppIds = new Set();
    const games = snapshot.games.map(game => {
      if (!game || typeof game !== 'object' || Array.isArray(game)
        || typeof game.id !== 'string' || !game.id
        || typeof game.title !== 'string' || !game.title.trim()) {
        throw new Error(t('The shared library contains an invalid game entry. No data was changed.'));
      }

      const title = normalizeTitle(game.title);
      if (ids.has(game.id) || titles.has(title)) {
        throw new Error(t('The shared library contains duplicate games named “{title}”. No data was changed.', { title: game.title.trim() }));
      }
      ids.add(game.id);
      titles.add(title);

      const normalizedGame = {
        ...game,
        description: typeof game.description === 'string' ? game.description : '',
        genre: typeof game.genre === 'string' ? game.genre : '',
        tags: typeof game.tags === 'string' ? game.tags : '',
        players: typeof game.players === 'string' ? game.players : '',
        steamUrl: typeof game.steamUrl === 'string' ? game.steamUrl : '',
        trailerUrl: typeof game.trailerUrl === 'string' ? game.trailerUrl : '',
        coverUrl: typeof game.coverUrl === 'string' ? game.coverUrl : '',
        notes: typeof game.notes === 'string' ? game.notes : '',
        status: game.status === 'in-progress' || game.status === 'played' || game.status === 'to-play' ? game.status : 'to-play',
        priority: Boolean(game.priority),
        steamCategories: Array.isArray(game.steamCategories) ? game.steamCategories.filter(item => typeof item === 'string') : []
      };

      const steamAppId = getSteamAppId(normalizedGame.steamUrl);
      if (steamAppId && steamAppIds.has(steamAppId)) {
        throw new Error(t('The shared library contains duplicate Steam app {id}. No data was changed.', { id: steamAppId }));
      }
      if (steamAppId) steamAppIds.add(steamAppId);

      return normalizedGame;
    });

    return games;
  }

  function buildSnapshot(games, exportedAt = new Date()) {
    return { schemaVersion: 1, exportedAt: new Date(exportedAt).toISOString(), games };
  }

  function serializeSnapshot(snapshot) {
    return `${JSON.stringify(snapshot, null, 2)}\n`;
  }

  // Compares two game lists by id and reports what applying `nextGames` would change.
  function summarizeChanges(currentGames, nextGames) {
    const current = new Map(currentGames.map(game => [game.id, game]));
    const next = new Map(nextGames.map(game => [game.id, game]));
    const added = [];
    const changed = [];
    const removed = [];
    for (const [id, game] of next) {
      const previous = current.get(id);
      if (!previous) added.push(game.title);
      else if (JSON.stringify(previous) !== JSON.stringify(game)) changed.push(game.title);
    }
    for (const [id, game] of current) {
      if (!next.has(id)) removed.push(game.title);
    }
    return { added, changed, removed, unchanged: next.size - added.length - changed.length };
  }

  // True when the snapshot was published after the version this browser last loaded or dismissed.
  function isNewerSnapshot(exportedAt, knownVersion) {
    const published = Date.parse(exportedAt);
    if (Number.isNaN(published)) return false;
    const known = Date.parse(knownVersion);
    return Number.isNaN(known) || published > known;
  }

  // GitHub's contents API expects base64 of the file's UTF-8 bytes.
  function encodeBase64Utf8(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
  }

  return {
    prepareSharedLibraryReplacement,
    buildSnapshot,
    serializeSnapshot,
    summarizeChanges,
    isNewerSnapshot,
    encodeBase64Utf8
  };
});