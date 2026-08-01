import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAppView, type AppViewModel } from '../../src/ui/app-view';
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
      keywords: ['直觉', '静默'],
      general: '答案正在静默中浮现。',
      love: '先倾听关系里的细微感受。',
      career: '让洞察先于行动。',
      wealth: '看清隐含条件再决定。',
      growth: '信任内在声音。',
    },
    reversed: {
      keywords: ['噪音', '封闭'],
      general: '外界噪音盖过了你的直觉。',
      love: '猜测正在取代坦诚交流。',
      career: '信息不全时先不要定论。',
      wealth: '暂停看不清代价的选择。',
      growth: '重新辨认真正的感受。',
    },
  },
};

function createModel(overrides: Partial<AppViewModel> = {}): AppViewModel {
  return {
    snapshot: {
      phase: { type: 'READY' },
      remainingCards: [CARD],
      remainingCount: 78,
      result: null,
      history: [],
    },
    currentCard: null,
    interpretation: null,
    topic: 'general',
    gesture: {
      label: '等待手势',
      progress: 0,
    },
    camera: {
      status: 'idle',
    },
    inputMode: 'gesture',
    webglAvailable: true,
    ...overrides,
  };
}

function createRoot(): HTMLDivElement {
  const root = document.createElement('div');
  document.body.append(root);
  return root;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('app view', () => {
  it('begins with the Chinese remaining-card count in the upper-left status', () => {
    const root = createRoot();
    const view = createAppView(root);

    view.render(createModel());

    const counter = root.querySelector('[data-ui="remaining"]');
    expect(counter?.textContent?.trim().startsWith('余牌 78 / 78')).toBe(true);
  });

  it('uses the real card face for history and marks reversed thumbnails', () => {
    const root = createRoot();
    const view = createAppView(root);

    view.render(createModel({
      snapshot: {
        phase: { type: 'CAROUSEL' },
        remainingCards: [],
        remainingCount: 77,
        result: null,
        history: [{
          cardId: CARD.id,
          orientation: 'reversed',
          drawnAt: Date.UTC(2026, 7, 1, 8, 30),
        }],
      },
      cardCatalog: [CARD],
    }));

    const item = root.querySelector('[data-ui="history-item"]');
    const image = item?.querySelector('img');
    expect(item?.getAttribute('data-orientation')).toBe('reversed');
    expect(image?.getAttribute('src')).toBe(CARD.image);
    expect(image?.getAttribute('alt')).toContain('女祭司');
  });

  it('presents the Chinese meaning first and the English card name as secondary text', () => {
    const root = createRoot();
    const view = createAppView(root);

    view.render(createModel({
      snapshot: {
        phase: { type: 'READING' },
        remainingCards: [CARD],
        remainingCount: 78,
        result: {
          cardId: CARD.id,
          orientation: 'reversed',
          drawnAt: Date.UTC(2026, 7, 1),
        },
        history: [],
      },
      currentCard: CARD,
    }));

    const reading = root.querySelector('[data-ui="reading"]');
    const zhName = reading?.querySelector('[data-language="zh-CN"]');
    const enName = reading?.querySelector('[data-language="en"]');
    const meaning = reading?.querySelector('[data-ui="meaning"]');
    expect(zhName?.textContent).toContain('女祭司');
    expect(enName?.textContent).toBe('The High Priestess');
    expect(meaning?.textContent).toContain('外界噪音盖过了你的直觉');
    expect(zhName?.compareDocumentPosition(enName as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('exposes retry and mouse/touch actions when the camera fails', () => {
    const root = createRoot();
    const view = createAppView(root);
    const retryCamera = vi.fn();
    const usePointerMode = vi.fn();
    view.bind({ retryCamera, usePointerMode });

    view.render(createModel({
      camera: {
        status: 'error',
        message: '未获得摄像头权限',
      },
    }));

    const retry = root.querySelector<HTMLButtonElement>('[data-action="retry-camera"]');
    const pointer = root.querySelector<HTMLButtonElement>('[data-action="use-pointer"]');
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('未获得摄像头权限');
    expect(retry?.textContent).toContain('重试');
    expect(pointer?.textContent).toContain('鼠标 / 触屏');

    retry?.click();
    pointer?.click();
    expect(retryCamera).toHaveBeenCalledOnce();
    expect(usePointerMode).toHaveBeenCalledOnce();
  });

  it('offers all five reading topics as accessible tabs', () => {
    const root = createRoot();
    const view = createAppView(root);
    const selectTopic = vi.fn();
    view.bind({ selectTopic });
    view.render(createModel({ currentCard: CARD }));

    const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual([
      '通用',
      '爱情',
      '事业',
      '财运',
      '成长',
    ]);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');

    tabs[1]?.click();
    expect(selectTopic).toHaveBeenCalledWith('love');
  });

  it('announces gesture dwell progress as a readable percentage', () => {
    const root = createRoot();
    const view = createAppView(root);

    view.render(createModel({
      gesture: {
        label: '握拳确认',
        detail: '保持手势',
        progress: 0.52,
      },
    }));

    const progress = root.querySelector('[role="progressbar"]');
    expect(progress?.getAttribute('aria-valuenow')).toBe('52');
    expect(progress?.getAttribute('aria-valuetext')).toBe('已确认 52%');
  });

  it('explains the 2D fallback while keeping the current face and orientation', () => {
    const root = createRoot();
    const view = createAppView(root);

    view.render(createModel({
      currentCard: CARD,
      webglAvailable: false,
      snapshot: {
        phase: { type: 'READING' },
        remainingCards: [CARD],
        remainingCount: 78,
        result: {
          cardId: CARD.id,
          orientation: 'reversed',
          drawnAt: Date.UTC(2026, 7, 1),
        },
        history: [],
      },
    }));

    const fallback = root.querySelector('[data-ui="fallback-2d"]');
    const image = fallback?.querySelector('img');
    expect(fallback?.textContent).toContain('无法开启 3D 星盘');
    expect(image?.getAttribute('src')).toBe(CARD.image);
    expect(image?.getAttribute('data-orientation')).toBe('reversed');
  });

  it('dismisses reset confirmation with Escape and returns focus to its trigger', () => {
    const root = createRoot();
    const view = createAppView(root);
    view.render(createModel());

    const trigger = root.querySelector<HTMLButtonElement>('[data-action="request-reset"]');
    trigger?.click();
    expect(root.querySelector('[data-ui="reset-confirmation"]')?.hasAttribute('hidden')).toBe(false);

    root.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
    }));

    expect(root.querySelector('[data-ui="reset-confirmation"]')?.hasAttribute('hidden')).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps camera recovery actions expanded even when a stale model says collapsed', () => {
    const root = createRoot();
    const view = createAppView(root);

    view.render(createModel({
      camera: {
        status: 'error',
        message: '模型载入失败',
        expanded: false,
      },
    }));

    expect(root.querySelector('[data-ui="camera-panel"]')?.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('[data-action="retry-camera"]')).not.toBeNull();
    expect(root.querySelector('[data-action="use-pointer"]')).not.toBeNull();
  });

  it('disposes safely when the environment does not expose MediaStream', () => {
    const root = createRoot();
    const view = createAppView(root);
    view.render(createModel());

    expect(() => view.dispose()).not.toThrow();
    expect(root.childElementCount).toBe(0);
  });

  it('moves through reading tabs with arrow keys', () => {
    const root = createRoot();
    const view = createAppView(root);
    const selectTopic = vi.fn();
    view.bind({ selectTopic });
    view.render(createModel({ currentCard: CARD }));

    const general = root.querySelector<HTMLButtonElement>('[role="tab"][data-topic="general"]');
    const love = root.querySelector<HTMLButtonElement>('[role="tab"][data-topic="love"]');
    general?.focus();
    general?.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
    }));

    expect(document.activeElement).toBe(love);
    expect(selectTopic).toHaveBeenCalledWith('love');
  });

  it('uses unique accessible title references for multiple view instances', () => {
    const firstRoot = createRoot();
    const secondRoot = createRoot();
    createAppView(firstRoot).render(createModel());
    createAppView(secondRoot).render(createModel());

    const firstReading = firstRoot.querySelector('[data-ui="reading"]');
    const secondReading = secondRoot.querySelector('[data-ui="reading"]');
    const firstTitleId = firstReading?.getAttribute('aria-labelledby');
    const secondTitleId = secondReading?.getAttribute('aria-labelledby');

    expect(firstTitleId).not.toBe(secondTitleId);
    expect(firstRoot.querySelector(`#${firstTitleId}`)).not.toBeNull();
    expect(secondRoot.querySelector(`#${secondTitleId}`)).not.toBeNull();
  });
});
