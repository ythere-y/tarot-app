import type { TarotCard, TarotOrientation } from '../tarot/types';

export type DrawPhase =
  | { type: 'READY' }
  | { type: 'CAROUSEL' }
  | { type: 'HOLDING' }
  | { type: 'PLACED' }
  | { type: 'REVEALING' }
  | { type: 'READING' }
  | { type: 'ARCHIVING' }
  | { type: 'COMPLETE' };

export type DrawEvent =
  | { type: 'START' }
  | { type: 'PINCH_STABLE' }
  | { type: 'RELEASE_IN_ZONE' }
  | { type: 'RELEASE_OUTSIDE' }
  | { type: 'FIST_DWELL_COMPLETE'; cardId?: string }
  | { type: 'FLIP_COMPLETE' }
  | { type: 'OPEN_DWELL_COMPLETE' }
  | { type: 'DRAW_FAILED' }
  | { type: 'ARCHIVE_COMPLETE'; isFinalCard?: boolean };

export interface DrawHistoryItem {
  cardId: string;
  orientation: TarotOrientation;
  drawnAt: number;
}

export type DrawResult = DrawHistoryItem;

export interface DrawSnapshot {
  phase: DrawPhase;
  remainingCards: readonly TarotCard[];
  remainingCount: number;
  result: DrawResult | null;
  history: readonly DrawHistoryItem[];
}

export interface DrawStore {
  dispatch(event: DrawEvent): void;
  getSnapshot(): DrawSnapshot;
  subscribe(listener: (snapshot: DrawSnapshot) => void): () => void;
  reset(): void;
}
