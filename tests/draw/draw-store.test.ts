import { describe, expect, it } from 'vitest';

import { TAROT_CARDS } from '../../src/tarot/cards';
import { createDrawStore } from '../../src/draw/draw-store';

function confirmCurrentCard(
  store: ReturnType<typeof createDrawStore>,
): void {
  store.dispatch({ type: 'START' });
  store.dispatch({ type: 'PINCH_STABLE' });
  store.dispatch({ type: 'RELEASE_IN_ZONE' });
  store.dispatch({ type: 'FIST_DWELL_COMPLETE' });
}

function archiveCurrentCard(
  store: ReturnType<typeof createDrawStore>,
): void {
  store.dispatch({ type: 'FLIP_COMPLETE' });
  store.dispatch({ type: 'OPEN_DWELL_COMPLETE' });
  store.dispatch({ type: 'ARCHIVE_COMPLETE' });
}

describe('draw store', () => {
  it('locks a deterministically selected card and orientation on confirmation', () => {
    const store = createDrawStore({
      cards: TAROT_CARDS,
      random: () => 0,
    });

    confirmCurrentCard(store);
    const locked = store.getSnapshot();

    expect(locked.phase).toEqual({ type: 'REVEALING' });
    expect(locked.result).toMatchObject({
      cardId: TAROT_CARDS[0]!.id,
      orientation: 'upright',
    });
    expect(locked.remainingCount).toBe(78);

    store.dispatch({ type: 'FIST_DWELL_COMPLETE' });
    expect(store.getSnapshot().result).toEqual(locked.result);
  });

  it('does not remove or archive a confirmed card until archive animation completes', () => {
    const store = createDrawStore({ cards: TAROT_CARDS, random: () => 0 });

    confirmCurrentCard(store);
    store.dispatch({ type: 'FLIP_COMPLETE' });
    store.dispatch({ type: 'OPEN_DWELL_COMPLETE' });

    expect(store.getSnapshot()).toMatchObject({
      phase: { type: 'ARCHIVING' },
      remainingCount: 78,
      history: [],
    });

    archiveCurrentCard(store);

    expect(store.getSnapshot()).toMatchObject({
      phase: { type: 'CAROUSEL' },
      remainingCount: 77,
      result: null,
      history: [
        expect.objectContaining({
          cardId: TAROT_CARDS[0]!.id,
          orientation: 'upright',
          drawnAt: expect.any(Number),
        }),
      ],
    });
  });

  it('draws all 78 cards without replacement and then completes', () => {
    const store = createDrawStore({ cards: TAROT_CARDS, random: () => 0 });

    for (let index = 0; index < 78; index += 1) {
      confirmCurrentCard(store);
      archiveCurrentCard(store);
    }

    const snapshot = store.getSnapshot();
    expect(snapshot.phase).toEqual({ type: 'COMPLETE' });
    expect(snapshot.remainingCount).toBe(0);
    expect(snapshot.history).toHaveLength(78);
    expect(new Set(snapshot.history.map((item) => item.cardId)).size).toBe(78);
  });

  it('rolls back only the current failed draw and preserves archived history', () => {
    const store = createDrawStore({ cards: TAROT_CARDS, random: () => 0 });

    confirmCurrentCard(store);
    archiveCurrentCard(store);
    confirmCurrentCard(store);
    store.dispatch({ type: 'DRAW_FAILED' });

    expect(store.getSnapshot()).toMatchObject({
      phase: { type: 'CAROUSEL' },
      remainingCount: 77,
      result: null,
      history: [{ cardId: TAROT_CARDS[0]!.id }],
    });
  });

  it('notifies subscribers only for real state changes and reset restores the deck', () => {
    const store = createDrawStore({ cards: TAROT_CARDS, random: () => 0 });
    const received: number[] = [];
    const unsubscribe = store.subscribe((snapshot) => {
      received.push(snapshot.remainingCount);
    });

    store.dispatch({ type: 'PINCH_STABLE' });
    confirmCurrentCard(store);
    archiveCurrentCard(store);
    store.reset();
    unsubscribe();

    expect(received).toEqual([78, 78, 78, 78, 78, 78, 77, 78]);
    expect(store.getSnapshot()).toMatchObject({
      phase: { type: 'READY' },
      remainingCount: 78,
      result: null,
      history: [],
    });
  });
});
