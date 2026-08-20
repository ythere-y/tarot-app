import test from 'node:test';
import assert from 'node:assert/strict';
import { createShuffleSequence } from '../../src/client/shuffle-sequence.js';

const vector = (x = 0, y = 0, z = 0) => ({ x, y, z });
const fakeCard = (_, index) => ({
  position: vector(0, -2, index * 0.006),
  rotation: vector(),
  scale: vector(1, 1, 1),
});
const cards = (count = 78) => Array.from({ length: count }, fakeCard);

test('normal shuffle follows every ritual phase and completes once', () => {
  const deck = cards();
  const sequence = createShuffleSequence();
  let completed = 0;
  sequence.onComplete(() => { completed += 1; });
  sequence.start(deck);

  const phases = [sequence.getState().phase];
  for (let i = 0; i < 100; i += 1) {
    sequence.update(0.05);
    const phase = sequence.getState().phase;
    if (phase !== phases.at(-1)) phases.push(phase);
  }

  assert.deepEqual(phases, ['converge', 'sphere', 'orbit', 'cut', 'merge', 'ready']);
  assert.equal(completed, 1);
  sequence.update(5);
  assert.equal(completed, 1);
  assert.equal(sequence.getState().ready, true);
});

test('sphere phase gives 78 finite distributed positions at the configured radius', () => {
  const deck = cards();
  const sequence = createShuffleSequence({ radius: 3.4 });
  sequence.start(deck);
  sequence.update(0.45);
  sequence.update(0.8);

  const radii = deck.map(card => Math.hypot(card.position.x, card.position.y, card.position.z));
  assert.equal(deck.length, 78);
  assert.ok(radii.every(Number.isFinite));
  assert.ok(radii.every(radius => Math.abs(radius - 3.4) < 0.001));
  assert.ok(new Set(deck.map(card => `${card.position.x.toFixed(3)}:${card.position.y.toFixed(3)}:${card.position.z.toFixed(3)}`)).size > 70);
  assert.ok(deck.every(card => Math.abs(card.scale.x - 0.24) < 0.001));
});

test('orbit moves the spherical deck through two turns before cutting into opposite piles', () => {
  const deck = cards();
  const sequence = createShuffleSequence();
  sequence.start(deck);
  sequence.update(0.45);
  sequence.update(0.8);
  const sphereStart = { ...deck[12].position };
  sequence.update(0.7);
  assert.notDeepEqual(deck[12].position, sphereStart);
  assert.ok(sequence.getState().orbitAngle > Math.PI);
  sequence.update(0.7);
  sequence.update(0.55);
  assert.ok(deck.filter((_, index) => index % 2 === 0).every(card => card.position.x < 0));
  assert.ok(deck.filter((_, index) => index % 2 === 1).every(card => card.position.x > 0));
});

test('merge interleaves every card into the central ready deck', () => {
  const deck = cards();
  const sequence = createShuffleSequence({ deckY: -2 });
  sequence.start(deck);
  sequence.update(0.45);
  sequence.update(0.8);
  sequence.update(1.4);
  sequence.update(0.55);
  sequence.update(0.9);

  assert.equal(sequence.getState().phase, 'ready');
  assert.ok(deck.every(card => Math.abs(card.position.x) < 0.001 && Math.abs(card.position.y + 2) < 0.001));
  assert.ok(deck.every(card => card.scale.x === 1 && card.rotation.y === 0));
  assert.equal(new Set(deck.map(card => card.position.z.toFixed(4))).size, 78);
});

test('skip and reset restore cards safely without duplicate completion', () => {
  const deck = cards();
  const sequence = createShuffleSequence();
  let completed = 0;
  sequence.onComplete(() => { completed += 1; });
  sequence.start(deck);
  sequence.update(0.6);
  sequence.skip();
  sequence.skip();
  assert.equal(sequence.getState().phase, 'ready');
  assert.equal(completed, 1);
  assert.ok(deck.every(card => card.position.x === 0 && card.position.y === -2));

  sequence.reset(deck);
  assert.deepEqual(sequence.getState(), { phase: 'idle', active: false, ready: false, progress: 0, orbitAngle: 0 });
});

test('reduced motion uses only converge and merge before ready', () => {
  const deck = cards();
  const sequence = createShuffleSequence({ reducedMotion: true });
  sequence.start(deck);
  const phases = [sequence.getState().phase];
  for (let i = 0; i < 20; i += 1) {
    sequence.update(0.05);
    if (sequence.getState().phase !== phases.at(-1)) phases.push(sequence.getState().phase);
  }
  assert.deepEqual(phases, ['converge', 'merge', 'ready']);
  assert.equal(sequence.getState().ready, true);
});

