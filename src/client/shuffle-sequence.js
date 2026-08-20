const NORMAL_PHASES = ['converge', 'sphere', 'orbit', 'cut', 'merge'];
const REDUCED_PHASES = ['converge', 'merge'];
const NORMAL_DURATIONS = Object.freeze({ converge: 0.45, sphere: 0.8, orbit: 1.4, cut: 0.55, merge: 0.9 });
const REDUCED_DURATIONS = Object.freeze({ converge: 0.25, merge: 0.35 });
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const smoothstep = value => value * value * (3 - 2 * value);
const mix = (from, to, amount) => from + (to - from) * amount;
const point = (x = 0, y = 0, z = 0) => ({ x, y, z });
const read = value => point(value.x, value.y, value.z);

function write(target, value) {
  if (typeof target.set === 'function') target.set(value.x, value.y, value.z);
  else Object.assign(target, value);
}

function interpolate(target, from, to, amount) {
  write(target, point(
    mix(from.x, to.x, amount),
    mix(from.y, to.y, amount),
    mix(from.z, to.z, amount),
  ));
}

function deckTarget(index, deckY, order = index) {
  return {
    position: point(0, deckY, order * 0.006),
    rotation: point(),
    scale: point(1, 1, 1),
  };
}

function sphereTarget(index, count, radius) {
  const y = 1 - (2 * (index + 0.5)) / count;
  const horizontal = Math.sqrt(Math.max(0, 1 - y * y));
  const angle = index * GOLDEN_ANGLE;
  return {
    position: point(radius * horizontal * Math.cos(angle), radius * y, radius * horizontal * Math.sin(angle)),
    rotation: point(-y * 0.3, angle + Math.PI, (index % 7 - 3) * 0.025),
    scale: point(0.24, 0.24, 0.24),
  };
}

function cutTarget(index, deckY) {
  const pileIndex = Math.floor(index / 2);
  const side = index % 2 === 0 ? -1 : 1;
  return {
    position: point(side * 1.35, deckY + pileIndex * 0.002, pileIndex * 0.008),
    rotation: point(0, side * 0.08, side * 0.07),
    scale: point(0.34, 0.34, 0.34),
  };
}

function snapshot(cards) {
  return cards.map(card => ({
    position: read(card.position),
    rotation: read(card.rotation),
    scale: read(card.scale),
  }));
}

export function createShuffleSequence({ reducedMotion = false, radius = 3.4, deckY = -2 } = {}) {
  const phases = reducedMotion ? REDUCED_PHASES : NORMAL_PHASES;
  const durations = reducedMotion ? REDUCED_DURATIONS : NORMAL_DURATIONS;
  let cards = [];
  let phaseIndex = -1;
  let elapsed = 0;
  let phaseStart = [];
  let phaseTargets = [];
  let completed = false;
  let completionCallback = () => {};
  let state = { phase: 'idle', active: false, ready: false, progress: 0, orbitAngle: 0 };
  let sphereTargets = [];

  function targetsFor(phase) {
    if (phase === 'converge' || phase === 'merge') return cards.map((_, index) => deckTarget(index, deckY));
    if (phase === 'sphere') return sphereTargets;
    if (phase === 'cut') return cards.map((_, index) => cutTarget(index, deckY));
    return snapshot(cards);
  }

  function enterPhase(index) {
    phaseIndex = index;
    elapsed = 0;
    if (phaseIndex >= phases.length) {
      finish();
      return;
    }
    const phase = phases[phaseIndex];
    phaseStart = snapshot(cards);
    phaseTargets = targetsFor(phase);
    state = { ...state, phase, active: true, ready: false, progress: 0 };
  }

  function applyPhase(progress) {
    const eased = smoothstep(progress);
    if (state.phase === 'orbit') {
      const angle = 4 * Math.PI * eased;
      state = { ...state, orbitAngle: angle, progress };
      cards.forEach((card, index) => {
        const base = sphereTargets[index];
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        write(card.position, point(
          base.position.x * cos - base.position.z * sin,
          base.position.y + Math.sin(angle * 0.5 + index * 0.17) * 0.12,
          base.position.x * sin + base.position.z * cos,
        ));
        write(card.rotation, point(base.rotation.x + Math.sin(angle + index) * 0.12, base.rotation.y + angle, base.rotation.z));
        write(card.scale, base.scale);
      });
      return;
    }
    state = { ...state, progress };
    cards.forEach((card, index) => {
      interpolate(card.position, phaseStart[index].position, phaseTargets[index].position, eased);
      interpolate(card.rotation, phaseStart[index].rotation, phaseTargets[index].rotation, eased);
      interpolate(card.scale, phaseStart[index].scale, phaseTargets[index].scale, eased);
    });
  }

  function finish() {
    cards.forEach((card, index) => {
      const target = deckTarget(index, deckY);
      write(card.position, target.position);
      write(card.rotation, target.rotation);
      write(card.scale, target.scale);
    });
    state = { phase: 'ready', active: false, ready: true, progress: 1, orbitAngle: state.orbitAngle };
    if (!completed) {
      completed = true;
      completionCallback();
    }
  }

  return {
    start(nextCards) {
      if (!Array.isArray(nextCards) || nextCards.length === 0) throw new Error('Shuffle requires at least one card');
      cards = nextCards;
      sphereTargets = cards.map((_, index) => sphereTarget(index, cards.length, radius));
      completed = false;
      state = { phase: 'idle', active: false, ready: false, progress: 0, orbitAngle: 0 };
      enterPhase(0);
      return this.getState();
    },
    update(deltaSeconds) {
      if (!state.active || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return this.getState();
      let remaining = deltaSeconds;
      while (remaining > 0 && state.active) {
        const duration = durations[state.phase];
        const available = duration - elapsed;
        const consumed = Math.min(remaining, available);
        elapsed += consumed;
        remaining -= consumed;
        const progress = Math.min(1, elapsed / duration);
        applyPhase(progress);
        if (progress >= 1 - Number.EPSILON) enterPhase(phaseIndex + 1);
      }
      return this.getState();
    },
    skip() {
      if (state.active) finish();
      return this.getState();
    },
    reset(nextCards = cards) {
      cards = nextCards;
      cards.forEach((card, index) => {
        const target = deckTarget(index, deckY);
        write(card.position, target.position);
        write(card.rotation, target.rotation);
        write(card.scale, target.scale);
      });
      phaseIndex = -1;
      elapsed = 0;
      completed = false;
      state = { phase: 'idle', active: false, ready: false, progress: 0, orbitAngle: 0 };
      return this.getState();
    },
    getState() { return { ...state }; },
    onComplete(callback) {
      completionCallback = typeof callback === 'function' ? callback : () => {};
      return this;
    },
  };
}

