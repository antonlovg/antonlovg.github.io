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