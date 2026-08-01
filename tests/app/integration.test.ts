import { afterEach, describe, expect, it } from 'vitest';

import {
  createTarotApp,
  type GestureEnginePort,
  type TarotScenePort,
} from '../../src/app/app';
import type { GestureEngineFrame } from '../../src/gestures/gesture-engine';
import type {
  InterpretationProvider,
  InterpretationRequest,
  InterpretationResponse,
} from '../../src/interpretation/types';
import { TAROT_CARDS } from '../../src/tarot/cards';
import type { TarotCard, TarotOrientation } from '../../src/tarot/types';
import type {
  AppView,
  AppViewActions,
  AppViewModel,
} from '../../src/ui/app-view';
import { fistHand, openHand, pinchHand } from '../gestures/fixtures';

class Deferred<T = void> {
  readonly promise: Promise<T>;
  private resolvePromise!: (value: T | PromiseLike<T>) => void;
  private rejectPromise!: (reason?: unknown) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
  }

  resolve(value: T extends void ? undefined : T = undefined as T extends void ? undefined : T): void {
    this.resolvePromise(value as T);
  }

  reject(reason: unknown): void {
    this.rejectPromise(reason);
  }
}

class FakeGestureEngine implements GestureEnginePort {
  startCalls = 0;
  stopCalls = 0;
  startError: Error | null = null;
  private onFrame: ((frame: GestureEngineFrame) => void) | null = null;

  async start(
    _video: HTMLVideoElement,
    onFrame: (frame: GestureEngineFrame) => void,
  ): Promise<void> {
    this.startCalls += 1;
    if (this.startError !== null) {
      throw this.startError;
    }
    this.onFrame = onFrame;
  }

  stop(): void {
    this.stopCalls += 1;
    this.onFrame = null;
  }

  emit(frame: GestureEngineFrame): void {
    this.onFrame?.(frame);
  }
}

class FakeScene implements TarotScenePort {
  readonly revealCalls: Array<{
    card: TarotCard;
    orientation: TarotOrientation;
  }> = [];
  readonly pointers: Array<{ x: number; y: number }> = [];
  readonly cardUpdates: string[][] = [];
  cards: readonly string[] = [];
  pickCalls = 0;
  releaseCalls = 0;
  archiveCalls = 0;
  disposeCalls = 0;
  mountError: Error | null = null;
  revealDeferred: Deferred | null = null;
  archiveDeferred: Deferred | null = null;
  private heldId: string | null = null;
  private pointer = { x: 0.5, y: 0.5 };

  mount(): this {
    if (this.mountError !== null) {
      throw this.mountError;
    }
    return this;
  }

  setCards(ids: readonly string[]): void {
    this.cards = [...ids];
    this.cardUpdates.push([...ids]);
  }

  setPointer(point: { x: number; y: number }): void {
    this.pointer = { ...point };
    this.pointers.push(this.pointer);
  }

  pickCard(): string | null {
    this.pickCalls += 1;
    this.heldId = this.cards[0] ?? null;
    return this.heldId;
  }

  moveHeldCard(point: { x: number; y: number }): void {
    this.setPointer(point);
  }

  async releaseHeldCard(): Promise<'placed' | 'returned' | null> {
    this.releaseCalls += 1;
    if (this.heldId === null) {
      return null;
    }
    const inZone =
      Math.abs(this.pointer.x - 0.5) <= 0.18
      && Math.abs(this.pointer.y - 0.5) <= 0.22;
    if (!inZone) {
      this.heldId = null;
      return 'returned';
    }
    return 'placed';
  }

  async reveal(card: TarotCard, orientation: TarotOrientation): Promise<void> {
    this.revealCalls.push({ card, orientation });
    await this.revealDeferred?.promise;
  }

  async archive(): Promise<void> {
    this.archiveCalls += 1;
    await this.archiveDeferred?.promise;
    this.heldId = null;
  }

  resize(): void {}

  dispose(): void {
    this.disposeCalls += 1;
  }
}

class FakeView implements AppView {
  readonly host = document.createElement('div');
  readonly video = document.createElement('video');
  readonly models: AppViewModel[] = [];
  actions: AppViewActions = {};
  disposeCalls = 0;
  readonly capturedPointers = new Set<number>();

  constructor(root: HTMLElement) {
    this.host.getBoundingClientRect = () => rect(0, 0, 100, 100);
    this.host.setPointerCapture = (pointerId): void => {
      this.capturedPointers.add(pointerId);
    };
    this.host.releasePointerCapture = (pointerId): void => {
      this.capturedPointers.delete(pointerId);
    };
    this.host.hasPointerCapture = (pointerId): boolean =>
      this.capturedPointers.has(pointerId);
    root.append(this.host, this.video);
  }

  render(model: AppViewModel): void {
    this.models.push(model);
  }

  getSceneHost(): HTMLElement {
    return this.host;
  }

  getVideoElement(): HTMLVideoElement {
    return this.video;
  }

  getHistoryTargetRect(): DOMRect {
    return rect(0, 80, 20, 20);
  }

  bind(actions: AppViewActions): void {
    this.actions = actions;
  }

  dispose(): void {
    this.disposeCalls += 1;
    this.host.remove();
    this.video.remove();
  }

  get latest(): AppViewModel {
    return this.models.at(-1)!;
  }
}

class FakeProvider implements InterpretationProvider {
  readonly requests: InterpretationRequest[] = [];

  async interpret(request: InterpretationRequest): Promise<InterpretationResponse> {
    this.requests.push(request);
    const card = TAROT_CARDS.find(({ id }) => id === request.cardId)!;
    return {
      cardId: request.cardId,
      cardName: card.nameZh,
      topic: request.topic,
      orientation: request.orientation,
      interpretation: card.meanings[request.orientation][request.topic],
      guidance: [...card.meanings[request.orientation].keywords],
      source: 'standard',
    };
  }
}

interface Harness {
  root: HTMLDivElement;
  engine: FakeGestureEngine;
  scene: FakeScene;
  view: FakeView;
  provider: FakeProvider;
  app: ReturnType<typeof createTarotApp>;
}

function createHarness(random: () => number = () => 0): Harness {
  return createHarnessWithScenes(random);
}

function createHarnessWithScenes(
  random: () => number,
  providedScenes: readonly FakeScene[] = [],
): Harness {
  const root = document.createElement('div');
  const engine = new FakeGestureEngine();
  const scene = providedScenes[0] ?? new FakeScene();
  let sceneIndex = 0;
  const view = new FakeView(root);
  const provider = new FakeProvider();
  const app = createTarotApp({
    root,
    random,
    dependencies: {
      gestureEngine: engine,
      createScene: () => providedScenes[sceneIndex++] ?? scene,
      createView: () => view,
      interpretationProvider: provider,
    },
  });
  return { root, engine, scene, view, provider, app };
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

function shiftedPinchAtCenter(): typeof pinchHand {
  return pinchHand.map(({ x, y, z }) => ({
    x: x + 0.14,
    y: y + 0.23,
    z,
  }));
}

function emitStable(
  engine: FakeGestureEngine,
  landmarks: GestureEngineFrame['landmarks'],
  timestamps: readonly number[],
): void {
  for (const timestamp of timestamps) {
    engine.emit({ landmarks, timestamp });
  }
}

function dispatchPointer(
  target: HTMLElement,
  type: string,
  pointerType: 'mouse' | 'touch',
  clientX: number,
  clientY: number,
): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
    button: 0,
  });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: pointerType },
    isPrimary: { value: true },
  });
  target.dispatchEvent(event);
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('createTarotApp', () => {
  it('waits for scene reveal and archive promises before advancing reading and history', async () => {
    const { app, engine, scene, view, provider } = createHarness(() => 0.9);
    scene.revealDeferred = new Deferred();
    scene.archiveDeferred = new Deferred();
    app.start();

    expect(engine.startCalls).toBe(0);
    view.actions.startCamera?.();
    await flushAsync();
    expect(engine.startCalls).toBe(1);

    emitStable(engine, openHand, [0, 20, 40, 60]);
    emitStable(engine, shiftedPinchAtCenter(), [100, 120, 140, 160]);
    engine.emit({ landmarks: shiftedPinchAtCenter(), timestamp: 180 });
    emitStable(engine, openHand, [200, 220, 240, 260]);
    await flushAsync();

    expect(view.latest.snapshot.phase.type).toBe('PLACED');
    emitStable(engine, fistHand, [300, 400, 500, 800]);
    await flushAsync();

    expect(scene.revealCalls).toHaveLength(1);
    expect(scene.revealCalls[0]).toMatchObject({
      card: { id: TAROT_CARDS[0]!.id },
      orientation: 'reversed',
    });
    expect(provider.requests).toEqual([{
      cardId: TAROT_CARDS[0]!.id,
      topic: 'general',
      orientation: 'reversed',
    }]);
    expect(view.latest.snapshot.phase.type).toBe('REVEALING');

    engine.emit({ landmarks: fistHand, timestamp: 850 });
    expect(scene.revealCalls).toHaveLength(1);

    scene.revealDeferred.resolve();
    await flushAsync();
    expect(view.latest.snapshot.phase.type).toBe('READING');

    emitStable(engine, openHand, [900, 1_000, 1_100, 1_200]);
    await flushAsync();
    expect(scene.archiveCalls).toBe(1);
    expect(view.latest.snapshot).toMatchObject({
      phase: { type: 'ARCHIVING' },
      remainingCount: 78,
      history: [],
    });

    scene.archiveDeferred.resolve();
    await flushAsync();
    expect(view.latest.snapshot).toMatchObject({
      phase: { type: 'CAROUSEL' },
      remainingCount: 77,
      history: [{
        cardId: TAROT_CARDS[0]!.id,
        orientation: 'reversed',
      }],
    });
    expect(view.latest.interpretation).toBeNull();

    view.actions.reset?.();
    expect(view.latest.snapshot).toMatchObject({
      phase: { type: 'CAROUSEL' },
      remainingCount: 78,
      history: [],
    });
    expect(scene.cards).toHaveLength(78);
    dispatchPointer(view.host, 'pointerdown', 'mouse', 50, 50);
    expect(scene.pickCalls).toBe(2);

    app.dispose();
  });

  it.each(['mouse', 'touch'] as const)(
    'routes %s input through the same draw phases and returns an out-of-zone card',
    async (pointerType) => {
      const { app, scene, view } = createHarness();
      app.start();

      dispatchPointer(view.host, 'pointerdown', pointerType, 50, 50);
      dispatchPointer(view.host, 'pointermove', pointerType, 5, 5);
      dispatchPointer(view.host, 'pointerup', pointerType, 5, 5);
      await flushAsync();

      expect(scene.pickCalls).toBe(1);
      expect(scene.releaseCalls).toBe(1);
      expect(view.latest.inputMode).toBe('pointer');
      expect(view.latest.snapshot.phase.type).toBe('CAROUSEL');

      dispatchPointer(view.host, 'pointerdown', pointerType, 50, 50);
      expect(scene.pickCalls).toBe(2);
      app.dispose();
    },
  );

  it('completes selection, reveal, reading, and archive with touch input', async () => {
    const { app, scene, view } = createHarness();
    app.start();

    dispatchPointer(view.host, 'pointerdown', 'touch', 50, 50);
    dispatchPointer(view.host, 'pointerup', 'touch', 50, 50);
    await flushAsync();
    expect(view.latest.snapshot.phase.type).toBe('PLACED');

    dispatchPointer(view.host, 'pointerdown', 'touch', 50, 50);
    await flushAsync();
    expect(scene.revealCalls).toHaveLength(1);
    expect(view.latest.snapshot.phase.type).toBe('READING');

    dispatchPointer(view.host, 'pointerdown', 'touch', 50, 50);
    await flushAsync();
    expect(scene.archiveCalls).toBe(1);
    expect(view.latest.snapshot).toMatchObject({
      phase: { type: 'CAROUSEL' },
      remainingCount: 77,
      history: [{ cardId: TAROT_CARDS[0]!.id }],
    });
    app.dispose();
  });

  it('releases a held card once when hand tracking is lost beyond the grace period', async () => {
    const { app, engine, scene, view } = createHarness();
    app.start();
    view.actions.startCamera?.();
    await flushAsync();

    emitStable(engine, shiftedPinchAtCenter(), [0, 20, 40, 60]);
    engine.emit({ landmarks: null, timestamp: 100 });
    expect(scene.releaseCalls).toBe(0);

    engine.emit({ landmarks: null, timestamp: 351 });
    await flushAsync();
    expect(scene.releaseCalls).toBe(1);
    expect(view.latest.snapshot.phase.type).toBe('PLACED');

    engine.emit({ landmarks: null, timestamp: 400 });
    await flushAsync();
    expect(scene.releaseCalls).toBe(1);
    app.dispose();
  });

  it('returns a gesture-held card before pointer mode takes ownership', async () => {
    const { app, engine, scene, view } = createHarness();
    app.start();
    view.actions.startCamera?.();
    await flushAsync();
    emitStable(engine, shiftedPinchAtCenter(), [0, 20, 40, 60]);
    expect(view.latest.snapshot.phase.type).toBe('HOLDING');

    view.actions.usePointerMode?.();
    await flushAsync();

    expect(scene.releaseCalls).toBe(1);
    expect(view.latest).toMatchObject({
      inputMode: 'pointer',
      snapshot: { phase: { type: 'CAROUSEL' } },
    });

    dispatchPointer(view.host, 'pointerdown', 'mouse', 50, 50);
    expect(scene.pickCalls).toBe(2);
    expect(view.latest.snapshot.phase.type).toBe('HOLDING');
    app.dispose();
  });

  it('replaces the scene when reset interrupts an archive so stale completion cannot remove new cards', async () => {
    const firstScene = new FakeScene();
    const secondScene = new FakeScene();
    firstScene.archiveDeferred = new Deferred();
    const { app, view } = createHarnessWithScenes(
      () => 0,
      [firstScene, secondScene],
    );
    app.start();

    dispatchPointer(view.host, 'pointerdown', 'mouse', 50, 50);
    dispatchPointer(view.host, 'pointerup', 'mouse', 50, 50);
    await flushAsync();
    dispatchPointer(view.host, 'pointerdown', 'mouse', 50, 50);
    await flushAsync();
    dispatchPointer(view.host, 'pointerdown', 'mouse', 50, 50);
    await flushAsync();
    expect(view.latest.snapshot.phase.type).toBe('ARCHIVING');

    view.actions.reset?.();
    expect(firstScene.disposeCalls).toBe(1);
    expect(secondScene.cards).toHaveLength(78);
    expect(view.latest.snapshot).toMatchObject({
      phase: { type: 'CAROUSEL' },
      remainingCount: 78,
      history: [],
    });

    firstScene.archiveDeferred.resolve();
    await flushAsync();
    expect(secondScene.cards).toHaveLength(78);
    expect(view.latest.snapshot).toMatchObject({
      phase: { type: 'CAROUSEL' },
      remainingCount: 78,
      history: [],
    });
    app.dispose();
  });

  it('retries a rejected reveal in place without consuming or archiving the card', async () => {
    const firstScene = new FakeScene();
    firstScene.revealDeferred = new Deferred();
    const { app, view } = createHarnessWithScenes(
      () => 0,
      [firstScene],
    );
    app.start();

    dispatchPointer(view.host, 'pointerdown', 'mouse', 50, 50);
    dispatchPointer(view.host, 'pointerup', 'mouse', 50, 50);
    await flushAsync();
    dispatchPointer(view.host, 'pointerdown', 'mouse', 50, 50);
    expect(view.latest.snapshot.phase.type).toBe('REVEALING');

    firstScene.revealDeferred.reject(new Error('texture failed'));
    await flushAsync();

    expect(view.latest.snapshot).toMatchObject({
      phase: { type: 'REVEALING' },
      remainingCount: 78,
      history: [],
    });
    expect(view.latest.resource).toMatchObject({
      status: 'error',
      resource: 'card-face',
    });
    expect(firstScene.disposeCalls).toBe(0);

    firstScene.revealDeferred = null;
    view.actions.retryResource?.();
    await flushAsync();
    expect(firstScene.revealCalls).toHaveLength(2);
    expect(view.latest.snapshot).toMatchObject({
      phase: { type: 'READING' },
      remainingCount: 78,
      history: [],
    });
    app.dispose();
  });

  it('recovers from a rejected archive without adding history and permits another selection', async () => {
    const firstScene = new FakeScene();
    const secondScene = new FakeScene();
    firstScene.archiveDeferred = new Deferred();
    const { app, view } = createHarnessWithScenes(
      () => 0,
      [firstScene, secondScene],
    );
    app.start();

    dispatchPointer(view.host, 'pointerdown', 'mouse', 50, 50);
    dispatchPointer(view.host, 'pointerup', 'mouse', 50, 50);
    await flushAsync();
    dispatchPointer(view.host, 'pointerdown', 'mouse', 50, 50);
    await flushAsync();
    dispatchPointer(view.host, 'pointerdown', 'mouse', 50, 50);
    expect(view.latest.snapshot.phase.type).toBe('ARCHIVING');

    firstScene.archiveDeferred.reject(new Error('archive failed'));
    await flushAsync();

    expect(view.latest.snapshot).toMatchObject({
      phase: { type: 'CAROUSEL' },
      remainingCount: 78,
      history: [],
    });
    expect(view.latest.gesture.detail).toContain('失败');
    expect(firstScene.disposeCalls).toBe(1);
    expect(secondScene.cards).toHaveLength(78);

    dispatchPointer(view.host, 'pointerdown', 'touch', 50, 50);
    expect(secondScene.pickCalls).toBe(1);
    expect(view.latest.snapshot.phase.type).toBe('HOLDING');
    app.dispose();
  });

  it('preserves an earlier archived reading when a later archive rejects', async () => {
    const activeScene = new FakeScene();
    const recoveryScene = new FakeScene();
    const { app, view } = createHarnessWithScenes(
      () => 0,
      [activeScene, recoveryScene],
    );
    app.start();

    dispatchPointer(view.host, 'pointerdown', 'touch', 50, 50);
    dispatchPointer(view.host, 'pointerup', 'touch', 50, 50);
    await flushAsync();
    dispatchPointer(view.host, 'pointerdown', 'touch', 50, 50);
    await flushAsync();
    dispatchPointer(view.host, 'pointerdown', 'touch', 50, 50);
    await flushAsync();
    const archivedCardId = TAROT_CARDS[0]!.id;
    expect(view.latest.snapshot).toMatchObject({
      remainingCount: 77,
      history: [{ cardId: archivedCardId }],
    });

    activeScene.archiveDeferred = new Deferred();
    dispatchPointer(view.host, 'pointerdown', 'touch', 50, 50);
    dispatchPointer(view.host, 'pointerup', 'touch', 50, 50);
    await flushAsync();
    dispatchPointer(view.host, 'pointerdown', 'touch', 50, 50);
    await flushAsync();
    dispatchPointer(view.host, 'pointerdown', 'touch', 50, 50);
    expect(view.latest.snapshot.phase.type).toBe('ARCHIVING');

    activeScene.archiveDeferred.reject(new Error('later archive failed'));
    await flushAsync();

    expect(view.latest.snapshot).toMatchObject({
      phase: { type: 'CAROUSEL' },
      remainingCount: 77,
      result: null,
      history: [{ cardId: archivedCardId }],
    });
    expect(recoveryScene.cards).toHaveLength(77);

    dispatchPointer(view.host, 'pointerdown', 'touch', 50, 50);
    expect(recoveryScene.pickCalls).toBe(1);
    expect(view.latest.snapshot.phase.type).toBe('HOLDING');
    app.dispose();
  });

  it('captures mouse input and safely returns a card when pointer capture is lost', async () => {
    const { app, scene, view } = createHarness();
    app.start();

    dispatchPointer(view.host, 'pointerdown', 'mouse', 50, 50);
    expect(view.capturedPointers.has(1)).toBe(true);
    dispatchPointer(view.host, 'lostpointercapture', 'mouse', 50, 50);
    await flushAsync();

    expect(scene.releaseCalls).toBe(1);
    expect(view.latest.snapshot.phase.type).toBe('CAROUSEL');
    app.dispose();
  });

  it('requests camera only from an explicit action and automatically enables pointer mode on failure', async () => {
    const { app, engine, view } = createHarness();
    engine.startError = new DOMException('denied', 'NotAllowedError');
    app.start();

    expect(engine.startCalls).toBe(0);
    expect(view.latest.camera.status).toBe('idle');

    view.actions.startCamera?.();
    expect(view.latest.camera.status).toBe('requesting');
    await flushAsync();

    expect(engine.startCalls).toBe(1);
    expect(view.latest).toMatchObject({
      inputMode: 'pointer',
      camera: { status: 'error' },
    });
    app.dispose();
  });

  it('falls back to the 2D view when WebGL scene mounting fails', () => {
    const { app, scene, view } = createHarness();
    scene.mountError = new Error('WebGL unavailable');

    expect(() => app.start()).not.toThrow();
    expect(view.latest.webglAvailable).toBe(false);
    expect(scene.disposeCalls).toBe(1);

    app.dispose();
  });

  it('disposes gesture, scene, listeners, subscriptions, and view idempotently', () => {
    const { app, engine, scene, view } = createHarness();
    app.start();
    app.dispose();
    app.dispose();

    dispatchPointer(view.host, 'pointerdown', 'mouse', 50, 50);
    expect(engine.stopCalls).toBe(1);
    expect(scene.disposeCalls).toBe(1);
    expect(view.disposeCalls).toBe(1);
    expect(scene.pickCalls).toBe(0);
  });
});
