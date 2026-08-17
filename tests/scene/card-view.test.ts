import { describe, expect, it } from 'vitest';
import {
  MeshBasicMaterial,
  PlaneGeometry,
  Texture,
  type TextureLoader,
} from 'three';

import {
  CardView,
  frontTransformFor,
  type CardAnimation,
} from '../../src/scene/card-view';
import type { TarotCard } from '../../src/tarot/types';

const TEST_CARD: TarotCard = {
  id: 'major-00-fool',
  number: 0,
  arcana: 'major',
  nameZh: '愚者',
  nameEn: 'The Fool',
  image: '/tarot_img/00.jpg',
  meanings: {
    upright: {
      keywords: ['beginning'],
      general: 'Begin.',
      love: 'Begin.',
      career: 'Begin.',
      wealth: 'Begin.',
      growth: 'Begin.',
    },
    reversed: {
      keywords: ['hesitation'],
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

function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createCardView(facePromise: Promise<Texture>): {
  view: CardView;
  geometry: PlaneGeometry;
  backMaterial: MeshBasicMaterial;
} {
  const geometry = new PlaneGeometry(1.4, 2.4);
  const backMaterial = new MeshBasicMaterial();
  const textureLoader = {
    loadAsync: () => facePromise,
  } as Pick<TextureLoader, 'loadAsync'>;

  return {
    view: new CardView({
      id: TEST_CARD.id,
      geometry,
      backMaterial,
      textureLoader,
      animate: finishImmediately,
    }),
    geometry,
    backMaterial,
  };
}

describe('frontTransformFor', () => {
  it('turns the front toward the viewer after a vertical-axis flip', () => {
    expect(frontTransformFor('upright')).toEqual({
      rotationY: Math.PI,
      rotationZ: 0,
    });
  });

  it('adds a 180-degree face rotation for a reversed card', () => {
    expect(frontTransformFor('reversed')).toEqual({
      rotationY: Math.PI,
      rotationZ: Math.PI,
    });
  });
});

describe('CardView reveal lifecycle', () => {
  it('does not begin the flip until the face texture has loaded', async () => {
    const pendingTexture = deferred<Texture>();
    const { view, geometry, backMaterial } = createCardView(
      pendingTexture.promise,
    );

    const reveal = view.reveal(TEST_CARD, 'upright');

    expect(view.object.rotation.y).toBe(0);
    expect(view.isRevealed).toBe(false);

    pendingTexture.resolve(new Texture());
    await reveal;

    expect(view.object.rotation.y).toBeCloseTo(Math.PI);
    expect(view.isRevealed).toBe(true);

    view.dispose();
    geometry.dispose();
    backMaterial.dispose();
  });

  it('keeps the back visible and surfaces a face texture failure', async () => {
    const textureError = new Error('face texture unavailable');
    const { view, geometry, backMaterial } = createCardView(
      Promise.reject(textureError),
    );

    await expect(view.reveal(TEST_CARD, 'upright')).rejects.toBe(textureError);
    expect(view.object.rotation.y).toBe(0);
    expect(view.isRevealed).toBe(false);
    expect(view.frontVisible).toBe(false);

    view.dispose();
    geometry.dispose();
    backMaterial.dispose();
  });

  it('orients a loaded reversed face upside down', async () => {
    const { view, geometry, backMaterial } = createCardView(
      Promise.resolve(new Texture()),
    );

    await view.reveal(TEST_CARD, 'reversed');

    expect(view.frontRotationZ).toBeCloseTo(Math.PI);

    view.dispose();
    geometry.dispose();
    backMaterial.dispose();
  });

  it('disposes the face texture owned by the card view', async () => {
    const texture = new Texture();
    let disposeEvents = 0;
    texture.addEventListener('dispose', () => {
      disposeEvents += 1;
    });
    const { view, geometry, backMaterial } = createCardView(
      Promise.resolve(texture),
    );
    await view.reveal(TEST_CARD, 'upright');

    view.dispose();

    expect(disposeEvents).toBe(1);
    geometry.dispose();
    backMaterial.dispose();
  });

  it('fades a revealed card out for reduced-motion archiving', async () => {
    const { view, geometry, backMaterial } = createCardView(
      Promise.resolve(new Texture()),
    );
    await view.reveal(TEST_CARD, 'upright');

    await view.fadeOut();

    expect(view.frontOpacity).toBe(0);
    expect(view.object.visible).toBe(false);

    view.dispose();
    geometry.dispose();
    backMaterial.dispose();
  });
});

describe('CardView movement lifecycle', () => {
  it('raises a hovered carousel card without losing its layout scale', async () => {
    const { view, geometry, backMaterial } = createCardView(
      Promise.resolve(new Texture()),
    );
    view.applyCarouselTransform({
      id: TEST_CARD.id,
      position: { x: 2, y: -0.5, z: 1 },
      rotation: { x: -0.1, y: 0.3, z: 0.05 },
      scale: 0.9,
    });

    await view.setHovered(true);

    expect(view.object.position.y).toBeGreaterThan(-0.5);
    expect(view.object.scale.x).toBeGreaterThan(0.9);

    view.dispose();
    geometry.dispose();
    backMaterial.dispose();
  });

  it('preserves hover lift when the moving carousel applies a new transform', async () => {
    const { view, geometry, backMaterial } = createCardView(
      Promise.resolve(new Texture()),
    );
    view.applyCarouselTransform({
      id: TEST_CARD.id,
      position: { x: 2, y: 0, z: 1 },
      rotation: { x: 0, y: 0.3, z: 0 },
      scale: 0.9,
    });
    await view.setHovered(true);

    view.applyCarouselTransform({
      id: TEST_CARD.id,
      position: { x: 2.1, y: 0, z: 0.9 },
      rotation: { x: 0, y: 0.32, z: 0 },
      scale: 0.88,
    });

    expect(view.object.position.y).toBeCloseTo(0.18);
    expect(view.object.scale.x).toBeCloseTo(0.88 * 1.08);

    view.dispose();
    geometry.dispose();
    backMaterial.dispose();
  });

  it('does not let an unfinished hover animation overwrite a held card', async () => {
    let finishHover: (() => void) | undefined;
    const delayedAnimation: CardAnimation = (_durationMs, update) =>
      new Promise<void>((resolve) => {
        finishHover = () => {
          update(1);
          resolve();
        };
      });
    const geometry = new PlaneGeometry(1.4, 2.4);
    const backMaterial = new MeshBasicMaterial();
    const textureLoader = {
      loadAsync: () => Promise.resolve(new Texture()),
    } as Pick<TextureLoader, 'loadAsync'>;
    const view = new CardView({
      id: TEST_CARD.id,
      geometry,
      backMaterial,
      textureLoader,
      animate: delayedAnimation,
    });
    view.applyCarouselTransform({
      id: TEST_CARD.id,
      position: { x: 2, y: 0, z: 1 },
      rotation: { x: 0, y: 0.3, z: 0 },
      scale: 0.9,
    });

    const hovering = view.setHovered(true);
    view.hold();
    view.moveHeldCard({ x: 1.5, y: 2, z: 1.8 });
    finishHover?.();
    await hovering;

    expect(view.object.position.toArray()).toEqual([1.5, 2, 1.8]);
    expect(view.object.scale.x).toBeCloseTo(1.12);

    view.dispose();
    geometry.dispose();
    backMaterial.dispose();
  });

  it('returns a released held card to its latest carousel transform', async () => {
    const { view, geometry, backMaterial } = createCardView(
      Promise.resolve(new Texture()),
    );
    const home = {
      id: TEST_CARD.id,
      position: { x: -3, y: 0.25, z: -1 },
      rotation: { x: -0.08, y: 1.2, z: 0.02 },
      scale: 0.84,
    };
    view.applyCarouselTransform(home);
    view.hold();
    view.moveHeldCard({ x: 1.5, y: 2, z: 1.8 });

    await view.releaseHeldCard();

    expect(view.state).toBe('carousel');
    expect(view.object.position.toArray()).toEqual([-3, 0.25, -1]);
    expect(view.object.rotation.toArray().slice(0, 3)).toEqual([
      -0.08,
      1.2,
      0.02,
    ]);
    expect(view.object.scale.x).toBeCloseTo(0.84);

    view.dispose();
    geometry.dispose();
    backMaterial.dispose();
  });

  it('animates a held card into the center reveal position', async () => {
    const { view, geometry, backMaterial } = createCardView(
      Promise.resolve(new Texture()),
    );
    view.applyCarouselTransform({
      id: TEST_CARD.id,
      position: { x: 4, y: 0, z: 0 },
      rotation: { x: -0.08, y: 2, z: 0.02 },
      scale: 0.9,
    });
    view.hold();

    await view.placeAtCenter();

    expect(view.state).toBe('placed');
    expect(view.object.position.toArray()).toEqual([0, 0, 1.25]);
    expect(view.object.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    expect(view.object.scale.x).toBeCloseTo(1.25);

    view.dispose();
    geometry.dispose();
    backMaterial.dispose();
  });
});
