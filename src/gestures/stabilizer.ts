import type { GestureKind } from './classifier';
import type { DrawPhase } from '../app/types';

export type GestureSemanticEvent =
  | 'PINCH_STABLE'
  | 'FIST_DWELL_COMPLETE'
  | 'OPEN_DWELL_COMPLETE';

export interface GestureSample {
  readonly kind: GestureKind;
  readonly phase?: DrawPhase['type'];
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
  readonly progress: number;
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

function assertValidConfig(config: GestureStabilizerConfig): void {
  if (!Number.isInteger(config.stableFrames) || config.stableFrames < 1) {
    throw new RangeError('stableFrames must be a positive integer');
  }
  for (const [name, value] of [
    ['fistDwellMs', config.fistDwellMs],
    ['openArchiveDwellMs', config.openArchiveDwellMs],
    ['lossGraceMs', config.lossGraceMs],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${name} must be finite and non-negative`);
    }
  }
}

export function createGestureStabilizer(
  config: GestureStabilizerConfig,
): GestureStabilizer {
  assertValidConfig(config);
  let lastTimestamp = Number.NEGATIVE_INFINITY;
  let candidate: GestureKind = 'UNKNOWN';
  let candidateFrames = 0;
  let candidateStartedAt: number | undefined;
  let confirmed: GestureKind = 'UNKNOWN';
  let lossStartedAt: number | undefined;
  let readingOpenStartedAt: number | undefined;
  let eventEmitted = false;
  let lastProgress = 0;

  function resetCandidate(next: GestureKind, timestamp: number): void {
    candidate = next;
    candidateFrames = 1;
    candidateStartedAt = timestamp;
    readingOpenStartedAt = undefined;
  }

  function resetRecognition(): void {
    candidate = 'UNKNOWN';
    candidateFrames = 0;
    candidateStartedAt = undefined;
    confirmed = 'UNKNOWN';
    readingOpenStartedAt = undefined;
    eventEmitted = false;
    lastProgress = 0;
  }

  function progressFor(sample: GestureSample, timestamp: number): number {
    if (candidate === 'UNKNOWN' || candidate === 'LOST') {
      return 0;
    }
    const stabilityProgress = Math.min(
      candidateFrames / config.stableFrames,
      1,
    );
    if (candidate === 'FIST' && candidateStartedAt !== undefined) {
      const dwellProgress = config.fistDwellMs === 0
        ? 1
        : Math.min((timestamp - candidateStartedAt) / config.fistDwellMs, 1);
      return Math.max(0, Math.min(stabilityProgress, dwellProgress));
    }
    if (
      candidate === 'OPEN'
      && sample.phase === 'READING'
      && readingOpenStartedAt !== undefined
    ) {
      const dwellProgress = config.openArchiveDwellMs === 0
        ? 1
        : Math.min(
            (timestamp - readingOpenStartedAt) / config.openArchiveDwellMs,
            1,
          );
      return Math.max(0, Math.min(stabilityProgress, dwellProgress));
    }
    return stabilityProgress;
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
          return { gesture: 'LOST', event: null, progress: 0 };
        }
        return {
          gesture: confirmed,
          event: null,
          progress: lastProgress,
        };
      }

      if (lossStartedAt !== undefined) {
        const pausedDuration = timestamp - lossStartedAt;
        if (pausedDuration > config.lossGraceMs) {
          resetRecognition();
        } else {
          if (candidateStartedAt !== undefined) {
            candidateStartedAt += pausedDuration;
          }
          if (readingOpenStartedAt !== undefined) {
            readingOpenStartedAt += pausedDuration;
          }
        }
      }
      lossStartedAt = undefined;

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
        if (confirmed !== candidate) {
          confirmed = candidate;
          eventEmitted = false;
        }
      }

      let event: GestureSemanticEvent | null = null;
      if (
        !eventEmitted &&
        candidate === confirmed &&
        confirmed === 'PINCH'
      ) {
        event = 'PINCH_STABLE';
      } else if (
        !eventEmitted &&
        candidate === confirmed &&
        confirmed === 'FIST' &&
        candidateStartedAt !== undefined &&
        timestamp - candidateStartedAt >= config.fistDwellMs
      ) {
        event = 'FIST_DWELL_COMPLETE';
      } else if (
        !eventEmitted &&
        candidate === confirmed &&
        confirmed === 'OPEN' &&
        sample.phase === 'READING' &&
        readingOpenStartedAt !== undefined &&
        timestamp - readingOpenStartedAt >= config.openArchiveDwellMs
      ) {
        event = 'OPEN_DWELL_COMPLETE';
      }

      if (event !== null) eventEmitted = true;
      lastProgress = progressFor(sample, timestamp);
      return { gesture: confirmed, event, progress: lastProgress };
    },
  };
}
