import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CAROUSEL_LAYOUT,
  layoutCarousel,
} from '../../src/scene/card-carousel';
import {
  clampPixelRatio,
  selectSceneQuality,
} from '../../src/scene/quality';

function cardIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `card-${index}`);
}

describe('layoutCarousel', () => {
  it.each([1, 78])('returns one finite transform for each of %i cards', (count) => {
    const transforms = layoutCarousel(cardIds(count), 0);

    expect(transforms).toHaveLength(count);
    for (const transform of transforms) {
      expect([
        transform.position.x,
        transform.position.y,
        transform.position.z,
        transform.rotation.x,
        transform.rotation.y,
        transform.rotation.z,
        transform.scale,
      ].every(Number.isFinite)).toBe(true);
    }
  });

  it('places every card at a unique point on the configured ellipse', () => {
    const transforms = layoutCarousel(cardIds(78), 0);
    const positions = new Set(
      transforms.map(({ position }) =>
        [position.x, position.y, position.z]
          .map((value) => value.toFixed(6))
          .join(':'),
      ),
    );

    expect(positions.size).toBe(78);
    for (const { position } of transforms) {
      const ellipse =
        (position.x / DEFAULT_CAROUSEL_LAYOUT.radiusX) ** 2 +
        (position.z / DEFAULT_CAROUSEL_LAYOUT.radiusZ) ** 2;
      expect(ellipse).toBeCloseTo(1, 8);
    }
  });

  it('advances the full loop over time without changing card order', () => {
    const ids = cardIds(78);
    const initial = layoutCarousel(ids, 0);
    const later = layoutCarousel(ids, 1_000);

    expect(later.map(({ id }) => id)).toEqual(ids);
    expect(later[0]?.position).not.toEqual(initial[0]?.position);
  });

  it('centers a single card facing the camera', () => {
    expect(layoutCarousel(['only-card'], 5_000)).toEqual([
      {
        id: 'only-card',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: -0.04, y: 0, z: 0 },
        scale: 1,
      },
    ]);
  });

  it('keeps a small carousel centered and stably visible', () => {
    const initial = layoutCarousel(cardIds(3), 0);
    const later = layoutCarousel(cardIds(3), 30_000);

    expect(later).toEqual(initial);
    expect(initial.map(({ position }) => position.x)).toEqual([-1.3, 0, 1.3]);
    for (const transform of initial) {
      expect(Math.abs(transform.position.x)).toBeLessThanOrEqual(1.3);
      expect(transform.position.z).toBeGreaterThanOrEqual(0);
      expect(Math.abs(transform.rotation.y)).toBeLessThanOrEqual(0.12);
    }
  });
});

describe('scene quality', () => {
  it('clamps renderer pixel ratio to a finite one-to-two range', () => {
    expect(clampPixelRatio(0)).toBe(1);
    expect(clampPixelRatio(1.5)).toBe(1.5);
    expect(clampPixelRatio(4)).toBe(2);
    expect(clampPixelRatio(Number.NaN)).toBe(1);
  });

  it('uses no simulated particles for reduced motion and fewer on weak devices', () => {
    expect(
      selectSceneQuality({
        devicePixelRatio: 3,
        hardwareConcurrency: 2,
        deviceMemory: 2,
        reducedMotion: false,
      }),
    ).toEqual({
      pixelRatio: 1.25,
      particleCount: 180,
      shadows: false,
    });

    expect(
      selectSceneQuality({
        devicePixelRatio: 2,
        hardwareConcurrency: 8,
        deviceMemory: 8,
        reducedMotion: true,
      }).particleCount,
    ).toBe(0);
  });
});
