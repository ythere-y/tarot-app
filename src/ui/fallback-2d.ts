import type { DrawSnapshot } from '../app/types';
import type { TarotCard, TarotOrientation } from '../tarot/types';

import { APP_COPY, ORIENTATION_COPY } from './copy';

export interface Fallback2DModel {
  snapshot: DrawSnapshot;
  currentCard: TarotCard | null;
  orientation?: TarotOrientation;
}

export interface Fallback2D {
  render(model: Fallback2DModel): void;
  dispose(): void;
}

export function createFallback2D(host: HTMLElement): Fallback2D {
  const fallback = document.createElement('section');
  fallback.className = 'fallback-orbit';
  fallback.dataset.ui = 'fallback-2d';
  fallback.setAttribute('aria-label', '二维塔罗牌阵');

  const notice = document.createElement('div');
  notice.className = 'fallback-orbit__notice';
  const noticeTitle = document.createElement('strong');
  noticeTitle.textContent = APP_COPY.fallbackTitle;
  const noticeDescription = document.createElement('p');
  noticeDescription.textContent = APP_COPY.fallbackDescription;
  notice.append(noticeTitle, noticeDescription);

  const orbit = document.createElement('div');
  orbit.className = 'fallback-orbit__ring';
  orbit.setAttribute('aria-hidden', 'true');

  const card = document.createElement('figure');
  card.className = 'fallback-card';

  const face = document.createElement('div');
  face.className = 'fallback-card__face';

  const caption = document.createElement('figcaption');
  caption.className = 'fallback-card__caption';

  const title = document.createElement('strong');
  const supporting = document.createElement('span');
  caption.append(title, supporting);
  card.append(face, caption);
  fallback.append(notice, orbit, card);
  host.replaceChildren(fallback);

  return {
    render(model): void {
      const orientation = model.orientation ?? model.snapshot.result?.orientation ?? 'upright';
      const currentCard = model.currentCard;
      fallback.dataset.phase = model.snapshot.phase.type.toLowerCase();
      card.dataset.orientation = orientation;
      face.replaceChildren();

      if (currentCard === null) {
        face.className = 'fallback-card__face fallback-card__face--back';
        face.setAttribute('role', 'img');
        face.setAttribute('aria-label', APP_COPY.fallbackCard);
        title.textContent = APP_COPY.fallbackCard;
        supporting.textContent = APP_COPY.fallbackCardEn;
        return;
      }

      const image = document.createElement('img');
      image.src = currentCard.image;
      image.alt = `${currentCard.nameZh}，${ORIENTATION_COPY[orientation]}`;
      image.dataset.orientation = orientation;
      face.className = 'fallback-card__face';
      face.removeAttribute('role');
      face.removeAttribute('aria-label');
      face.append(image);
      title.textContent = `${currentCard.nameZh} · ${ORIENTATION_COPY[orientation]}`;
      supporting.textContent = currentCard.nameEn;
    },
    dispose(): void {
      fallback.remove();
    },
  };
}

export function renderFallback2D(host: HTMLElement, model: Fallback2DModel): Fallback2D {
  const fallback = createFallback2D(host);
  fallback.render(model);
  return fallback;
}
