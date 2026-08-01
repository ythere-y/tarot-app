import {
  Group,
  Mesh,
  MeshBasicMaterial,
  SRGBColorSpace,
  type Material,
  type PlaneGeometry,
  type Texture,
  type TextureLoader,
} from 'three';

import type { TarotCard, TarotOrientation } from '../tarot/types';
import type { CarouselPoint, CarouselTransform } from './card-carousel';

export interface CardFrontTransform {
  readonly rotationY: number;
  readonly rotationZ: number;
}

export function frontTransformFor(
  orientation: TarotOrientation,
): CardFrontTransform {
  return {
    rotationY: Math.PI,
    rotationZ: orientation === 'reversed' ? Math.PI : 0,
  };
}

export type CardAnimation = (
  durationMs: number,
  update: (progress: number) => void,
) => Promise<void>;

export interface CardViewOptions {
  readonly id: string;
  readonly geometry: PlaneGeometry;
  readonly backMaterial: Material;
  readonly textureLoader: Pick<TextureLoader, 'loadAsync'>;
  readonly animate: CardAnimation;
}

export type CardViewState =
  | 'carousel'
  | 'held'
  | 'placed'
  | 'revealing'
  | 'revealed'
  | 'archiving'
  | 'archived'
  | 'disposed';

interface ParticleArchiveSnapshot {
  readonly scale: number;
  readonly opacity: number;
  readonly visible: boolean;
}

export class CardView {
  readonly id: string;
  readonly object = new Group();

  private readonly geometry: PlaneGeometry;
  private readonly textureLoader: Pick<TextureLoader, 'loadAsync'>;
  private readonly animate: CardAnimation;
  private readonly back: Mesh;
  private front: Mesh<PlaneGeometry, MeshBasicMaterial> | undefined;
  private faceTexture: Texture | undefined;
  private disposed = false;
  private revealed = false;
  private homeTransform: CarouselTransform | undefined;
  private viewState: CardViewState = 'carousel';
  private hoverAmount = 0;
  private hoverRevision = 0;
  private particleArchiveSnapshot: ParticleArchiveSnapshot | undefined;

  constructor({
    id,
    geometry,
    backMaterial,
    textureLoader,
    animate,
  }: CardViewOptions) {
    this.id = id;
    this.geometry = geometry;
    this.textureLoader = textureLoader;
    this.animate = animate;
    this.object.name = `tarot-card-${id}`;

    this.back = new Mesh(geometry, backMaterial);
    this.back.name = 'tarot-card-back';
    this.back.position.z = 0.006;
    this.object.add(this.back);
  }

  get isRevealed(): boolean {
    return this.revealed;
  }

  get state(): CardViewState {
    return this.viewState;
  }

  get frontVisible(): boolean {
    return this.front?.visible ?? false;
  }

  get frontRotationZ(): number {
    return this.front?.rotation.z ?? 0;
  }

  get frontOpacity(): number {
    return this.front?.material.opacity ?? 0;
  }

  get pickTarget(): Mesh {
    return this.back;
  }

  applyCarouselTransform(transform: CarouselTransform): void {
    this.assertUsable();
    this.homeTransform = transform;
    if (this.viewState !== 'carousel') {
      return;
    }

    this.applyCarouselPose();
  }

  async setHovered(hovered: boolean): Promise<void> {
    this.assertUsable();
    if (!this.homeTransform || this.viewState !== 'carousel') {
      return;
    }

    const revision = ++this.hoverRevision;
    const startAmount = this.hoverAmount;
    const targetAmount = hovered ? 1 : 0;
    await this.animate(160, (progress) => {
      if (
        this.viewState !== 'carousel' ||
        revision !== this.hoverRevision
      ) {
        return;
      }
      this.hoverAmount = lerp(
        startAmount,
        targetAmount,
        easeInOutCubic(progress),
      );
      this.applyCarouselPose();
    });
    if (this.viewState === 'carousel' && revision === this.hoverRevision) {
      this.hoverAmount = targetAmount;
      this.applyCarouselPose();
    }
  }

  hold(): void {
    this.assertUsable();
    this.hoverRevision += 1;
    this.hoverAmount = 0;
    this.viewState = 'held';
  }

  moveHeldCard(point: CarouselPoint): void {
    this.assertUsable();
    if (this.viewState !== 'held') {
      throw new Error('Only a held card can be moved');
    }

    this.object.position.set(point.x, point.y, point.z);
    this.object.rotation.set(0, 0, 0);
    this.object.scale.setScalar(1.12);
  }

  async releaseHeldCard(): Promise<void> {
    this.assertUsable();
    if (this.viewState !== 'held' || !this.homeTransform) {
      return;
    }

    await this.animateTo(this.homeTransform, 320);
    this.viewState = 'carousel';
  }

  async placeAtCenter(): Promise<void> {
    this.assertUsable();
    await this.animateTo(
      {
        position: { x: 0, y: 0, z: 1.25 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: 1.25,
      },
      420,
    );
    this.viewState = 'placed';
  }

  async reveal(
    card: TarotCard,
    orientation: TarotOrientation,
    preloadedTexture?: Texture,
  ): Promise<void> {
    this.assertUsable();

    const texture =
      preloadedTexture ?? await this.textureLoader.loadAsync(card.image);
    if (this.disposed) {
      texture.dispose();
      throw new Error('Cannot reveal a disposed card view');
    }

    texture.colorSpace = SRGBColorSpace;
    this.replaceFront(texture, orientation);

    const startRotationY = this.object.rotation.y;
    this.viewState = 'revealing';
    await this.animate(650, (progress) => {
      this.object.rotation.y =
        startRotationY + (Math.PI - startRotationY) * easeInOutCubic(progress);
    });
    this.revealed = true;
    this.viewState = 'revealed';
  }

  async fadeOut(): Promise<void> {
    this.assertUsable();
    if (!this.front || !this.revealed) {
      throw new Error('Cannot archive a card before it is revealed');
    }

    const startOpacity = this.front.material.opacity;
    await this.animate(140, (progress) => {
      if (this.front) {
        this.front.material.opacity = lerp(
          startOpacity,
          0,
          easeInOutCubic(progress),
        );
      }
    });
    this.front.material.opacity = 0;
    this.object.visible = false;
    this.viewState = 'archived';
  }

  startParticleArchive(): void {
    this.assertUsable();
    if (!this.front || !this.revealed) {
      throw new Error('Cannot archive a card before it is revealed');
    }

    this.particleArchiveSnapshot = {
      scale: this.object.scale.x,
      opacity: this.front.material.opacity,
      visible: this.object.visible,
    };
    this.viewState = 'archiving';
  }

  applyParticleArchiveProgress(progress: number): void {
    this.assertUsable();
    if (!this.front || !this.particleArchiveSnapshot) {
      throw new Error('Particle archive has not started');
    }

    const clamped = Math.min(Math.max(progress, 0), 1);
    const fadeProgress = Math.min(clamped / 0.7, 1);
    this.front.material.opacity = lerp(
      this.particleArchiveSnapshot.opacity,
      0,
      easeInOutCubic(fadeProgress),
    );
    this.object.scale.setScalar(
      lerp(
        this.particleArchiveSnapshot.scale,
        this.particleArchiveSnapshot.scale * 0.18,
        easeInOutCubic(clamped),
      ),
    );
  }

  finishParticleArchive(): void {
    this.assertUsable();
    if (!this.revealed || !this.particleArchiveSnapshot) {
      throw new Error('Cannot archive a card before it is revealed');
    }

    this.applyParticleArchiveProgress(1);
    this.object.visible = false;
    this.particleArchiveSnapshot = undefined;
    this.viewState = 'archived';
  }

  restoreParticleArchive(): void {
    if (this.disposed || !this.particleArchiveSnapshot) {
      return;
    }

    if (this.front) {
      this.front.material.opacity = this.particleArchiveSnapshot.opacity;
    }
    this.object.scale.setScalar(this.particleArchiveSnapshot.scale);
    this.object.visible = this.particleArchiveSnapshot.visible;
    this.particleArchiveSnapshot = undefined;
    this.viewState = 'revealed';
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.viewState = 'disposed';
    this.releaseFront();
    this.object.removeFromParent();
    this.object.clear();
  }

  private replaceFront(
    texture: Texture,
    orientation: TarotOrientation,
  ): void {
    this.releaseFront();

    const material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
    });
    const transform = frontTransformFor(orientation);
    const front = new Mesh(this.geometry, material);
    front.name = 'tarot-card-front';
    front.position.z = -0.006;
    front.rotation.y = transform.rotationY;
    front.rotation.z = transform.rotationZ;
    front.visible = true;

    this.faceTexture = texture;
    this.front = front;
    this.object.add(front);
  }

  private async animateTo(
    destination: {
      readonly position: CarouselPoint;
      readonly rotation: CarouselPoint;
      readonly scale: number;
    },
    durationMs: number,
  ): Promise<void> {
    const start = {
      position: this.object.position.clone(),
      rotation: {
        x: this.object.rotation.x,
        y: this.object.rotation.y,
        z: this.object.rotation.z,
      },
      scale: this.object.scale.x,
    };

    await this.animate(durationMs, (progress) => {
      const eased = easeInOutCubic(progress);
      this.object.position.set(
        lerp(start.position.x, destination.position.x, eased),
        lerp(start.position.y, destination.position.y, eased),
        lerp(start.position.z, destination.position.z, eased),
      );
      this.object.rotation.set(
        lerp(start.rotation.x, destination.rotation.x, eased),
        lerp(start.rotation.y, destination.rotation.y, eased),
        lerp(start.rotation.z, destination.rotation.z, eased),
      );
      this.object.scale.setScalar(lerp(start.scale, destination.scale, eased));
    });
    this.object.position.set(
      destination.position.x,
      destination.position.y,
      destination.position.z,
    );
    this.object.rotation.set(
      destination.rotation.x,
      destination.rotation.y,
      destination.rotation.z,
    );
    this.object.scale.setScalar(destination.scale);
  }

  private applyCarouselPose(): void {
    if (!this.homeTransform) {
      return;
    }

    this.object.position.set(
      this.homeTransform.position.x,
      this.homeTransform.position.y + this.hoverAmount * 0.18,
      this.homeTransform.position.z,
    );
    this.object.rotation.set(
      this.homeTransform.rotation.x,
      this.homeTransform.rotation.y,
      this.homeTransform.rotation.z,
    );
    this.object.scale.setScalar(
      this.homeTransform.scale * (1 + this.hoverAmount * 0.08),
    );
  }

  private releaseFront(): void {
    if (this.front) {
      this.front.removeFromParent();
      this.front.material.dispose();
      this.front = undefined;
    }
    this.faceTexture?.dispose();
    this.faceTexture = undefined;
    this.revealed = false;
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw new Error('Card view has been disposed');
    }
  }
}

function easeInOutCubic(progress: number): number {
  const clamped = Math.min(Math.max(progress, 0), 1);
  return clamped < 0.5
    ? 4 * clamped ** 3
    : 1 - (-2 * clamped + 2) ** 3 / 2;
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}
