import { createMinorEffectProfile } from './minor-effect-profile.js';

export function createMinorEffectController({ rendererFactory, tier='standard' }) {
  if (typeof rendererFactory !== 'function') throw new TypeError('rendererFactory is required');
  let state='idle';
  let active=null;

  const disposeActive=()=>{
    if (!active) return;
    active.dispose();
    active=null;
  };

  return {
    prepare(card, orientation, anchor) {
      const profile=createMinorEffectProfile(card, orientation, tier);
      disposeActive();
      if (!profile) { state='idle'; return false; }
      active=rendererFactory({profile,anchor});
      state='prepared';
      return true;
    },
    reveal() {
      if (!active || state!=='prepared') return false;
      active.reveal(); state='revealing'; return true;
    },
    settle() {
      if (!active || !['prepared','revealing'].includes(state)) return false;
      active.settle(); state='settled'; return true;
    },
    update(dt) { if (active && state!=='disposed') active.update(dt); },
    dispose() { disposeActive(); state='disposed'; },
    getState() { return state; }
  };
}
