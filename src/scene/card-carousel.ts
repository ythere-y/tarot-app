export interface CarouselPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface CarouselTransform {
  readonly id: string;
  readonly position: CarouselPoint;
  readonly rotation: CarouselPoint;
  readonly scale: number;
}

export interface CarouselLayoutOptions {
  readonly radiusX: number;
  readonly radiusZ: number;
  readonly speedRadiansPerSecond: number;
}

export const DEFAULT_CAROUSEL_LAYOUT: CarouselLayoutOptions = {
  radiusX: 6.2,
  radiusZ: 2.4,
  speedRadiansPerSecond: 0.08,
};

export function layoutCarousel(
  ids: readonly string[],
  timeMs: number,
  options: CarouselLayoutOptions = DEFAULT_CAROUSEL_LAYOUT,
): CarouselTransform[] {
  if (ids.length === 0) {
    return [];
  }

  const elapsedSeconds = Number.isFinite(timeMs) ? timeMs / 1_000 : 0;
  const phase = elapsedSeconds * options.speedRadiansPerSecond;

  return ids.map((id, index) => {
    const angle = (index / ids.length) * Math.PI * 2 + phase;
    const depth = (Math.sin(angle) + 1) / 2;

    return {
      id,
      position: {
        x: Math.cos(angle) * options.radiusX,
        y: 0,
        z: Math.sin(angle) * options.radiusZ,
      },
      rotation: {
        x: -0.08,
        y: -angle + Math.PI / 2,
        z: Math.sin(angle) * 0.06,
      },
      scale: 0.82 + depth * 0.18,
    };
  });
}
