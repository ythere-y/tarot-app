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
    });

    expect(response).toMatchObject({
      cardId: 'major-00-fool',
      cardName: '愚者',
      topic,
      orientation,
      source: 'standard',
    });
    expect(response.interpretation).toBeTypeOf('string');
    expect(response.interpretation.trim()).not.toBe('');
    expect(response.guidance).toEqual(expect.any(Array));
    expect(response.guidance.length).toBeGreaterThan(0);
  });

  it('rejects an unknown tarot card id', async () => {
    await expect(
      provider.interpret({
        cardId: 'unknown-card',
        topic: 'general',
        orientation: 'upright',
      }),
    ).rejects.toThrow('Unknown tarot card: unknown-card');
  });
});
