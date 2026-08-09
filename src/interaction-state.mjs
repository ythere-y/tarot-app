export function createInteractionState() {
  return { phase: "IDLE" };
}

export function isPointInsideRevealZone(point, bounds) {
  return (
    Math.abs(point.x) <= bounds.halfWidth &&
    Math.abs(point.y) <= bounds.halfHeight &&
    Math.abs(point.z) <= bounds.halfDepth
  );
}

export function transitionInteraction(state, event) {
  if (event.type === "RESET") return createInteractionState();

  const transitions = {
    IDLE: {
      POINTER_ENTER_DECK: "AIMING",
    },
    AIMING: {
      POINTER_LEAVE_DECK: "IDLE",
      GRAB: "DRAGGING",
    },
    DRAGGING: {
      ENTER_REVEAL_ZONE: "READY_TO_CONFIRM",
    },
    READY_TO_CONFIRM: {
      LEAVE_REVEAL_ZONE: "DRAGGING",
      CONFIRM: "REVEALED",
    },
  };

  return {
    phase: transitions[state.phase]?.[event.type] ?? state.phase,
  };
}
