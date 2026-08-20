import test from 'node:test';
import assert from 'node:assert/strict';
import { createOnboardingController } from '../../src/client/onboarding.js';

const storage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, value); },
  };
};

test('first visit starts at welcome and mouse path advances only on ordered actions', () => {
  const controller = createOnboardingController({ storage: storage() });
  assert.deepEqual(controller.getState(), {
    phase: 'welcome', mode: null, topic: 'general', active: true, firstVisit: true, completed: false,
  });

  controller.selectMode('mouse');
  controller.selectTopic('love');
  controller.start();
  assert.equal(controller.getState().phase, 'shuffle');
  controller.notify('deck-targeted');
  assert.equal(controller.getState().phase, 'shuffle');
  controller.notify('shuffle-complete');
  assert.equal(controller.getState().phase, 'target-deck');
  controller.notify('card-grabbed');
  assert.equal(controller.getState().phase, 'target-deck');
  controller.notify('deck-targeted');
  assert.equal(controller.getState().phase, 'grab');
  controller.notify('card-grabbed');
  controller.notify('card-grabbed');
  assert.equal(controller.getState().phase, 'reveal');
  controller.notify('card-revealed');
  assert.equal(controller.getState().phase, 'result-explainer');
});

test('gesture path waits for a visible hand before targeting the deck', () => {
  const controller = createOnboardingController({ storage: storage() });
  controller.selectMode('gesture');
  controller.selectTopic('career');
  controller.start();
  assert.equal(controller.getState().phase, 'shuffle');
  controller.notify('hand-visible');
  assert.equal(controller.getState().phase, 'shuffle');
  controller.notify('shuffle-complete');
  assert.equal(controller.getState().phase, 'locate-input');
  controller.notify('deck-targeted');
  assert.equal(controller.getState().phase, 'locate-input');
  controller.notify('hand-visible');
  assert.equal(controller.getState().phase, 'target-deck');
});

test('completion persists while replay keeps the completed marker', () => {
  const memory = storage();
  const controller = createOnboardingController({ storage: memory, completedKey: 'guide' });
  controller.complete();
  assert.equal(memory.getItem('guide'), '1');
  assert.deepEqual(controller.getState(), {
    phase: 'complete', mode: null, topic: 'general', active: false, firstVisit: false, completed: true,
  });

  const returning = createOnboardingController({ storage: memory, completedKey: 'guide' });
  returning.replay('mouse');
  assert.equal(returning.getState().phase, 'shuffle');
  returning.notify('shuffle-complete');
  assert.equal(returning.getState().phase, 'target-deck');
  assert.equal(returning.getState().completed, true);
  assert.equal(memory.getItem('guide'), '1');
});

test('skip closes the guide without marking a first visit complete', () => {
  const memory = storage();
  const controller = createOnboardingController({ storage: memory, completedKey: 'guide' });
  controller.skip();
  assert.equal(controller.getState().phase, 'complete');
  assert.equal(controller.getState().active, false);
  assert.equal(controller.getState().completed, false);
  assert.equal(memory.getItem('guide'), null);
});

test('storage failures fall back to safe in-memory state', () => {
  const broken = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  const controller = createOnboardingController({ storage: broken });
  assert.equal(controller.getState().firstVisit, true);
  assert.doesNotThrow(() => controller.complete());
  assert.equal(controller.getState().completed, true);
});

test('invalid mode and topic values are rejected', () => {
  const controller = createOnboardingController({ storage: storage() });
  assert.throws(() => controller.selectMode('touch'), /Unknown onboarding mode/);
  assert.throws(() => controller.selectTopic('future'), /Unknown onboarding topic/);
});
