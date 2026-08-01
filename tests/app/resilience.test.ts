import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Group,
  MeshBasicMaterial,
  Scene,
  Texture,
  type Camera,
  type TextureLoader,
} from 'three';

import {
  createTarotApp,
  type GestureEnginePort,
  type TarotScenePort,
} from '../../src/app/app';
import {
  GestureEngineError,
  resolveGestureAssetPaths,
  type GestureEngineFrame,
} from '../../src/gestures/gesture-engine';
import {
  CARD_BACK_URL,
  TarotScene,
  type SceneResourceState,
  type TarotRenderer,
} from '../../src/scene/tarot-scene';
import { selectSceneQuality } from '../../src/scene/quality';
import { TAROT_CARDS } from '../../src/tarot/cards';
import type { TarotCard, TarotOrientation } from '../../src/tarot/types';
import type {
  AppView,
  AppViewActions,
  AppViewModel,
} from '../../src/ui/app-view';
import { openHand, pinchHand } from '../gestures/fixtures';

class Deferred<T> {
  readonly promise: Promise<T>;
  private resolvePromise!: (value: T | PromiseLike<T>) => void;
  private rejectPromise!: (reason?: unknown) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
  }

  resolve(value: T): void {
    this.resolvePromise(value);
  }

  reject(reason: unknown): void {
    this.rejectPromise(reason);
  }
}

class RejectingGestureEngine implements GestureEnginePort {
  startCalls = 0;
  stopCalls = 0;
  runtimeError:
    | ((error: GestureEngineError) => void)
    | undefined;

  constructor(private readonly error: Error | null = null) {}

  async start(
    video: HTMLVideoElement,
    onFrame: (frame: GestureEngineFrame) => void,
    onError?: (error: GestureEngineError) => void,
  ): Promise<void> {
    void video;
    void onFrame;
    this.startCalls += 1;
    this.runtimeError = onError;
    if (this.error !== null) {
      throw this.error;
    }
  }

  stop(): void {
    this.stopCalls += 1;
  }

  failAtRuntime(error: GestureEngineError): void {
    this.runtimeError?.(error);
  }
}

interface SceneCallbacks {
  readonly onResourceState?: (state: SceneResourceState) => void;
  readonly onFatalError?: (error: Error) => void;
}

class RecoverableScene implements TarotScenePort {
  callbacks: SceneCallbacks = {};
  cards: readonly string[] = [];
  mountError: Error | null = null;
  revealFailures = 0;
  revealCalls = 0;
  retryAssetCalls = 0;
  suspended: boolean[] = [];
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
  }

  setPointer(point: { x: number; y: number }): void {
    this.pointer = { ...point };
  }

  pickCard(): string | null {
    this.heldId = this.cards[0] ?? null;
    return this.heldId;
  }

  moveHeldCard(point: { x: number; y: number }): void {
    this.pointer = { ...point };
  }

  async releaseHeldCard(): Promise<'placed' | 'returned' | null> {
    if (this.heldId === null) {
      return null;
    }
    const placed =
      Math.abs(this.pointer.x - 0.5) <= 0.18
      && Math.abs(this.pointer.y - 0.5) <= 0.22;
    return placed ? 'placed' : 'returned';
  }

  async reveal(
    card: TarotCard,
    orientation: TarotOrientation,
  ): Promise<void> {
    void card;
    void orientation;
    this.revealCalls += 1;
    if (this.revealFailures > 0) {
      this.revealFailures -= 1;
      throw new Error('face texture unavailable');
    }
  }

  async archive(): Promise<void> {
    this.heldId = null;
  }

  retryFailedAssets(): Promise<void> {
    this.retryAssetCalls += 1;
    return Promise.resolve();
  }

  setSuspended(suspended: boolean): void {
    this.suspended.push(suspended);
  }

  resize(): void {}
  dispose(): void {}
}

class InspectingRenderer implements TarotRenderer {
  readonly domElement = document.createElement('canvas');
  renderCalls = 0;
  lastScene: Scene | null = null;

  setPixelRatio(): void {}
  setSize(): void {}

  render(scene: Scene, camera: Camera): void {
    void camera;
    this.renderCalls += 1;
    this.lastScene = scene;
  }

  dispose(): void {}
}

function createRoot(): HTMLDivElement {
  const root = document.createElement('div');
  document.body.append(root);
  return root;
}

function startApp(options: {
  readonly cameraError?: Error;
  readonly scene?: RecoverableScene;
} = {}): {
  readonly app: ReturnType<typeof createTarotApp>;
  readonly engine: RejectingGestureEngine;
  readonly root: HTMLDivElement;
  readonly scene: RecoverableScene;
} {
  const root = createRoot();
  const engine = new RejectingGestureEngine(options.cameraError ?? null);
  const scene = options.scene ?? new RecoverableScene();
  const app = createTarotApp({
    root,
    random: () => 0,
    dependencies: {
      gestureEngine: engine,
      createScene: (callbacks?: SceneCallbacks) => {
        scene.callbacks = callbacks ?? {};
        return scene;
      },
    },
  });
  app.start();
  const host = root.querySelector<HTMLElement>('[data-ui="scene-host"]');
  if (host !== null) {
    host.getBoundingClientRect = () => rect(0, 0, 100, 100);
    const capturedPointers = new Set<number>();
    host.setPointerCapture = (pointerId): void => {
      capturedPointers.add(pointerId);
    };
    host.releasePointerCapture = (pointerId): void => {
      capturedPointers.delete(pointerId);
    };
    host.hasPointerCapture = (pointerId): boolean =>
      capturedPointers.has(pointerId);
  }
  return { app, engine, root, scene };
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

function dispatchPointer(
  target: HTMLElement,
  type: string,
  x = 50,
  y = 50,
): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: 'mouse' },
    isPrimary: { value: true },
  });
  target.dispatchEvent(event);
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function sceneHost(root: HTMLElement): HTMLElement {
  return root.querySelector<HTMLElement>('[data-ui="scene-host"]')!;
}

function makeCards(count: number): TarotCard[] {
  return TAROT_CARDS.slice(0, count);
}

function emitStable(
  engine: {
    emit(frame: GestureEngineFrame): void;
  },
  landmarks: GestureEngineFrame['landmarks'],
  timestamps: readonly number[],
): void {
  for (const timestamp of timestamps) {
    engine.emit({ landmarks, timestamp });
  }
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('camera and renderer recovery', () => {
  it.each([
    new GestureEngineError(
      'PERMISSION_DENIED',
      'Camera permission was denied',
    ),
    new GestureEngineError(
      'NO_DEVICE',
      'No camera device was found',
    ),
    new GestureEngineError(
      'MODEL_ERROR',
      'The hand landmark model could not be loaded',
    ),
  ])(
    'keeps pointer input, retry, and an empty history available after %s',
    async (cameraError) => {
      const { app, root } = startApp({ cameraError });

      root.querySelector<HTMLButtonElement>(
        '[data-action="start-camera"]',
      )?.click();
      await flushAsync();

      expect(root.querySelector('[data-ui="camera-message"]')?.textContent)
        .toContain(cameraError.message);
      expect(root.querySelector('[data-action="retry-camera"]')).not.toBeNull();
      expect(root.querySelector('[data-action="use-pointer"]')).not.toBeNull();
      expect(root.querySelectorAll('[data-ui="history-item"]')).toHaveLength(0);

      root.querySelector<HTMLButtonElement>(
        '[data-action="use-pointer"]',
      )?.click();
      dispatchPointer(sceneHost(root), 'pointerdown');
      expect(root.querySelector('[data-ui="input-mode"]')?.textContent)
        .not.toBe('');
      app.dispose();
    },
  );

  it('uses the 2D scene when WebGL mounting fails without creating history', () => {
    const scene = new RecoverableScene();
    scene.mountError = new Error('WebGL unavailable');
    const { app, root } = startApp({ scene });

    expect(sceneHost(root).dataset.renderer).toBe('2d');
    expect(root.querySelector('[data-ui="fallback-2d"]')).not.toBeNull();
    expect(root.querySelectorAll('[data-ui="history-item"]')).toHaveLength(0);
    app.dispose();
  });

  it('does not let an older camera start completion stop a newer session', async () => {
    class OverlappingGestureEngine implements GestureEnginePort {
      readonly starts = [new Deferred<void>(), new Deferred<void>()];
      stopCalls = 0;
      startCalls = 0;

      start(): Promise<void> {
        return this.starts[this.startCalls++]!.promise;
      }

      stop(): void {
        this.stopCalls += 1;
      }
    }

    const root = createRoot();
    const engine = new OverlappingGestureEngine();
    const view: AppView & { actions: AppViewActions } = {
      actions: {},
      render(model: AppViewModel): void {
        void model;
      },
      getSceneHost: () => root,
      getVideoElement: () => document.createElement('video'),
      getHistoryTargetRect: () => rect(0, 0, 1, 1),
      bind(actions): void {
        this.actions = actions;
      },
      dispose(): void {},
    };
    const app = createTarotApp({
      root,
      dependencies: {
        gestureEngine: engine,
        createScene: () => new RecoverableScene(),
        createView: () => view,
      },
    });
    app.start();

    view.actions.startCamera?.();
    view.actions.startCamera?.();
    engine.starts[0]!.resolve();
    await flushAsync();

    expect(engine.startCalls).toBe(2);
    expect(engine.stopCalls).toBe(0);
    engine.starts[1]!.resolve();
    await flushAsync();
    app.dispose();
  });

  it('falls back to 2D after a mounted WebGL scene reports a fatal error', () => {
    const scene = new RecoverableScene();
    const { app, root } = startApp({ scene });

    scene.callbacks.onFatalError?.(new Error('WebGL context lost'));

    expect(sceneHost(root).dataset.renderer).toBe('2d');
    expect(root.querySelector('[data-ui="fallback-2d"]')).not.toBeNull();
    expect(root.querySelectorAll('[data-ui="history-item"]')).toHaveLength(0);
    app.dispose();
  });

  it('continues an in-progress reveal on the 2D fallback without history', async () => {
    const scene = new RecoverableScene();
    const oldReveal = new Deferred<void>();
    scene.reveal = async (): Promise<void> => {
      scene.revealCalls += 1;
      await oldReveal.promise;
    };
    const { app, root } = startApp({ scene });
    const host = sceneHost(root);
    dispatchPointer(host, 'pointerdown');
    dispatchPointer(host, 'pointerup');
    await flushAsync();
    dispatchPointer(host, 'pointerdown');
    await flushAsync();

    scene.callbacks.onFatalError?.(new Error('WebGL context lost'));
    await flushAsync();

    expect(root.querySelector<HTMLElement>('[data-ui="fallback-2d"]')
      ?.dataset.phase).toBe('reading');
    expect(root.querySelectorAll('[data-ui="history-item"]')).toHaveLength(0);
    oldReveal.resolve();
    await flushAsync();
    expect(root.querySelectorAll('[data-ui="history-item"]')).toHaveLength(0);
    app.dispose();
  });

  it('rolls a pending held-card release back after a WebGL fatal error', async () => {
    const scene = new RecoverableScene();
    const oldRelease = new Deferred<'placed' | 'returned'>();
    scene.releaseHeldCard = () => oldRelease.promise;
    const { app, root } = startApp({ scene });
    const host = sceneHost(root);
    dispatchPointer(host, 'pointerdown');
    dispatchPointer(host, 'pointerup');
    await flushAsync();

    scene.callbacks.onFatalError?.(new Error('WebGL context lost'));
    await flushAsync();

    expect(root.querySelector<HTMLElement>('[data-ui="fallback-2d"]')
      ?.dataset.phase).toBe('carousel');
    expect(root.querySelectorAll('[data-ui="history-item"]')).toHaveLength(0);
    oldRelease.resolve('placed');
    await flushAsync();
    expect(root.querySelector<HTMLElement>('[data-ui="fallback-2d"]')
      ?.dataset.phase).toBe('carousel');
    app.dispose();
  });

  it('surfaces a runtime model failure with retry and pointer fallback', async () => {
    const { app, engine, root } = startApp();
    root.querySelector<HTMLButtonElement>(
      '[data-action="start-camera"]',
    )?.click();
    await flushAsync();

    engine.failAtRuntime(
      new GestureEngineError(
        'MODEL_ERROR',
        'Hand tracking stopped unexpectedly',
      ),
    );

    expect(root.querySelector('[data-ui="camera-message"]')?.textContent)
      .toContain('Hand tracking stopped unexpectedly');
    expect(root.querySelector('[data-action="retry-camera"]')).not.toBeNull();
    expect(root.querySelector('[data-action="use-pointer"]')).not.toBeNull();
    expect(root.querySelectorAll('[data-ui="history-item"]')).toHaveLength(0);
    app.dispose();
  });
});

describe('async operation ownership', () => {
  it('keeps a newer release locked when an older scene release settles', async () => {
    class EmittingGestureEngine implements GestureEnginePort {
      private onFrame: ((frame: GestureEngineFrame) => void) | undefined;

      async start(
        _video: HTMLVideoElement,
        onFrame: (frame: GestureEngineFrame) => void,
      ): Promise<void> {
        this.onFrame = onFrame;
      }

      stop(): void {}

      emit(frame: GestureEngineFrame): void {
        this.onFrame?.(frame);
      }
    }

    const root = createRoot();
    const engine = new EmittingGestureEngine();
    const scenes = [new RecoverableScene(), new RecoverableScene()];
    const releases = [new Deferred<'placed' | 'returned'>(), new Deferred<'placed' | 'returned'>()];
    const releaseCalls = [0, 0];
    scenes.forEach((candidate, index) => {
      candidate.releaseHeldCard = async () => {
        releaseCalls[index] += 1;
        return releases[index]!.promise;
      };
    });
    let sceneIndex = 0;
    const app = createTarotApp({
      root,
      dependencies: {
        gestureEngine: engine,
        createScene: (callbacks?: SceneCallbacks) => {
          const candidate = scenes[sceneIndex++]!;
          candidate.callbacks = callbacks ?? {};
          return candidate;
        },
      },
    });
    app.start();
    root.querySelector<HTMLButtonElement>(
      '[data-action="start-camera"]',
    )?.click();
    await flushAsync();

    emitStable(engine, pinchHand, [0, 20, 40, 60]);
    emitStable(engine, openHand, [100, 160, 220, 280]);
    expect(releaseCalls[0]).toBe(1);

    root.querySelector<HTMLButtonElement>(
      '[data-action="request-reset"]',
    )?.click();
    root.querySelector<HTMLButtonElement>(
      '[data-action="confirm-reset"]',
    )?.click();
    emitStable(engine, pinchHand, [400, 420, 440, 460]);
    emitStable(engine, openHand, [500, 560, 620, 680]);
    expect(releaseCalls[1]).toBe(1);

    releases[0]!.resolve('returned');
    await flushAsync();
    emitStable(engine, pinchHand, [800, 820, 840, 860]);
    emitStable(engine, openHand, [900, 960, 1_020, 1_080]);

    expect(releaseCalls[1]).toBe(1);
    releases[1]!.resolve('returned');
    await flushAsync();
    app.dispose();
  });
});

describe('recoverable texture failures', () => {
  it('retries a failed face reveal without archiving the unrevealed card', async () => {
    const scene = new RecoverableScene();
    scene.revealFailures = 1;
    const { app, root } = startApp({ scene });
    const host = sceneHost(root);

    dispatchPointer(host, 'pointerdown');
    dispatchPointer(host, 'pointerup');
    await flushAsync();
    dispatchPointer(host, 'pointerdown');
    await flushAsync();

    expect(scene.revealCalls).toBe(1);
    expect(root.querySelectorAll('[data-ui="history-item"]')).toHaveLength(0);
    const retry = root.querySelector<HTMLButtonElement>(
      '[data-action="retry-resource"]',
    );
    expect(retry).not.toBeNull();

    retry?.click();
    await flushAsync();

    expect(scene.revealCalls).toBe(2);
    expect(root.querySelector('[data-ui="resource-status"]')?.hasAttribute('hidden'))
      .toBe(true);
    expect(root.querySelectorAll('[data-ui="history-item"]')).toHaveLength(0);
    app.dispose();
  });

  it('offers a retry when cover loading fails while keeping the app usable', async () => {
    const { app, root, scene } = startApp();

    scene.callbacks.onResourceState?.({
      status: 'error',
      resource: 'card-back',
      error: new Error('cover unavailable'),
    });
    await flushAsync();

    expect(root.querySelector('[data-ui="resource-message"]')?.textContent)
      .toContain('cover unavailable');
    const retry = root.querySelector<HTMLButtonElement>(
      '[data-action="retry-resource"]',
    );
    expect(retry).not.toBeNull();

    dispatchPointer(sceneHost(root), 'pointerdown');
    expect(root.querySelectorAll('[data-ui="history-item"]')).toHaveLength(0);
    retry?.click();
    expect(scene.retryAssetCalls).toBe(1);
    app.dispose();
  });

  it('does not hide a face-loading state when an older cover load completes', async () => {
    const scene = new RecoverableScene();
    const reveal = new Deferred<void>();
    scene.reveal = async (): Promise<void> => {
      scene.revealCalls += 1;
      await reveal.promise;
    };
    const { app, root } = startApp({ scene });
    const host = sceneHost(root);
    dispatchPointer(host, 'pointerdown');
    dispatchPointer(host, 'pointerup');
    await flushAsync();
    dispatchPointer(host, 'pointerdown');
    await flushAsync();

    scene.callbacks.onResourceState?.({
      status: 'ready',
      resource: 'card-back',
    });

    expect(
      root.querySelector<HTMLElement>(
        '[data-ui="resource-status"]',
      )?.dataset.status,
    )
      .toBe('loading');
    reveal.resolve();
    await flushAsync();
    app.dispose();
  });

  it('restores a cover retry after an overlapping face load succeeds', async () => {
    const scene = new RecoverableScene();
    const reveal = new Deferred<void>();
    scene.reveal = async (): Promise<void> => {
      scene.revealCalls += 1;
      await reveal.promise;
    };
    const { app, root } = startApp({ scene });
    const host = sceneHost(root);
    dispatchPointer(host, 'pointerdown');
    dispatchPointer(host, 'pointerup');
    await flushAsync();
    dispatchPointer(host, 'pointerdown');
    await flushAsync();

    scene.callbacks.onResourceState?.({
      status: 'error',
      resource: 'card-back',
      error: new Error('cover unavailable'),
    });
    reveal.resolve();
    await flushAsync();

    expect(
      root.querySelector<HTMLElement>(
        '[data-ui="resource-status"]',
      )?.dataset.status,
    ).toBe('error');
    expect(root.querySelector('[data-ui="resource-message"]')?.textContent)
      .toContain('cover unavailable');
    expect(root.querySelector('[data-action="retry-resource"]')).not.toBeNull();
    app.dispose();
  });

  it('ignores a stale resource failure from a scene replaced by reset', () => {
    const root = createRoot();
    const scenes = [new RecoverableScene(), new RecoverableScene()];
    let sceneIndex = 0;
    const app = createTarotApp({
      root,
      dependencies: {
        gestureEngine: new RejectingGestureEngine(),
        createScene: (callbacks?: SceneCallbacks) => {
          const scene = scenes[sceneIndex++]!;
          scene.callbacks = callbacks ?? {};
          return scene;
        },
      },
    });
    app.start();

    root.querySelector<HTMLButtonElement>(
      '[data-action="request-reset"]',
    )?.click();
    root.querySelector<HTMLButtonElement>(
      '[data-action="confirm-reset"]',
    )?.click();
    scenes[0]!.callbacks.onResourceState?.({
      status: 'error',
      resource: 'card-back',
      error: new Error('stale cover failure'),
    });

    expect(
      root.querySelector<HTMLElement>(
        '[data-ui="resource-status"]',
      )?.hasAttribute('hidden'),
    ).toBe(true);
    app.dispose();
  });
});

describe('visibility and quality limits', () => {
  it('suspends and resumes the scene with document visibility', () => {
    const visibility = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('visible');
    const { app, scene } = startApp();
    scene.suspended = [];

    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(scene.suspended).toEqual([true, false]);
    app.dispose();
  });

  it('caps high-density rendering and particles on powerful devices', () => {
    expect(selectSceneQuality({
      devicePixelRatio: 8,
      hardwareConcurrency: 64,
      deviceMemory: 64,
      reducedMotion: false,
    })).toMatchObject({
      pixelRatio: 2,
      particleCount: 480,
    });
  });
});

describe('local gesture runtime assets', () => {
  it('resolves WASM and model files within the deployed application path', () => {
    expect(resolveGestureAssetPaths(
      new URL('https://tarot.example/apps/celestial/'),
    )).toEqual({
      wasmBasePath: 'https://tarot.example/apps/celestial/mediapipe/wasm',
      modelAssetPath:
        'https://tarot.example/apps/celestial/mediapipe/models/hand_landmarker.task',
    });
  });
});

describe('TarotScene asset scheduling', () => {
  it('settles cover first, then preloads a bounded face batch with limited concurrency', async () => {
    const cover = new Deferred<Texture>();
    const pendingFaces: Array<{
      readonly url: string;
      readonly deferred: Deferred<Texture>;
    }> = [];
    const calls: string[] = [];
    let activeFaces = 0;
    let maximumActiveFaces = 0;
    const loader = {
      loadAsync(url: string): Promise<Texture> {
        calls.push(url);
        if (url === CARD_BACK_URL) {
          return cover.promise;
        }
        activeFaces += 1;
        maximumActiveFaces = Math.max(maximumActiveFaces, activeFaces);
        const deferred = new Deferred<Texture>();
        pendingFaces.push({ url, deferred });
        return deferred.promise.finally(() => {
          activeFaces -= 1;
        });
      },
    } as Pick<TextureLoader, 'loadAsync'>;
    const { scene } = createConcreteScene(loader);
    const cards = makeCards(8);
    scene.setCards(cards.map(({ id }) => id));

    expect(calls).toEqual([CARD_BACK_URL]);
    cover.resolve(new Texture());
    await flushAsync();

    for (let index = 0; index < 8; index += 1) {
      const unresolved = pendingFaces.splice(0);
      for (const pending of unresolved) {
        pending.deferred.resolve(new Texture());
      }
      await flushAsync();
    }

    const faceCalls = calls.filter((url) => url !== CARD_BACK_URL);
    expect(faceCalls.length).toBeGreaterThan(0);
    expect(faceCalls.length).toBeLessThanOrEqual(4);
    expect(maximumActiveFaces).toBeLessThanOrEqual(2);
    scene.dispose();
  });

  it('keeps the internal styled back after cover failure and can retry it', async () => {
    const recoveredCover = new Texture();
    let attempts = 0;
    const states: SceneResourceState[] = [];
    const loader = {
      async loadAsync(url: string): Promise<Texture> {
        if (url !== CARD_BACK_URL) {
          return new Texture();
        }
        attempts += 1;
        if (attempts === 1) {
          throw new Error('cover failed');
        }
        return recoveredCover;
      },
    } as Pick<TextureLoader, 'loadAsync'>;
    const { renderer, runFrame, scene } = createConcreteScene(
      loader,
      (state) => states.push(state),
    );
    scene.setCards([TAROT_CARDS[0]!.id]);
    await flushAsync();
    runFrame();

    const material = findBackMaterial(renderer.lastScene);
    expect(material.map).toBeNull();
    expect(material.color.getHex()).not.toBe(0xffffff);
    expect(states.at(-1)).toMatchObject({
      status: 'error',
      resource: 'card-back',
    });

    await scene.retryFailedAssets();

    expect(attempts).toBe(2);
    expect(material.map).toBe(recoveredCover);
    expect(states.at(-1)).toMatchObject({
      status: 'ready',
      resource: 'card-back',
    });
    scene.dispose();
  });

  it('stops scheduling render frames while suspended and resumes once visible', () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    const cancelled: number[] = [];
    let nextId = 1;
    const { renderer, scene } = createConcreteScene(
      { loadAsync: async () => new Texture() },
      undefined,
      {
        requestFrame(callback) {
          const id = nextId++;
          callbacks.set(id, callback);
          return id;
        },
        cancelFrame(handle) {
          cancelled.push(handle);
          callbacks.delete(handle);
        },
      },
    );

    const first = callbacks.entries().next().value as
      | [number, FrameRequestCallback]
      | undefined;
    expect(first).toBeDefined();
    callbacks.delete(first![0]);
    first![1](16);
    expect(renderer.renderCalls).toBe(1);

    scene.setSuspended(true);
    expect(cancelled).toContain(2);
    expect(callbacks.size).toBe(0);

    scene.setSuspended(false);
    expect(callbacks.size).toBe(1);
    scene.dispose();
  });

  it('pauses an active card tween while hidden and resumes without a time jump', () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextId = 1;
    const renderer = new InspectingRenderer();
    const host = document.createElement('div');
    Object.defineProperties(host, {
      clientWidth: { value: 800 },
      clientHeight: { value: 600 },
    });
    const scene = new TarotScene({
      cards: TAROT_CARDS,
      capabilities: {
        devicePixelRatio: 1,
        hardwareConcurrency: 4,
        deviceMemory: 4,
        reducedMotion: true,
      },
      rendererFactory: () => renderer,
      textureLoader: { loadAsync: async () => new Texture() },
      requestFrame(callback) {
        const id = nextId++;
        callbacks.set(id, callback);
        return id;
      },
      cancelFrame(handle) {
        callbacks.delete(handle);
      },
      now: () => 0,
    }).mount(host);
    scene.setCards([TAROT_CARDS[0]!.id]);

    runScheduledFrames(callbacks, 80);
    const card = renderer.lastScene?.children.find(
      (child): child is Group => child instanceof Group,
    );
    expect(card).toBeDefined();
    const beforeHidden = card!.scale.x;

    scene.setSuspended(true);
    expect(callbacks.size).toBe(0);
    scene.setSuspended(false);
    runScheduledFrames(callbacks, 1_080);

    expect(card!.scale.x).toBeCloseTo(beforeHidden);
    runScheduledFrames(callbacks, 1_160);
    expect(card!.scale.x).toBeGreaterThan(beforeHidden);
    scene.dispose();
  });

  it('does not count hidden time for a tween created while already suspended', () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextId = 1;
    const renderer = new InspectingRenderer();
    const host = document.createElement('div');
    Object.defineProperties(host, {
      clientWidth: { value: 800 },
      clientHeight: { value: 600 },
    });
    const scene = new TarotScene({
      cards: TAROT_CARDS,
      capabilities: {
        devicePixelRatio: 1,
        hardwareConcurrency: 4,
        deviceMemory: 4,
        reducedMotion: true,
      },
      rendererFactory: () => renderer,
      textureLoader: { loadAsync: async () => new Texture() },
      requestFrame(callback) {
        const id = nextId++;
        callbacks.set(id, callback);
        return id;
      },
      cancelFrame(handle) {
        callbacks.delete(handle);
      },
      now: () => 0,
    }).mount(host);
    scene.setSuspended(true);
    scene.setCards([TAROT_CARDS[0]!.id]);

    scene.setSuspended(false);
    runScheduledFrames(callbacks, 1_080);
    const card = renderer.lastScene?.children.find(
      (child): child is Group => child instanceof Group,
    );
    expect(card).toBeDefined();
    expect(card!.scale.x).toBeCloseTo(1);
    runScheduledFrames(callbacks, 1_160);
    expect(card!.scale.x).toBeGreaterThan(1);
    scene.dispose();
  });

  it('reports a renderer exception as a one-shot runtime fatal error', () => {
    const fatalErrors: Error[] = [];
    const renderError = new Error('renderer failed');
    const { renderer, runFrame, scene } = createConcreteScene(
      { loadAsync: async () => new Texture() },
      undefined,
      { onFatalError: (error) => fatalErrors.push(error) },
    );
    renderer.render = (): void => {
      throw renderError;
    };

    runFrame();
    runFrame();

    expect(fatalErrors).toEqual([renderError]);
    scene.dispose();
  });

  it('prevents default context-loss handling and reports the loss once', () => {
    const fatalErrors: Error[] = [];
    const { renderer, scene } = createConcreteScene(
      { loadAsync: async () => new Texture() },
      undefined,
      { onFatalError: (error) => fatalErrors.push(error) },
    );
    const event = new Event('webglcontextlost', { cancelable: true });

    renderer.domElement.dispatchEvent(event);
    renderer.domElement.dispatchEvent(
      new Event('webglcontextlost', { cancelable: true }),
    );

    expect(event.defaultPrevented).toBe(true);
    expect(fatalErrors).toHaveLength(1);
    expect(fatalErrors[0]?.message).toContain('context');
    scene.dispose();
  });

  it('disposes preloaded face textures when their cards leave the scene', async () => {
    const cards = makeCards(8);
    const faceTextures = new Map<string, Texture>();
    const disposed = new Set<string>();
    const loader = {
      async loadAsync(url: string): Promise<Texture> {
        const texture = new Texture();
        if (url !== CARD_BACK_URL) {
          faceTextures.set(url, texture);
          texture.addEventListener('dispose', () => {
            disposed.add(url);
          });
        }
        return texture;
      },
    } as Pick<TextureLoader, 'loadAsync'>;
    const { scene } = createConcreteScene(loader);
    scene.setCards(cards.map(({ id }) => id));
    await flushAsync();
    await flushAsync();

    const loadedUrls = [...faceTextures.keys()];
    expect(loadedUrls.length).toBeGreaterThan(0);
    scene.setCards(cards.slice(4).map(({ id }) => id));

    expect(loadedUrls.every((url) => disposed.has(url))).toBe(true);
    scene.dispose();
  });

  it('evicts cached faces outside a reordered four-card preload window', async () => {
    const cards = makeCards(8);
    const faceTextures = new Map<string, Texture>();
    const disposed = new Set<string>();
    const loader = {
      async loadAsync(url: string): Promise<Texture> {
        const texture = new Texture();
        if (url !== CARD_BACK_URL) {
          faceTextures.set(url, texture);
          texture.addEventListener('dispose', () => disposed.add(url));
        }
        return texture;
      },
    } as Pick<TextureLoader, 'loadAsync'>;
    const { scene } = createConcreteScene(loader);
    scene.setCards(cards.map(({ id }) => id));
    await vi.waitFor(() => expect(faceTextures.size).toBe(4));
    const initialUrls = [...faceTextures.keys()];

    scene.setCards([...cards].reverse().map(({ id }) => id));
    await vi.waitFor(() => {
      expect(initialUrls.every((url) => disposed.has(url))).toBe(true);
    });

    scene.dispose();
  });
});

function runScheduledFrames(
  callbacks: Map<number, FrameRequestCallback>,
  timestamp: number,
): void {
  const scheduled = [...callbacks.entries()];
  callbacks.clear();
  for (const [, callback] of scheduled) {
    callback(timestamp);
  }
}

function createConcreteScene(
  textureLoader: Pick<TextureLoader, 'loadAsync'>,
  onResourceState?: (state: SceneResourceState) => void,
  frames: {
    readonly requestFrame?: (callback: FrameRequestCallback) => number;
    readonly cancelFrame?: (handle: number) => void;
    readonly onFatalError?: (error: Error) => void;
  } = {},
): {
  readonly renderer: InspectingRenderer;
  readonly runFrame: (time?: number) => void;
  readonly scene: TarotScene;
} {
  const renderer = new InspectingRenderer();
  let pendingFrame: FrameRequestCallback | undefined;
  let nextFrameId = 1;
  const host = document.createElement('div');
  Object.defineProperties(host, {
    clientWidth: { value: 800 },
    clientHeight: { value: 600 },
  });
  const scene = new TarotScene({
    cards: TAROT_CARDS,
    capabilities: {
      devicePixelRatio: 2,
      hardwareConcurrency: 8,
      deviceMemory: 8,
      reducedMotion: true,
    },
    rendererFactory: () => renderer,
    textureLoader,
    animate: async (_duration, update) => update(1),
    requestFrame:
      frames.requestFrame
      ?? ((callback) => {
        pendingFrame = callback;
        return nextFrameId++;
      }),
    cancelFrame: frames.cancelFrame ?? (() => undefined),
    now: () => 0,
    onResourceState,
    onFatalError: frames.onFatalError,
  });
  scene.mount(host);
  return {
    renderer,
    runFrame(time = 0): void {
      const callback = pendingFrame;
      pendingFrame = undefined;
      callback?.(time);
    },
    scene,
  };
}

function findBackMaterial(scene: Scene | null): MeshBasicMaterial {
  let material: MeshBasicMaterial | null = null;
  scene?.traverse((object) => {
    if (
      object.name === 'tarot-card-back'
      && 'material' in object
      && object.material instanceof MeshBasicMaterial
    ) {
      material = object.material;
    }
  });
  if (material === null) {
    throw new Error('Expected a styled tarot card back');
  }
  return material;
}
