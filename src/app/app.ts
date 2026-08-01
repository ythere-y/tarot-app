import { gestureStability, drawTiming } from './config';
import type { DrawEvent, DrawResult, DrawSnapshot } from './types';
import { createDrawStore } from '../draw/draw-store';
import type { RandomSource } from '../draw/random';
import {
  classifyGesture,
  type GestureKind,
  type HandLandmark,
} from '../gestures/classifier';
import {
  GestureEngine,
  type GestureEngineFrame,
} from '../gestures/gesture-engine';
import {
  createPointerFilter,
  type PointerPoint,
} from '../gestures/pointer-filter';
import {
  createGestureStabilizer,
  type GestureStabilizer,
} from '../gestures/stabilizer';
import { LocalInterpretationProvider } from '../interpretation/local-provider';
import type {
  InterpretationProvider,
  InterpretationResponse,
  InterpretationTopic,
} from '../interpretation/types';
import { TarotScene, type ReleaseResult } from '../scene/tarot-scene';
import { TAROT_CARDS } from '../tarot/cards';
import type { TarotCard, TarotOrientation } from '../tarot/types';
import {
  createAppView,
  type AppView,
  type CameraViewStatus,
  type GestureViewStatus,
  type InputMode,
} from '../ui/app-view';

export interface GestureEnginePort {
  start(
    video: HTMLVideoElement,
    onFrame: (frame: GestureEngineFrame) => void,
  ): Promise<void>;
  stop(): void;
}

export interface TarotScenePort {
  mount(host: HTMLElement): unknown;
  setCards(ids: readonly string[]): void;
  setPointer(point: PointerPoint): void;
  pickCard(): string | null;
  moveHeldCard(point: PointerPoint): void;
  releaseHeldCard(): Promise<ReleaseResult>;
  reveal(card: TarotCard, orientation: TarotOrientation): Promise<void>;
  archive(targetRect: DOMRect): Promise<void>;
  resize(): void;
  dispose(): void;
}

export interface TarotAppDependencies {
  readonly cards: readonly TarotCard[];
  readonly gestureEngine: GestureEnginePort;
  readonly createScene: () => TarotScenePort;
  readonly createView: (root: HTMLElement) => AppView;
  readonly interpretationProvider: InterpretationProvider;
}

export interface CreateTarotAppOptions {
  readonly root: HTMLElement;
  readonly random?: RandomSource;
  readonly dependencies?: Partial<TarotAppDependencies>;
}

export interface TarotApp {
  start(): void;
  dispose(): void;
}

const DEFAULT_GESTURE_STATUS: GestureViewStatus = {
  label: '等待手势',
  detail: '张开手掌，捏合选牌',
  progress: 0,
};

export function createTarotApp({
  root,
  random,
  dependencies = {},
}: CreateTarotAppOptions): TarotApp {
  const cards = dependencies.cards ?? TAROT_CARDS;
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const store = createDrawStore({ cards, random });
  const gestureEngine =
    dependencies.gestureEngine ?? new GestureEngine();
  const createScene =
    dependencies.createScene ?? (() => new TarotScene({ cards }));
  const createView =
    dependencies.createView ?? ((viewRoot) => createAppView(viewRoot));
  const interpretationProvider =
    dependencies.interpretationProvider ?? new LocalInterpretationProvider();

  let view: AppView | null = null;
  let scene: TarotScenePort | null = null;
  let unsubscribe: (() => void) | null = null;
  let started = false;
  let disposed = false;
  let webglAvailable = true;
  let inputMode: InputMode = 'gesture';
  let camera: CameraViewStatus = { status: 'idle' };
  let gestureStatus = { ...DEFAULT_GESTURE_STATUS };
  let topic: InterpretationTopic = 'general';
  let interpretation: InterpretationResponse | null = null;
  let selectedCardId: string | null = null;
  let gestureKind: GestureKind = 'UNKNOWN';
  let gestureStabilizer = createStabilizer();
  let pointerFilter = createPointerFilter(
    gestureStability.pointerSmoothingAlpha,
  );
  let releaseInFlight = false;
  let lastCardsKey = '';
  let operationGeneration = 0;
  let cameraGeneration = 0;
  let activePointerId: number | null = null;

  const render = (): void => {
    if (view === null) {
      return;
    }
    const snapshot = store.getSnapshot();
    view.render({
      snapshot,
      currentCard: currentCard(snapshot, cardsById),
      interpretation,
      topic,
      gesture: gestureStatus,
      camera,
      inputMode,
      webglAvailable,
      cardCatalog: cards,
      totalCards: cards.length,
    });
  };

  const syncCards = (snapshot: DrawSnapshot): void => {
    if (scene === null) {
      return;
    }
    const ids = snapshot.remainingCards.map(({ id }) => id);
    const cardsKey = ids.join('\u0000');
    if (cardsKey === lastCardsKey) {
      return;
    }
    lastCardsKey = cardsKey;
    scene.setCards(ids);
  };

  const dispatch = (event: DrawEvent): void => {
    store.dispatch(event);
  };

  const mountFreshScene = (): void => {
    if (view === null) {
      return;
    }
    if (!webglAvailable) {
      scene = createFallbackScene();
      scene.mount(view.getSceneHost());
      return;
    }

    const candidate = createScene();
    try {
      candidate.mount(view.getSceneHost());
      scene = candidate;
    } catch {
      candidate.dispose();
      webglAvailable = false;
      inputMode = 'pointer';
      scene = createFallbackScene();
      scene.mount(view.getSceneHost());
    }
  };

  const updatePointer = (
    point: PointerPoint,
    moveHeld: boolean,
  ): void => {
    if (scene === null) {
      return;
    }
    if (moveHeld && store.getSnapshot().phase.type === 'HOLDING') {
      scene.moveHeldCard(point);
    } else {
      scene.setPointer(point);
    }
  };

  const beginSelection = (): void => {
    if (scene === null || store.getSnapshot().phase.type !== 'CAROUSEL') {
      return;
    }
    const cardId = scene.pickCard();
    if (cardId === null) {
      return;
    }
    selectedCardId = cardId;
    dispatch({ type: 'PINCH_STABLE' });
  };

  const releaseSelection = async (): Promise<void> => {
    if (
      scene === null
      || releaseInFlight
      || store.getSnapshot().phase.type !== 'HOLDING'
    ) {
      return;
    }
    releaseInFlight = true;
    const generation = operationGeneration;
    let result: ReleaseResult = null;
    try {
      result = await scene.releaseHeldCard();
    } catch {
      result = 'returned';
    } finally {
      releaseInFlight = false;
    }
    if (
      disposed
      || generation !== operationGeneration
      || store.getSnapshot().phase.type !== 'HOLDING'
    ) {
      return;
    }
    if (result === 'placed') {
      dispatch({ type: 'RELEASE_IN_ZONE' });
      return;
    }
    selectedCardId = null;
    dispatch({ type: 'RELEASE_OUTSIDE' });
  };

  const requestInterpretation = (
    result: DrawResult,
    requestedTopic: InterpretationTopic,
  ): void => {
    const generation = operationGeneration;
    void interpretationProvider
      .interpret({
        cardId: result.cardId,
        orientation: result.orientation,
        topic: requestedTopic,
      })
      .then((response) => {
        const current = store.getSnapshot().result;
        if (
          disposed
          || generation !== operationGeneration
          || current?.cardId !== result.cardId
          || current.orientation !== result.orientation
          || requestedTopic !== topic
        ) {
          return;
        }
        interpretation = response;
        render();
      })
      .catch(() => undefined);
  };

  const beginReveal = (): void => {
    if (
      scene === null
      || store.getSnapshot().phase.type !== 'PLACED'
      || selectedCardId === null
    ) {
      return;
    }
    dispatch({
      type: 'FIST_DWELL_COMPLETE',
      cardId: selectedCardId,
    });
    const snapshot = store.getSnapshot();
    const result = snapshot.result;
    if (snapshot.phase.type !== 'REVEALING' || result === null) {
      return;
    }
    const card = cardsById.get(result.cardId);
    if (card === undefined) {
      return;
    }
    interpretation = null;
    requestInterpretation(result, topic);
    const generation = operationGeneration;
    void scene
      .reveal(card, result.orientation)
      .then(() => {
        if (
          disposed
          || generation !== operationGeneration
          || store.getSnapshot().phase.type !== 'REVEALING'
        ) {
          return;
        }
        dispatch({ type: 'FLIP_COMPLETE' });
      })
      .catch(() => undefined);
  };

  const beginArchive = (): void => {
    if (scene === null || store.getSnapshot().phase.type !== 'READING') {
      return;
    }
    dispatch({ type: 'OPEN_DWELL_COMPLETE' });
    if (store.getSnapshot().phase.type !== 'ARCHIVING') {
      return;
    }
    const generation = operationGeneration;
    const targetRect = view?.getHistoryTargetRect() ?? emptyRect();
    void scene
      .archive(targetRect)
      .then(() => {
        if (
          disposed
          || generation !== operationGeneration
          || store.getSnapshot().phase.type !== 'ARCHIVING'
        ) {
          return;
        }
        selectedCardId = null;
        interpretation = null;
        dispatch({ type: 'ARCHIVE_COMPLETE' });
      })
      .catch(() => undefined);
  };

  const handleSemanticEvent = (
    event: 'PINCH_STABLE' | 'FIST_DWELL_COMPLETE' | 'OPEN_DWELL_COMPLETE',
  ): void => {
    switch (event) {
      case 'PINCH_STABLE':
        beginSelection();
        break;
      case 'FIST_DWELL_COMPLETE':
        beginReveal();
        break;
      case 'OPEN_DWELL_COMPLETE':
        beginArchive();
        break;
    }
  };

  const handleGestureFrame = (frame: GestureEngineFrame): void => {
    if (disposed || !started || inputMode !== 'gesture') {
      return;
    }
    const rawGesture = classifyGesture(frame.landmarks, {
      pinchEnterThreshold: gestureStability.pinchEnterThreshold,
      pinchExitThreshold: gestureStability.pinchExitThreshold,
      fistEnterFoldRatio: gestureStability.fistEnterFoldRatio,
      fistExitFoldRatio: gestureStability.fistExitFoldRatio,
      openExtensionRatio: 1.08,
      pinchLatched: gestureKind === 'PINCH',
      fistLatched: gestureKind === 'FIST',
    });
    const pointer = pointerFromLandmarks(frame.landmarks);
    const phase = store.getSnapshot().phase.type;
    if (
      pointer !== null
      && (phase !== 'HOLDING' || rawGesture === 'PINCH')
    ) {
      const filtered = pointerFilter.update(pointer);
      updatePointer(filtered, rawGesture === 'PINCH');
    }

    const previousGesture = gestureKind;
    const update = gestureStabilizer.update(
      {
        kind: rawGesture,
        phase,
      },
      frame.timestamp,
    );
    gestureKind = update.gesture;
    gestureStatus = statusForGesture(update.gesture);
    render();

    if (update.event !== null) {
      handleSemanticEvent(update.event);
    }
    if (
      store.getSnapshot().phase.type === 'HOLDING'
      && previousGesture === 'PINCH'
      && update.gesture !== 'PINCH'
    ) {
      void releaseSelection();
    }
  };

  const startCamera = (): void => {
    if (disposed || !started || view === null) {
      return;
    }
    const generation = ++cameraGeneration;
    inputMode = 'gesture';
    camera = { status: 'requesting', expanded: true };
    render();
    void gestureEngine
      .start(view.getVideoElement(), handleGestureFrame)
      .then(() => {
        if (disposed || generation !== cameraGeneration) {
          gestureEngine.stop();
          return;
        }
        camera = { status: 'ready', expanded: false };
        inputMode = 'gesture';
        render();
      })
      .catch((error: unknown) => {
        if (disposed || generation !== cameraGeneration) {
          return;
        }
        camera = {
          status: 'error',
          message: cameraErrorMessage(error),
          expanded: true,
        };
        inputMode = 'pointer';
        render();
      });
  };

  const usePointerMode = (): void => {
    if (disposed) {
      return;
    }
    cameraGeneration += 1;
    gestureEngine.stop();
    inputMode = 'pointer';
    render();
  };

  const selectTopic = (nextTopic: InterpretationTopic): void => {
    if (topic === nextTopic) {
      return;
    }
    topic = nextTopic;
    interpretation = null;
    const result = store.getSnapshot().result;
    if (result !== null) {
      requestInterpretation(result, nextTopic);
    }
    render();
  };

  const reset = (): void => {
    operationGeneration += 1;
    selectedCardId = null;
    interpretation = null;
    topic = 'general';
    releaseInFlight = false;
    gestureKind = 'UNKNOWN';
    gestureStabilizer = createStabilizer();
    pointerFilter = createPointerFilter(
      gestureStability.pointerSmoothingAlpha,
    );
    scene?.dispose();
    scene = null;
    lastCardsKey = '';
    mountFreshScene();
    store.reset();
    dispatch({ type: 'START' });
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (
      disposed
      || !started
      || event.button !== 0
      || event.isPrimary === false
      || activePointerId !== null
      || view === null
    ) {
      return;
    }
    event.preventDefault();
    if (inputMode !== 'pointer') {
      usePointerMode();
    }
    const point = pointerFromEvent(event, view.getSceneHost());
    updatePointer(point, false);
    switch (store.getSnapshot().phase.type) {
      case 'CAROUSEL':
        activePointerId = event.pointerId;
        try {
          view.getSceneHost().setPointerCapture(event.pointerId);
        } catch {
          activePointerId = event.pointerId;
        }
        beginSelection();
        break;
      case 'PLACED':
        beginReveal();
        break;
      case 'READING':
        beginArchive();
        break;
      default:
        break;
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (
      disposed
      || !started
      || inputMode !== 'pointer'
      || event.isPrimary === false
      || event.pointerId !== activePointerId
      || view === null
    ) {
      return;
    }
    const point = pointerFromEvent(event, view.getSceneHost());
    updatePointer(point, true);
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (
      disposed
      || !started
      || inputMode !== 'pointer'
      || event.isPrimary === false
      || event.pointerId !== activePointerId
      || view === null
    ) {
      return;
    }
    updatePointer(
      pointerFromEvent(event, view.getSceneHost()),
      true,
    );
    releaseActivePointer(event.pointerId);
    void releaseSelection();
  };

  const releaseActivePointer = (pointerId: number): void => {
    if (activePointerId !== pointerId) {
      return;
    }
    activePointerId = null;
    const host = view?.getSceneHost();
    if (host?.hasPointerCapture(pointerId)) {
      try {
        host.releasePointerCapture(pointerId);
      } catch {
        return;
      }
    }
  };

  const cancelPointerSelection = (event: PointerEvent): void => {
    if (
      disposed
      || !started
      || inputMode !== 'pointer'
      || scene === null
      || event.pointerId !== activePointerId
    ) {
      return;
    }
    activePointerId = null;
    scene.moveHeldCard({ x: 0, y: 0 });
    void releaseSelection();
  };

  const onResize = (): void => {
    scene?.resize();
  };

  return {
    start(): void {
      if (disposed || started) {
        return;
      }
      started = true;
      view = createView(root);
      view.bind({
        startCamera,
        retryCamera: startCamera,
        usePointerMode,
        selectTopic,
        reset,
      });

      mountFreshScene();

      unsubscribe = store.subscribe((snapshot) => {
        syncCards(snapshot);
        render();
      });
      syncCards(store.getSnapshot());
      const sceneHost = view.getSceneHost();
      sceneHost.style.touchAction = 'none';
      sceneHost.addEventListener('pointerdown', onPointerDown);
      sceneHost.addEventListener('pointermove', onPointerMove);
      sceneHost.addEventListener('pointerup', onPointerUp);
      sceneHost.addEventListener('pointercancel', cancelPointerSelection);
      sceneHost.addEventListener(
        'lostpointercapture',
        cancelPointerSelection,
      );
      window.addEventListener('resize', onResize);
      dispatch({ type: 'START' });
      render();
    },

    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      operationGeneration += 1;
      cameraGeneration += 1;
      gestureEngine.stop();
      unsubscribe?.();
      unsubscribe = null;
      if (view !== null) {
        const sceneHost = view.getSceneHost();
        sceneHost.removeEventListener('pointerdown', onPointerDown);
        sceneHost.removeEventListener('pointermove', onPointerMove);
        sceneHost.removeEventListener('pointerup', onPointerUp);
        sceneHost.removeEventListener(
          'pointercancel',
          cancelPointerSelection,
        );
        sceneHost.removeEventListener(
          'lostpointercapture',
          cancelPointerSelection,
        );
      }
      window.removeEventListener('resize', onResize);
      scene?.dispose();
      scene = null;
      view?.dispose();
      view = null;
    },
  };
}

function createStabilizer(): GestureStabilizer {
  return createGestureStabilizer({
    stableFrames: gestureStability.stableFrames,
    fistDwellMs: drawTiming.fistDwellMs,
    openArchiveDwellMs: drawTiming.openArchiveDwellMs,
    lossGraceMs: gestureStability.lossGraceMs,
  });
}

function currentCard(
  snapshot: DrawSnapshot,
  cardsById: ReadonlyMap<string, TarotCard>,
): TarotCard | null {
  return snapshot.result === null
    ? null
    : cardsById.get(snapshot.result.cardId) ?? null;
}

function pointerFromLandmarks(
  landmarks: readonly HandLandmark[] | null,
): PointerPoint | null {
  const indexTip = landmarks?.[8];
  if (
    indexTip === undefined
    || !Number.isFinite(indexTip.x)
    || !Number.isFinite(indexTip.y)
  ) {
    return null;
  }
  return {
    x: clamp(1 - indexTip.x, 0, 1),
    y: clamp(indexTip.y, 0, 1),
  };
}

function pointerFromEvent(
  event: PointerEvent,
  host: HTMLElement,
): PointerPoint {
  const bounds = host.getBoundingClientRect();
  return {
    x: clamp((event.clientX - bounds.left) / Math.max(bounds.width, 1), 0, 1),
    y: clamp((event.clientY - bounds.top) / Math.max(bounds.height, 1), 0, 1),
  };
}

function statusForGesture(gesture: GestureKind): GestureViewStatus {
  const labels: Record<GestureKind, string> = {
    OPEN: '张开手掌',
    PINCH: '捏合选牌',
    FIST: '握拳确认',
    UNKNOWN: '识别手势中',
    LOST: '未检测到手',
  };
  return {
    label: labels[gesture],
    detail: gesture === 'LOST' ? '可继续使用鼠标或触屏' : undefined,
    progress: gesture === 'UNKNOWN' || gesture === 'LOST' ? 0 : 1,
  };
}

function cameraErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message;
  }
  return '无法启动摄像头，已切换到鼠标 / 触屏模式';
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function emptyRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
  };
}

function createFallbackScene(): TarotScenePort {
  let cards: readonly string[] = [];
  let selected: string | null = null;
  let pointer: PointerPoint = { x: 0.5, y: 0.5 };

  return {
    mount(): void {},
    setCards(ids): void {
      cards = [...ids];
    },
    setPointer(point): void {
      pointer = { ...point };
    },
    pickCard(): string | null {
      selected = cards[0] ?? null;
      return selected;
    },
    moveHeldCard(point): void {
      pointer = { ...point };
    },
    async releaseHeldCard(): Promise<ReleaseResult> {
      if (selected === null) {
        return null;
      }
      const placed =
        Math.abs(pointer.x - 0.5) <= 0.18
        && Math.abs(pointer.y - 0.5) <= 0.22;
      if (!placed) {
        selected = null;
      }
      return placed ? 'placed' : 'returned';
    },
    async reveal(): Promise<void> {},
    async archive(): Promise<void> {
      selected = null;
    },
    resize(): void {},
    dispose(): void {
      cards = [];
      selected = null;
    },
  };
}
