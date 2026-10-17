import test from 'node:test';
import assert from 'node:assert/strict';
import sharedLibrary from '../shared-library.js';

const { prepareSharedLibraryReplacement } = sharedLibrary;

const existingGame = {
  id: 'existing-id',
  title: 'Existing Game',
  description: 'Updated description',
  genre: 'Puzzle',
  tags: 'shared',
  players: '2',
  steamUrl: 'https://store.steampowered.com/app/100/Existing_Game/',
  trailerUrl: '',
  coverUrl: 'https://example.test/cover.jpg',
  notes: 'Updated shared note',
  status: 'played',
  priority: true,
  steamCategories: ['Co-op']
};

const newGame = {
  id: 'new-id',
  title: 'New Game',
  description: 'The new entry description',
  genre: 'Adventure',
  tags: 'new, co-op',
  players: '4',
  steamUrl: 'https://store.steampowered.com/app/200/New_Game/',
  trailerUrl: 'https://example.test/trailer.mp4',
  coverUrl: 'https://example.test/new-cover.jpg',
  notes: 'New entry notes',
  status: 'to-play',
  priority: false,
  steamCategories: ['Multi-player', 'Co-op']
};

const snapshot = {
  schemaVersion: 1,
  exportedAt: '2026-10-10T22:01:44.227Z',
  games: [existingGame, newGame]
};

test('shared replacement uses the snapshot as the complete canonical library', () => {
  const localGames = [{ ...existingGame, description: 'Local-only edit' }, { id: 'local-only', title: 'Local Only' }];

  const replacement = prepareSharedLibraryReplacement(snapshot);

  assert.deepEqual(replacement, snapshot.games);
  assert.equal(replacement.some(game => game.id === 'local-only'), false);
  assert.equal(replacement.find(game => game.id === existingGame.id).description, existingGame.description);
});

test('applying the same shared snapshot repeatedly never duplicates games', () => {
  const firstUpdate = prepareSharedLibraryReplacement(snapshot);
  const secondUpdate = prepareSharedLibraryReplacement(snapshot);
  const thirdUpdate = prepareSharedLibraryReplacement({ ...snapshot, games: secondUpdate });

  assert.deepEqual(secondUpdate, firstUpdate);
  assert.deepEqual(thirdUpdate, firstUpdate);
  assert.equal(thirdUpdate.filter(game => game.id === newGame.id).length, 1);
});

test('new shared games retain all published details', () => {
  const replacement = prepareSharedLibraryReplacement(snapshot);

  assert.deepEqual(replacement.find(game => game.id === newGame.id), newGame);
});

test('rejects an unsupported or malformed shared export', () => {
  assert.throws(() => prepareSharedLibraryReplacement({ ...snapshot, schemaVersion: 2 }), /unsupported shared library format/i);
  assert.throws(() => prepareSharedLibraryReplacement({ schemaVersion: 1, games: {} }), /does not contain a game list/i);
});

test('legacy entries without optional fields are normalized into safe empty strings', () => {
  const legacySnapshot = {
    schemaVersion: 1,
    exportedAt: '2026-10-10T22:01:44.227Z',
    games: [{
      id: 'legacy-id',
      title: 'Legacy Game',
      status: 'to-play',
      priority: false,
      steamCategories: ['Co-op']
    }]
  };

  const replacement = prepareSharedLibraryReplacement(legacySnapshot);

  assert.deepEqual(replacement[0], {
    id: 'legacy-id',
    title: 'Legacy Game',
    description: '',
    genre: '',
    tags: '',
    players: '',
    steamUrl: '',
    trailerUrl: '',
    coverUrl: '',
    notes: '',
    status: 'to-play',
    priority: false,
    steamCategories: ['Co-op']
  });
});

test('rejects duplicate game IDs, normalized titles, and Steam app IDs', () => {
  assert.throws(() => prepareSharedLibraryReplacement({
    ...snapshot,
    games: [existingGame, { ...newGame, id: existingGame.id }]
  }), /duplicate games/i);
  assert.throws(() => prepareSharedLibraryReplacement({
    ...snapshot,
    games: [existingGame, { ...newGame, title: ' existing   game ' }]
  }), /duplicate games/i);
  assert.throws(() => prepareSharedLibraryReplacement({
    ...snapshot,
    games: [
      { ...existingGame, steamUrl: 'https://store.steampowered.com/app/100/One/' },
      { ...newGame, steamUrl: 'https://store.steampowered.com/app/100/Two/' }
    ]
  }), /duplicate Steam app/i);
});
const {
  buildSnapshot,
  serializeSnapshot,
  summarizeChanges,
  isNewerSnapshot,
  encodeBase64Utf8
} = sharedLibrary;

test('summarizes added, changed, removed and unchanged games by id', () => {
  const removedGame = { ...newGame, id: 'removed-id', title: 'Removed Game', steamUrl: '' };
  const current = [existingGame, removedGame];
  const next = [{ ...existingGame }, { ...newGame }];
  assert.deepEqual(summarizeChanges(current, next), { added: ['New Game'], changed: [], removed: ['Removed Game'], unchanged: 1 });

  const edited = [{ ...existingGame, notes: 'Edited' }];
  assert.deepEqual(summarizeChanges([existingGame], edited), { added: [], changed: ['Existing Game'], removed: [], unchanged: 0 });
});

test('a built snapshot round-trips through the shared library validator', () => {
  const built = buildSnapshot([existingGame, newGame], '2026-10-17T10:00:00Z');
  assert.equal(built.exportedAt, '2026-10-17T10:00:00.000Z');
  const parsed = JSON.parse(serializeSnapshot(built));
  assert.deepEqual(prepareSharedLibraryReplacement(parsed), [existingGame, newGame]);
  assert.ok(serializeSnapshot(built).endsWith('}\n'));
});

test('detects whether a shared snapshot is newer than the known version', () => {
  assert.equal(isNewerSnapshot('2026-10-17T10:00:00Z', undefined), true);
  assert.equal(isNewerSnapshot('2026-10-17T10:00:00Z', '2026-10-16T10:00:00Z'), true);
  assert.equal(isNewerSnapshot('2026-10-17T10:00:00Z', '2026-10-17T10:00:00.000Z'), false);
  assert.equal(isNewerSnapshot('2026-10-15T10:00:00Z', '2026-10-17T10:00:00Z'), false);
  assert.equal(isNewerSnapshot('not a date', undefined), false);
});

test('base64 encoding preserves non-ASCII titles for the GitHub API', () => {
  const text = '違う冬のぼくら (Bokura) – Lövgren';
  assert.equal(Buffer.from(encodeBase64Utf8(text), 'base64').toString('utf8'), text);
  const large = 'å'.repeat(200000);
  assert.equal(Buffer.from(encodeBase64Utf8(large), 'base64').toString('utf8'), large);
});

test('the published shared-library.json is a valid snapshot', async () => {
  const { readFile } = await import('node:fs/promises');
  const published = JSON.parse(await readFile(new URL('../shared-library.json', import.meta.url), 'utf8'));
  const games = prepareSharedLibraryReplacement(published);
  assert.ok(games.length > 0);
  assert.ok(!Number.isNaN(Date.parse(published.exportedAt)));
});
