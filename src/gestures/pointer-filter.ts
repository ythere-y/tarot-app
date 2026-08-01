export interface PointerPoint {
  readonly x: number;
  readonly y: number;
}

export interface PointerFilter {
  update(point: PointerPoint): PointerPoint;
}

export function createPointerFilter(alpha: number): PointerFilter {
  if (alpha < 0 || alpha > 1 || !Number.isFinite(alpha)) {
    throw new RangeError('Pointer filter alpha must be between 0 and 1');
  }

  let previous: PointerPoint | undefined;

  return {
    update(point) {
      if (!previous) {
        previous = { ...point };
        return previous;
      }

      previous = {
        x: previous.x + alpha * (point.x - previous.x),
        y: previous.y + alpha * (point.y - previous.y),
      };
      return previous;
    },
  };
}
