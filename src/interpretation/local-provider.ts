import { TAROT_CARDS } from '../tarot/cards';

import type {
  InterpretationProvider,
  InterpretationRequest,
  InterpretationResponse,
} from './types';

export class LocalInterpretationProvider implements InterpretationProvider {
  async interpret(request: InterpretationRequest): Promise<InterpretationResponse> {
    const card = TAROT_CARDS.find(({ id }) => id === request.cardId);

    if (card === undefined) {
      throw new Error(`Unknown tarot card: ${request.cardId}`);
    }

    const meaning = card.meanings[request.orientation];

    return {
      cardId: card.id,
      cardName: card.nameZh,
      topic: request.topic,
      orientation: request.orientation,
      interpretation: meaning[request.topic],
      guidance: [...meaning.keywords],
      source: 'standard',
    };
  }
}
