import {
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  Vector2,
  WebGLRenderer,
  type Camera,
  type Texture,
} from 'three';

import { TAROT_CARDS } from '../tarot/cards';
import type { TarotCard, TarotOrientation } from '../tarot/types';
import type { PointerPoint } from '../gestures/pointer-filter';
import { ArchiveParticles } from './archive-particles';
import { layoutCarousel } from './card-carousel';
import {
  CardView,
  type CardAnimation,
} from './card-view';
import {
  selectSceneQuality,
  type DeviceCapabilities,
  type SceneQuality,
} from './quality';

export const CARD_BACK_URL = new URL(
  '../../tarot_img/cover.jpg',
  import.meta.url,
).href;

const FACE_PRELOAD_BATCH_SIZE = 4;
const FACE_PRELOAD_CONCURRENCY = 2;

export interface TarotRenderer {
  readonly domElement: HTMLCanvasElement;
  setPixelRatio(pixelRatio: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: Scene, camera: Camera): void;
  dispose(): void;
}

export type ReleaseResult = 'placed' | 'returned' | null;

export type SceneResource = 'card-back';

export type SceneResourceState =
  | {
      readonly status: 'loading';
      readonly resource: SceneResource;
    }
  | {
      readonly status: 'ready';
      readonly resource: SceneResource;
    }
  | {
      readonly status: 'error';
      readonly resource: SceneResource;
      readonly error: Error;
    };

export interface TarotSceneOptions {
  readonly cards?: readonly TarotCard[];
  readonly capabilities?: DeviceCapabilities;
  readonly rendererFactory?: () => TarotRenderer;
  readonly textureLoader?: Pick<TextureLoader, 'loadAsync'>;
  readonly animate?: CardAnimation;
  readonly requestFrame?: (callback: FrameRequestCallback) => number;
  readonly cancelFrame?: (handle: number) => void;
  readonly now?: () => number;
  readonly onError?: (error: Error) => void;
  readonly onFatalError?: (error: Error) => void;
  readonly onResourceState?: (state: SceneResourceState) => void;
}

interface PendingAnimation {
  handle?: number;
  elapsedMs: number;
  lastFrameTime?: number;
  readonly durationMs: number;
  readonly update: (progress: number) => void;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  step: FrameRequestCallback;
}

export class TarotScene {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(42, 1, 0.1, 100);
  private readonly cardsById: ReadonlyMap<string, TarotCard>;
  private readonly quality: SceneQuality;
  private readonly textureLoader: Pick<TextureLoader, 'loadAsync'>;
  private readonly geometry = new PlaneGeometry(1.4, 2.4, 1, 1);
  private readonly backMaterial = new MeshBasicMaterial({
    color: 0x21172f,
  });
  private readonly views = new Map<string, CardView>();
  private readonly rendererFactory: () => TarotRenderer;
  private readonly requestFrame: (callback: FrameRequestCallback) => number;
  private readonly cancelFrame: (handle: number) => void;
  private readonly now: () => number;
  private readonly onError?: (error: Error) => void;
  private readonly onFatalError?: (error: Error) => void;
  private readonly onResourceState?: (state: SceneResourceState) => void;
  private readonly animate: CardAnimation;
  private readonly archiveParticles: ArchiveParticles;
  private readonly pendingAnimations = new Set<PendingAnimation>();
  private readonly raycaster = new Raycaster();

  private order: string[] = [];
  private element: HTMLElement | undefined;
  private renderer: TarotRenderer | undefined;
  private renderFrame: number | undefined;
  private pointer: PointerPoint = { x: 0.5, y: 0.5 };
  private lastHeldPointer: PointerPoint = { x: 0.5, y: 0.5 };
  private hoveredId: string | null = null;
  private selectedId: string | null = null;
  private coverTexture: Texture | undefined;
  private readonly preloadedFaces = new Map<string, Texture>();
  private readonly faceLoads = new Map<string, Promise<void>>();
  private facePreloadQueue: string[] = [];
  private activeFacePreloads = 0;
  private coverLoad: Promise<void> | undefined;
  private coverSettled = false;
  private cardBackFailed = false;
  private suspended = false;
  private fatalReported = false;
  private disposed = false;

  constructor(options: TarotSceneOptions = {}) {
    const cards = options.cards ?? TAROT_CARDS;
    this.cardsById = new Map(cards.map((card) => [card.id, card]));
    this.quality = selectSceneQuality(
      options.capabilities ?? detectDeviceCapabilities(),
    );
    this.textureLoader = options.textureLoader ?? new TextureLoader();
    this.rendererFactory =
      options.rendererFactory ??
      (() => new WebGLRenderer({ antialias: true, alpha: true }));
    this.requestFrame = options.requestFrame ?? defaultRequestFrame;
    this.cancelFrame = options.cancelFrame ?? defaultCancelFrame;
    this.now = options.now ?? (() => performance.now());
    this.onError = options.onError;
    this.onFatalError = options.onFatalError;
    this.onResourceState = options.onResourceState;
    this.animate =
      options.animate ??
      ((durationMs, update) => this.animateWithFrames(durationMs, update));

    this.camera.position.set(0, 1.2, 11);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();

    this.archiveParticles = new ArchiveParticles({
      scene: this.scene,
      particleCount: this.quality.particleCount,
      animate: this.animate,
    });
  }

  static mount(
    element: HTMLElement,
    options: TarotSceneOptions = {},
  ): TarotScene {
    return new TarotScene(options).mount(element);
  }

  get cardIds(): readonly string[] {
    return [...this.order];
  }

  get heldCardId(): string | null {
    return this.selectedId;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  mount(element: HTMLElement): this {
    this.assertUsable();
    if (this.element && this.element !== element) {
      throw new Error('Tarot scene is already mounted');
    }
    if (this.renderer) {
      return this;
    }

    this.element = element;
    this.renderer = this.rendererFactory();
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.domElement.addEventListener(
      'webglcontextlost',
      this.handleContextLost,
    );
    element.append(this.renderer.domElement);
    this.resize();
    void this.loadCardBack();
    this.startRenderLoop();
    return this;
  }

  setCards(ids: readonly string[]): void {
    this.assertUsable();
    const uniqueIds = new Set(ids);
    if (uniqueIds.size !== ids.length) {
      throw new Error('Carousel card IDs must be unique');
    }
    for (const id of ids) {
      if (!this.cardsById.has(id)) {
        throw new Error(`Unknown tarot card ID: ${id}`);
      }
    }

    for (const [id, view] of this.views) {
      if (!uniqueIds.has(id)) {
        view.dispose();
        this.views.delete(id);
        this.releasePreloadedFace(id);
        if (this.selectedId === id) {
          this.selectedId = null;
        }
      }
    }

    for (const id of ids) {
      if (!this.views.has(id)) {
        const view = new CardView({
          id,
          geometry: this.geometry,
          backMaterial: this.backMaterial,
          textureLoader: this.textureLoader,
          animate: this.animate,
        });
        this.views.set(id, view);
        this.scene.add(view.object);
      }
    }

    this.order = [...ids];
    this.applyCarouselLayout(this.now());
    this.updateHoveredCard();
    this.scheduleFacePreloads();
  }

  setPointer(point: PointerPoint): void {
    this.assertUsable();
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new RangeError('Pointer coordinates must be finite');
    }

    this.pointer = {
      x: clamp(point.x, 0, 1),
      y: clamp(point.y, 0, 1),
    };
    if (this.selectedId) {
      this.lastHeldPointer = this.pointer;
      return;
    }
    this.updateHoveredCard();
  }

  pickCard(): string | null {
    this.assertUsable();
    if (this.selectedId) {
      return this.selectedId;
    }

    this.updateHoveredCard();
    const id = this.hoveredId;
    if (!id) {
      return null;
    }

    const view = this.views.get(id)!;
    view.hold();
    this.selectedId = id;
    this.lastHeldPointer = this.pointer;
    return id;
  }

  moveHeldCard(point: PointerPoint): void {
    this.assertUsable();
    const id = this.selectedId;
    if (!id) {
      return;
    }

    this.setPointer(point);
    const view = this.views.get(id);
    if (!view) {
      return;
    }
    view.moveHeldCard(
      pointerToWorld(this.pointer, this.camera, 1.8),
    );
  }

  async releaseHeldCard(): Promise<ReleaseResult> {
    this.assertUsable();
    const id = this.selectedId;
    if (!id) {
      return null;
    }

    const view = this.views.get(id);
    if (!view) {
      this.selectedId = null;
      return null;
    }

    if (isInRevealZone(this.lastHeldPointer)) {
      await view.placeAtCenter();
      return 'placed';
    }

    await view.releaseHeldCard();
    this.selectedId = null;
    this.updateHoveredCard();
    return 'returned';
  }

  async reveal(
    card: TarotCard,
    orientation: TarotOrientation,
  ): Promise<void> {
    this.assertUsable();
    const view = this.selectedView(card.id);
    if (view.state !== 'placed') {
      throw new Error('Card must be placed in the center before reveal');
    }

    const pendingFace = this.faceLoads.get(card.id);
    if (pendingFace !== undefined) {
      await pendingFace;
    }
    const preloadedTexture = this.preloadedFaces.get(card.id);
    this.preloadedFaces.delete(card.id);
    await view.reveal(card, orientation, preloadedTexture);
  }

  async archive(targetRect: DOMRect): Promise<void> {
    this.assertUsable();
    const view = this.selectedView();
    if (!view.isRevealed) {
      throw new Error('Cannot archive a card before it is revealed');
    }

    const target = historyTargetToWorld(
      targetRect,
      this.viewportRect(),
      this.camera,
    );
    await this.archiveParticles.archive(
      view,
      target,
      this.quality.particleCount === 0,
    );

    const archivedId = view.id;
    view.dispose();
    this.views.delete(archivedId);
    this.order = this.order.filter((id) => id !== archivedId);
    this.selectedId = null;
    this.hoveredId = null;
    this.applyCarouselLayout(this.now());
  }

  resize(): void {
    this.assertUsable();
    if (!this.renderer || !this.element) {
      return;
    }

    const width = Math.max(this.element.clientWidth, 1);
    const height = Math.max(this.element.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.renderer.setSize(width, height, false);
  }

  setSuspended(suspended: boolean): void {
    this.assertUsable();
    if (this.suspended === suspended) {
      return;
    }
    this.suspended = suspended;
    if (suspended) {
      if (this.renderFrame !== undefined) {
        this.cancelFrame(this.renderFrame);
        this.renderFrame = undefined;
      }
      for (const animation of this.pendingAnimations) {
        if (animation.handle !== undefined) {
          this.cancelFrame(animation.handle);
          animation.handle = undefined;
        }
        animation.lastFrameTime = undefined;
      }
      return;
    }
    if (this.fatalReported) {
      return;
    }
    this.startRenderLoop();
    for (const animation of this.pendingAnimations) {
      this.scheduleAnimation(animation);
    }
  }

  retryFailedAssets(): Promise<void> {
    this.assertUsable();
    return this.cardBackFailed
      ? this.loadCardBack()
      : Promise.resolve();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    if (this.renderFrame !== undefined) {
      this.cancelFrame(this.renderFrame);
      this.renderFrame = undefined;
    }
    for (const animation of this.pendingAnimations) {
      if (animation.handle !== undefined) {
        this.cancelFrame(animation.handle);
      }
      animation.reject(new Error('Tarot scene was disposed'));
    }
    this.pendingAnimations.clear();

    this.archiveParticles.dispose();
    for (const view of this.views.values()) {
      view.dispose();
    }
    this.views.clear();
    this.order = [];
    for (const texture of this.preloadedFaces.values()) {
      texture.dispose();
    }
    this.preloadedFaces.clear();
    this.facePreloadQueue = [];
    this.coverTexture?.dispose();
    this.coverTexture = undefined;
    this.backMaterial.dispose();
    this.geometry.dispose();

    if (this.renderer) {
      const canvas = this.renderer.domElement;
      canvas.removeEventListener(
        'webglcontextlost',
        this.handleContextLost,
      );
      this.renderer.dispose();
      canvas.remove();
      this.renderer = undefined;
    }
    this.element = undefined;
    this.selectedId = null;
    this.hoveredId = null;
  }

  private readonly renderLoop: FrameRequestCallback = (time) => {
    this.renderFrame = undefined;
    if (this.disposed || this.suspended || !this.renderer) {
      return;
    }

    try {
      this.applyCarouselLayout(time);
      this.updateHoveredCard();
      this.renderer.render(this.scene, this.camera);
    } catch (error) {
      this.reportFatalError(error);
      return;
    }
    this.startRenderLoop();
  };

  private startRenderLoop(): void {
    if (
      this.disposed
      || this.suspended
      || !this.renderer
      || this.renderFrame !== undefined
    ) {
      return;
    }
    this.renderFrame = this.requestFrame(this.renderLoop);
  }

  private applyCarouselLayout(time: number): void {
    for (const transform of layoutCarousel(this.order, time)) {
      this.views.get(transform.id)?.applyCarouselTransform(transform);
    }
  }

  private updateHoveredCard(): void {
    if (this.selectedId || this.order.length === 0) {
      return;
    }

    this.scene.updateMatrixWorld(true);
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(
      new Vector2(this.pointer.x * 2 - 1, 1 - this.pointer.y * 2),
      this.camera,
    );
    const pickTargets = this.order.flatMap((id) => {
      const view = this.views.get(id);
      return view ? [view.pickTarget] : [];
    });
    const nearest = this.raycaster.intersectObjects(pickTargets, false)[0];
    const nearestId =
      this.order.find((id) => this.views.get(id)?.pickTarget === nearest?.object) ??
      null;

    if (nearestId === this.hoveredId) {
      return;
    }

    const previous = this.hoveredId ? this.views.get(this.hoveredId) : undefined;
    if (previous) {
      void previous.setHovered(false).catch((error: unknown) => {
        this.reportError(error);
      });
    }
    this.hoveredId = nearestId;
    const next = nearestId ? this.views.get(nearestId) : undefined;
    if (next) {
      void next.setHovered(true).catch((error: unknown) => {
        this.reportError(error);
      });
    }
  }

  private selectedView(expectedId?: string): CardView {
    if (!this.selectedId) {
      throw new Error('No card is currently held');
    }
    if (expectedId && this.selectedId !== expectedId) {
      throw new Error(
        `Selected card ${this.selectedId} does not match ${expectedId}`,
      );
    }

    const view = this.views.get(this.selectedId);
    if (!view) {
      throw new Error('Selected card is no longer in the carousel');
    }
    return view;
  }

  private viewportRect(): DOMRect {
    const bounds = this.element?.getBoundingClientRect();
    const width =
      bounds?.width ||
      this.element?.clientWidth ||
      globalThis.innerWidth ||
      1;
    const height =
      bounds?.height ||
      this.element?.clientHeight ||
      globalThis.innerHeight ||
      1;
    const left = bounds?.left ?? 0;
    const top = bounds?.top ?? 0;
    return createRect(left, top, width, height);
  }

  private loadCardBack(): Promise<void> {
    if (this.coverLoad !== undefined) {
      return this.coverLoad;
    }
    this.onResourceState?.({
      status: 'loading',
      resource: 'card-back',
    });
    const load = this.textureLoader
      .loadAsync(CARD_BACK_URL)
      .then((texture) => {
        if (this.disposed) {
          texture.dispose();
          return;
        }

        texture.colorSpace = SRGBColorSpace;
        this.coverTexture?.dispose();
        this.coverTexture = texture;
        this.backMaterial.map = texture;
        this.backMaterial.color.set(0xffffff);
        this.backMaterial.needsUpdate = true;
        this.cardBackFailed = false;
        this.onResourceState?.({
          status: 'ready',
          resource: 'card-back',
        });
      })
      .catch((error: unknown) => {
        const resourceError =
          error instanceof Error
            ? error
            : new Error('Card back texture failed to load');
        this.cardBackFailed = true;
        this.backMaterial.map = null;
        this.backMaterial.color.set(0x21172f);
        this.backMaterial.needsUpdate = true;
        this.onResourceState?.({
          status: 'error',
          resource: 'card-back',
          error: resourceError,
        });
        this.reportError(resourceError);
      })
      .finally(() => {
        this.coverLoad = undefined;
        this.coverSettled = true;
        this.scheduleFacePreloads();
      });
    this.coverLoad = load;
    return load;
  }

  private scheduleFacePreloads(): void {
    if (!this.coverSettled || this.disposed) {
      return;
    }
    const desired = this.preloadWindow();
    const desiredSet = new Set(desired);
    for (const id of this.preloadedFaces.keys()) {
      if (!desiredSet.has(id)) {
        this.releasePreloadedFace(id);
      }
    }
    this.facePreloadQueue = this.facePreloadQueue.filter((id) =>
      desiredSet.has(id),
    );
    for (const id of desired) {
      if (
        !this.preloadedFaces.has(id)
        && !this.faceLoads.has(id)
        && !this.facePreloadQueue.includes(id)
      ) {
        this.facePreloadQueue.push(id);
      }
    }
    this.pumpFacePreloads();
  }

  private preloadWindow(): readonly string[] {
    return this.order.slice(0, FACE_PRELOAD_BATCH_SIZE);
  }

  private pumpFacePreloads(): void {
    while (
      !this.disposed
      && this.activeFacePreloads < FACE_PRELOAD_CONCURRENCY
      && this.facePreloadQueue.length > 0
    ) {
      const id = this.facePreloadQueue.shift();
      if (id === undefined) {
        return;
      }
      this.activeFacePreloads += 1;
      void this.preloadFace(id).finally(() => {
        this.activeFacePreloads -= 1;
        this.scheduleFacePreloads();
      });
    }
  }

  private preloadFace(id: string): Promise<void> {
    const existing = this.faceLoads.get(id);
    if (existing !== undefined) {
      return existing;
    }
    const card = this.cardsById.get(id);
    if (card === undefined) {
      return Promise.resolve();
    }
    const load = this.textureLoader
      .loadAsync(card.image)
      .then((texture) => {
        if (this.disposed || !this.preloadWindow().includes(id)) {
          texture.dispose();
          return;
        }
        texture.colorSpace = SRGBColorSpace;
        this.releasePreloadedFace(id);
        this.preloadedFaces.set(id, texture);
      })
      .catch(() => undefined)
      .finally(() => {
        this.faceLoads.delete(id);
      });
    this.faceLoads.set(id, load);
    return load;
  }

  private releasePreloadedFace(id: string): void {
    this.preloadedFaces.get(id)?.dispose();
    this.preloadedFaces.delete(id);
  }

  private animateWithFrames(
    durationMs: number,
    update: (progress: number) => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.disposed) {
        reject(new Error('Tarot scene was disposed'));
        return;
      }

      const pending: PendingAnimation = {
        elapsedMs: 0,
        lastFrameTime: this.suspended ? undefined : this.now(),
        durationMs,
        update,
        resolve,
        reject,
        step: () => undefined,
      };
      const step: FrameRequestCallback = (time) => {
        pending.handle = undefined;
        if (this.disposed) {
          this.pendingAnimations.delete(pending);
          reject(new Error('Tarot scene was disposed'));
          return;
        }
        if (this.suspended) {
          pending.lastFrameTime = undefined;
          return;
        }

        if (pending.lastFrameTime === undefined) {
          pending.lastFrameTime = time;
        } else {
          pending.elapsedMs += Math.max(0, time - pending.lastFrameTime);
          pending.lastFrameTime = time;
        }
        const progress =
          durationMs <= 0
            ? 1
            : clamp(pending.elapsedMs / durationMs, 0, 1);
        update(progress);
        if (progress >= 1) {
          this.pendingAnimations.delete(pending);
          resolve();
          return;
        }

        this.scheduleAnimation(pending);
      };
      pending.step = step;
      this.pendingAnimations.add(pending);
      this.scheduleAnimation(pending);
    });
  }

  private scheduleAnimation(animation: PendingAnimation): void {
    if (
      this.disposed
      || this.suspended
      || animation.handle !== undefined
      || !this.pendingAnimations.has(animation)
    ) {
      return;
    }
    animation.handle = this.requestFrame(animation.step);
  }

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.reportFatalError(new Error('WebGL context was lost'));
  };

  private reportFatalError(error: unknown): void {
    if (this.disposed || this.fatalReported) {
      return;
    }
    this.fatalReported = true;
    this.setSuspended(true);
    this.onFatalError?.(
      error instanceof Error ? error : new Error('Tarot rendering failed'),
    );
  }

  private reportError(error: unknown): void {
    this.onError?.(
      error instanceof Error ? error : new Error('Unknown tarot scene error'),
    );
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw new Error('Tarot scene has been disposed');
    }
  }
}

export function historyTargetToWorld(
  targetRect: DOMRect,
  viewportRect: DOMRect,
  camera: PerspectiveCamera,
): Vector3 {
  const center = {
    x: targetRect.left + targetRect.width / 2,
    y: targetRect.top + targetRect.height / 2,
  };
  const pointer = {
    x: (center.x - viewportRect.left) / Math.max(viewportRect.width, 1),
    y: (center.y - viewportRect.top) / Math.max(viewportRect.height, 1),
  };
  return pointerToWorld(pointer, camera, 0);
}

function pointerToWorld(
  pointer: PointerPoint,
  camera: PerspectiveCamera,
  planeZ: number,
): Vector3 {
  const projected = new Vector3(
    pointer.x * 2 - 1,
    1 - pointer.y * 2,
    0.5,
  ).unproject(camera);
  const direction = projected.sub(camera.position).normalize();
  if (Math.abs(direction.z) < Number.EPSILON) {
    return new Vector3(camera.position.x, camera.position.y, planeZ);
  }

  const distance = (planeZ - camera.position.z) / direction.z;
  return camera.position.clone().add(direction.multiplyScalar(distance));
}

function isInRevealZone(point: PointerPoint): boolean {
  return Math.abs(point.x - 0.5) <= 0.18 && Math.abs(point.y - 0.5) <= 0.22;
}

function detectDeviceCapabilities(): DeviceCapabilities {
  const navigatorWithMemory = globalThis.navigator as Navigator & {
    readonly deviceMemory?: number;
  };
  return {
    devicePixelRatio: globalThis.devicePixelRatio ?? 1,
    hardwareConcurrency: navigatorWithMemory.hardwareConcurrency,
    deviceMemory: navigatorWithMemory.deviceMemory,
    reducedMotion:
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
      false,
  };
}

function createRect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

const defaultRequestFrame = (callback: FrameRequestCallback): number =>
  globalThis.requestAnimationFrame(callback);

const defaultCancelFrame = (handle: number): void => {
  globalThis.cancelAnimationFrame(handle);
};
