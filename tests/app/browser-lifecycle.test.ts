import { afterEach, describe, expect, it } from 'vitest';

import {
  installTarotAppLifecycle,
  type TarotAppFactory,
} from '../../src/app/browser-lifecycle';
import type { TarotApp } from '../../src/app/app';

interface FakeApp extends TarotApp {
  readonly startCalls: number;
  readonly disposeCalls: number;
}

function transitionEvent(
  type: 'pagehide' | 'pageshow',
  persisted: boolean,
): PageTransitionEvent {
  const event = new Event(type);
  Object.defineProperty(event, 'persisted', { value: persisted });
  return event as PageTransitionEvent;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('installTarotAppLifecycle', () => {
  it('stops the cached page and rebuilds the app when BFCache restores it', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const apps: FakeApp[] = [];
    const createApp: TarotAppFactory = () => {
      const index = apps.length + 1;
      let startCalls = 0;
      let disposeCalls = 0;
      const app: FakeApp = {
        get startCalls() {
          return startCalls;
        },
        get disposeCalls() {
          return disposeCalls;
        },
        start(): void {
          startCalls += 1;
          root.textContent = `mounted-${index}`;
        },
        dispose(): void {
          disposeCalls += 1;
          root.replaceChildren();
        },
      };
      apps.push(app);
      return app;
    };
    const lifecycle = installTarotAppLifecycle({
      root,
      target: window,
      createApp,
    });

    expect(root.textContent).toBe('mounted-1');
    window.dispatchEvent(transitionEvent('pagehide', true));
    expect(apps[0]?.disposeCalls).toBe(1);
    expect(root.childNodes).toHaveLength(0);

    window.dispatchEvent(transitionEvent('pageshow', true));
    expect(apps).toHaveLength(2);
    expect(apps[1]?.startCalls).toBe(1);
    expect(root.textContent).toBe('mounted-2');

    lifecycle.dispose();
    expect(apps[1]?.disposeCalls).toBe(1);
  });

  it('permanently disposes the app when the page is not cached', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const apps: FakeApp[] = [];
    const createApp: TarotAppFactory = () => {
      let disposeCalls = 0;
      const app: FakeApp = {
        startCalls: 0,
        get disposeCalls() {
          return disposeCalls;
        },
        start(): void {
          root.textContent = 'mounted';
        },
        dispose(): void {
          disposeCalls += 1;
          root.replaceChildren();
        },
      };
      apps.push(app);
      return app;
    };
    const lifecycle = installTarotAppLifecycle({
      root,
      target: window,
      createApp,
    });

    window.dispatchEvent(transitionEvent('pagehide', false));
    expect(apps[0]?.disposeCalls).toBe(1);
    expect(root.childNodes).toHaveLength(0);

    window.dispatchEvent(transitionEvent('pageshow', true));
    expect(apps).toHaveLength(1);

    lifecycle.dispose();
    expect(apps[0]?.disposeCalls).toBe(1);
  });
});
