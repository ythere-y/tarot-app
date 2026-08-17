import test from 'node:test';
import assert from 'node:assert/strict';
import { createUiMotion } from '../../src/client/ui-motion.js';

const el = () => ({ style: {}, textContent: '', classList: { add(){}, remove(){} } });
function fixture(reducedMotion = false) {
  const elements = { '.editorial-intro': [el(), el()], '#ui-layer': el(), '#result-title': el(), '#result-meaning': el(), '#ai-reading': el() };
  const calls=[];
  const root={ querySelector:s=>elements[s] || null, querySelectorAll:s=>elements[s] || [] };
  const anime={ animate:(target,options)=>{ calls.push(['animate',target,options]); return { cancel(){ calls.push(['cancel',target]); } }; }, createTimeline:()=>({ add(target,options,at){ calls.push(['add',target,options,at]); return this; }, cancel(){} }), stagger:n=>n };
  return { motion:createUiMotion({ anime,root,reducedMotion }), calls, elements };
}

test('intro animates editorial elements and replacement status cancels old animation', () => {
  const {motion,calls}=fixture(); motion.intro(); const status=el(); motion.updateStatus(status,'one'); motion.updateStatus(status,'two');
  assert.equal(status.textContent,'two'); assert.ok(calls.some(c=>c[0]==='cancel')); assert.ok(calls.some(c=>c[0]==='animate'));
});

test('result reveal follows title, meaning, AI order', () => {
  const {motion,calls,elements}=fixture(); motion.revealResult();
  assert.deepEqual(calls.filter(c=>c[0]==='add').map(c=>c[1]), [elements['#result-title'],elements['#result-meaning'],elements['#ai-reading']]);
});

test('reduced motion sets final states without animation and missing elements are safe', () => {
  const {motion,calls,elements}=fixture(true); motion.intro(); motion.revealResult(); motion.revealHistory(null); motion.setAiState('loading');
  assert.equal(calls.length,0); assert.equal(elements['.editorial-intro'][0].style.opacity,'1');
});
