import {
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
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

export interface TarotRenderer {
  readonly domElement: HTMLCanvasElement;
  setPixelRatio(pixelRatio: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: Scene, camera: Camera): void;
  dispose(): void;
}

export type ReleaseResult = 'placed' | 'returned' | null;

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
}

interface PendingAnimation {
  handle: number;
  reject: (error: Error) => void;
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
  private readonly animate: CardAnimation;
  private readonly archiveParticles: ArchiveParticles;
  private readonly pendingAnimations = new Set<PendingAnimation>();

  private order: string[] = [];
  private element: HTMLElement | undefined;
  private renderer: TarotRenderer | undefined;
  private renderFrame: number | undefined;
  private pointer: PointerPoint = { x: 0.5, y: 0.5 };
  private lastHeldPointer: PointerPoint = { x: 0.5, y: 0.5 };
  private hoveredId: string | null = null;
  private selectedId: string | null = null;
  private coverTexture: Texture | undefined;
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
    element.append(this.renderer.domElement);
    this.resize();
    void this.loadCardBack();
    this.renderFrame = this.requestFrame(this.renderLoop);
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
    const id = this.hoveredId ?? this.order[0] ?? null;
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

    await view.reveal(card, orientation);
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
      this.cancelFrame(animation.handle);
      animation.reject(new Error('Tarot scene was disposed'));
    }
    this.pendingAnimations.clear();

    this.archiveParticles.dispose();
    for (const view of this.views.values()) {
      view.dispose();
    }
    this.views.clear();
    this.order = [];
    this.coverTexture?.dispose();
    this.coverTexture = undefined;
    this.backMaterial.dispose();
    this.geometry.dispose();

    if (this.renderer) {
      const canvas = this.renderer.domElement;
      this.renderer.dispose();
      canvas.remove();
      this.renderer = undefined;
    }
    this.element = undefined;
    this.selectedId = null;
    this.hoveredId = null;
  }

  private readonly renderLoop: FrameRequestCallback = (time) => {
    if (this.disposed || !this.renderer) {
      return;
    }

    this.applyCarouselLayout(time);
    this.updateHoveredCard();
    this.renderer.render(this.scene, this.camera);
    this.renderFrame = this.requestFrame(this.renderLoop);
  };

  private applyCarouselLayout(time: number): void {
    for (const transform of layoutCarousel(this.order, time)) {
      this.views.get(transform.id)?.applyCarouselTransform(transform);
    }
  }

  private updateHoveredCard(): void {
    if (this.selectedId || this.order.length === 0) {
      return;
    }

    let nearestId: string | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const id of this.order) {
      const view = this.views.get(id);
      if (!view) {
        continue;
      }
      const projected = view.object.position.clone().project(this.camera);
      const screenX = (projected.x + 1) / 2;
      const screenY = (1 - projected.y) / 2;
      const distance = Math.hypot(
        screenX - this.pointer.x,
        screenY - this.pointer.y,
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestId = id;
      }
    }

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

  private async loadCardBack(): Promise<void> {
    try {
      const texture = await this.textureLoader.loadAsync(CARD_BACK_URL);
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
    } catch (error) {
      this.reportError(
        error instanceof Error
          ? error
          : new Error('Card back texture failed to load'),
      );
    }
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

      const start = this.now();
      const pending: PendingAnimation = {
        handle: 0,
        reject,
      };
      const step: FrameRequestCallback = (time) => {
        this.pendingAnimations.delete(pending);
        if (this.disposed) {
          reject(new Error('Tarot scene was disposed'));
          return;
        }

        const progress =
          durationMs <= 0 ? 1 : clamp((time - start) / durationMs, 0, 1);
        update(progress);
        if (progress >= 1) {
          resolve();
          return;
        }

        pending.handle = this.requestFrame(step);
        this.pendingAnimations.add(pending);
      };
      pending.handle = this.requestFrame(step);
      this.pendingAnimations.add(pending);
    });
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
