import type { DrawEvent, DrawPhase } from '../app/types';

export type { DrawEvent, DrawPhase } from '../app/types';

const ready: DrawPhase = { type: 'READY' };

export function initialDrawPhase(): DrawPhase {
  return ready;
}

export function transitionDrawPhase(phase: DrawPhase, event: DrawEvent): DrawPhase {
  switch (phase.type) {
    case 'READY':
      return event.type === 'START' ? { type: 'CAROUSEL' } : phase;
    case 'CAROUSEL':
      return event.type === 'PINCH_STABLE' ? { type: 'HOLDING' } : phase;
    case 'HOLDING':
      if (event.type === 'RELEASE_IN_ZONE') {
        return { type: 'PLACED' };
      }
      return event.type === 'RELEASE_OUTSIDE' ? { type: 'CAROUSEL' } : phase;
    case 'PLACED':
      return event.type === 'FIST_DWELL_COMPLETE' ? { type: 'REVEALING' } : phase;
    case 'REVEALING':
      return event.type === 'FLIP_COMPLETE' ? { type: 'READING' } : phase;
    case 'READING':
      return event.type === 'OPEN_DWELL_COMPLETE' ? { type: 'ARCHIVING' } : phase;
    case 'ARCHIVING':
      if (event.type !== 'ARCHIVE_COMPLETE') {
        return phase;
      }
      return event.isFinalCard ? { type: 'COMPLETE' } : { type: 'CAROUSEL' };
    case 'COMPLETE':
      return phase;
  }
}
