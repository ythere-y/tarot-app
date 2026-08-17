function setVisible(target) {
  if (!target?.style) return;
  target.style.opacity = '1';
  target.style.transform = 'none';
}

export function createUiMotion({ anime, root = document, reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false } = {}) {
  const running = new Map();
  let resultTimeline;
  let destroyed = false;
  const animate = (target, options) => {
    if (!target || destroyed || reducedMotion || !anime?.animate) { setVisible(target); return null; }
    running.get(target)?.cancel?.();
    const instance = anime.animate(target, options);
    running.set(target, instance);
    return instance;
  };
  const all = selector => [...(root?.querySelectorAll?.(selector) ?? [])];
  const one = selector => root?.querySelector?.(selector) ?? null;

  return {
    intro() {
      const targets = all('.editorial-intro');
      if (reducedMotion || !anime?.animate) return targets.forEach(setVisible);
      animate(targets, { opacity: [0, 1], y: [18, 0], delay: anime.stagger?.(90) ?? 0, duration: 850, ease: 'outExpo' });
    },
    updateStatus(element, value) {
      if (!element) return;
      element.textContent = value;
      animate(element, { opacity: [0.35, 1], y: [4, 0], duration: 280, ease: 'outQuad' });
    },
    focusReading() { animate(one('#ui-layer'), { '--ui-focus': 0.28, duration: 420, ease: 'outQuad' }); },
    releaseReading() { animate(one('#ui-layer'), { '--ui-focus': 1, duration: 420, ease: 'outQuad' }); },
    revealResult() {
      const targets = [one('#result-title'), one('#result-meaning'), one('#ai-reading')].filter(Boolean);
      if (reducedMotion || !anime?.createTimeline) return targets.forEach(setVisible);
      resultTimeline?.cancel?.();
      resultTimeline = anime.createTimeline({ defaults: { ease: 'outExpo' } });
      targets.forEach((target, index) => resultTimeline.add(target, { opacity: [0, 1], y: [16, 0], duration: 560 }, index ? '-=360' : 0));
    },
    revealHistory(entry) { animate(entry, { opacity: [0, 1], x: [-16, 0], duration: 480, ease: 'outExpo' }); },
    setAiState(state) {
      const panel = one('#ai-reading');
      if (!panel) return;
      if (panel.dataset) panel.dataset.state = state;
      animate(panel, { opacity: [0.55, 1], duration: state === 'loading' ? 700 : 360, ease: 'inOutQuad' });
    },
    destroy() {
      destroyed = true;
      resultTimeline?.cancel?.();
      running.forEach(instance => instance?.cancel?.());
      running.clear();
    },
  };
}
