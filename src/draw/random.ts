export type RandomSource = () => number;

export const defaultRandom: RandomSource = Math.random;

export function randomIndex(length: number, random: RandomSource): number {
  if (!Number.isInteger(length) || length < 1) {
    throw new RangeError('Cannot draw from an empty deck');
  }

  const value = random();
  const normalized = Number.isFinite(value) ? Math.min(0.9999999999999999, Math.max(0, value)) : 0;
  return Math.floor(normalized * length);
}

export function randomOrientation(random: RandomSource): 'upright' | 'reversed' {
  return random() < 0.5 ? 'upright' : 'reversed';
}
