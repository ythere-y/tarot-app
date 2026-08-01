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
      title: `${card.nameZh} · ${request.orientation === 'upright' ? '正位' : '逆位'}`,
      summary: meaning[request.topic],
      guidance: [...meaning.keywords],
      source: 'standard',
      cardId: card.id,
      topic: request.topic,
      orientation: request.orientation,
    };
  }
}
