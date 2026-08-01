import {
  PerspectiveCamera,
  Texture,
  type TextureLoader,
} from 'three';
import { describe, expect, it } from 'vitest';

import {
  TarotScene,
  historyTargetToWorld,
  type TarotRenderer,
} from '../../src/scene/tarot-scene';
import type { CardAnimation } from '../../src/scene/card-view';
import type { TarotCard } from '../../src/tarot/types';

const CARD: TarotCard = {
  id: 'major-02-high-priestess',
  number: 2,
  arcana: 'major',
  nameZh: '女祭司',
  nameEn: 'The High Priestess',
  image: '/tarot_img/02.jpg',
  meanings: {
    upright: {
      keywords: ['intuition'],
      general: 'Listen.',
      love: 'Listen.',
      career: 'Listen.',
      wealth: 'Listen.',
      growth: 'Listen.',
    },
    reversed: {
      keywords: ['noise'],
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

class TestRenderer implements TarotRenderer {
  readonly domElement = document.createElement('canvas');
  disposed = false;

  setPixelRatio(): void {}
  setSize(): void {}
  render(): void {}

  dispose(): void {
    this.disposed = true;
  }
}

function rect(
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

function createScene(
  loadAsync: (url: string) => Promise<Texture> = async () => new Texture(),
  cards: readonly TarotCard[] = [CARD],
): { scene: TarotScene; renderer: TestRenderer; host: HTMLDivElement } {
  const renderer = new TestRenderer();
  const host = document.createElement('div');
  Object.defineProperties(host, {
    clientWidth: { value: 800 },
    clientHeight: { value: 600 },
  });
  const textureLoader = { loadAsync } as Pick<TextureLoader, 'loadAsync'>;
  const scene = new TarotScene({
    cards,
    capabilities: {
      devicePixelRatio: 2,
      hardwareConcurrency: 8,
      deviceMemory: 8,
      reducedMotion: true,
    },
    rendererFactory: () => renderer,
    textureLoader,
    animate: finishImmediately,
    requestFrame: () => 17,
    cancelFrame: () => undefined,
    now: () => 0,
  });
  scene.mount(host);
  return { scene, renderer, host };
}

function makeCards(count: number): TarotCard[] {
  return Array.from({ length: count }, (_, index) => ({
    ...CARD,
    id: `card-${index}`,
    number: index,
    nameEn: `Card ${index}`,
    image: `/tarot_img/${index}.jpg`,
  }));
}

describe('historyTargetToWorld', () => {
  it('maps a lower-left history target to a finite point left of center', () => {
    const camera = new PerspectiveCamera(42, 4 / 3, 0.1, 100);
    camera.position.set(0, 1.2, 11);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    const point = historyTargetToWorld(
      rect(24, 500, 120, 64),
      rect(0, 0, 800, 600),
      camera,
    );

    expect([point.x, point.y, point.z].every(Number.isFinite)).toBe(true);
    expect(point.x).toBeLessThan(0);
    expect(point.y).toBeLessThan(0);
    expect(point.z).toBe(0);
  });
});

describe('TarotScene', () => {
  it('mounts a renderer and disposes the canvas and renderer resource', () => {
    const { scene, renderer, host } = createScene();

    expect(host.contains(renderer.domElement)).toBe(true);

    scene.dispose();

    expect(host.contains(renderer.domElement)).toBe(false);
    expect(renderer.disposed).toBe(true);
    expect(scene.isDisposed).toBe(true);
  });

  it('runs the complete held, revealed, and archived card lifecycle', async () => {
    const { scene } = createScene();
    scene.setCards([CARD.id]);
    scene.setPointer({ x: 0.5, y: 0.5 });

    expect(scene.pickCard()).toBe(CARD.id);
    scene.moveHeldCard({ x: 0.5, y: 0.5 });
    await expect(scene.releaseHeldCard()).resolves.toBe('placed');
    await scene.reveal(CARD, 'reversed');
    await scene.archive(rect(24, 500, 120, 64));

    expect(scene.cardIds).toEqual([]);
    expect(scene.heldCardId).toBeNull();

    scene.dispose();
  });

  it.each([
    { count: 1, expected: ['card-0'] },
    { count: 3, expected: ['card-1'] },
    { count: 78, expected: ['card-19', 'card-20'] },
  ])(
    'picks a visible front-facing card at the center from $count cards',
    ({ count, expected }) => {
      const cards = makeCards(count);
      const { scene } = createScene(undefined, cards);
      scene.setCards(cards.map(({ id }) => id));
      scene.setPointer({ x: 0.5, y: 0.5 });

      expect(expected).toContain(scene.pickCard());

      scene.dispose();
    },
  );

  it('does not pick a card when the pointer ray misses every visible face', () => {
    const cards = makeCards(78);
    const { scene } = createScene(undefined, cards);
    scene.setCards(cards.map(({ id }) => id));
    scene.setPointer({ x: 0, y: 0 });

    expect(scene.pickCard()).toBeNull();

    scene.dispose();
  });

  it('surfaces a face load error and refuses to archive the failed result', async () => {
    const faceError = new Error('face failed');
    const { scene } = createScene(async (url) => {
      if (url.endsWith('cover.jpg')) {
        return new Texture();
      }
      throw faceError;
    });
    scene.setCards([CARD.id]);
    scene.setPointer({ x: 0.5, y: 0.5 });
    scene.pickCard();
    scene.moveHeldCard({ x: 0.5, y: 0.5 });
    await scene.releaseHeldCard();

    await expect(scene.reveal(CARD, 'upright')).rejects.toBe(faceError);
    await expect(scene.archive(rect(24, 500, 120, 64))).rejects.toThrow(
      'before it is revealed',
    );
    expect(scene.cardIds).toEqual([CARD.id]);

    scene.dispose();
  });
});
