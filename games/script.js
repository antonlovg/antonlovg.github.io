const appState = {
  games: [],
  filters: {
    status: 'All',
    type: 'All',
    genre: 'All',
    query: ''
  },
  sort: 'recently-added',
  view: 'grid',
  collections: ['My library'],
  activeCollection: 'My library',
  editingGameId: null,
  localStorageKey: 'game-library-data',
  collectionsStorageKey: 'game-library-collections',
  themeStorageKey: 'game-library-theme',
  viewStorageKey: 'game-library-view',
  sortStorageKey: 'game-library-sort'
};

const elements = {
  searchInput: document.getElementById('searchInput'),
  collectionSelector: document.getElementById('collectionSelector'),
  newCollectionButton: document.getElementById('newCollectionButton'),
  deleteCollectionButton: document.getElementById('deleteCollectionButton'),
  collectionCreate: document.getElementById('collectionCreate'),
  newCollectionInput: document.getElementById('newCollectionInput'),
  saveCollectionButton: document.getElementById('saveCollectionButton'),
  addGameButton: document.getElementById('addGameButton'),
  refreshButton: document.getElementById('refreshButton'),
  themeToggle: document.getElementById('themeToggle'),
  statusFilters: document.getElementById('statusFilters'),
  typeFilters: document.getElementById('typeFilters'),
  genreFilter: document.getElementById('genreFilter'),
  sortSelect: document.getElementById('sortSelect'),
  gridViewButton: document.getElementById('gridViewButton'),
  listViewButton: document.getElementById('listViewButton'),
  resultsCount: document.getElementById('resultsCount'),
  gamesGrid: document.getElementById('gamesGrid'),
  loadingState: document.getElementById('loadingState'),
  errorState: document.getElementById('errorState'),
  emptyState: document.getElementById('emptyState'),
  recommendationsList: document.getElementById('recommendationsList'),
  playTogetherList: document.getElementById('playTogetherList'),
  libraryTitle: document.getElementById('libraryTitle'),
  statTotal: document.getElementById('statTotal'),
  statPlayed: document.getElementById('statPlayed'),
  statWant: document.getElementById('statWant'),
  statCoop: document.getElementById('statCoop'),
  gameModal: document.getElementById('gameModal'),
  steamSearchInput: document.getElementById('steamSearchInput'),
  steamSearchButton: document.getElementById('steamSearchButton'),
  steamSearchStatus: document.getElementById('steamSearchStatus'),
  steamSearchResults: document.getElementById('steamSearchResults'),
  modalTitle: document.getElementById('modalTitle'),
  gameForm: document.getElementById('gameForm'),
  closeModalButton: document.getElementById('closeModalButton'),
  cancelGameButton: document.getElementById('cancelGameButton'),
  toast: document.getElementById('toast'),
  gameId: document.getElementById('gameId'),
  gameTitle: document.getElementById('gameTitle'),
  gameDescription: document.getElementById('gameDescription'),
  gameCoverUrl: document.getElementById('gameCoverUrl'),
  gameSteamUrl: document.getElementById('gameSteamUrl'),
  gameStatus: document.getElementById('gameStatus'),
  gameType: document.getElementById('gameType'),
  gameReleaseYear: document.getElementById('gameReleaseYear'),
  gameGenres: document.getElementById('gameGenres'),
  gameNotes: document.getElementById('gameNotes'),
};

const DEFAULT_GAMES = [
  {
    id: 'seed-1',
    title: 'It Takes Two',
    description: 'A co-op adventure about overcoming obstacles together.',
    cover_url: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1426210/header.jpg',
    steam_url: 'https://store.steampowered.com/app/1426210/It_Takes_Two/',
    status: 'Want to play',
    game_type: 'Co-op',
    genres: ['Adventure', 'Co-op', 'Puzzle'],
    release_year: 2021,
    notes: 'Perfect for a couple of game nights.',
    collection: 'My library',
    created_at: '2024-01-10T12:00:00Z',
    updated_at: '2024-01-10T12:00:00Z'
  },
  {
    id: 'seed-2',
    title: 'A Way Out',
    description: 'A story-driven co-op escape adventure.',
    cover_url: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1222700/header.jpg',
    steam_url: 'https://store.steampowered.com/app/1222700/A_Way_Out/',
    status: 'Playing',
    game_type: 'Co-op',
    genres: ['Action', 'Adventure', 'Co-op'],
    release_year: 2018,
    notes: 'Great for playing together on weekends.',
    collection: 'My library',
    created_at: '2024-02-05T11:20:00Z',
    updated_at: '2024-02-19T09:10:00Z'
  },
  {
    id: 'seed-3',
    title: 'Stardew Valley',
    description: 'A cozy farm life sim with plenty of variety.',
    cover_url: 'https://cdn.cloudflare.steamstatic.com/steam/apps/413150/header.jpg',
    steam_url: 'https://store.steampowered.com/app/413150/Stardew_Valley/',
    status: 'Played',
    game_type: 'Singleplayer',
    genres: ['Simulation', 'RPG', 'Cozy'],
    release_year: 2016,
    notes: 'Still one of our favorite chill games.',
    added_by: 'Anton',
    created_at: '2023-06-12T08:00:00Z',
    updated_at: '2024-04-15T21:00:00Z'
  },
  {
    id: 'seed-4',
    title: 'Baldur\'s Gate 3',
    description: 'A massive RPG with deep choices and combat.',
    cover_url: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1086940/header.jpg',
    steam_url: 'https://store.steampowered.com/app/1086940/Baldurs_Gate_3/',
    status: 'Playing',
    game_type: 'Singleplayer & Co-op',
    genres: ['RPG', 'Adventure', 'Fantasy'],
    release_year: 2023,
    notes: 'Could be a great co-op candidate later.',
    added_by: 'Friend',
    created_at: '2024-03-10T14:00:00Z',
    updated_at: '2024-03-10T14:00:00Z'
  },
  {
    id: 'seed-5',
    title: 'Resident Evil 2',
    description: 'A tense classic survival horror remake.',
    cover_url: 'https://cdn.cloudflare.steamstatic.com/steam/apps/883710/header.jpg',
    steam_url: 'https://store.steampowered.com/app/883710/Resident_Evil_2/',
    status: 'Played',
    game_type: 'Singleplayer',
    genres: ['Horror', 'Action', 'Survival'],
    release_year: 2019,
    notes: 'A perfect match for scary nights.',
    added_by: 'Anton',
    created_at: '2023-10-19T10:30:00Z',
    updated_at: '2024-02-09T16:20:00Z'
  },
  {
    id: 'seed-6',
    title: 'Resident Evil 4',
    description: 'A third-person action horror classic.',
    cover_url: 'https://cdn.cloudflare.steamstatic.com/steam/apps/2050650/header.jpg',
    steam_url: 'https://store.steampowered.com/app/2050650/Resident_Evil_4/',
    status: 'Want to play',
    game_type: 'Singleplayer',
    genres: ['Horror', 'Action', 'Shooter'],
    release_year: 2023,
    notes: 'Already on the wishlist for the next horror run.',
    added_by: 'Friend',
    created_at: '2024-02-15T09:05:00Z',
    updated_at: '2024-02-15T09:05:00Z'
  },
  {
    id: 'seed-7',
    title: 'Resident Evil Village',
    description: 'A stylish horror showcase with strong atmosphere.',
    cover_url: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1196590/header.jpg',
    steam_url: 'https://store.steampowered.com/app/1196590/Resident_Evil_Village/',
    status: 'Want to play',
    game_type: 'Singleplayer',
    genres: ['Horror', 'Action', 'Survival'],
    release_year: 2021,
    notes: 'Good for a tense evening session.',
    added_by: 'Anton',
    created_at: '2024-01-22T18:30:00Z',
    updated_at: '2024-01-22T18:30:00Z'
  },
  {
    id: 'seed-8',
    title: 'Alien: Isolation',
    description: 'A survival horror game of cat-and-mouse tension.',
    cover_url: 'https://cdn.cloudflare.steamstatic.com/steam/apps/214490/header.jpg',
    steam_url: 'https://store.steampowered.com/app/214490/Alien_Isolation/',
    status: 'Played',
    game_type: 'Singleplayer',
    genres: ['Horror', 'Survival', 'Action'],
    release_year: 2014,
    notes: 'One of the most stressful games in the library.',
    added_by: 'Friend',
    created_at: '2023-11-17T17:40:00Z',
    updated_at: '2024-01-31T14:00:00Z'
  },
  {
    id: 'seed-9',
    title: 'Dead by Daylight',
    description: 'A multiplayer horror chase with unpredictable matches.',
    cover_url: 'https://cdn.cloudflare.steamstatic.com/steam/apps/381210/header.jpg',
    steam_url: 'https://store.steampowered.com/app/381210/Dead_by_Daylight/',
    status: 'Playing',
    game_type: 'Multiplayer',
    genres: ['Horror', 'Survival', 'Action'],
    release_year: 2016,
    notes: 'Always fun with friends.',
    added_by: 'Anton',
    created_at: '2024-04-01T08:00:00Z',
    updated_at: '2024-04-30T07:00:00Z'
  },
  {
    id: 'seed-10',
    title: 'Phasmophobia',
    description: 'Investigate a haunted location with a team.',
    cover_url: 'https://cdn.cloudflare.steamstatic.com/steam/apps/739630/header.jpg',
    steam_url: 'https://store.steampowered.com/app/739630/Phasmophobia/',
    status: 'Want to play',
    game_type: 'Multiplayer',
    genres: ['Horror', 'Co-op', 'Survival'],
    release_year: 2020,
    notes: 'Excellent co-op horror option.',
    added_by: 'Friend',
    created_at: '2024-01-08T15:00:00Z',
    updated_at: '2024-01-08T15:00:00Z'
  },
  {
    id: 'seed-11',
    title: 'Lethal Company',
    description: 'A co-op scavenger run with a strong danger theme.',
    cover_url: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1966720/header.jpg',
    steam_url: 'https://store.steampowered.com/app/1966720/Lethal_Company/',
    status: 'Playing',
    game_type: 'Co-op',
    genres: ['Co-op', 'Survival', 'Horror'],
    release_year: 2023,
    notes: 'Very good for co-op weekends.',
    added_by: 'Anton',
    created_at: '2024-04-02T11:00:00Z',
    updated_at: '2024-04-26T12:00:00Z'
  },
  {
    id: 'seed-12',
    title: 'Deep Rock Galactic',
    description: 'A co-op mining run packed with action and danger.',
    cover_url: 'https://cdn.cloudflare.steamstatic.com/steam/apps/548430/header.jpg',
    steam_url: 'https://store.steampowered.com/app/548430/Deep_Rock_Galactic/',
    status: 'Want to play',
    game_type: 'Co-op',
    genres: ['Co-op', 'Action', 'Survival'],
    release_year: 2020,
    notes: 'A natural co-op pick for a weekend session.',
    added_by: 'Friend',
    created_at: '2024-02-20T16:45:00Z',
    updated_at: '2024-02-20T16:45:00Z'
  },
  {
    id: 'seed-13',
    title: 'Terraria',
    description: 'A sandbox exploration game with endless possibilities.',
    cover_url: 'https://cdn.cloudflare.steamstatic.com/steam/apps/105600/header.jpg',
    steam_url: 'https://store.steampowered.com/app/105600/Terraria/',
    status: 'Played',
    game_type: 'Singleplayer & Co-op',
    genres: ['Adventure', 'RPG', 'Survival'],
    release_year: 2011,
    notes: 'One of the most replayable games in the library.',
    added_by: 'Anton',
    created_at: '2023-08-11T09:00:00Z',
    updated_at: '2024-03-16T10:12:00Z'
  },
  {
    id: 'seed-14',
    title: 'Minecraft',
    description: 'Build, explore and survive in a blocky world.',
    cover_url: '',
    steam_url: 'https://store.steampowered.com/app/582010/Minecraft_Java_Edition/',
    status: 'Want to play',
    game_type: 'Singleplayer & Co-op',
    genres: ['Adventure', 'Simulation', 'Survival'],
    release_year: 2011,
    notes: 'A sandbox classic to revisit together.',
    added_by: 'Friend',
    created_at: '2024-03-27T07:35:00Z',
    updated_at: '2024-03-27T07:35:00Z'
  },
  {
    id: 'seed-15',
    title: 'Portal 2',
    description: 'A clever puzzle adventure full of unique mechanics.',
    cover_url: 'https://cdn.cloudflare.steamstatic.com/steam/apps/620/header.jpg',
    steam_url: 'https://store.steampowered.com/app/620/Portal_2/',
    status: 'Played',
    game_type: 'Singleplayer & Co-op',
    genres: ['Puzzle', 'Adventure', 'Co-op'],
    release_year: 2011,
    notes: 'An evergreen favorite for brainy co-op sessions.',
    added_by: 'Anton',
    created_at: '2023-12-04T13:10:00Z',
    updated_at: '2024-04-20T09:00:00Z'
  }
];

function setView(view) {
  appState.view = view;
  localStorage.setItem(appState.viewStorageKey, view);
  renderFilteredGames();
}

const statusClasses = {
  'Want to play': 'want-to-play',
  Playing: 'playing',
  Played: 'played',
  Abandoned: 'abandoned'
};

function safeNormalizeArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeGame(game) {
  const defaultGame = DEFAULT_GAMES.find((item) => item.title === game.title);
  const coverUrl = game.cover_url && !game.cover_url.includes('images.igdb.com')
    ? game.cover_url
    : defaultGame?.cover_url || '';
  const steamUrl = game.title === 'A Way Out'
    ? 'https://store.steampowered.com/app/1222700/A_Way_Out/'
    : game.title === 'Resident Evil 4'
      ? 'https://store.steampowered.com/app/2050650/Resident_Evil_4/'
      : game.steam_url || defaultGame?.steam_url || '';

  return {
    id: game.id || crypto.randomUUID(),
    title: game.title || 'Untitled game',
    description: game.description || '',
    cover_url: coverUrl,
    steam_url: steamUrl,
    status: game.status || 'Want to play',
    game_type: game.game_type || 'Singleplayer',
    genres: safeNormalizeArray(game.genres),
    release_year: game.release_year || null,
    notes: game.notes || '',
    collection: game.collection || 'My library',
    created_at: game.created_at || new Date().toISOString(),
    updated_at: game.updated_at || new Date().toISOString()
  };
}

function loadCollections() {
  const saved = localStorage.getItem(appState.collectionsStorageKey);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        appState.collections = Array.from(new Set(parsed.filter((name) => typeof name === 'string' && name.trim())));
      }
    } catch (error) {
      console.warn('Unable to parse saved lists', error);
    }
  }

  if (!appState.collections.length) appState.collections = ['My library'];
  appState.activeCollection = localStorage.getItem('game-library-active-list') || appState.collections[0];
  if (!appState.collections.includes(appState.activeCollection)) appState.activeCollection = appState.collections[0];
  localStorage.setItem(appState.collectionsStorageKey, JSON.stringify(appState.collections));
  renderCollectionOptions();
}

function renderCollectionOptions() {
  elements.collectionSelector.innerHTML = appState.collections
    .map((collection) => `<option value="${escapeAttribute(collection)}">${escapeHtml(collection)}</option>`)
    .join('');
  elements.collectionSelector.value = appState.activeCollection;
  elements.libraryTitle.textContent = appState.activeCollection;
  elements.deleteCollectionButton.disabled = appState.activeCollection === 'My library';
}

function createCollection() {
  const trimmedName = elements.newCollectionInput.value.trim();
  if (!trimmedName) {
    showToast('Enter a name for the new list.');
    elements.newCollectionInput.focus();
    return;
  }
  if (appState.collections.some((collection) => collection.toLowerCase() === trimmedName.toLowerCase())) {
    showToast('That list already exists.');
    return;
  }
  appState.collections.push(trimmedName);
  appState.activeCollection = trimmedName;
  localStorage.setItem(appState.collectionsStorageKey, JSON.stringify(appState.collections));
  localStorage.setItem('game-library-active-list', appState.activeCollection);
  renderCollectionOptions();
  renderFilteredGames();
  elements.newCollectionInput.value = '';
  elements.collectionCreate.classList.add('hidden');
  showToast(`Created "${trimmedName}".`);
}

function deleteCollection() {
  if (appState.activeCollection === 'My library') {
    showToast('My library cannot be deleted.');
    return;
  }

  const collectionToDelete = appState.activeCollection;
  if (!window.confirm(`Delete "${collectionToDelete}"? Its games will move to My library.`)) return;

  appState.games = appState.games.map((game) => (
    game.collection === collectionToDelete
      ? { ...game, collection: 'My library' }
      : game
  ));
  appState.collections = appState.collections.filter((collection) => collection !== collectionToDelete);
  appState.activeCollection = 'My library';
  localStorage.setItem(appState.localStorageKey, JSON.stringify(appState.games));
  localStorage.setItem(appState.collectionsStorageKey, JSON.stringify(appState.collections));
  localStorage.setItem('game-library-active-list', appState.activeCollection);
  renderCollectionOptions();
  renderAll();
  showToast(`Deleted "${collectionToDelete}". Games moved to My library.`);
}

function getLocalGames() {
  const saved = localStorage.getItem(appState.localStorageKey);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map(normalizeGame);
      }
    } catch (error) {
      console.warn('Unable to parse saved games', error);
    }
  }

  localStorage.setItem(appState.localStorageKey, JSON.stringify(DEFAULT_GAMES));
  return DEFAULT_GAMES.map(normalizeGame);
}

function loadGames() {
  elements.loadingState.classList.remove('hidden');
  elements.errorState.classList.add('hidden');

  try {
    appState.games = getLocalGames();
    renderAll();
  } catch (error) {
    console.error('Unable to load games', error);
    elements.errorState.classList.remove('hidden');
  } finally {
    elements.loadingState.classList.add('hidden');
  }
}

function renderAll() {
  renderStats();
  renderGenreOptions();
  renderFilteredGames();
  renderRecommendations();
  renderPlayTogether();
}

function renderStats() {
  const total = appState.games.length;
  const played = appState.games.filter((game) => game.status === 'Played').length;
  const wantToPlay = appState.games.filter((game) => game.status === 'Want to play').length;
  const coOp = appState.games.filter((game) => /(Co-op|Singleplayer & Co-op)/.test(game.game_type)).length;

  elements.statTotal.textContent = total;
  elements.statPlayed.textContent = played;
  elements.statWant.textContent = wantToPlay;
  elements.statCoop.textContent = coOp;
}

function renderGenreOptions() {
  const allGenres = Array.from(new Set(appState.games.flatMap((game) => game.genres))).sort((a, b) => a.localeCompare(b));
  const currentValue = elements.genreFilter.value;

  elements.genreFilter.innerHTML = '<option value="All">All genres</option>' + allGenres.map((genre) => `<option value="${escapeHtml(genre)}">${escapeHtml(genre)}</option>`).join('');

  if (allGenres.includes(currentValue)) {
    elements.genreFilter.value = currentValue;
  } else {
    elements.genreFilter.value = 'All';
    appState.filters.genre = 'All';
  }
}

function getFilteredGames() {
  const query = appState.filters.query.trim().toLowerCase();

  const filtered = appState.games.filter((game) => {
    const matchesCollection = game.collection === appState.activeCollection;
    const matchesStatus = appState.filters.status === 'All' || game.status === appState.filters.status;
    const matchesType = appState.filters.type === 'All' || game.game_type === appState.filters.type;
    const matchesGenre = appState.filters.genre === 'All' || game.genres.includes(appState.filters.genre);
    const haystack = [game.title, game.description, game.notes, ...(game.genres || [])].join(' ').toLowerCase();
    const matchesQuery = !query || haystack.includes(query);

    return matchesCollection && matchesStatus && matchesType && matchesGenre && matchesQuery;
  });

  filtered.sort((a, b) => {
    switch (appState.sort) {
      case 'az':
        return a.title.localeCompare(b.title);
      case 'za':
        return b.title.localeCompare(a.title);
      case 'release-year':
        return (b.release_year || 0) - (a.release_year || 0);
      case 'manual':
        return appState.games.indexOf(a) - appState.games.indexOf(b);
      case 'recently-updated':
        return new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
      case 'recently-added':
      default:
        return new Date(b.created_at || b.updated_at) - new Date(a.created_at || a.updated_at);
    }
  });

  return filtered;
}

function renderFilteredGames() {
  const filteredGames = getFilteredGames();
  elements.resultsCount.textContent = `${filteredGames.length} ${filteredGames.length === 1 ? 'game' : 'games'}`;

  if (!filteredGames.length) {
    elements.gamesGrid.innerHTML = '';
    elements.emptyState.classList.remove('hidden');
    return;
  }

  elements.emptyState.classList.add('hidden');

  elements.gamesGrid.classList.toggle('list-view', appState.view === 'list');
  elements.gridViewButton.classList.toggle('active', appState.view === 'grid');
  elements.listViewButton.classList.toggle('active', appState.view === 'list');

  elements.gamesGrid.innerHTML = filteredGames.map((game) => {
    const genres = (game.genres || []).slice(0, 3).map((genre) => `<span class="genre-tag">${escapeHtml(genre)}</span>`).join('');
    const coverMarkup = game.cover_url
      ? `<img src="${escapeAttribute(game.cover_url)}" alt="${escapeAttribute(game.title)} cover" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='grid';" /><div class="card-fallback" style="display:none;">${escapeHtml(getInitials(game.title))}</div>`
      : `<div class="card-fallback">${escapeHtml(getInitials(game.title))}</div>`;

    return `
      <article class="game-card" data-id="${game.id}" draggable="true">
        <div class="card-cover">
          ${coverMarkup}
        </div>
        <div class="card-body">
          <div class="game-heading">
            <h3>${escapeHtml(game.title)}</h3>
            <span class="status-badge ${statusClasses[game.status] || 'want-to-play'}">${escapeHtml(game.status)}</span>
          </div>

          <div class="game-meta">
            <span class="game-type">${escapeHtml(game.game_type)}</span>
            ${game.release_year ? `<span>· ${escapeHtml(String(game.release_year))}</span>` : ''}
          </div>

          <div class="genre-tags">${genres || '<span class="genre-tag">Unsorted</span>'}</div>

          <p>${escapeHtml(truncateText(game.description, 120)) || 'No description added yet.'}</p>

          <div class="game-meta">
            <span>${escapeHtml(game.collection || 'My library')}</span>
          </div>

          <div class="card-actions">
            <div class="link-group">
              ${game.steam_url ? `<a class="steam-link" href="${escapeAttribute(game.steam_url)}" target="_blank" rel="noreferrer noopener">Steam →</a>` : '<span class="steam-link" aria-hidden="true">No Steam link</span>'}
            </div>

            <div class="card-controls">
              <button class="text-btn" type="button" data-action="edit" data-id="${game.id}">Edit</button>
              <button class="text-btn danger" type="button" data-action="delete" data-id="${game.id}">Delete</button>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');

  bindCardActions();
  bindDragAndDrop();
}

function bindDragAndDrop() {
  let draggedId = null;

  elements.gamesGrid.querySelectorAll('.game-card').forEach((card) => {
    card.addEventListener('dragstart', (event) => {
      draggedId = card.dataset.id;
      card.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', draggedId);
    });

    card.addEventListener('dragend', () => {
      draggedId = null;
      card.classList.remove('dragging');
      elements.gamesGrid.querySelectorAll('.game-card').forEach((item) => item.classList.remove('drag-over'));
    });

    card.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (draggedId && draggedId !== card.dataset.id) {
        card.classList.add('drag-over');
      }
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over');
    });

    card.addEventListener('drop', (event) => {
      event.preventDefault();
      card.classList.remove('drag-over');
      moveGameBefore(draggedId || event.dataTransfer.getData('text/plain'), card.dataset.id);
    });
  });
}

function moveGameBefore(sourceId, targetId) {
  if (!sourceId || sourceId === targetId) return;

  const sourceIndex = appState.games.findIndex((game) => game.id === sourceId);
  const targetIndex = appState.games.findIndex((game) => game.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;

  const [movedGame] = appState.games.splice(sourceIndex, 1);
  const adjustedTargetIndex = appState.games.findIndex((game) => game.id === targetId);
  appState.games.splice(adjustedTargetIndex, 0, movedGame);
  appState.sort = 'manual';
  elements.sortSelect.value = 'manual';
  localStorage.setItem(appState.localStorageKey, JSON.stringify(appState.games));
  localStorage.setItem(appState.sortStorageKey, appState.sort);
  renderFilteredGames();
  showToast('Manual order saved.');
}

function renderRecommendations() {
  const unplayed = appState.games.filter((game) => game.status !== 'Played');
  const recommendations = unplayed
    .map((game) => {
      const similarityScore = appState.games.reduce((score, otherGame) => {
        if (otherGame.id === game.id || otherGame.status === 'Played') return score;
        const genreOverlap = (game.genres || []).filter((genre) => (otherGame.genres || []).includes(genre)).length;
        const typeMatch = otherGame.game_type === game.game_type ? 1 : 0;
        return score + genreOverlap * 3 + typeMatch;
      }, 0);

      return { ...game, similarityScore };
    })
    .filter((game) => game.similarityScore > 0)
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, 4);

  if (!recommendations.length) {
    elements.recommendationsList.innerHTML = '<div class="suggestion-item"><strong>No recommendations yet.</strong><small>Add more games to get ideas.</small></div>';
    return;
  }

  elements.recommendationsList.innerHTML = recommendations
    .map((game) => `
      <div class="suggestion-item">
        <strong>${escapeHtml(game.title)}</strong>
        <small>${escapeHtml(game.game_type)} · ${escapeHtml((game.genres || []).slice(0, 3).join(', ') || 'General')}</small>
      </div>
    `)
    .join('');
}

function renderPlayTogether() {
  const coOpGames = appState.games.filter((game) => {
    return (game.game_type === 'Co-op' || game.game_type === 'Multiplayer' || game.game_type === 'Singleplayer & Co-op') && game.status !== 'Played';
  }).slice(0, 4);

  if (!coOpGames.length) {
    elements.playTogetherList.innerHTML = '<div class="suggestion-item"><strong>No co-op picks found.</strong><small>Try adding more games to the library.</small></div>';
    return;
  }

  elements.playTogetherList.innerHTML = coOpGames
    .map((game) => `
      <div class="suggestion-item">
        <strong>${escapeHtml(game.title)}</strong>
        <small>${escapeHtml(game.status)} · ${escapeHtml(game.game_type)}</small>
      </div>
    `)
    .join('');
}

function applyTheme(theme) {
  const isDark = theme === 'dark';
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  elements.themeToggle.textContent = isDark ? '☀ Light' : '☾ Dark';
  elements.themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem(appState.themeStorageKey, nextTheme);
  applyTheme(nextTheme);
}

function bindCardActions() {
  document.querySelectorAll('[data-action="edit"]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.id;
      const game = appState.games.find((item) => item.id === id);
      if (!game) return;
      openGameModal(game);
    });
  });

  document.querySelectorAll('[data-action="delete"]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.id;
      const game = appState.games.find((item) => item.id === id);
      if (!game) return;

      const confirmed = window.confirm(`Are you sure you want to remove "${game.title}"?`);
      if (!confirmed) return;

      removeGame(id);
    });
  });
}

async function searchSteamGames() {
  const term = elements.steamSearchInput.value.trim();
  if (!term) {
    elements.steamSearchStatus.textContent = 'Enter a game title first.';
    return;
  }

  const steamSearchUrl = `https://store.steampowered.com/search/?term=${encodeURIComponent(term)}`;
  window.open(steamSearchUrl, '_blank', 'noopener,noreferrer');
  elements.steamSearchStatus.textContent = 'Steam search opened in a new tab. Copy the selected store URL into the form.';
}

function attachEventListeners() {
  elements.gridViewButton.addEventListener('click', () => setView('grid'));
  elements.listViewButton.addEventListener('click', () => setView('list'));
  elements.collectionSelector.addEventListener('change', (event) => {
    appState.activeCollection = event.target.value;
    localStorage.setItem('game-library-active-list', appState.activeCollection);
    renderCollectionOptions();
    renderFilteredGames();
  });
  elements.newCollectionButton.addEventListener('click', () => {
    elements.collectionCreate.classList.toggle('hidden');
    if (!elements.collectionCreate.classList.contains('hidden')) elements.newCollectionInput.focus();
  });
  elements.deleteCollectionButton.addEventListener('click', deleteCollection);
  elements.saveCollectionButton.addEventListener('click', createCollection);
  elements.newCollectionInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') createCollection();
    if (event.key === 'Escape') elements.collectionCreate.classList.add('hidden');
  });

  elements.searchInput.addEventListener('input', (event) => {
    appState.filters.query = event.target.value;
    renderFilteredGames();
  });

  elements.genreFilter.addEventListener('change', (event) => {
    appState.filters.genre = event.target.value;
    renderFilteredGames();
  });

  elements.sortSelect.addEventListener('change', (event) => {
    appState.sort = event.target.value;
    localStorage.setItem(appState.sortStorageKey, appState.sort);
    renderFilteredGames();
  });

  elements.addGameButton.addEventListener('click', () => {
    openGameModal();
  });

  elements.steamSearchButton.addEventListener('click', searchSteamGames);
  elements.steamSearchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      searchSteamGames();
    }
  });

  elements.refreshButton.addEventListener('click', () => {
    loadGames();
    showToast('Library refreshed.');
  });

  elements.themeToggle.addEventListener('click', toggleTheme);

  elements.closeModalButton.addEventListener('click', closeGameModal);
  elements.cancelGameButton.addEventListener('click', closeGameModal);

  elements.gameModal.addEventListener('click', (event) => {
    if (event.target.dataset.close === 'true') {
      closeGameModal();
    }
  });

  elements.gameForm.addEventListener('submit', handleGameSubmit);

  document.querySelectorAll('[data-status]').forEach((button) => {
    button.addEventListener('click', () => {
      appState.filters.status = button.dataset.status;
      updateChipSelection(button, 'data-status');
      renderFilteredGames();
    });
  });

  document.querySelectorAll('[data-type]').forEach((button) => {
    button.addEventListener('click', () => {
      appState.filters.type = button.dataset.type;
      updateChipSelection(button, 'data-type');
      renderFilteredGames();
    });
  });
}

function updateChipSelection(activeButton, attribute) {
  const buttons = document.querySelectorAll(`[${attribute}]`);
  buttons.forEach((button) => {
    button.classList.toggle('active', button === activeButton);
  });
}

function openGameModal(game = null) {
  elements.gameModal.classList.remove('hidden');
  elements.gameModal.setAttribute('aria-hidden', 'false');

  if (game) {
    appState.editingGameId = game.id;
    elements.modalTitle.textContent = 'Edit Game';
    elements.gameId.value = game.id;
    elements.gameTitle.value = game.title || '';
    elements.gameDescription.value = game.description || '';
    elements.gameCoverUrl.value = game.cover_url || '';
    elements.gameSteamUrl.value = game.steam_url || '';
    elements.gameStatus.value = game.status || 'Want to play';
    elements.gameType.value = game.game_type || 'Singleplayer';
    elements.gameReleaseYear.value = game.release_year || '';
    elements.gameGenres.value = (game.genres || []).join(', ');
    elements.gameNotes.value = game.notes || '';
  } else {
    appState.editingGameId = null;
    elements.modalTitle.textContent = 'Add Game';
    elements.gameForm.reset();
    elements.gameStatus.value = 'Want to play';
    elements.gameType.value = 'Singleplayer';
    elements.gameId.value = '';
    elements.steamSearchInput.value = '';
    elements.steamSearchStatus.textContent = '';
    elements.steamSearchResults.innerHTML = '';
  }
}

function closeGameModal() {
  elements.gameModal.classList.add('hidden');
  elements.gameModal.setAttribute('aria-hidden', 'true');
  elements.gameForm.reset();
  elements.steamSearchStatus.textContent = '';
  elements.steamSearchResults.innerHTML = '';
  appState.editingGameId = null;
}

function handleGameSubmit(event) {
  event.preventDefault();

  const title = elements.gameTitle.value.trim();
  if (!title) {
    showToast('A game title is required.');
    return;
  }

  const wasEditing = Boolean(appState.editingGameId);
  const nextGame = normalizeGame({
    id: appState.editingGameId || crypto.randomUUID(),
    title,
    description: elements.gameDescription.value.trim(),
    cover_url: elements.gameCoverUrl.value.trim(),
    steam_url: elements.gameSteamUrl.value.trim(),
    status: elements.gameStatus.value,
    game_type: elements.gameType.value,
    genres: elements.gameGenres.value,
    release_year: elements.gameReleaseYear.value ? Number(elements.gameReleaseYear.value) : null,
    notes: elements.gameNotes.value.trim(),
    collection: appState.activeCollection,
    created_at: appState.editingGameId ? undefined : new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  try {
    const existingIndex = appState.games.findIndex((game) => game.id === nextGame.id);
    if (existingIndex >= 0) {
      appState.games[existingIndex] = nextGame;
    } else {
      appState.games.unshift(nextGame);
    }
    localStorage.setItem(appState.localStorageKey, JSON.stringify(appState.games));

    closeGameModal();
    renderAll();
    showToast(wasEditing ? 'Game updated.' : 'Game added.');
  } catch (error) {
    console.error('Failed to save game', error);
    showToast('Could not save the game. Please try again.');
  }
}

function removeGame(id) {
  try {
    appState.games = appState.games.filter((game) => game.id !== id);
    localStorage.setItem(appState.localStorageKey, JSON.stringify(appState.games));

    renderAll();
    showToast('Game removed.');
  } catch (error) {
    console.error('Failed to delete game', error);
    showToast('Could not delete the game. Please try again.');
  }
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('visible');
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => {
    elements.toast.classList.remove('visible');
  }, 2200);
}

function getInitials(title) {
  return title
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || 'G';
}

function truncateText(text, limit) {
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit - 1).trim()}…` : text;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function initialize() {
  loadCollections();
  applyTheme(localStorage.getItem(appState.themeStorageKey) || 'light');
  appState.view = localStorage.getItem(appState.viewStorageKey) || 'grid';
  appState.sort = localStorage.getItem(appState.sortStorageKey) || 'recently-added';
  elements.sortSelect.value = appState.sort;
  attachEventListeners();
  loadGames();
}

initialize();
