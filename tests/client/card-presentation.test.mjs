import test from 'node:test';
import assert from 'node:assert/strict';
import { depthForApparentScale } from '../../src/client/card-presentation.js';

test('places a held card only twelve percent larger than the deck', () => {
  const depth = depthForApparentScale(12, 1.12);
  assert.ok(Math.abs(depth - 1.2857142857) < 1e-9);
});

test('rejects camera distances and scale factors that cannot produce a stable depth', () => {
  assert.throws(() => depthForApparentScale(0, 1.12), /camera distance/i);
  assert.throws(() => depthForApparentScale(12, 1), /greater than 1/i);
});
