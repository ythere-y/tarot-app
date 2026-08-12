const ELEMENTS = Object.freeze({
  Wands: Object.freeze({ element:'fire', palette:Object.freeze(['#FFE29A','#FF8A2A','#D9381E']) }),
  Cups: Object.freeze({ element:'water', palette:Object.freeze(['#D9FAFF','#42C8E8','#2464C7']) }),
  Swords: Object.freeze({ element:'air', palette:Object.freeze(['#F3F7FF','#9EDCFF','#A8A3C7']) }),
  Pentacles: Object.freeze({ element:'earth', palette:Object.freeze(['#D9A83E','#6F9B52','#76513A']) })
});

const BUDGETS = Object.freeze({ standard:800, low:250, reduced:80 });

export function getParticleBudget(tier) {
  if (!(tier in BUDGETS)) throw new Error(`Unknown performance tier: ${tier}`);
  return BUDGETS[tier];
}

export function getMinorElement(card) {
  if (!card || card.type !== 'minor') return null;
  const definition = ELEMENTS[card.suit];
  if (!definition) throw new Error(`Unknown minor suit: ${card.suit}`);
  return definition.element;
}

export function createMinorEffectProfile(card, orientation='upright', tier='standard') {
  const element = getMinorElement(card);
  if (!element) return null;
  if (!['upright','reversed'].includes(orientation)) throw new Error(`Unknown orientation: ${orientation}`);
  const reversed = orientation === 'reversed';
  const definition = ELEMENTS[card.suit];
  return Object.freeze({
    element,
    orientation,
    palette: definition.palette,
    particleCount: getParticleBudget(tier),
    flow: reversed ? 'inward' : 'outward',
    verticalDirection: reversed ? -1 : 1,
    turbulence: reversed ? 0.8 : 0.45
  });
}
