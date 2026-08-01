import { describe, expect, it } from 'vitest';
import {
  classifyGesture,
  type GestureThresholds,
} from '../../src/gestures/classifier';
import {
  fistHand,
  nearFistHand,
  nearPinchHand,
  openHand,
  pinchHand,
  scaleHand,
} from './fixtures';

const thresholds: GestureThresholds = {
  pinchEnterThreshold: 0.28,
  pinchExitThreshold: 0.36,
  fistEnterFoldRatio: 0.92,
  fistExitFoldRatio: 0.98,
  openExtensionRatio: 1.08,
};

describe('classifyGesture', () => {
  it('classifies fixed open, pinch, and fist landmark fixtures', () => {
    expect(classifyGesture(openHand, thresholds)).toBe('OPEN');
    expect(classifyGesture(pinchHand, thresholds)).toBe('PINCH');
    expect(classifyGesture(fistHand, thresholds)).toBe('FIST');
  });

  it('normalizes pinch distance by palm scale', () => {
    expect(classifyGesture(scaleHand(pinchHand, 0.35), thresholds)).toBe('PINCH');
    expect(classifyGesture(scaleHand(openHand, 1.8), thresholds)).toBe('OPEN');
  });

  it('uses the wider exit threshold only while pinch is latched', () => {
    expect(classifyGesture(nearPinchHand, thresholds)).not.toBe('PINCH');
    expect(
      classifyGesture(nearPinchHand, {
        ...thresholds,
        pinchLatched: true,
      }),
    ).toBe('PINCH');
  });

  it('uses the wider fold threshold only while fist is latched', () => {
    expect(classifyGesture(nearFistHand, thresholds)).not.toBe('FIST');
    expect(
      classifyGesture(nearFistHand, {
        ...thresholds,
        fistLatched: true,
      }),
    ).toBe('FIST');
  });

  it('reports LOST for no hand and UNKNOWN for malformed landmarks', () => {
    expect(classifyGesture(null, thresholds)).toBe('LOST');
    expect(classifyGesture([], thresholds)).toBe('UNKNOWN');
  });
});
