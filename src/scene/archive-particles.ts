import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
  type Scene,
  type Vector3,
} from 'three';

import { type CardAnimation, CardView } from './card-view';
import type { CarouselPoint } from './card-carousel';

export interface ArchiveParticleSeed {
  readonly angle: number;
  readonly radius: number;
  readonly lift: number;
  readonly delay: number;
}

export interface ArchiveParticlesOptions {
  readonly scene: Scene;
  readonly particleCount: number;
  readonly animate: CardAnimation;
  readonly random?: () => number;
}

export function archiveParticlePosition(
  origin: CarouselPoint,
  target: CarouselPoint,
  seed: ArchiveParticleSeed,
  progress: number,
): CarouselPoint {
  const elapsed = clamp01((clamp01(progress) - seed.delay) / (1 - seed.delay));
  if (elapsed === 1) {
    return { ...target };
  }

  const startX = origin.x + Math.cos(seed.angle) * seed.radius;
  const startY = origin.y + Math.sin(seed.angle) * seed.radius * 1.35;

  return {
    x: lerp(startX, target.x, elapsed),
    y:
      lerp(startY, target.y, elapsed) +
      Math.sin(elapsed * Math.PI) * seed.lift,
    z: lerp(origin.z, target.z, elapsed),
  };
}

export class ArchiveParticles {
  private readonly scene: Scene;
  private readonly particleCount: number;
  private readonly animate: CardAnimation;
  private readonly random: () => number;
  private active:
    | {
        points: Points<BufferGeometry, PointsMaterial>;
        geometry: BufferGeometry;
        material: PointsMaterial;
      }
    | undefined;
  private archiveInProgress = false;
  private disposed = false;

  constructor({
    scene,
    particleCount,
    animate,
    random = Math.random,
  }: ArchiveParticlesOptions) {
    this.scene = scene;
    this.particleCount = Math.max(0, Math.floor(particleCount));
    this.animate = animate;
    this.random = random;
  }

  async archive(
    card: CardView,
    target: Vector3,
    reducedMotion: boolean,
  ): Promise<void> {
    if (this.disposed) {
      throw new Error('Archive particle effect has been disposed');
    }
    if (!card.isRevealed) {
      throw new Error('Cannot archive a card before it is revealed');
    }
    if (this.archiveInProgress) {
      throw new Error('An archive animation is already running');
    }

    this.archiveInProgress = true;
    try {
      if (reducedMotion || this.particleCount === 0) {
        await card.fadeOut();
        return;
      }

      const origin = {
        x: card.object.position.x,
        y: card.object.position.y,
        z: card.object.position.z,
      };
      const seeds = this.createSeeds();
      const geometry = new BufferGeometry();
      const positionAttribute = new Float32BufferAttribute(
        new Float32Array(this.particleCount * 3),
        3,
      );
      const positions = positionAttribute.array as Float32Array;
      geometry.setAttribute('position', positionAttribute);
      const material = new PointsMaterial({
        color: 0xd8b45a,
        size: 0.065,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      const points = new Points(geometry, material);
      points.name = 'tarot-archive-particles';
      points.frustumCulled = false;
      this.active = { points, geometry, material };
      this.writePositions(positions, origin, target, seeds, 0);
      positionAttribute.needsUpdate = true;
      this.scene.add(points);
      card.startParticleArchive();

      try {
        await this.animate(760, (progress) => {
          if (this.disposed) {
            return;
          }
          this.writePositions(positions, origin, target, seeds, progress);
          positionAttribute.needsUpdate = true;
          material.opacity = 1 - clamp01(progress) ** 3;
          card.applyParticleArchiveProgress(progress);
        });
        card.finishParticleArchive();
      } catch (error) {
        card.restoreParticleArchive();
        throw error;
      }
    } finally {
      this.releaseActive();
      this.archiveInProgress = false;
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.releaseActive();
  }

  private createSeeds(): ArchiveParticleSeed[] {
    return Array.from({ length: this.particleCount }, () => ({
      angle: this.random() * Math.PI * 2,
      radius: 0.05 + this.random() * 0.72,
      lift: 0.35 + this.random() * 0.9,
      delay: this.random() * 0.22,
    }));
  }

  private writePositions(
    positions: Float32Array,
    origin: CarouselPoint,
    target: CarouselPoint,
    seeds: readonly ArchiveParticleSeed[],
    progress: number,
  ): void {
    seeds.forEach((seed, index) => {
      const position = archiveParticlePosition(origin, target, seed, progress);
      const offset = index * 3;
      positions[offset] = position.x;
      positions[offset + 1] = position.y;
      positions[offset + 2] = position.z;
    });
  }

  private releaseActive(): void {
    if (!this.active) {
      return;
    }

    this.active.points.removeFromParent();
    this.active.geometry.dispose();
    this.active.material.dispose();
    this.active = undefined;
  }
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}
