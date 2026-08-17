import {
  createTarotApp,
  type CreateTarotAppOptions,
  type TarotApp,
} from './app';

export type TarotAppFactory = (
  options: CreateTarotAppOptions,
) => TarotApp;

export interface BrowserLifecycleOptions {
  readonly root: HTMLElement;
  readonly target?: Window;
  readonly createApp?: TarotAppFactory;
}

export interface BrowserLifecycle {
  dispose(): void;
}

export function installTarotAppLifecycle({
  root,
  target = window,
  createApp = createTarotApp,
}: BrowserLifecycleOptions): BrowserLifecycle {
  let activeApp: TarotApp | null = null;
  let lifecycleDisposed = false;

  const mount = (): void => {
    if (lifecycleDisposed || activeApp !== null) {
      return;
    }
    activeApp = createApp({ root });
    activeApp.start();
  };

  const removeListeners = (): void => {
    target.removeEventListener('pagehide', onPageHide);
    target.removeEventListener('pageshow', onPageShow);
  };

  const onPageHide = (event: PageTransitionEvent): void => {
    activeApp?.dispose();
    activeApp = null;
    if (!event.persisted) {
      lifecycleDisposed = true;
      removeListeners();
    }
  };

  const onPageShow = (event: PageTransitionEvent): void => {
    if (event.persisted) {
      mount();
    }
  };

  target.addEventListener('pagehide', onPageHide);
  target.addEventListener('pageshow', onPageShow);
  mount();

  return {
    dispose(): void {
      if (lifecycleDisposed) {
        return;
      }
      lifecycleDisposed = true;
      removeListeners();
      activeApp?.dispose();
      activeApp = null;
    },
  };
}
