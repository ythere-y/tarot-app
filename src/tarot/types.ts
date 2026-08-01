export type TarotArcana = 'major' | 'minor';
export type TarotSuit = 'wands' | 'cups' | 'swords' | 'pentacles';
export type TarotOrientation = 'upright' | 'reversed';

export interface TarotMeaning {
  keywords: string[];
  general: string;
  love: string;
  career: string;
  wealth: string;
  growth: string;
}

export interface TarotCard {
  id: string;
  number: number;
  arcana: TarotArcana;
  suit?: TarotSuit;
  rank?: string;
  nameZh: string;
  nameEn: string;
  image: string;
  meanings: {
    upright: TarotMeaning;
    reversed: TarotMeaning;
  };
}

export type ValidationIssueCode =
  | 'duplicate-id'
  | 'duplicate-image'
  | 'invalid-arcana-suit'
  | 'missing-name'
  | 'missing-image'
  | 'empty-meaning';

export interface ValidationIssue {
  code: ValidationIssueCode;
  cardId: string;
  field?: string;
  message: string;
}
