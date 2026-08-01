import type { DrawSnapshot } from '../app/types';
import type {
  InterpretationResponse,
  InterpretationTopic,
} from '../interpretation/types';
import { TAROT_CARDS } from '../tarot/cards';
import type { TarotCard } from '../tarot/types';

import {
  APP_COPY,
  ORIENTATION_COPY,
  PHASE_COPY,
  READING_TOPICS,
} from './copy';
import { createFallback2D, type Fallback2D } from './fallback-2d';

export type CameraStatus = 'idle' | 'requesting' | 'ready' | 'error';
export type InputMode = 'gesture' | 'pointer';

export interface GestureViewStatus {
  label: string;
  detail?: string;
  progress: number;
}

export interface CameraViewStatus {
  status: CameraStatus;
  message?: string;
  expanded?: boolean;
}

export type ResourceViewStatus =
  | { readonly status: 'idle' }
  | {
      readonly status: 'loading' | 'error';
      readonly resource: 'card-back' | 'card-face';
      readonly message: string;
    };

export interface AppViewModel {
  snapshot: DrawSnapshot;
  currentCard: TarotCard | null;
  interpretation: InterpretationResponse | null;
  topic: InterpretationTopic;
  gesture: GestureViewStatus;
  camera: CameraViewStatus;
  resource?: ResourceViewStatus;
  inputMode: InputMode;
  webglAvailable: boolean;
  cardCatalog?: readonly TarotCard[];
  totalCards?: number;
}

export interface AppViewActions {
  startCamera?: () => void;
  retryCamera?: () => void;
  usePointerMode?: () => void;
  retryResource?: () => void;
  selectTopic?: (topic: InterpretationTopic) => void;
  reset?: () => void;
}

export interface AppView {
  render(model: AppViewModel): void;
  getSceneHost(): HTMLElement;
  getVideoElement(): HTMLVideoElement;
  getHistoryTargetRect(): DOMRect;
  bind(actions: AppViewActions): void;
  dispose(): void;
}

const DEFAULT_TOTAL = 78;
let viewSequence = 0;

function setVisible(element: HTMLElement, visible: boolean): void {
  element.hidden = !visible;
}

function setText(element: Element, value: string): void {
  element.textContent = value;
}

function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) {
    return 0;
  }

  return Math.min(1, Math.max(0, progress));
}

function getRequiredElement<T extends Element>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`Missing app view element: ${selector}`);
  }

  return element;
}

function cameraMessage(camera: CameraViewStatus): string {
  if (camera.message !== undefined && camera.message.trim() !== '') {
    return camera.message;
  }

  switch (camera.status) {
    case 'idle':
      return APP_COPY.cameraIdle;
    case 'requesting':
      return APP_COPY.cameraRequesting;
    case 'ready':
      return APP_COPY.cameraReady;
    case 'error':
      return APP_COPY.cameraError;
  }
}

function createHistoryItem(
  item: DrawSnapshot['history'][number],
  card: TarotCard | undefined,
): HTMLLIElement {
  const row = document.createElement('li');
  row.className = 'history-card';
  row.dataset.ui = 'history-item';
  row.dataset.orientation = item.orientation;

  const frame = document.createElement('span');
  frame.className = 'history-card__frame';

  if (card !== undefined) {
    const image = document.createElement('img');
    image.className = 'history-card__image';
    image.src = card.image;
    image.alt = `${card.nameZh}，${ORIENTATION_COPY[item.orientation]}`;
    image.dataset.orientation = item.orientation;
    frame.append(image);
  } else {
    frame.classList.add('history-card__frame--missing');
    frame.setAttribute('role', 'img');
    frame.setAttribute('aria-label', '牌面暂不可用');
  }

  const text = document.createElement('span');
  text.className = 'history-card__text';

  const name = document.createElement('strong');
  name.textContent = card?.nameZh ?? '未知牌';

  const meta = document.createElement('span');
  const time = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(item.drawnAt));
  meta.textContent = `${ORIENTATION_COPY[item.orientation]} · ${time}`;

  text.append(name, meta);
  row.append(frame, text);
  return row;
}

function isTopic(value: string | undefined): value is InterpretationTopic {
  return READING_TOPICS.some((topic) => topic.value === value);
}

export function createAppView(root: HTMLElement): AppView {
  const id = ++viewSequence;
  const readingTitleId = `tarot-reading-title-${id}`;
  const tabPanelId = `tarot-reading-panel-${id}`;
  const historyTitleId = `tarot-history-title-${id}`;
  const cameraPanelId = `tarot-camera-panel-${id}`;

  root.classList.add('tarot-app');
  root.innerHTML = `
    <div class="celestial-shell">
      <svg class="celestial-linework" viewBox="0 0 900 900" aria-hidden="true">
        <circle cx="450" cy="450" r="390"></circle>
        <circle cx="450" cy="450" r="318"></circle>
        <path d="M450 60v780M60 450h780M174 174l552 552M726 174L174 726"></path>
        <path class="celestial-linework__orbit" d="M118 448c88-214 576-214 664 0-88 214-576 214-664 0Z"></path>
      </svg>

      <header class="app-masthead">
        <p class="remaining-count" data-ui="remaining" aria-live="polite"></p>
        <p class="phase-status" data-ui="phase" role="status" aria-live="polite"></p>
      </header>

      <main class="experience-grid">
        <section class="scene-stage" aria-label="塔罗抽牌星盘">
          <div class="scene-host" data-ui="scene-host"></div>

          <aside class="resource-status" data-ui="resource-status" hidden>
            <p data-ui="resource-message" role="status" aria-live="polite"></p>
            <button class="text-button" type="button"
              data-action="retry-resource" hidden>
              Retry loading
            </button>
          </aside>

          <section class="gesture-hud" aria-label="手势识别状态">
            <div class="gesture-hud__ring" data-ui="gesture-ring" aria-hidden="true"></div>
            <div>
              <p class="gesture-hud__label" data-ui="gesture-label" role="status" aria-live="polite"></p>
              <p class="gesture-hud__detail" data-ui="gesture-detail"></p>
            </div>
            <div class="sr-only" data-ui="gesture-progress" role="progressbar"
              aria-label="手势确认进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div>
          </section>

          <aside class="camera-dock" data-ui="camera">
            <button class="camera-dock__toggle" type="button" data-action="toggle-camera"
              aria-expanded="false" aria-controls="${cameraPanelId}">
              <span>${APP_COPY.camera}</span>
              <small>${APP_COPY.cameraEn}</small>
            </button>
            <div class="camera-dock__panel" id="${cameraPanelId}" data-ui="camera-panel" hidden>
              <video data-ui="camera-video" muted playsinline aria-label="摄像头手势预览"></video>
              <p data-ui="camera-message" role="status" aria-live="polite"></p>
              <div class="camera-dock__actions" data-ui="camera-actions"></div>
            </div>
          </aside>
        </section>

        <aside class="reading-panel" data-ui="reading" aria-labelledby="${readingTitleId}">
          <div class="reading-panel__heading">
            <p class="eyebrow">${APP_COPY.readingEn}</p>
            <h1 id="${readingTitleId}">${APP_COPY.reading}</h1>
          </div>
          <div class="card-identity">
            <h2 data-language="zh-CN"></h2>
            <p data-language="en"></p>
          </div>
          <div class="reading-tabs" role="tablist" aria-label="牌义主题"></div>
          <section class="reading-content" id="${tabPanelId}" role="tabpanel"
            tabindex="0" data-ui="reading-content">
            <p class="reading-content__keywords" data-ui="keywords"></p>
            <p class="reading-content__meaning" data-ui="meaning"></p>
            <ul class="reading-content__guidance" data-ui="guidance"></ul>
          </section>
        </aside>
      </main>

      <aside class="history-rail" aria-labelledby="${historyTitleId}">
        <div class="history-rail__heading">
          <p class="eyebrow">${APP_COPY.historyEn}</p>
          <h2 id="${historyTitleId}">${APP_COPY.history}</h2>
        </div>
        <ol class="history-list" data-ui="history"></ol>
        <p class="history-empty" data-ui="history-empty">${APP_COPY.noHistory}</p>
      </aside>

      <footer class="command-bar" aria-label="抽牌控制">
        <p class="input-mode" data-ui="input-mode"></p>
        <button class="seal-button seal-button--primary" type="button" data-action="start-camera">
          ${APP_COPY.startCamera}
        </button>
        <button class="seal-button" type="button" data-action="request-reset">
          ${APP_COPY.reset}
        </button>
      </footer>

      <dialog class="reset-confirmation" data-ui="reset-confirmation" role="alertdialog"
        aria-modal="true" aria-labelledby="reset-title-${id}" aria-describedby="reset-description-${id}" hidden>
        <div class="reset-confirmation__surface">
          <p class="eyebrow">New Cycle</p>
          <h2 id="reset-title-${id}">${APP_COPY.resetTitle}</h2>
          <p id="reset-description-${id}">${APP_COPY.resetDescription}</p>
          <div class="reset-confirmation__actions">
            <button class="seal-button seal-button--danger" type="button" data-action="confirm-reset">
              ${APP_COPY.confirmReset}
            </button>
            <button class="seal-button" type="button" data-action="cancel-reset">
              ${APP_COPY.cancel}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  `;

  const sceneHost = getRequiredElement<HTMLElement>(root, '[data-ui="scene-host"]');
  const video = getRequiredElement<HTMLVideoElement>(root, '[data-ui="camera-video"]');
  const history = getRequiredElement<HTMLOListElement>(root, '[data-ui="history"]');
  const readingTabs = getRequiredElement<HTMLElement>(root, '[role="tablist"]');
  const readingTabPanel = getRequiredElement<HTMLElement>(root, '[role="tabpanel"]');
  const cameraPanel = getRequiredElement<HTMLElement>(root, '[data-ui="camera-panel"]');
  const cameraToggle = getRequiredElement<HTMLButtonElement>(root, '[data-action="toggle-camera"]');
  const resetConfirmation = getRequiredElement<HTMLDialogElement>(root, '[data-ui="reset-confirmation"]');
  const resetTrigger = getRequiredElement<HTMLButtonElement>(root, '[data-action="request-reset"]');
  const topicTabs = new Map<InterpretationTopic, HTMLButtonElement>();
  for (const topic of READING_TOPICS) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'reading-tab';
    tab.dataset.action = 'select-topic';
    tab.dataset.topic = topic.value;
    tab.id = `tarot-reading-tab-${id}-${topic.value}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', tabPanelId);
    tab.textContent = topic.label;
    topicTabs.set(topic.value, tab);
    readingTabs.append(tab);
  }
  let actions: AppViewActions = {};
  let fallback: Fallback2D | null = null;
  let cameraExpanded = false;

  const updateCameraExpanded = (): void => {
    cameraPanel.hidden = !cameraExpanded;
    cameraToggle.setAttribute('aria-expanded', String(cameraExpanded));
  };

  const setBackgroundInert = (inert: boolean): void => {
    const siblings = resetConfirmation.parentElement?.children ?? [];
    for (const sibling of siblings) {
      if (!(sibling instanceof HTMLElement) || sibling === resetConfirmation) {
        continue;
      }
      if (inert) {
        sibling.setAttribute('inert', '');
      } else {
        sibling.removeAttribute('inert');
      }
    }
  };

  const closeResetConfirmation = (): void => {
    if (
      resetConfirmation.open
      && typeof resetConfirmation.close === 'function'
    ) {
      resetConfirmation.close();
    } else {
      resetConfirmation.removeAttribute('open');
    }
    resetConfirmation.hidden = true;
    setBackgroundInert(false);
    resetTrigger.focus();
  };

  const openResetConfirmation = (): void => {
    resetConfirmation.hidden = false;
    setBackgroundInert(true);
    if (
      !resetConfirmation.open
      && typeof resetConfirmation.showModal === 'function'
    ) {
      resetConfirmation.showModal();
    } else {
      resetConfirmation.setAttribute('open', '');
    }
    getRequiredElement<HTMLButtonElement>(
      resetConfirmation,
      '[data-action="confirm-reset"]',
    ).focus();
  };

  const onClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const button = target.closest<HTMLButtonElement>('button[data-action]');
    if (button === null || !root.contains(button)) {
      return;
    }

    switch (button.dataset.action) {
      case 'start-camera':
        actions.startCamera?.();
        break;
      case 'retry-camera':
        actions.retryCamera?.();
        break;
      case 'use-pointer':
        actions.usePointerMode?.();
        break;
      case 'retry-resource':
        actions.retryResource?.();
        break;
      case 'select-topic': {
        const topic = button.dataset.topic;
        if (isTopic(topic)) {
          actions.selectTopic?.(topic);
        }
        break;
      }
      case 'toggle-camera':
        cameraExpanded = !cameraExpanded;
        updateCameraExpanded();
        break;
      case 'request-reset':
        openResetConfirmation();
        break;
      case 'confirm-reset':
        closeResetConfirmation();
        actions.reset?.();
        break;
      case 'cancel-reset':
        closeResetConfirmation();
        break;
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Tab' && !resetConfirmation.hidden) {
      const focusable = Array.from(
        resetConfirmation.querySelectorAll<HTMLButtonElement>('button:not([disabled])'),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (
        first !== undefined
        && last !== undefined
        && (event.shiftKey
          ? document.activeElement === first
          : document.activeElement === last)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
      return;
    }

    const target = event.target;
    const tab = target instanceof Element
      ? target.closest<HTMLButtonElement>('[role="tab"]')
      : null;
    if (
      tab !== null
      && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
    ) {
      const tabs = Array.from(
        root.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
      );
      const currentIndex = tabs.indexOf(tab);
      let nextIndex = currentIndex;
      if (event.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % tabs.length;
      } else if (event.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = tabs.length - 1;
      }

      const nextTab = tabs[nextIndex];
      const topic = nextTab?.dataset.topic;
      if (nextTab !== undefined && isTopic(topic)) {
        event.preventDefault();
        nextTab.focus();
        actions.selectTopic?.(topic);
      }
      return;
    }

    if (event.key === 'Escape' && !resetConfirmation.hidden) {
      event.preventDefault();
      closeResetConfirmation();
    }
  };

  const onResetCancel = (event: Event): void => {
    event.preventDefault();
    closeResetConfirmation();
  };

  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKeyDown);
  resetConfirmation.addEventListener('cancel', onResetCancel);

  return {
    render(model): void {
      const totalCards = model.totalCards ?? DEFAULT_TOTAL;
      const resource = model.resource ?? { status: 'idle' };
      const orientation = model.snapshot.result?.orientation ?? 'upright';
      const progress = clampProgress(model.gesture.progress);
      const progressPercent = Math.round(progress * 100);

      setText(
        getRequiredElement(root, '[data-ui="remaining"]'),
        `${APP_COPY.remaining} ${model.snapshot.remainingCount} / ${totalCards} · ${APP_COPY.remainingEn}`,
      );
      setText(
        getRequiredElement(root, '[data-ui="phase"]'),
        PHASE_COPY[model.snapshot.phase.type],
      );
      setText(
        getRequiredElement(root, '[data-ui="gesture-label"]'),
        model.gesture.label,
      );
      setText(
        getRequiredElement(root, '[data-ui="gesture-detail"]'),
        model.gesture.detail ?? `确认进度 ${progressPercent}%`,
      );

      const gestureRing = getRequiredElement<HTMLElement>(root, '[data-ui="gesture-ring"]');
      gestureRing.style.setProperty('--gesture-progress', `${progressPercent * 3.6}deg`);
      const gestureProgress = getRequiredElement<HTMLElement>(root, '[data-ui="gesture-progress"]');
      gestureProgress.setAttribute('aria-valuenow', String(progressPercent));
      gestureProgress.setAttribute('aria-valuetext', `已确认 ${progressPercent}%`);

      setText(
        getRequiredElement(root, '[data-ui="input-mode"]'),
        model.inputMode === 'gesture' ? APP_COPY.gestureMode : APP_COPY.pointerMode,
      );

      const resourceStatus = getRequiredElement<HTMLElement>(
        root,
        '[data-ui="resource-status"]',
      );
      const resourceMessage = getRequiredElement<HTMLElement>(
        root,
        '[data-ui="resource-message"]',
      );
      const retryResource = getRequiredElement<HTMLButtonElement>(
        root,
        '[data-action="retry-resource"]',
      );
      resourceStatus.hidden = resource.status === 'idle';
      resourceStatus.dataset.status = resource.status;
      resourceMessage.textContent =
        resource.status === 'idle' ? '' : resource.message;
      resourceMessage.setAttribute(
        'role',
        resource.status === 'error' ? 'alert' : 'status',
      );
      retryResource.hidden = resource.status !== 'error';

      const cameraStatusMessage = cameraMessage(model.camera);
      const cameraMessageElement = getRequiredElement<HTMLElement>(root, '[data-ui="camera-message"]');
      cameraMessageElement.textContent = cameraStatusMessage;
      cameraMessageElement.setAttribute(
        'role',
        model.camera.status === 'error' ? 'alert' : 'status',
      );
      getRequiredElement<HTMLElement>(root, '[data-ui="camera"]').dataset.status =
        model.camera.status;

      const cameraActions = getRequiredElement<HTMLElement>(root, '[data-ui="camera-actions"]');
      cameraActions.replaceChildren();
      if (model.camera.status === 'error') {
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'text-button';
        retry.dataset.action = 'retry-camera';
        retry.textContent = APP_COPY.retryCamera;

        const pointer = document.createElement('button');
        pointer.type = 'button';
        pointer.className = 'text-button';
        pointer.dataset.action = 'use-pointer';
        pointer.textContent = APP_COPY.usePointer;
        cameraActions.append(retry, pointer);
        cameraExpanded = true;
      } else if (model.camera.status === 'idle') {
        const start = document.createElement('button');
        start.type = 'button';
        start.className = 'text-button';
        start.dataset.action = 'start-camera';
        start.textContent = APP_COPY.startCamera;
        cameraActions.append(start);
      }

      if (model.camera.status !== 'error' && model.camera.expanded !== undefined) {
        cameraExpanded = model.camera.expanded;
      }
      updateCameraExpanded();

      const catalog = new Map<string, TarotCard>(
        [...TAROT_CARDS, ...(model.cardCatalog ?? []), ...(model.currentCard === null ? [] : [model.currentCard])]
          .map((card) => [card.id, card]),
      );
      history.replaceChildren(
        ...model.snapshot.history.map((item) => createHistoryItem(item, catalog.get(item.cardId))),
      );
      setVisible(
        getRequiredElement<HTMLElement>(root, '[data-ui="history-empty"]'),
        model.snapshot.history.length === 0,
      );

      const zhName = getRequiredElement<HTMLElement>(root, '[data-language="zh-CN"]');
      const enName = getRequiredElement<HTMLElement>(root, '[data-language="en"]');
      const meaning = getRequiredElement<HTMLElement>(root, '[data-ui="meaning"]');
      const keywords = getRequiredElement<HTMLElement>(root, '[data-ui="keywords"]');
      const guidance = getRequiredElement<HTMLUListElement>(root, '[data-ui="guidance"]');

      for (const topic of READING_TOPICS) {
        const tab = topicTabs.get(topic.value);
        if (tab === undefined) {
          continue;
        }
        tab.setAttribute('aria-selected', String(topic.value === model.topic));
        tab.tabIndex = topic.value === model.topic ? 0 : -1;
        if (topic.value === model.topic) {
          readingTabPanel.setAttribute('aria-labelledby', tab.id);
        }
      }

      if (model.currentCard === null) {
        zhName.textContent = APP_COPY.noReading;
        enName.textContent = APP_COPY.readingEn;
        keywords.textContent = '';
        meaning.textContent = APP_COPY.noReading;
        guidance.replaceChildren();
      } else {
        const cardMeaning = model.currentCard.meanings[orientation];
        const interpretation = model.interpretation;
        const matchingInterpretation =
          interpretation?.cardId === model.currentCard.id
          && interpretation.orientation === orientation
          && interpretation.topic === model.topic
            ? interpretation
            : null;
        zhName.textContent = `${model.currentCard.nameZh} · ${ORIENTATION_COPY[orientation]}`;
        enName.textContent = model.currentCard.nameEn;
        keywords.textContent = cardMeaning.keywords.join(' · ');
        meaning.textContent =
          matchingInterpretation !== null
            ? matchingInterpretation.interpretation
            : cardMeaning[model.topic];
        guidance.replaceChildren(
          ...(matchingInterpretation !== null
            ? matchingInterpretation.guidance.map((item) => {
                const listItem = document.createElement('li');
                listItem.textContent = item;
                return listItem;
              })
            : []),
        );
      }

      const reading = getRequiredElement<HTMLElement>(root, '[data-ui="reading"]');
      reading.dataset.topic = model.topic;
      reading.dataset.orientation = orientation;

      if (!model.webglAvailable) {
        if (fallback === null) {
          fallback = createFallback2D(sceneHost);
        }
        fallback.render({
          snapshot: model.snapshot,
          currentCard: model.currentCard,
          orientation,
        });
        sceneHost.dataset.renderer = '2d';
      } else {
        fallback?.dispose();
        fallback = null;
        sceneHost.dataset.renderer = 'webgl';
      }

      setVisible(
        getRequiredElement<HTMLElement>(root, '[data-action="start-camera"]'),
        model.camera.status === 'idle' && model.inputMode === 'gesture',
      );
    },
    getSceneHost(): HTMLElement {
      return sceneHost;
    },
    getVideoElement(): HTMLVideoElement {
      return video;
    },
    getHistoryTargetRect(): DOMRect {
      return history.getBoundingClientRect();
    },
    bind(nextActions): void {
      actions = { ...nextActions };
    },
    dispose(): void {
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKeyDown);
      resetConfirmation.removeEventListener('cancel', onResetCancel);
      fallback?.dispose();
      fallback = null;
      const stream = video.srcObject as MediaStream | null;
      if (stream?.getTracks !== undefined) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
      }
      video.srcObject = null;
      root.replaceChildren();
      root.classList.remove('tarot-app');
    },
  };
}
