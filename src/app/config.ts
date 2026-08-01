export const drawTiming = {
  fistDwellMs: 500,
  openArchiveDwellMs: 300,
} as const;

export const gestureStability = {
  stableFrames: 4,
  lossGraceMs: 250,
  pinchEnterThreshold: 0.28,
  pinchExitThreshold: 0.36,
  pointerSmoothingAlpha: 0.2,
} as const;
