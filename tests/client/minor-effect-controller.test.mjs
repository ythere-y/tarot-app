import test from 'node:test';
import assert from 'node:assert/strict';
import { createMinorEffectController } from '../../src/client/effects/minor-effect-controller.js';

test('runs lifecycle and forwards updates', () => {
  const calls=[];
  const controller=createMinorEffectController({ tier:'low', rendererFactory:({profile})=>({
    reveal:()=>calls.push('reveal'), settle:()=>calls.push('settle'), update:dt=>calls.push(dt), dispose:()=>calls.push('dispose'), profile
  })});
  assert.equal(controller.getState(),'idle');
  assert.equal(controller.prepare({type:'minor',suit:'Cups'},'upright',{x:1,y:2,z:0}),true);
  assert.equal(controller.getState(),'prepared');
  controller.reveal(); controller.update(.1); controller.settle(); controller.dispose(); controller.dispose();
  assert.deepEqual(calls,['reveal',.1,'settle','dispose']);
  assert.equal(controller.getState(),'disposed');
});

test('majors are no-op and replacing an effect disposes the old instance', () => {
  let disposed=0;
  const controller=createMinorEffectController({rendererFactory:()=>({reveal(){},settle(){},update(){},dispose(){disposed++;}})});
  assert.equal(controller.prepare({type:'major'},'upright',{}),false);
  controller.prepare({type:'minor',suit:'Wands'},'upright',{});
  controller.prepare({type:'minor',suit:'Swords'},'reversed',{});
  assert.equal(disposed,1);
});
