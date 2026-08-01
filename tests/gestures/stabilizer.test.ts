import { describe, expect, it } from 'vitest';
import {
  createGestureStabilizer,
  type GestureStabilizer,
} from '../../src/gestures/stabilizer';

const config = {
  stableFrames: 4,
  fistDwellMs: 500,
  openArchiveDwellMs: 300,
  lossGraceMs: 250,
} as const;

function createStabilizer(): GestureStabilizer {
  return createGestureStabilizer(config);
}

describe('createGestureStabilizer', () => {
  it('confirms a pinch only after the configured consecutive frames', () => {
    const stabilizer = createStabilizer();

    expect(stabilizer.update('PINCH', 0).event).toBeNull();
    expect(stabilizer.update('PINCH', 20).event).toBeNull();
    expect(stabilizer.update('PINCH', 40).event).toBeNull();
    expect(stabilizer.update('PINCH', 60)).toEqual({
      gesture: 'PINCH',
      event: 'PINCH_STABLE',
    });
    expect(stabilizer.update('PINCH', 80).event).toBeNull();
  });

  it('resets consecutive-frame confirmation when another gesture intervenes', () => {
    const stabilizer = createStabilizer();
    stabilizer.update('PINCH', 0);
    stabilizer.update('PINCH', 20);
    stabilizer.update('OPEN', 40);
    stabilizer.update('PINCH', 60);
    stabilizer.update('PINCH', 80);
    stabilizer.update('PINCH', 100);

    expect(stabilizer.update('PINCH', 120).event).toBe('PINCH_STABLE');
  });

  it('keeps the confirmed gesture until the replacement is stable', () => {
    const stabilizer = createStabilizer();
    stabilizer.update('PINCH', 0);
    stabilizer.update('PINCH', 20);
    stabilizer.update('PINCH', 40);
    stabilizer.update('PINCH', 60);

    expect(stabilizer.update('OPEN', 80)).toEqual({
      gesture: 'PINCH',
      event: null,
    });
    expect(stabilizer.update('OPEN', 100).gesture).toBe('PINCH');
    expect(stabilizer.update('OPEN', 120).gesture).toBe('PINCH');
    expect(stabilizer.update('OPEN', 140)).toEqual({
      gesture: 'OPEN',
      event: null,
    });
  });

  it('requires a continuous 500ms fist dwell as well as stable frames', () => {
    const stabilizer = createStabilizer();
    stabilizer.update('FIST', 0);
    stabilizer.update('FIST', 100);
    stabilizer.update('FIST', 200);

    expect(stabilizer.update('FIST', 499).event).toBeNull();
    expect(stabilizer.update('FIST', 500)).toEqual({
      gesture: 'FIST',
      event: 'FIST_DWELL_COMPLETE',
    });
    expect(stabilizer.update('FIST', 700).event).toBeNull();
  });

  it('emits the 300ms open dwell only in reading mode', () => {
    const stabilizer = createStabilizer();
    stabilizer.update({ kind: 'OPEN', phase: 'READY' }, 0);
    stabilizer.update({ kind: 'OPEN', phase: 'READY' }, 100);
    stabilizer.update({ kind: 'OPEN', phase: 'READY' }, 200);
    expect(
      stabilizer.update({ kind: 'OPEN', phase: 'READY' }, 400).event,
    ).toBeNull();

    stabilizer.update({ kind: 'OPEN', phase: 'READING' }, 500);
    stabilizer.update({ kind: 'OPEN', phase: 'READING' }, 600);
    stabilizer.update({ kind: 'OPEN', phase: 'READING' }, 700);
    expect(
      stabilizer.update({ kind: 'OPEN', phase: 'READING' }, 799).event,
    ).toBeNull();
    expect(stabilizer.update({ kind: 'OPEN', phase: 'READING' }, 800)).toEqual({
      gesture: 'OPEN',
      event: 'OPEN_DWELL_COMPLETE',
    });
  });

  it('pauses fist dwell during a short hand loss within the grace period', () => {
    const stabilizer = createStabilizer();
    stabilizer.update('FIST', 0);
    stabilizer.update('FIST', 100);
    stabilizer.update('LOST', 200);

    expect(stabilizer.update('LOST', 400).gesture).toBe('UNKNOWN');
    stabilizer.update('FIST', 450);
    expect(stabilizer.update('FIST', 500).event).toBeNull();
    expect(stabilizer.update('FIST', 749).event).toBeNull();
    expect(stabilizer.update('FIST', 750).event).toBe(
      'FIST_DWELL_COMPLETE',
    );
  });

  it('pauses reading open dwell during a short hand loss', () => {
    const stabilizer = createStabilizer();
    stabilizer.update({ kind: 'OPEN', phase: 'READING' }, 0);
    stabilizer.update({ kind: 'OPEN', phase: 'READING' }, 50);
    stabilizer.update({ kind: 'OPEN', phase: 'READING' }, 100);
    stabilizer.update({ kind: 'OPEN', phase: 'READING' }, 150);
    stabilizer.update('LOST', 200);
    stabilizer.update('LOST', 350);

    expect(
      stabilizer.update({ kind: 'OPEN', phase: 'READING' }, 400).event,
    ).toBeNull();
    expect(
      stabilizer.update({ kind: 'OPEN', phase: 'READING' }, 499).event,
    ).toBeNull();
    expect(
      stabilizer.update({ kind: 'OPEN', phase: 'READING' }, 500).event,
    ).toBe('OPEN_DWELL_COMPLETE');
  });

  it('restarts fist confirmation when the recovery frame exceeds loss grace', () => {
    const stabilizer = createStabilizer();
    stabilizer.update('FIST', 0);
    stabilizer.update('FIST', 100);
    stabilizer.update('FIST', 200);
    stabilizer.update('FIST', 300);
    stabilizer.update('LOST', 301);

    expect(stabilizer.update('FIST', 600)).toEqual({
      gesture: 'UNKNOWN',
      event: null,
    });
    expect(stabilizer.update('FIST', 700).event).toBeNull();
    expect(stabilizer.update('FIST', 800).event).toBeNull();
    expect(stabilizer.update('FIST', 900).event).toBeNull();
    expect(stabilizer.update('FIST', 1_099).event).toBeNull();
    expect(stabilizer.update('FIST', 1_100).event).toBe(
      'FIST_DWELL_COMPLETE',
    );
  });

  it('restarts reading open dwell when the recovery frame exceeds loss grace', () => {
    const stabilizer = createStabilizer();
    stabilizer.update({ kind: 'OPEN', phase: 'READING' }, 0);
    stabilizer.update({ kind: 'OPEN', phase: 'READING' }, 50);
    stabilizer.update({ kind: 'OPEN', phase: 'READING' }, 100);
    stabilizer.update({ kind: 'OPEN', phase: 'READING' }, 150);
    stabilizer.update('LOST', 151);

    expect(
      stabilizer.update({ kind: 'OPEN', phase: 'READING' }, 500),
    ).toEqual({
      gesture: 'UNKNOWN',
      event: null,
    });
    stabilizer.update({ kind: 'OPEN', phase: 'READING' }, 550);
    stabilizer.update({ kind: 'OPEN', phase: 'READING' }, 600);
    expect(
      stabilizer.update({ kind: 'OPEN', phase: 'READING' }, 650).event,
    ).toBeNull();
    expect(
      stabilizer.update({ kind: 'OPEN', phase: 'READING' }, 799).event,
    ).toBeNull();
    expect(
      stabilizer.update({ kind: 'OPEN', phase: 'READING' }, 800).event,
    ).toBe('OPEN_DWELL_COMPLETE');
  });

  it('emits LOST and resets pending dwell after the loss grace expires', () => {
    const stabilizer = createStabilizer();
    stabilizer.update('FIST', 0);
    stabilizer.update('FIST', 100);
    stabilizer.update('LOST', 200);

    expect(stabilizer.update('LOST', 451)).toEqual({
      gesture: 'LOST',
      event: null,
    });
    stabilizer.update('FIST', 500);
    stabilizer.update('FIST', 600);
    stabilizer.update('FIST', 700);
    expect(stabilizer.update('FIST', 900).event).toBeNull();
    expect(stabilizer.update('FIST', 1_000).event).toBe(
      'FIST_DWELL_COMPLETE',
    );
  });

  it('rejects decreasing timestamps to protect dwell calculations', () => {
    const stabilizer = createStabilizer();
    stabilizer.update('OPEN', 10);

    expect(() => stabilizer.update('OPEN', 9)).toThrow(RangeError);
  });

  it.each([
    [{ ...config, stableFrames: 0 }],
    [{ ...config, stableFrames: 1.5 }],
    [{ ...config, fistDwellMs: -1 }],
    [{ ...config, openArchiveDwellMs: Number.POSITIVE_INFINITY }],
    [{ ...config, lossGraceMs: Number.NaN }],
  ])('rejects invalid stability configuration %#', (invalidConfig) => {
    expect(() => createGestureStabilizer(invalidConfig)).toThrow(RangeError);
  });
});
