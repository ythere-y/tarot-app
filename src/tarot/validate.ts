import type {
  TarotCard,
  TarotMeaning,
  TarotOrientation,
  TarotSuit,
  ValidationIssue,
} from './types';

const suits = new Set<TarotSuit>(['wands', 'cups', 'swords', 'pentacles']);
const orientations: TarotOrientation[] = ['upright', 'reversed'];
const meaningFields: (keyof Omit<TarotMeaning, 'keywords'>)[] = [
  'general',
  'love',
  'career',
  'wealth',
  'growth',
];

function issue(
  code: ValidationIssue['code'],
  cardId: string,
  message: string,
  field?: string,
): ValidationIssue {
  return field === undefined
    ? { code, cardId, message }
    : { code, cardId, field, message };
}

export function validateTarotCards(cards: readonly TarotCard[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set<string>();
  const images = new Set<string>();

  for (const card of cards) {
    if (ids.has(card.id)) {
      issues.push(issue('duplicate-id', card.id, `重复的牌 ID：${card.id}`, 'id'));
    }
    ids.add(card.id);

    const image = card.image.trim();
    if (image === '') {
      issues.push(issue('missing-image', card.id, '缺少牌面图片路径', 'image'));
    } else if (images.has(image)) {
      issues.push(issue('duplicate-image', card.id, `重复的牌面图片：${image}`, 'image'));
    }
    images.add(image);

    if (card.nameZh.trim() === '') {
      issues.push(issue('missing-name', card.id, '缺少中文牌名', 'nameZh'));
    }
    if (card.nameEn.trim() === '') {
      issues.push(issue('missing-name', card.id, '缺少英文牌名', 'nameEn'));
    }

    const validCombination =
      (card.arcana === 'major' && card.suit === undefined) ||
      (card.arcana === 'minor' &&
        card.suit !== undefined &&
        suits.has(card.suit));
    if (!validCombination) {
      issues.push(
        issue(
          'invalid-arcana-suit',
          card.id,
          `无效的阿尔卡那与花色组合：${card.arcana}/${card.suit ?? 'none'}`,
          'suit',
        ),
      );
    }

    for (const orientation of orientations) {
      const meaning = card.meanings[orientation];
      const keywordField = `meanings.${orientation}.keywords`;
      if (
        meaning.keywords.length === 0 ||
        meaning.keywords.some((keyword) => keyword.trim() === '')
      ) {
        issues.push(
          issue('empty-meaning', card.id, `${keywordField} 不得为空`, keywordField),
        );
      }

      for (const field of meaningFields) {
        const fieldPath = `meanings.${orientation}.${field}`;
        if (meaning[field].trim() === '') {
          issues.push(issue('empty-meaning', card.id, `${fieldPath} 不得为空`, fieldPath));
        }
      }
    }
  }

  return issues;
}
