export type InterpretationTopic = 'general' | 'love' | 'career' | 'wealth' | 'growth';
export type CardOrientation = 'upright' | 'reversed';

export interface InterpretationRequest {
  question?: string;
  cardId: string;
  topic: InterpretationTopic;
  orientation: CardOrientation;
  locale: 'zh-CN';
}

export interface InterpretationResponse {
  title: string;
  summary: string;
  guidance: string[];
  source: 'standard' | 'ai';
  cardId: string;
  topic: InterpretationTopic;
  orientation: CardOrientation;
}

export interface InterpretationProvider {
  interpret(request: InterpretationRequest): Promise<InterpretationResponse>;
}
