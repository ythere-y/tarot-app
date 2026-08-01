export type GestureKind = 'OPEN' | 'PINCH' | 'FIST' | 'UNKNOWN' | 'LOST';

export interface HandLandmark {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface GestureThresholds {
  readonly pinchEnterThreshold: number;
  readonly pinchExitThreshold: number;
  readonly fistFoldRatio: number;
  readonly openExtensionRatio: number;
  readonly pinchLatched?: boolean;
}

const FINGER_PIP_AND_TIP = [
  [6, 8],
  [10, 12],
  [14, 16],
  [18, 20],
] as const;

function distance(a: HandLandmark, b: HandLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function isLandmark(value: HandLandmark | undefined): value is HandLandmark {
  return (
    value !== undefined &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  );
}

export function classifyGesture(
  landmarks: readonly HandLandmark[] | null | undefined,
  thresholds: GestureThresholds,
): GestureKind {
  if (landmarks == null) return 'LOST';
  if (landmarks.length !== 21 || !landmarks.every(isLandmark)) return 'UNKNOWN';

  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  if (!wrist || !middleMcp || !thumbTip || !indexTip) return 'UNKNOWN';

  const palmScale = distance(wrist, middleMcp);
  if (palmScale <= Number.EPSILON) return 'UNKNOWN';

  const pinchThreshold = thresholds.pinchLatched
    ? thresholds.pinchExitThreshold
    : thresholds.pinchEnterThreshold;
  if (distance(thumbTip, indexTip) / palmScale <= pinchThreshold) {
    return 'PINCH';
  }

  const extensionRatios = FINGER_PIP_AND_TIP.map(([pipIndex, tipIndex]) => {
    const pip = landmarks[pipIndex];
    const tip = landmarks[tipIndex];
    if (!pip || !tip) return Number.NaN;
    const proximalDistance = distance(wrist, pip);
    return proximalDistance <= Number.EPSILON
      ? Number.NaN
      : distance(wrist, tip) / proximalDistance;
  });

  if (extensionRatios.every((ratio) => ratio <= thresholds.fistFoldRatio)) {
    return 'FIST';
  }
  if (extensionRatios.every((ratio) => ratio >= thresholds.openExtensionRatio)) {
    return 'OPEN';
  }
  return 'UNKNOWN';
}
