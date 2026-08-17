import { describe, expect, it } from 'vitest';

import {
  initialDrawPhase,
  transitionDrawPhase,
  type DrawEvent,
  type DrawPhase,
} from '../../src/draw/draw-machine';

function transition(phase: DrawPhase, event: DrawEvent): DrawPhase {
  return transitionDrawPhase(phase, event);
}

describe('draw phase transitions', () => {
  it('moves through the complete successful draw sequence', () => {
    const ready = initialDrawPhase();
    const carousel = transition(ready, { type: 'START' });
    const holding = transition(carousel, { type: 'PINCH_STABLE' });
    const placed = transition(holding, { type: 'RELEASE_IN_ZONE' });
    const revealing = transition(placed, { type: 'FIST_DWELL_COMPLETE' });
    const reading = transition(revealing, { type: 'FLIP_COMPLETE' });
    const archiving = transition(reading, { type: 'OPEN_DWELL_COMPLETE' });
    const nextCard = transition(archiving, {
      type: 'ARCHIVE_COMPLETE',
      isFinalCard: false,
    });

    expect([
      ready.type,
      carousel.type,
      holding.type,
      placed.type,
      revealing.type,
      reading.type,
      archiving.type,
      nextCard.type,
    ]).toEqual([
      'READY',
      'CAROUSEL',
      'HOLDING',
      'PLACED',
      'REVEALING',
      'READING',
      'ARCHIVING',
      'CAROUSEL',
    ]);
  });

  it('returns a held card to the carousel when released outside the reveal zone', () => {
    const holding = transition(
      transition(initialDrawPhase(), { type: 'START' }),
      { type: 'PINCH_STABLE' },
    );

    expect(transition(holding, { type: 'RELEASE_OUTSIDE' })).toEqual({
      type: 'CAROUSEL',
    });
  });

  it('completes when the final archived card leaves the deck', () => {
    expect(
      transition({ type: 'ARCHIVING' }, { type: 'ARCHIVE_COMPLETE', isFinalCard: true }),
    ).toEqual({ type: 'COMPLETE' });
  });

  it.each(['REVEALING', 'ARCHIVING'] as const)(
    'returns %s to the carousel when the current draw fails',
    (type) => {
      expect(
        transition({ type }, { type: 'DRAW_FAILED' }),
      ).toEqual({ type: 'CAROUSEL' });
    },
  );

  it('ignores invalid events by returning the same phase object', () => {
    const ready = initialDrawPhase();

    expect(transition(ready, { type: 'PINCH_STABLE' })).toBe(ready);
  });

  it('ignores repeated animation completion events', () => {
    const revealing = transition(
      transition(
        transition(
          transition(initialDrawPhase(), { type: 'START' }),
          { type: 'PINCH_STABLE' },
        ),
        { type: 'RELEASE_IN_ZONE' },
      ),
      { type: 'FIST_DWELL_COMPLETE' },
    );
    const reading = transition(revealing, { type: 'FLIP_COMPLETE' });
    const repeated = transition(reading, { type: 'FLIP_COMPLETE' });

    expect(repeated).toBe(reading);
  });
});
