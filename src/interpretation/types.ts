export type InterpretationTopic = 'general' | 'love' | 'career' | 'wealth' | 'growth';
export type CardOrientation = 'upright' | 'reversed';

export interface InterpretationRequest {
  cardId: string;
  topic: InterpretationTopic;
  orientation: CardOrientation;
}

export interface InterpretationResponse {
  cardId: string;
  cardName: string;
  topic: InterpretationTopic;
  orientation: CardOrientation;
  interpretation: string;
  guidance: string[];
  source: 'standard';
}

export interface InterpretationProvider {
  interpret(request: InterpretationRequest): Promise<InterpretationResponse>;
}
