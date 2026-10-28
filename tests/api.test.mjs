import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { makeDemoPack } from '../shared/rpg.mjs';

test('local API validates staged model output and rejects truncation without a real model call', async t => {
  const probe = createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, ['--import', './tests/mock-provider.mjs', 'server/index.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port), DEEPSEEK_API_KEY: 'fixture-not-a-secret', DEEPSEEK_MODEL: 'fixture-model' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Fixture server did not start.')), 5000);
    child.stdout.on('data', chunk => { if (String(chunk).includes('listening')) { clearTimeout(timer); resolve(); } });
    child.on('exit', code => { clearTimeout(timer); reject(new Error(`Fixture server exited ${code}.`)); });
  });
  const base = `http://127.0.0.1:${port}`;
  assert.equal((await (await fetch(`${base}/api/status`)).json()).configured, true);
  const post = (mode, input) => fetch(`${base}/api/dm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode, context: '{}', input: JSON.stringify(input) }) });
  const sheet = await post('class_sheet', { concept: 'fixture' }); assert.equal(sheet.status, 200); assert.equal((await sheet.json()).result.advancements.length, 21);
  const pool = await post('level_skills', { level: 10 }); assert.equal(pool.status, 200); const body = await pool.json(); assert.equal(body.result.skills.length, 5); assert.equal(body.usage.cachedInputTokens, 50);
  const nodes = makeDemoPack().advancements.slice(0, 3); const pairs = await post('advanced_skills', { nodes }); assert.equal(pairs.status, 200); assert.equal((await pairs.json()).result.nodes[0].skills.length, 2);
  const invalid = await post('class_sheet', { concept: 'INVALID_JSON' }); assert.equal(invalid.status, 502); assert.equal((await invalid.json()).usage.outputTokens, 200);
  const truncated = await post('class_sheet', { concept: 'TRUNCATED' }); assert.equal(truncated.status, 502); assert.match((await truncated.json()).error, /truncated/);
  assert.equal((await post('level_skills', { level: 11 })).status, 400);
  assert.equal((await post('advanced_skills', { nodes: Array(4).fill(nodes[0]) })).status, 400);
  assert.equal((await post('toString', {})).status, 400);
  const overpower = await post('class_sheet', { concept: 'OVERPOWERED' }); assert.equal(overpower.status, 502); assert.match((await overpower.json()).error, /points|power/);
  const recapInput = { previousRecap: '', events: [{ text: 'The crew reached the stair.', kind: 'engine-event' }], highlights: [], throughEvent: 1 };
  const recap = await post('summarize', recapInput); assert.equal(recap.status, 200); assert.match((await recap.json()).result.recap, /unresolved/);
  assert.equal((await post('summarize', { ...recapInput, events: Array(9).fill(recapInput.events[0]) })).status, 400);
  const oversized = await post('summarize', { ...recapInput, previousRecap: 'OVERSIZED_RECAP' }); assert.equal(oversized.status, 502); assert.equal((await oversized.json()).usage.outputTokens, 200);
});
