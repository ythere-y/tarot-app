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
    const response = await fetch(`${base}/api/reading`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ topic: 'general', cardName: 'The Fool', orientation: 'upright', standardMeaning: '新的开始。' }) });
    assert.deepEqual(await response.json(), expected);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
