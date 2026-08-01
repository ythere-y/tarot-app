import {
  MeshBasicMaterial,
  PlaneGeometry,
  Scene,
  Texture,
  Vector3,
  type Points,
  type TextureLoader,
} from 'three';
import { describe, expect, it } from 'vitest';

import {
  ArchiveParticles,
  archiveParticlePosition,
} from '../../src/scene/archive-particles';
import {
  CardView,
  type CardAnimation,
} from '../../src/scene/card-view';
import type { TarotCard } from '../../src/tarot/types';

const CARD: TarotCard = {
  id: 'major-01-magician',
  number: 1,
  arcana: 'major',
  nameZh: '魔术师',
  nameEn: 'The Magician',
  image: '/tarot_img/01.jpg',
  meanings: {
    upright: {
      keywords: ['focus'],
      general: 'Focus.',
      love: 'Focus.',
      career: 'Focus.',
      wealth: 'Focus.',
      growth: 'Focus.',
    },
    reversed: {
      keywords: ['distraction'],
      general: 'Pause.',
      love: 'Pause.',
      career: 'Pause.',
      wealth: 'Pause.',
      growth: 'Pause.',
    },
  },
};

const finishImmediately: CardAnimation = async (_durationMs, update) => {
  update(1);
};

function createRevealedView(
  animate: CardAnimation = finishImmediately,
): {
  view: CardView;
  geometry: PlaneGeometry;
  backMaterial: MeshBasicMaterial;
} {
  const geometry = new PlaneGeometry(1.4, 2.4);
  const backMaterial = new MeshBasicMaterial();
  const textureLoader = {
    loadAsync: () => Promise.resolve(new Texture()),
  } as Pick<TextureLoader, 'loadAsync'>;

  return {
    view: new CardView({
      id: CARD.id,
      geometry,
      backMaterial,
      textureLoader,
      animate,
    }),
    geometry,
    backMaterial,
  };
}

describe('archiveParticlePosition', () => {
  it('moves every finite particle path into the history target', () => {
    const origin = { x: 0, y: 0, z: 1.25 };
    const target = { x: -4, y: -2, z: 0 };
    const seed = { angle: 1.2, radius: 0.4, lift: 1.1, delay: 0.15 };

    const halfway = archiveParticlePosition(origin, target, seed, 0.5);
    const complete = archiveParticlePosition(origin, target, seed, 1);

    expect([halfway.x, halfway.y, halfway.z].every(Number.isFinite)).toBe(true);
    expect(complete).toEqual(target);
  });
});

describe('ArchiveParticles', () => {
  it('fades and shrinks the central card while particles are moving', async () => {
    const scene = new Scene();
    const { view, geometry, backMaterial } = createRevealedView();
    scene.add(view.object);
    await view.reveal(CARD, 'upright');
    let finishAnimation: (() => void) | undefined;
    const animate: CardAnimation = (_durationMs, update) => {
      update(0.35);
      return new Promise<void>((resolve) => {
        finishAnimation = () => {
          update(1);
          resolve();
        };
      });
    };
    const effect = new ArchiveParticles({
      scene,
      particleCount: 12,
      animate,
      random: () => 0.5,
    });

    const archive = effect.archive(view, new Vector3(-4, -2, 0), false);
    await Promise.resolve();

    expect(view.state).toBe('archiving');
    expect(view.frontOpacity).toBeLessThan(1);
    expect(view.object.scale.x).toBeLessThan(1);
    expect(view.object.visible).toBe(true);

    finishAnimation?.();
    await archive;
    effect.dispose();
    view.dispose();
    geometry.dispose();
    backMaterial.dispose();
  });

  it('restores the revealed card when particle animation fails', async () => {
    const scene = new Scene();
    const { view, geometry, backMaterial } = createRevealedView();
    scene.add(view.object);
    await view.reveal(CARD, 'upright');
    const animationError = new Error('archive animation failed');
    let rejectAnimation: ((error: Error) => void) | undefined;
    const animate: CardAnimation = (_durationMs, update) => {
      update(0.4);
      return new Promise<void>((_resolve, reject) => {
        rejectAnimation = reject;
      });
    };
    const effect = new ArchiveParticles({
      scene,
      particleCount: 12,
      animate,
      random: () => 0.5,
    });

    const archive = effect.archive(view, new Vector3(-4, -2, 0), false);
    await Promise.resolve();
    expect(view.state).toBe('archiving');
    expect(view.frontOpacity).toBeLessThan(1);
    expect(view.object.scale.x).toBeLessThan(1);

    rejectAnimation?.(animationError);
    await expect(archive).rejects.toBe(animationError);

    expect(view.state).toBe('revealed');
    expect(view.frontOpacity).toBe(1);
    expect(view.object.scale.x).toBe(1);
    expect(view.object.visible).toBe(true);
    expect(scene.children.some((child) => child.type === 'Points')).toBe(false);

    effect.dispose();
    view.dispose();
    geometry.dispose();
    backMaterial.dispose();
  });

  it('resolves after particles reach the target and releases effect resources', async () => {
    const scene = new Scene();
    const { view, geometry, backMaterial } = createRevealedView();
    scene.add(view.object);
    await view.reveal(CARD, 'upright');
    let finishAnimation: (() => void) | undefined;
    const animate: CardAnimation = (_durationMs, update) => {
      return new Promise<void>((resolve) => {
        finishAnimation = () => {
          update(1);
          resolve();
        };
      });
    };
    const effect = new ArchiveParticles({
      scene,
      particleCount: 12,
      animate,
      random: () => 0.5,
    });

    const archive = effect.archive(view, new Vector3(-4, -2, 0), false);
    await Promise.resolve();
    const particles = scene.children.find(
      (child): child is Points => child.type === 'Points',
    );
    expect(particles).toBeDefined();
    expect(
      Array.from(particles?.geometry.attributes.position?.array ?? []).some(
        (coordinate) => coordinate !== 0,
      ),
    ).toBe(true);

    let geometryDisposals = 0;
    let materialDisposals = 0;
    particles?.geometry.addEventListener('dispose', () => {
      geometryDisposals += 1;
    });
    if (particles && !Array.isArray(particles.material)) {
      particles.material.addEventListener('dispose', () => {
        materialDisposals += 1;
      });
    }

    finishAnimation?.();
    await archive;

    expect(scene.children.some((child) => child.type === 'Points')).toBe(false);
    expect(view.object.visible).toBe(false);
    expect(geometryDisposals).toBe(1);
    expect(materialDisposals).toBe(1);

    effect.dispose();
    view.dispose();
    geometry.dispose();
    backMaterial.dispose();
  });

  it('uses a short fade without creating particles under reduced motion', async () => {
    const scene = new Scene();
    const { view, geometry, backMaterial } = createRevealedView();
    scene.add(view.object);
    await view.reveal(CARD, 'upright');
    const effect = new ArchiveParticles({
      scene,
      particleCount: 12,
      animate: finishImmediately,
      random: () => 0.5,
    });

    await effect.archive(view, new Vector3(-4, -2, 0), true);

    expect(scene.children.some((child) => child.type === 'Points')).toBe(false);
    expect(view.frontOpacity).toBe(0);
    expect(view.object.visible).toBe(false);

    effect.dispose();
    view.dispose();
    geometry.dispose();
    backMaterial.dispose();
  });

  it('rejects a second reduced-motion archive while the first fade is active', async () => {
    let animationCall = 0;
    let finishFade: (() => void) | undefined;
    const cardAnimation: CardAnimation = (_durationMs, update) => {
      animationCall += 1;
      if (animationCall === 2) {
        return new Promise<void>((resolve) => {
          finishFade = () => {
            update(1);
            resolve();
          };
        });
      }
      update(1);
      return Promise.resolve();
    };
    const scene = new Scene();
    const { view, geometry, backMaterial } = createRevealedView(cardAnimation);
    scene.add(view.object);
    await view.reveal(CARD, 'upright');
    const effect = new ArchiveParticles({
      scene,
      particleCount: 12,
      animate: finishImmediately,
      random: () => 0.5,
    });

    const firstArchive = effect.archive(view, new Vector3(-4, -2, 0), true);
    await Promise.resolve();
    const secondOutcome = await effect
      .archive(view, new Vector3(-4, -2, 0), true)
      .then(
        () => null,
        (error: unknown) => error,
      );
    finishFade?.();
    await firstArchive;

    expect(secondOutcome).toBeInstanceOf(Error);
    expect((secondOutcome as Error).message).toContain('already running');

    effect.dispose();
    view.dispose();
    geometry.dispose();
    backMaterial.dispose();
  });

  it('refuses to archive a card whose face was never revealed', async () => {
    const scene = new Scene();
    const { view, geometry, backMaterial } = createRevealedView();
    scene.add(view.object);
    const effect = new ArchiveParticles({
      scene,
      particleCount: 12,
      animate: finishImmediately,
      random: () => 0.5,
    });

    await expect(
      effect.archive(view, new Vector3(-4, -2, 0), false),
    ).rejects.toThrow('before it is revealed');
    expect(view.object.visible).toBe(true);
    expect(scene.children.some((child) => child.type === 'Points')).toBe(false);

    effect.dispose();
    view.dispose();
    geometry.dispose();
    backMaterial.dispose();
  });
});
