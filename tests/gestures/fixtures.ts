import type { HandLandmark } from '../../src/gestures/classifier';

function point(x: number, y: number, z = 0): HandLandmark {
  return { x, y, z };
}

const palm: HandLandmark[] = [
  point(0.5, 0.9),
  point(0.38, 0.76),
  point(0.31, 0.65),
  point(0.25, 0.55),
  point(0.2, 0.44),
  point(0.4, 0.62),
  point(0.39, 0.48),
  point(0.38, 0.34),
  point(0.37, 0.18),
  point(0.5, 0.59),
  point(0.5, 0.43),
  point(0.5, 0.28),
  point(0.5, 0.11),
  point(0.59, 0.62),
  point(0.61, 0.48),
  point(0.62, 0.34),
  point(0.63, 0.19),
  point(0.67, 0.68),
  point(0.7, 0.55),
  point(0.72, 0.43),
  point(0.74, 0.31),
];

export const openHand: readonly HandLandmark[] = palm;

export const pinchHand: readonly HandLandmark[] = palm.map((landmark, index) => {
  if (index === 4) return point(0.32, 0.29);
  if (index === 8) return point(0.36, 0.27);
  return landmark;
});

export const nearPinchHand: readonly HandLandmark[] = palm.map((landmark, index) => {
  if (index === 4) return point(0.27, 0.29);
  if (index === 8) return point(0.36, 0.27);
  return landmark;
});

export const fistHand: readonly HandLandmark[] = palm.map((landmark, index) => {
  const foldedTips: Record<number, HandLandmark> = {
    8: point(0.41, 0.59),
    12: point(0.5, 0.57),
    16: point(0.59, 0.6),
    20: point(0.66, 0.66),
  };
  return foldedTips[index] ?? landmark;
});

export function scaleHand(
  landmarks: readonly HandLandmark[],
  scale: number,
): readonly HandLandmark[] {
  return landmarks.map(({ x, y, z }) =>
    point(0.5 + (x - 0.5) * scale, 0.5 + (y - 0.5) * scale, z * scale),
  );
}
