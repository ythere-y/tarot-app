import { describe, expect, it } from 'vitest';

import { LocalInterpretationProvider } from '../../src/interpretation/local-provider';

const provider = new LocalInterpretationProvider();

describe('LocalInterpretationProvider', () => {
  it.each([
    ['general', 'upright'],
    ['love', 'upright'],
    ['career', 'upright'],
    ['wealth', 'upright'],
    ['growth', 'upright'],
    ['general', 'reversed'],
    ['love', 'reversed'],
    ['career', 'reversed'],
    ['wealth', 'reversed'],
    ['growth', 'reversed'],
  ] as const)('returns the standard %s meaning for an %s Fool', async (topic, orientation) => {
    const response = await provider.interpret({
      cardId: 'major-00-fool',
      topic,
      orientation,
      locale: 'zh-CN',
    });

    expect(response).toEqual({
      cardId: 'major-00-fool',
      topic,
      orientation,
      title: `愚者 · ${orientation === 'upright' ? '正位' : '逆位'}`,
      summary: orientation === 'upright'
        ? {
            general: '新的旅程正在展开，带着好奇心出发会遇见意外的可能。',
            love: '感情适合放下预设，以轻松真诚的方式认识彼此。',
            career: '大胆尝试新方向，但要在行动前确认基本风险。',
            wealth: '财务处于探索期，小额尝试比孤注一掷更合适。',
            growth: '学习信任生命，同时为自己的选择承担责任。',
          }[topic]
        : {
            general: '冲动或过度犹豫都可能让机会偏离，需要先看清后果。',
            love: '关系里可能害怕承诺或只顾新鲜感，宜坦白真实期待。',
            career: '未经准备的转向容易返工，先补足信息与能力缺口。',
            wealth: '警惕随性消费和高风险下注，暂缓无法解释的投资。',
            growth: '辨认自由与逃避的差别，让勇气建立在觉察之上。',
          }[topic],
      guidance: orientation === 'upright'
        ? ['新开始', '自由', '信任', '冒险']
        : ['鲁莽', '迟疑', '逃避', '准备不足'],
      source: 'standard',
    });
  });

  it('accepts an optional question without changing the standard source text', async () => {
    const response = await provider.interpret({
      question: '我该如何开始新的计划？',
      cardId: 'major-00-fool',
      topic: 'growth',
      orientation: 'upright',
      locale: 'zh-CN',
    });

    expect(response.source).toBe('standard');
    expect(response.summary).toBe('学习信任生命，同时为自己的选择承担责任。');
  });

  it('rejects an unknown tarot card id', async () => {
    await expect(
      provider.interpret({
        cardId: 'unknown-card',
        topic: 'general',
        orientation: 'upright',
        locale: 'zh-CN',
      }),
    ).rejects.toThrow('Unknown tarot card: unknown-card');
  });
});
