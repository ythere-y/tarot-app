import type { GestureKind } from './classifier';

export type GestureSemanticEvent =
  | 'PINCH_STABLE'
  | 'FIST_DWELL_COMPLETE'
  | 'OPEN_DWELL_COMPLETE';

export interface GestureSample {
  readonly kind: GestureKind;
  readonly phase?: string;
}

export interface GestureStabilizerConfig {
  readonly stableFrames: number;
  readonly fistDwellMs: number;
  readonly openArchiveDwellMs: number;
  readonly lossGraceMs: number;
}

export interface GestureStabilizerUpdate {
  readonly gesture: GestureKind;
  readonly event: GestureSemanticEvent | null;
}

export interface GestureStabilizer {
  update(
    sample: GestureKind | GestureSample,
    timestamp: number,
  ): GestureStabilizerUpdate;
}

function normalizeSample(sample: GestureKind | GestureSample): GestureSample {
  return typeof sample === 'string' ? { kind: sample } : sample;
}

export function createGestureStabilizer(
  config: GestureStabilizerConfig,
): GestureStabilizer {
  let lastTimestamp = Number.NEGATIVE_INFINITY;
  let candidate: GestureKind = 'UNKNOWN';
  let candidateFrames = 0;
  let candidateStartedAt: number | undefined;
  let confirmed: GestureKind = 'UNKNOWN';
  let lossStartedAt: number | undefined;
  let readingOpenStartedAt: number | undefined;
  let eventEmitted = false;

  function resetCandidate(next: GestureKind, timestamp: number): void {
    candidate = next;
    candidateFrames = 1;
    candidateStartedAt = timestamp;
    confirmed = 'UNKNOWN';
    readingOpenStartedAt = undefined;
    eventEmitted = false;
  }

  function resetRecognition(): void {
    candidate = 'UNKNOWN';
    candidateFrames = 0;
    candidateStartedAt = undefined;
    confirmed = 'UNKNOWN';
    readingOpenStartedAt = undefined;
    eventEmitted = false;
  }

  return {
    update(input, timestamp) {
      if (!Number.isFinite(timestamp) || timestamp < lastTimestamp) {
        throw new RangeError('Gesture timestamps must be finite and monotonic');
      }
      lastTimestamp = timestamp;
      const sample = normalizeSample(input);

      if (sample.kind === 'LOST') {
        lossStartedAt ??= timestamp;
        if (timestamp - lossStartedAt > config.lossGraceMs) {
          resetRecognition();
          return { gesture: 'LOST', event: null };
        }
        return { gesture: confirmed, event: null };
      }

      lossStartedAt = undefined;
      if (sample.kind === 'UNKNOWN') {
        resetRecognition();
        return { gesture: 'UNKNOWN', event: null };
      }

      if (sample.kind !== candidate) {
        resetCandidate(sample.kind, timestamp);
      } else {
        candidateFrames += 1;
      }

      if (candidate === 'OPEN' && sample.phase === 'READING') {
        readingOpenStartedAt ??= timestamp;
      } else if (candidate === 'OPEN') {
        readingOpenStartedAt = undefined;
      }

      if (candidateFrames >= config.stableFrames) {
        confirmed = candidate;
      }

      let event: GestureSemanticEvent | null = null;
      if (!eventEmitted && confirmed === 'PINCH') {
        event = 'PINCH_STABLE';
      } else if (
        !eventEmitted &&
        confirmed === 'FIST' &&
        candidateStartedAt !== undefined &&
        timestamp - candidateStartedAt >= config.fistDwellMs
      ) {
        event = 'FIST_DWELL_COMPLETE';
      } else if (
        !eventEmitted &&
        confirmed === 'OPEN' &&
        sample.phase === 'READING' &&
        readingOpenStartedAt !== undefined &&
        timestamp - readingOpenStartedAt >= config.openArchiveDwellMs
      ) {
        event = 'OPEN_DWELL_COMPLETE';
      }

      if (event !== null) eventEmitted = true;
      return { gesture: confirmed, event };
    },
  };
}
