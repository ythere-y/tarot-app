import test from 'node:test';
import assert from 'node:assert/strict';
import { getMinorElement, createMinorEffectProfile, getParticleBudget } from '../../src/client/effects/minor-effect-profile.js';

test('maps the four minor suits and excludes majors', () => {
  assert.equal(getMinorElement({ type: 'minor', suit: 'Wands' }), 'fire');
  assert.equal(getMinorElement({ type: 'minor', suit: 'Cups' }), 'water');
  assert.equal(getMinorElement({ type: 'minor', suit: 'Swords' }), 'air');
  assert.equal(getMinorElement({ type: 'minor', suit: 'Pentacles' }), 'earth');
  assert.equal(getMinorElement({ type: 'major' }), null);
  assert.throws(() => getMinorElement({ type: 'minor', suit: 'Stars' }), /Unknown minor suit/);
});

test('builds upright and reversed profiles at each budget', () => {
  assert.deepEqual(['standard','low','reduced'].map(getParticleBudget), [800,250,80]);
  const up = createMinorEffectProfile({ type:'minor', suit:'Wands' }, 'upright', 'low');
  const rev = createMinorEffectProfile({ type:'minor', suit:'Wands' }, 'reversed', 'reduced');
  assert.equal(up.flow, 'outward'); assert.equal(up.verticalDirection, 1); assert.equal(up.turbulence, 0.45);
  assert.equal(rev.flow, 'inward'); assert.equal(rev.verticalDirection, -1); assert.equal(rev.turbulence, 0.8);
  assert.equal(up.particleCount, 250); assert.equal(rev.particleCount, 80);
  assert.deepEqual(up.palette, ['#FFE29A','#FF8A2A','#D9381E']);
  assert.equal(createMinorEffectProfile({ type:'major' }, 'upright', 'standard'), null);
});
