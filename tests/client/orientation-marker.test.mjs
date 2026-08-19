import test from 'node:test';
import assert from 'node:assert/strict';
import { updateOrientationMarker } from '../../src/client/orientation-marker.js';

test('reversed draws show the compact bilingual orientation marker', () => {
  const marker = { hidden: true, textContent: '' };

  updateOrientationMarker(marker, true);

  assert.equal(marker.hidden, false);
  assert.equal(marker.textContent, '↻ 逆位 · REVERSED');
});

test('upright draws hide and clear the orientation marker', () => {
  const marker = { hidden: false, textContent: '↻ 逆位 · REVERSED' };

  updateOrientationMarker(marker, false);

  assert.equal(marker.hidden, true);
  assert.equal(marker.textContent, '');
});
