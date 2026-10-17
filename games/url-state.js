// Shareable game-library state in the URL, e.g. /games/?q=portal&genre=Puzzle&players=2&priority=1#in-progress
// Values from the address bar are untrusted: everything is validated or length-limited here,
// and the app only ever writes them into form controls (never into HTML).
(function attachUrlState(root, createApi) {
  const api = createApi();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GameUrlState = api;
})(globalThis, () => {
  const VIEWS = ['to-play', 'in-progress', 'played', 'all'];
  const PLAYERS = ['1', '2', '3', '4', '5+', 'unknown'];
  const DEFAULT_VIEW = 'to-play';
  const MAX_QUERY = 100;
  const MAX_GENRE = 60;

  function cleanText(value, max) {
    return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';
  }

  function parse(href) {
    let url;
    try {
      url = new URL(href);
    } catch {
      return { view: DEFAULT_VIEW, q: '', genre: '', players: '', priority: false };
    }
    const params = url.searchParams;
    let hash = '';
    try {
      hash = decodeURIComponent(url.hash.slice(1));
    } catch {
      hash = '';
    }
    const players = params.get('players') || '';
    return {
      view: VIEWS.includes(hash) ? hash : DEFAULT_VIEW,
      q: cleanText(params.get('q'), MAX_QUERY),
      genre: cleanText(params.get('genre'), MAX_GENRE),
      players: PLAYERS.includes(players) ? players : '',
      priority: params.get('priority') === '1'
    };
  }

  // Builds the path + query + hash for a state, keeping unrelated query parameters.
  function build(href, state) {
    const url = new URL(href);
    const params = url.searchParams;
    for (const key of ['q', 'genre', 'players', 'priority']) params.delete(key);
    const q = cleanText(state.q, MAX_QUERY);
    const genre = cleanText(state.genre, MAX_GENRE);
    if (q) params.set('q', q);
    if (genre) params.set('genre', genre);
    if (PLAYERS.includes(state.players)) params.set('players', state.players);
    if (state.priority) params.set('priority', '1');
    const query = params.toString();
    const view = VIEWS.includes(state.view) && state.view !== DEFAULT_VIEW ? `#${state.view}` : '';
    return `${url.pathname}${query ? `?${query}` : ''}${view}`;
  }

  function sameState(a, b) {
    return a.view === b.view && a.q === b.q && a.genre === b.genre && a.players === b.players && Boolean(a.priority) === Boolean(b.priority);
  }

  return { VIEWS, PLAYERS, DEFAULT_VIEW, parse, build, sameState };
});
