import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createThreeElementRenderer } from '../../src/client/effects/three-element-renderer.js';

test('creates the requested particles and follows lifecycle phases', () => {
  const scene=new THREE.Scene(); const anchor=new THREE.Vector3(1,2,0);
  const profile={element:'water',palette:['#D9FAFF','#42C8E8','#2464C7'],particleCount:80,flow:'outward',verticalDirection:1,turbulence:.45};
  const effect=createThreeElementRenderer({THREE,scene,profile,anchor});
  assert.equal(scene.children.length,1); assert.equal(effect.getSnapshot().particleCount,80);
  effect.reveal(); effect.update(.25); assert.equal(effect.getSnapshot().phase,'revealing');
  effect.settle(); effect.update(.25); assert.equal(effect.getSnapshot().phase,'settled');
  effect.dispose(); effect.dispose();
  assert.equal(scene.children.length,0); assert.equal(effect.getSnapshot().disposed,true);
});

test('updates positions for every element and reversed flow', () => {
  for (const element of ['fire','water','air','earth']) {
    const scene=new THREE.Scene();
    const profile={element,palette:['#fff','#888','#000'],particleCount:8,flow:'inward',verticalDirection:-1,turbulence:.8};
    const effect=createThreeElementRenderer({THREE,scene,profile,anchor:{x:0,y:0,z:0}});
    const before=scene.children[0].geometry.attributes.position.array.slice();
    effect.reveal(); effect.update(.2);
    const after=scene.children[0].geometry.attributes.position.array;
    assert.notDeepEqual([...after],[...before],`${element} particles should move`);
    effect.dispose();
  }
});
