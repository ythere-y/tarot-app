import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../../server.mjs';

test('app exposes five topics and AI reading contract', async () => {
  const expected = { headline: '留意新的入口', reading: '可以温和地探索新方向。', action: '写下一项小尝试。', disclaimer: '内容仅供娱乐与自我反思。' };
  const server = createAppServer({ readingService: { generate: async () => expected } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const html = await (await fetch(base)).text();
    for (const label of ['综合', '感情', '事业', '财运', '成长']) assert.match(html, new RegExp(label));
    for (const id of ['ai-headline', 'ai-text', 'ai-action', 'ai-disclaimer']) assert.match(html, new RegExp(`id="${id}"`));
    assert.match(html, /class="oracle-header editorial-intro"/);
    assert.match(html, /THE INTERACTIVE ARCANA/);
    assert.match(html, /class="oracle-console editorial-intro"/);
    assert.match(html, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(html, /\/vendor\/anime\.esm\.js/);
    assert.match(html, /createUiMotion/);
    assert.match(html, /animate as animeAnimate/);
    assert.doesNotMatch(html, /import \{ animate, createTimeline, stagger \}/);
    assert.match(html, /const matFront = new THREE\.ShaderMaterial/);
    assert.match(html, /tex\.anisotropy = renderer\.capabilities\.getMaxAnisotropy\(\)/);
    assert.match(html, /new THREE\.LineBasicMaterial\(\{ color: 0xffdf82/);
    assert.match(html, /saturation:\s*\{ value: 1\.04 \}/);
    assert.match(html, /contrast:\s*\{ value: 1\.06 \}/);
    assert.match(html, /vec3 softClipped = contrasted \/ \(1\.0 \+ max\(contrasted - 0\.92, 0\.0\) \* 1\.6\)/);
    assert.match(html, /color:\s*0x4b356f/);
    assert.match(html, /emissive:\s*0x5a3b10/);
    assert.match(html, /cardHeight,\s*0\.12/);
    assert.match(html, /new THREE\.EdgesGeometry\(geometry\)/);
    assert.match(html, /createMinorEffectController/);
    assert.match(html, /createThreeElementRenderer/);
    assert.match(html, /elementEffect\.prepare\(draw\.data/);
    assert.match(html, /elementEffect\.reveal\(\)/);
    assert.match(html, /elementEffect\.settle\(\)/);
    assert.match(html, /elementEffect\.update\(dt\)/);
    assert.match(html, /suit,/);
    const response = await fetch(`${base}/api/reading`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ topic: 'general', cardName: 'The Fool', orientation: 'upright', standardMeaning: '新的开始。' }) });
    assert.deepEqual(await response.json(), expected);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
