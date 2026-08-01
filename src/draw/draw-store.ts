import type {
  DrawEvent,
  DrawHistoryItem,
  DrawResult,
  DrawSnapshot,
  DrawStore,
} from '../app/types';
import type { TarotCard } from '../tarot/types';
import { initialDrawPhase, transitionDrawPhase } from './draw-machine';
import { defaultRandom, randomIndex, randomOrientation, type RandomSource } from './random';

export type { DrawEvent, DrawHistoryItem, DrawSnapshot, DrawStore } from '../app/types';

export interface CreateDrawStoreOptions {
  cards: readonly TarotCard[];
  random?: RandomSource;
}

export function createDrawStore({
  cards,
  random = defaultRandom,
}: CreateDrawStoreOptions): DrawStore {
  const initialCards = [...cards];
  const listeners = new Set<(snapshot: DrawSnapshot) => void>();
  let snapshot = createSnapshot(initialCards);

  function dispatch(event: DrawEvent): void {
    const transitionEvent = isArchiveComplete(event)
      ? { ...event, isFinalCard: snapshot.remainingCards.length === 1 }
      : event;
    const phase = transitionDrawPhase(snapshot.phase, transitionEvent);

    if (phase === snapshot.phase) {
      return;
    }

    if (event.type === 'FIST_DWELL_COMPLETE') {
      const result = drawResult(snapshot.remainingCards, random, event.cardId);
      snapshot = createSnapshot(
        snapshot.remainingCards,
        phase,
        result,
        snapshot.history,
      );
    } else if (event.type === 'ARCHIVE_COMPLETE') {
      snapshot = archiveResult(snapshot, phase);
    } else {
      snapshot = createSnapshot(
        snapshot.remainingCards,
        phase,
        snapshot.result,
        snapshot.history,
      );
    }

    notify();
  }

  function getSnapshot(): DrawSnapshot {
    return snapshot;
  }

  function subscribe(listener: (nextSnapshot: DrawSnapshot) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function reset(): void {
    snapshot = createSnapshot(initialCards);
    notify();
  }

  function notify(): void {
    for (const listener of listeners) {
      listener(snapshot);
    }
  }

  return { dispatch, getSnapshot, subscribe, reset };
}

function createSnapshot(
  remainingCards: readonly TarotCard[],
  phase = initialDrawPhase(),
  result: DrawResult | null = null,
  history: readonly DrawHistoryItem[] = [],
): DrawSnapshot {
  return {
    phase,
    remainingCards,
    remainingCount: remainingCards.length,
    result,
    history,
  };
}

function drawResult(
  cards: readonly TarotCard[],
  random: RandomSource,
  cardId?: string,
): DrawResult {
  const card =
    (cardId === undefined
      ? undefined
      : cards.find((candidate) => candidate.id === cardId))
    ?? cards[randomIndex(cards.length, random)]!;
  return {
    cardId: card.id,
    orientation: randomOrientation(random),
    drawnAt: Date.now(),
  };
}

function archiveResult(snapshot: DrawSnapshot, phase: DrawSnapshot['phase']): DrawSnapshot {
  if (snapshot.result === null) {
    return createSnapshot(snapshot.remainingCards, phase, null, snapshot.history);
  }

  const historyItem: DrawHistoryItem = { ...snapshot.result };
  const remainingCards = snapshot.remainingCards.filter(
    (card) => card.id !== snapshot.result!.cardId,
  );
  return createSnapshot(remainingCards, phase, null, [...snapshot.history, historyItem]);
}

function isArchiveComplete(
  event: DrawEvent,
): event is Extract<DrawEvent, { type: 'ARCHIVE_COMPLETE' }> {
  return event.type === 'ARCHIVE_COMPLETE';
}
