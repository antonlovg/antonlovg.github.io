const STORAGE_KEY = 'personal-game-library-v1';
const PREFERENCES_KEY = 'personal-game-library-preferences-v1';
const VALID_STATUSES = ['to-play', 'in-progress', 'played'];
const VALID_THEMES = ['forest', 'ocean', 'ember', 'light'];
const VALID_SORTS = ['title', 'title-desc', 'priority', 'random'];
const STATUS_LABELS = {
  'to-play': 'To Play',
  'in-progress': 'In Progress',
  played: 'Played Games'
};

const initialGames = [
  ['ARK Survival Evolved', 'Open world', 'Dino', 'to-play'],
  ["No Man's Sky", 'Open world', 'Space', 'to-play'],
  ['The Forest', 'Survival', '', 'to-play'],
  ['Astroneer', 'Space survival', 'Easier', 'to-play'],
  ['Risk of Rain 2', 'Roguelike', 'Waytoodank', 'to-play'],
  ['Stranded Deep', 'Survival', 'Potentially relaxing', 'to-play'],
  ['Deep Rock Galactic', 'Co-op', 'Originally categorized as farming game', 'to-play'],
  ['Two Against the Legion', 'Co-op', 'Sussy', 'to-play'],
  ['Outward', 'Open world', 'Fantasy', 'to-play'],
  ['Wobbly Life', 'Simulation', 'Sillybilly', 'to-play'],
  ['Elden Ring', 'Soulslike', 'Co-op', 'to-play'],
  ['The Timeless Child', 'Puzzle', '', 'to-play', true],
  ['Unsolved Case', 'Puzzle', '', 'to-play', true],
  ['The Amulet of AmunRun', 'Puzzle', '', 'to-play'],
  ['Sneak Thief', 'Stealth', 'FPS', 'to-play'],
  ['Puzzle Compound', 'Puzzle', '', 'to-play'],
  ['Escape First Alchemist', 'Puzzle', '', 'to-play', true],
  ['Mad Experiments 2: Escape Room', 'Puzzle', '', 'to-play', true],
  ["LiMiT's Escape Room Games 1 & 2", 'Escape room', '', 'to-play'],
  ['Unboxing the Cryptic Killer', 'Puzzle', 'Designed for two players', 'to-play', false, '2'],
  ['In Sink: A Co-Op Escape Prologue', 'Puzzle', 'Designed for two players', 'to-play', false, '2'],
  ['Space Beast Terror Fright', 'Co-op', 'Permadeath', 'to-play'],
  ['Rocketbirds', '2D', 'Co-op', 'to-play'],
  ['Kingdom Two Crowns', '2D', 'Medieval', 'to-play'],
  ['Unravel Two', '2D', 'Remote Play Together', 'to-play'],
  ['Project Playtime', 'Horror', 'Similar concept to Devour', 'to-play'],
  ['Out of Space', 'Simulation', 'Relaxing space sim', 'to-play'],
  ['Sniper Elite', 'Sniper', 'Co-op', 'to-play'],
  ['Grounded', 'Survival', 'Base-building', 'to-play'],
  ['Noch', 'Horror', 'Two-player FPS', 'to-play'],
  ['Strange Brigade', 'Combat', 'Puzzle and exploration', 'to-play'],
  ['Unrailed', 'Co-op', 'Relaxing train game', 'to-play'],
  ['Victor Vran', 'Action RPG', 'Diablo-like co-op', 'to-play'],
  ['Ashen', 'RPG', '', 'to-play'],
  ['Heist Kitty: Multiplayer Cat Simulator Game', 'Open world', 'Cat', 'to-play'],
  ['Antioch: Scarlet Bay', 'Narrative', 'Minimal gameplay, co-op', 'to-play'],
  ['Palallel', '2D', 'Simple puzzle', 'to-play'],
  ['39 Days to Mars', '2D', 'Exploration', 'to-play'],
  ['Get Together', '2D', 'Two-player puzzle', 'to-play', true, '2'],
  ['Psycho Reign', 'Horror', 'Puzzle', 'to-play'],
  ['Mark & Lara: Partners In Justice', 'Detective', 'Text-based co-op', 'to-play'],
  ['Bread & Fred', '2D', 'Puzzle', 'to-play'],
  ['Blanc', 'Adventure', 'Minimal gameplay, beautiful presentation', 'to-play'],
  ['Spiritfarer', 'Story-driven', 'Remote Play', 'to-play'],
  ['違う冬のぼくら (Bokura)', 'Puzzle', 'Two-player game; each player sees a different version of the world', 'to-play', false, '2'],

  ['Escape the Backrooms', 'Horror', 'Co-op', 'in-progress'],
  ['Remnants: From the Ashes', 'Soulslike', '', 'in-progress'],
  ['The Long Drive', 'Driving', 'Silly car game', 'in-progress'],
  ['Last Will', 'Puzzle', '', 'in-progress'],
  ['Cry of Fear', 'Horror', 'Co-op', 'in-progress'],
  ['The Watchers', 'Horror', 'Similar to Devour', 'in-progress'],
  ['Escape Memoirs: Mini Stories', 'Puzzle', '', 'in-progress'],
  ['Escape from School', 'Puzzle', '', 'in-progress'],
  ['En Route: Space', 'Puzzle', '', 'in-progress'],
  ['Bigfoot', 'Survival', '', 'in-progress'],
  ['Journey to the Savage Planet', 'Adventure', 'Co-op story', 'in-progress'],
  ['GTFO', 'Co-op', 'Difficult; unsure if the difficulty is enjoyable', 'in-progress'],

  ['A Way Out', 'Co-op', 'Story', 'played'],
  ['Stay Close', 'Horror', 'Co-op', 'played'],
  ['Dark Pictures games', 'Horror', 'Co-op; collection entry', 'played'],
  ['We Were Here', 'Puzzle', '', 'played'],
  ['The Past Within', 'Puzzle', '', 'played'],
  ['Dead by Daylight', 'Multiplayer', 'Regular/replayable game', 'played'],
  ['ARAM', 'Game mode', 'League of Legends', 'played'],
  ['Rust', 'Survival', 'Regular/replayable game', 'played'],
  ['Paladins', 'Multiplayer', 'Regular/replayable game', 'played'],
  ['World of Warcraft', 'MMORPG', 'Regular/replayable game', 'played'],
  ['The Outlast Trials', 'Horror', 'Co-op', 'played'],

  ['Borderlands', 'Shooter', 'Unsure whether already played', 'to-play'],
  ['F.E.A.R. 3', 'Shooter', 'Unsure how co-op works', 'to-play'],
  ['GTA', 'Action', 'Previously tried; intended way to play is unclear', 'to-play'],
  ['Dying Light', 'Action', '', 'to-play'],
  ['Pode', 'Puzzle', 'Might work with Remote Play; inspired by Norwegian culture', 'to-play']
];

let games = [];
let activeView = 'to-play';
let toastTimer;
let steamCategories = [];
let randomOrder = new Map();
let suggestedGameId = null;

const elements = {
  grid: document.querySelector('#game-grid'),
  empty: document.querySelector('#empty-state'),
  dialog: document.querySelector('#game-dialog'),
  form: document.querySelector('#game-form'),
  toast: document.querySelector('#toast'),
  importInput: document.querySelector('#import-input'),
  search: document.querySelector('#search-input'),
  genreFilter: document.querySelector('#genre-filter'),
  playersFilter: document.querySelector('#players-filter'),
  priorityFilter: document.querySelector('#priority-filter')
};

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `game-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeInitialGames() {
  return initialGames.map(([title, genre, notes, status, priority = false, players = '']) => ({
    id: makeId(), title, description: '', genre, tags: '', players,
    steamUrl: '', coverUrl: '', notes, status, priority, steamCategories: []
  }));
}

function isString(value) {
  return typeof value === 'string';
}

function safeWebUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function validateGameList(value) {
  if (!Array.isArray(value)) return false;
  return value.every(game => game && typeof game === 'object' && !Array.isArray(game)
    && isString(game.id) && game.id.length > 0
    && isString(game.title) && game.title.trim().length > 0
    && VALID_STATUSES.includes(game.status)
    && ['description', 'genre', 'tags', 'players', 'steamUrl', 'coverUrl', 'notes'].every(key => isString(game[key]))
    && typeof game.priority === 'boolean'
    && (game.steamCategories === undefined || (Array.isArray(game.steamCategories) && game.steamCategories.every(isString))));
}

function normalizeGame(game) {
  return {
    id: game.id,
    title: game.title.trim(),
    description: game.description,
    genre: game.genre,
    tags: game.tags,
    players: game.players,
    steamUrl: game.steamUrl,
    coverUrl: game.coverUrl,
    notes: game.notes,
    status: game.status,
    priority: game.priority,
    steamCategories: game.steamCategories || []
  };
}

function initializeLibrary() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) {
      games = makeInitialGames();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
      loadPreferences();
      return;
    }
    const parsed = JSON.parse(saved);
    if (!validateGameList(parsed)) throw new Error('Saved library data is invalid. It was left untouched.');
    games = parsed.map(normalizeGame);
  } catch (error) {
    games = [];
    showToast(error instanceof SyntaxError ? 'Saved library could not be read. Its stored data was left untouched.' : error.message, true);
  }
  loadPreferences();
}

function loadPreferences() {
  try {
    const preferences = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || '{}');
    const theme = VALID_THEMES.includes(preferences.theme) ? preferences.theme : 'forest';
    const sort = VALID_SORTS.includes(preferences.sort) ? preferences.sort : 'title';
    document.documentElement.dataset.theme = theme;
    document.querySelector('#theme-select').value = theme;
    document.querySelector('#sort-select').value = sort;
    if (sort === 'random') randomOrder = new Map(games.map(game => [game.id, Math.random()]));
  } catch {
    document.documentElement.dataset.theme = 'forest';
    document.querySelector('#theme-select').value = 'forest';
    document.querySelector('#sort-select').value = 'title';
  }
}

function saveTheme(theme) {
  if (!VALID_THEMES.includes(theme)) return;
  document.documentElement.dataset.theme = theme;
  try {
    const preferences = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || '{}');
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ ...preferences, theme }));
  } catch {
    showToast('Theme changed, but this browser could not save the preference.', true);
  }
}

function saveSort(sort) {
  if (!VALID_SORTS.includes(sort)) return;
  try {
    const preferences = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || '{}');
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ ...preferences, sort }));
  } catch {
    showToast('Sort changed, but this browser could not save the preference.', true);
  }
}

function commitGames(nextGames, message) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextGames));
    games = nextGames;
    render();
    if (message) showToast(message);
    return true;
  } catch {
    showToast('Could not save to this browser. Check available site storage.', true);
    return false;
  }
}

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle('is-error', isError);
  elements.toast.classList.add('is-visible');
  toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), 3600);
}

function getVisibleGames() {
  const query = elements.search.value.trim().toLocaleLowerCase();
  const genre = elements.genreFilter.value;
  const players = elements.playersFilter.value;
  const priorityOnly = elements.priorityFilter.checked;

  return games.filter(game => {
    if (activeView !== 'all' && game.status !== activeView) return false;
    if (genre && game.genre !== genre) return false;
    if (priorityOnly && !game.priority) return false;
    if (players === 'unknown' && game.players) return false;
    if (players && players !== 'unknown') {
      if (players === '5+' ? !['5+', '6+', 'many'].includes(game.players) : game.players !== players) return false;
    }
    if (query) {
      const haystack = [game.title, game.description, game.genre, game.tags, game.notes].join(' ').toLocaleLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  }).sort((first, second) => {
    const sort = document.querySelector('#sort-select').value;
    if (sort === 'random') {
      if (!randomOrder.has(first.id)) randomOrder.set(first.id, Math.random());
      if (!randomOrder.has(second.id)) randomOrder.set(second.id, Math.random());
      return randomOrder.get(first.id) - randomOrder.get(second.id);
    }
    if (sort === 'priority' && first.priority !== second.priority) return first.priority ? -1 : 1;
    const result = first.title.localeCompare(second.title);
    return sort === 'title-desc' ? -result : result;
  });
}

function addText(parent, tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  node.textContent = text;
  parent.append(node);
  return node;
}

function makeCard(game) {
  const card = document.createElement('article');
  card.className = 'game-card';
  const cover = document.createElement('div');
  cover.className = 'cover-wrap';
  const coverUrl = safeWebUrl(game.coverUrl);
  if (coverUrl) {
    const image = document.createElement('img');
    image.src = coverUrl;
    image.alt = `${game.title} cover`;
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => {
      const placeholder = document.createElement('div');
      placeholder.className = 'cover-placeholder';
      placeholder.textContent = game.title.slice(0, 1).toUpperCase();
      image.replaceWith(placeholder);
    }, { once: true });
    cover.append(image);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'cover-placeholder';
    placeholder.textContent = game.title.slice(0, 1).toUpperCase();
    cover.append(placeholder);
  }
  if (game.priority) addText(cover, 'span', 'priority-mark', '!');
  card.append(cover);

  const content = document.createElement('div');
  content.className = 'card-content';
  const titleRow = document.createElement('div');
  titleRow.className = 'card-title-row';
  addText(titleRow, 'h3', 'card-title', game.title);
  content.append(titleRow);
  if (game.description) addText(content, 'p', 'card-description', game.description);

  const chips = [];
  if (game.genre) chips.push(game.genre);
  if (game.players) chips.push(`${game.players} ${game.players === '1' ? 'player' : 'players'}`);
  for (const tag of game.tags.split(',').map(item => item.trim()).filter(Boolean)) chips.push(tag);
  if (chips.length) {
    const meta = document.createElement('div');
    meta.className = 'card-meta';
    for (const chip of chips) addText(meta, 'span', 'meta-chip', chip);
    content.append(meta);
  }
  if (game.steamCategories.length) {
    addText(content, 'p', 'steam-categories', `Steam categories: ${game.steamCategories.join(', ')}`);
  }
  if (game.notes) addText(content, 'p', 'card-notes', game.notes);
  const spacer = document.createElement('div');
  spacer.className = 'card-spacer';
  content.append(spacer);

  const footer = document.createElement('div');
  footer.className = 'card-footer';
  const steamUrl = safeWebUrl(game.steamUrl);
  if (steamUrl) {
    const link = addText(footer, 'a', 'steam-link', 'Open Steam ↗');
    link.href = steamUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  const actions = document.createElement('div');
  actions.className = 'card-actions';
  const moveButton = document.createElement('button');
  moveButton.type = 'button';
  moveButton.className = 'small-button';
  moveButton.textContent = game.status === 'to-play' ? 'Start' : game.status === 'in-progress' ? 'Mark played' : 'Replay';
  moveButton.setAttribute('aria-label', `${moveButton.textContent} ${game.title}`);
  moveButton.addEventListener('click', () => {
    const nextStatus = game.status === 'to-play' ? 'in-progress' : game.status === 'in-progress' ? 'played' : 'to-play';
    commitGames(games.map(item => item.id === game.id ? { ...item, status: nextStatus } : item), `${game.title} moved to ${STATUS_LABELS[nextStatus]}.`);
  });
  actions.append(moveButton);
  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'small-button';
  editButton.textContent = 'Edit';
  editButton.addEventListener('click', () => openEditor(game));
  actions.append(editButton);
  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'small-button delete-button';
  deleteButton.textContent = 'Delete';
  deleteButton.addEventListener('click', () => deleteGame(game));
  actions.append(deleteButton);
  footer.append(actions);
  content.append(footer);
  card.append(content);
  return card;
}

function renderGenres() {
  const previous = elements.genreFilter.value;
  const genres = [...new Set(games.map(game => game.genre.trim()).filter(Boolean))]
    .sort((first, second) => first.localeCompare(second));
  elements.genreFilter.replaceChildren(new Option('All genres', ''));
  for (const genre of genres) elements.genreFilter.add(new Option(genre, genre));
  if (genres.includes(previous)) elements.genreFilter.value = previous;
}

function render() {
  renderGenres();
  document.querySelectorAll('.view-tab').forEach(tab => {
    const selected = tab.dataset.view === activeView;
    tab.classList.toggle('is-active', selected);
    tab.setAttribute('aria-current', selected ? 'page' : 'false');
  });
  for (const status of VALID_STATUSES) {
    document.querySelector(`#count-${status}`).textContent = games.filter(game => game.status === status).length;
  }
  document.querySelector('#count-all').textContent = games.length;
  document.querySelector('#library-count').textContent = `${games.length} ${games.length === 1 ? 'game' : 'games'} in your library`;
  document.querySelector('#view-heading').textContent = activeView === 'all' ? 'All Games' : STATUS_LABELS[activeView];
  const visible = getVisibleGames();
  document.querySelector('#results-count').textContent = `${visible.length} ${visible.length === 1 ? 'game' : 'games'}`;
  elements.grid.replaceChildren(...visible.map(makeCard));
  elements.empty.hidden = visible.length !== 0;
}

function showRandomSuggestion(previousId = null) {
  const candidates = getVisibleGames();
  const result = document.querySelector('#suggestion-result');
  result.replaceChildren();
  if (!candidates.length) {
    suggestedGameId = null;
    document.querySelector('#suggestion-title').textContent = 'No games to choose from';
    addText(result, 'p', 'suggestion-description', 'Adjust the current view or filters, then try again.');
    document.querySelector('#start-suggested-game').disabled = true;
    document.querySelector('#suggest-another').disabled = true;
    return;
  }
  const available = candidates.filter(game => game.id !== previousId);
  const picked = (available.length ? available : candidates)[Math.floor(Math.random() * (available.length || candidates.length))];
  suggestedGameId = picked.id;
  document.querySelector('#suggestion-title').textContent = 'What should you play?';
  addText(result, 'h3', 'suggestion-game-title', `${picked.priority ? '! ' : ''}${picked.title}`);
  const details = [picked.genre, picked.players ? `${picked.players} ${picked.players === '1' ? 'player' : 'players'}` : ''].filter(Boolean).join(' · ');
  if (details) addText(result, 'p', 'suggestion-meta', details);
  if (picked.description) addText(result, 'p', 'suggestion-description', picked.description);
  else if (picked.notes) addText(result, 'p', 'suggestion-description', picked.notes);
  const startButton = document.querySelector('#start-suggested-game');
  startButton.disabled = picked.status === 'in-progress';
  startButton.textContent = picked.status === 'in-progress' ? 'Already in progress' : 'Start this game';
  document.querySelector('#suggest-another').disabled = candidates.length < 2;
}

function startSuggestedGame() {
  const picked = games.find(game => game.id === suggestedGameId);
  if (!picked || picked.status === 'in-progress') return;
  if (commitGames(games.map(game => game.id === picked.id ? { ...game, status: 'in-progress' } : game), `${picked.title} moved to In Progress.`)) {
    document.querySelector('#suggestion-dialog').close();
  }
}

function openEditor(game = null) {
  elements.form.reset();
  document.querySelector('#game-id').value = game?.id || '';
  document.querySelector('#dialog-title').textContent = game ? 'Edit game' : 'Add a game';
  document.querySelector('#game-title').value = game?.title || '';
  document.querySelector('#game-description').value = game?.description || '';
  document.querySelector('#game-genre').value = game?.genre || '';
  document.querySelector('#game-tags').value = game?.tags || '';
  document.querySelector('#game-players').value = game?.players || '';
  document.querySelector('#game-steam-url').value = game?.steamUrl || '';
  document.querySelector('#game-cover-url').value = game?.coverUrl || '';
  document.querySelector('#game-notes').value = game?.notes || '';
  document.querySelector('#game-status').value = game?.status || (activeView === 'all' ? 'to-play' : activeView);
  document.querySelector('#game-priority').checked = game?.priority || false;
  steamCategories = game?.steamCategories ? [...game.steamCategories] : [];
  elements.dialog.showModal();
  document.querySelector('#game-title').focus();
}

function readFormGame() {
  const id = document.querySelector('#game-id').value;
  return {
    id: id || makeId(),
    title: document.querySelector('#game-title').value.trim(),
    description: document.querySelector('#game-description').value.trim(),
    genre: document.querySelector('#game-genre').value.trim(),
    tags: document.querySelector('#game-tags').value.trim(),
    players: document.querySelector('#game-players').value,
    steamUrl: document.querySelector('#game-steam-url').value.trim(),
    coverUrl: document.querySelector('#game-cover-url').value.trim(),
    notes: document.querySelector('#game-notes').value.trim(),
    status: document.querySelector('#game-status').value,
    priority: document.querySelector('#game-priority').checked,
    steamCategories: [...steamCategories]
  };
}

function deleteGame(game) {
  if (!confirm(`Delete "${game.title}" from your library? This cannot be undone.`)) return;
  commitGames(games.filter(item => item.id !== game.id), `${game.title} deleted.`);
}

async function fetchSteamInfo() {
  const steamUrl = document.querySelector('#game-steam-url').value.trim();
  const match = steamUrl.match(/store\.steampowered\.com\/app\/(\d+)/i);
  if (!match) {
    showToast('Enter a Steam Store URL containing an app ID first.', true);
    return;
  }
  const button = document.querySelector('#fetch-steam');
  button.disabled = true;
  button.textContent = 'Fetching…';
  try {
    let response;
    try {
      response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${match[1]}&cc=se&l=english`);
    } catch {
      throw new Error('Could not reach Steam. Check your connection; the browser or network may also be blocking this request.');
    }
    if (!response.ok) throw new Error(`Steam returned HTTP ${response.status}. Try again later.`);
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error('Steam returned an unreadable response. Try again later.');
    }
    const details = result[match[1]];
    if (!details?.success || !details.data) throw new Error('Steam returned no public details for this app. Check that the URL points to a public game page.');
    const data = details.data;
    const fetched = {
      title: typeof data.name === 'string' ? data.name : '',
      description: typeof data.short_description === 'string' ? data.short_description : '',
      coverUrl: typeof data.header_image === 'string' ? data.header_image : '',
      genre: Array.isArray(data.genres) ? data.genres.map(item => item.description).filter(Boolean).join(', ') : '',
      categories: Array.isArray(data.categories) ? data.categories.map(item => item.description).filter(Boolean) : []
    };
    const current = {
      title: document.querySelector('#game-title').value.trim(),
      description: document.querySelector('#game-description').value.trim(),
      coverUrl: document.querySelector('#game-cover-url').value.trim(),
      genre: document.querySelector('#game-genre').value.trim()
    };
    const wouldReplace = Object.keys(current).some(key => current[key] && fetched[key] && current[key] !== fetched[key])
      || (steamCategories.length > 0 && fetched.categories.length > 0);
    if (wouldReplace && !confirm('Steam has information for fields you have already filled in. Replace those fields with Steam data?')) return;
    for (const key of Object.keys(current)) {
      if (fetched[key] && (!current[key] || wouldReplace)) {
        const fieldId = { title: 'game-title', description: 'game-description', coverUrl: 'game-cover-url', genre: 'game-genre' }[key];
        document.querySelector(`#${fieldId}`).value = fetched[key];
      }
    }
    if (fetched.categories.length && (steamCategories.length === 0 || wouldReplace)) steamCategories = fetched.categories;
    showToast('Steam info added to the form. Save the game to keep it.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Steam lookup failed. Your entered information is unchanged.';
    showToast(`${message} Your entered information is unchanged.`, true);
  } finally {
    button.disabled = false;
    button.textContent = 'Fetch Steam info';
  }
}

function exportLibrary() {
  try {
    const contents = JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), games }, null, 2);
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `game-library-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Library export downloaded.');
  } catch {
    showToast('Could not export the library.', true);
  }
}

function escapeMarkdown(value) {
  return String(value).replace(/[\\`*_~|]/g, '\\$&').replace(/\s+/g, ' ').trim();
}

function buildMarkdownExport() {
  const selectedStatuses = [...document.querySelectorAll('[data-markdown-status]:checked')].map(input => input.dataset.markdownStatus);
  const selectedFields = new Set([...document.querySelectorAll('[data-markdown-field]:checked')].map(input => input.dataset.markdownField));
  if (!selectedStatuses.length) return 'Select at least one game group to export.';

  return selectedStatuses.map(status => {
    const group = games.filter(game => game.status === status).sort((first, second) => first.title.localeCompare(second.title));
    const lines = [`## ${STATUS_LABELS[status]}`];
    if (!group.length) {
      lines.push('_No games._');
      return lines.join('\n');
    }
    for (const game of group) {
      const title = escapeMarkdown(game.title);
      lines.push(`- **${game.priority ? '! ' : ''}${title}**`);
      const details = [];
      if (selectedFields.has('genre') && game.genre) details.push(escapeMarkdown(game.genre));
      if (selectedFields.has('players') && game.players) details.push(`${escapeMarkdown(game.players)} ${game.players === '1' ? 'player' : 'players'}`);
      if (details.length) lines.push(`  ${details.join(' | ')}`);
      if (selectedFields.has('description') && game.description) lines.push(`  ${escapeMarkdown(game.description)}`);
      if (selectedFields.has('tags') && game.tags) lines.push(`  Tags: ${escapeMarkdown(game.tags)}`);
      if (selectedFields.has('notes') && game.notes) lines.push(`  Notes: ${escapeMarkdown(game.notes)}`);
      const steamUrl = selectedFields.has('steamUrl') ? safeWebUrl(game.steamUrl) : '';
      if (steamUrl) lines.push(`  Steam: ${steamUrl}`);
      const coverUrl = selectedFields.has('coverUrl') ? safeWebUrl(game.coverUrl) : '';
      if (coverUrl) lines.push(`  Cover: ${coverUrl}`);
      if (selectedFields.has('steamCategories') && game.steamCategories.length) {
        lines.push(`  Steam store categories: ${escapeMarkdown(game.steamCategories.join(', '))}`);
      }
    }
    return lines.join('\n');
  }).join('\n\n');
}

function updateMarkdownPreview() {
  const markdown = buildMarkdownExport();
  document.querySelector('#markdown-preview').value = markdown;
  const length = document.querySelector('#markdown-length');
  length.textContent = markdown.length > 2000
    ? `${markdown.length} characters. Discord's message limit is 2,000 characters; select fewer groups or details to shorten it.`
    : `${markdown.length} characters. Discord's message limit is 2,000 characters.`;
  length.classList.toggle('is-over-limit', markdown.length > 2000);
}

async function copyMarkdown() {
  const preview = document.querySelector('#markdown-preview');
  try {
    await navigator.clipboard.writeText(preview.value);
  } catch {
    preview.focus();
    preview.select();
    if (!document.execCommand('copy')) {
      showToast('Could not copy automatically. Select and copy the preview text.', true);
      return;
    }
  }
  showToast('Markdown copied to clipboard.');
}

function downloadMarkdown() {
  const url = URL.createObjectURL(new Blob([document.querySelector('#markdown-preview').value], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `game-library-${new Date().toISOString().slice(0, 10)}.md`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Markdown file downloaded.');
}

async function importLibrary(file) {
  try {
    const parsed = JSON.parse(await file.text());
    const imported = Array.isArray(parsed) ? parsed : parsed?.games;
    if (!validateGameList(imported)) throw new Error('This file is not a valid game library export. No data was changed.');
    if (!confirm(`Import ${imported.length} games? This will replace your current library of ${games.length} games. Export a backup first if you want to keep it.`)) return;
    const normalized = imported.map(normalizeGame);
    const ids = new Set();
    for (const game of normalized) {
      if (ids.has(game.id)) game.id = makeId();
      ids.add(game.id);
    }
    commitGames(normalized, `Imported ${normalized.length} games. The previous library was replaced.`);
  } catch (error) {
    showToast(error instanceof SyntaxError ? 'Could not read that JSON file. No data was changed.' : error.message, true);
  } finally {
    elements.importInput.value = '';
  }
}

document.querySelectorAll('.view-tab').forEach(tab => tab.addEventListener('click', () => {
  activeView = tab.dataset.view;
  render();
}));
elements.search.addEventListener('input', render);
elements.genreFilter.addEventListener('change', render);
elements.playersFilter.addEventListener('change', render);
elements.priorityFilter.addEventListener('change', render);
document.querySelector('#sort-select').addEventListener('change', () => {
  const sort = document.querySelector('#sort-select').value;
  if (sort === 'random') {
    randomOrder = new Map(games.map(game => [game.id, Math.random()]));
  }
  saveSort(sort);
  render();
});
document.querySelector('#theme-select').addEventListener('change', event => saveTheme(event.target.value));
document.querySelector('#pick-game-button').addEventListener('click', () => {
  showRandomSuggestion();
  document.querySelector('#suggestion-dialog').showModal();
});
document.querySelector('#suggest-another').addEventListener('click', () => showRandomSuggestion(suggestedGameId));
document.querySelector('#start-suggested-game').addEventListener('click', startSuggestedGame);
document.querySelector('#close-suggestion').addEventListener('click', () => document.querySelector('#suggestion-dialog').close());
document.querySelector('#add-button').addEventListener('click', () => openEditor());
document.querySelector('#close-dialog').addEventListener('click', () => elements.dialog.close());
document.querySelector('#cancel-dialog').addEventListener('click', () => elements.dialog.close());
document.querySelector('#fetch-steam').addEventListener('click', fetchSteamInfo);
elements.form.addEventListener('submit', event => {
  event.preventDefault();
  if (!elements.form.reportValidity()) return;
  const savedGame = readFormGame();
  const exists = games.some(game => game.id === savedGame.id);
  const nextGames = exists ? games.map(game => game.id === savedGame.id ? savedGame : game) : [...games, savedGame];
  if (commitGames(nextGames, exists ? 'Game updated.' : 'Game added.')) elements.dialog.close();
});
document.querySelector('#export-button').addEventListener('click', exportLibrary);
document.querySelector('#markdown-export-button').addEventListener('click', () => {
  updateMarkdownPreview();
  document.querySelector('#markdown-dialog').showModal();
});
document.querySelector('#howto-button').addEventListener('click', () => document.querySelector('#howto-dialog').showModal());
document.querySelector('#close-markdown').addEventListener('click', () => document.querySelector('#markdown-dialog').close());
document.querySelector('#close-markdown-bottom').addEventListener('click', () => document.querySelector('#markdown-dialog').close());
document.querySelector('#close-howto').addEventListener('click', () => document.querySelector('#howto-dialog').close());
document.querySelector('#close-howto-bottom').addEventListener('click', () => document.querySelector('#howto-dialog').close());
document.querySelectorAll('[data-markdown-status], [data-markdown-field]').forEach(input => input.addEventListener('change', updateMarkdownPreview));
document.querySelector('#copy-markdown').addEventListener('click', copyMarkdown);
document.querySelector('#download-markdown').addEventListener('click', downloadMarkdown);
document.querySelector('#import-button').addEventListener('click', () => elements.importInput.click());
elements.importInput.addEventListener('change', event => {
  const [file] = event.target.files;
  if (file) importLibrary(file);
});
document.querySelector('#reset-button').addEventListener('click', () => {
  if (!confirm(`Delete all ${games.length} games and reset to the original starter library? This cannot be undone. Export a backup first if you want to keep your data.`)) return;
  commitGames(makeInitialGames(), 'Library reset to the original starter games.');
});

initializeLibrary();
render();