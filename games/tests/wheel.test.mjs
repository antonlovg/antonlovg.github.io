import test from 'node:test';
import assert from 'node:assert/strict';
import wheel from '../wheel.js';

const { targetRotation, segmentAt, sample, MAX_SEGMENTS, COLORS } = wheel;

test('the wheel always stops on the chosen game', () => {
  for (let count = 1; count <= 12; count++) {
    for (let winner = 0; winner < count; winner++) {
      for (const jitter of [-1, -0.5, 0, 0.5, 1]) {
        const rotation = targetRotation(count, winner, { current: 1234.5, jitter });
        assert.equal(segmentAt(count, rotation), winner, `count ${count}, winner ${winner}, jitter ${jitter}`);
      }
    }
  }
});

test('thousands of random spins land on the winner and always move forward', () => {
  let current = 0;
  for (let i = 0; i < 5000; i++) {
    const count = 2 + Math.floor(Math.random() * 11);
    const winner = Math.floor(Math.random() * count);
    const next = targetRotation(count, winner, { current, jitter: Math.random() * 2 - 1 });
    assert.ok(next > current + 4 * 360, 'spins at least four full turns');
    assert.equal(segmentAt(count, next), winner);
    current = next;
  }
});

test('the sample keeps the winner and caps the segment count', () => {
  const items = Array.from({ length: 40 }, (_, index) => `game ${index}`);
  for (let i = 0; i < 200; i++) {
    const winnerIndex = Math.floor(Math.random() * items.length);
    const result = sample(items, winnerIndex);
    assert.equal(result.items.length, MAX_SEGMENTS);
    assert.equal(result.items[result.winner], items[winnerIndex]);
    assert.equal(new Set(result.items).size, result.items.length, 'no duplicates');
  }
  const small = sample(['a', 'b', 'c'], 2);
  assert.equal(small.items.length, 3);
  assert.equal(small.items[small.winner], 'c');
});

test('every segment colour has 4.5:1 contrast with white labels', () => {
  const luminance = hex => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (const color of COLORS) {
    const ratio = 1.05 / (luminance(color) + 0.05);
    assert.ok(ratio >= 4.5, `${color} contrast ${ratio.toFixed(2)}`);
  }
});
