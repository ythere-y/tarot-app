import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { cwd } from 'node:process';

import { describe, expect, it } from 'vitest';

import { TAROT_CARDS } from '../../src/tarot/cards';
import type { TarotCard } from '../../src/tarot/types';
import { validateTarotCards } from '../../src/tarot/validate';

const meaningFields = ['general', 'love', 'career', 'wealth', 'growth'] as const;
const assetNames = new Set(
  readdirSync(resolve(cwd(), 'tarot_img'), { encoding: 'utf8' }),
);

function imageFilename(image: string): string {
  const segments = new URL(image, 'https://tarot.local').pathname.split('/');
  return decodeURIComponent(segments.at(-1) ?? '');
}

function cloneCard(card: TarotCard): TarotCard {
  return structuredClone(card);
}

describe('Rider–Waite tarot dataset', () => {
  it('contains exactly 22 major and 56 minor arcana cards', () => {
    expect(TAROT_CARDS).toHaveLength(78);
    expect(TAROT_CARDS.filter((card) => card.arcana === 'major')).toHaveLength(22);
    expect(TAROT_CARDS.filter((card) => card.arcana === 'minor')).toHaveLength(56);
  });

  it('gives every card a unique id, image, and non-empty bilingual name', () => {
    expect(new Set(TAROT_CARDS.map((card) => card.id)).size).toBe(78);
    expect(new Set(TAROT_CARDS.map((card) => card.image)).size).toBe(78);

    for (const card of TAROT_CARDS) {
      expect(card.nameZh.trim(), `${card.id} is missing nameZh`).not.toBe('');
      expect(card.nameEn.trim(), `${card.id} is missing nameEn`).not.toBe('');
    }
  });

  it('ships all 79 local images and maps each face exactly once', () => {
    expect(assetNames.size).toBe(79);
    expect(assetNames.has('cover.jpg')).toBe(true);

    const faceNames = TAROT_CARDS.map((card) => imageFilename(card.image));
    expect(new Set(faceNames).size).toBe(78);
    expect(faceNames).not.toContain('cover.jpg');

    for (const filename of faceNames) {
      expect(assetNames.has(filename), `missing tarot_img/${filename}`).toBe(true);
    }
  });

  it('provides complete and distinct upright and reversed Chinese meanings', () => {
    for (const card of TAROT_CARDS) {
      const { upright, reversed } = card.meanings;

      expect(upright.keywords.length, `${card.id} upright keywords`).toBeGreaterThan(0);
      expect(reversed.keywords.length, `${card.id} reversed keywords`).toBeGreaterThan(0);
      expect(upright.keywords.join('|')).not.toBe(reversed.keywords.join('|'));

      for (const field of meaningFields) {
        expect(upright[field].trim(), `${card.id} upright ${field}`).not.toBe('');
        expect(reversed[field].trim(), `${card.id} reversed ${field}`).not.toBe('');
        expect(upright[field], `${card.id} ${field} must differ by orientation`).not.toBe(
          reversed[field],
        );
      }
    }
  });

  it('passes the production dataset validator', () => {
    expect(validateTarotCards(TAROT_CARDS)).toEqual([]);
  });
});

describe('validateTarotCards', () => {
  it('reports duplicate ids', () => {
    const duplicate = cloneCard(TAROT_CARDS[0]!);

    expect(validateTarotCards([...TAROT_CARDS, duplicate])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'duplicate-id', cardId: duplicate.id }),
      ]),
    );
  });

  it('reports invalid arcana and suit combinations', () => {
    const majorWithSuit = { ...cloneCard(TAROT_CARDS[0]!), suit: 'wands' as const };
    const minorWithoutSuit = cloneCard(
      TAROT_CARDS.find((card) => card.arcana === 'minor')!,
    );
    delete minorWithoutSuit.suit;

    expect(validateTarotCards([majorWithSuit, minorWithoutSuit])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid-arcana-suit', cardId: majorWithSuit.id }),
        expect.objectContaining({
          code: 'invalid-arcana-suit',
          cardId: minorWithoutSuit.id,
        }),
      ]),
    );
  });

  it('reports empty meaning fields and keyword lists', () => {
    const emptyMeaning = cloneCard(TAROT_CARDS[0]!);
    emptyMeaning.meanings.upright.love = '   ';
    emptyMeaning.meanings.reversed.keywords = [];

    expect(validateTarotCards([emptyMeaning])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'empty-meaning',
          cardId: emptyMeaning.id,
          field: 'meanings.upright.love',
        }),
        expect.objectContaining({
          code: 'empty-meaning',
          cardId: emptyMeaning.id,
          field: 'meanings.reversed.keywords',
        }),
      ]),
    );
  });

  it('reports absent image strings', () => {
    const missingImage = cloneCard(TAROT_CARDS[0]!);
    missingImage.image = '   ';

    expect(validateTarotCards([missingImage])).toEqual([
      expect.objectContaining({ code: 'missing-image', cardId: missingImage.id }),
    ]);
  });
});
