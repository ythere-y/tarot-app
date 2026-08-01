import { describe, expect, it } from 'vitest';
import { createPointerFilter } from '../../src/gestures/pointer-filter';

describe('createPointerFilter', () => {
  it('returns the first point unchanged', () => {
    const filter = createPointerFilter(0.2);

    expect(filter.update({ x: 0.25, y: 0.75 })).toEqual({
      x: 0.25,
      y: 0.75,
    });
  });

  it('applies exponential smoothing to each coordinate', () => {
    const filter = createPointerFilter(0.2);
    filter.update({ x: 0, y: 1 });

    const second = filter.update({ x: 1, y: 0 });
    expect(second.x).toBeCloseTo(0.2);
    expect(second.y).toBeCloseTo(0.8);

    const third = filter.update({ x: 1, y: 0 });
    expect(third.x).toBeCloseTo(0.36);
    expect(third.y).toBeCloseTo(0.64);
  });

  it('rejects alpha values outside the inclusive zero-to-one range', () => {
    expect(() => createPointerFilter(-0.01)).toThrow(RangeError);
    expect(() => createPointerFilter(1.01)).toThrow(RangeError);
  });
});
