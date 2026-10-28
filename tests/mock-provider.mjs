// Loaded only by api.test.mjs. Never forwards an upstream network request.
import { makeDemoPack } from '../shared/rpg.mjs';
globalThis.fetch = async (url, options) => {
  if (url !== 'https://api.deepseek.com/chat/completions') throw new Error('Unexpected mock upstream URL.');
  const request = JSON.parse(options.body), prompt = request.messages[0].content;
  if (request.thinking?.type !== 'disabled') throw new Error('Story and authoring requests must explicitly disable extra thinking output.');
  const envelope = JSON.parse(request.messages[1].content.split('Context and input follow:\n')[1]);
  const input = JSON.parse(envelope.input), pack = makeDemoPack();
  let result = { text: 'The fixture preserves the recorded outcome.' };
  if (prompt.includes('Compress supplied RPG story memory')) result = { recap: input.previousRecap === 'OVERSIZED_RECAP' ? 'x'.repeat(1801) : 'The crew reached the stair. The surveyor choice is unresolved.' };
  if (prompt.includes('Generate class identity')) { const { levels, advancements, ...sheet } = pack; result = { ...sheet, advancements: advancements.map(({ skills, ...node }) => node) }; }
  if (prompt.includes('Generate only the requested level')) result = pack.levels.find(pool => pool.level === input.level);
  if (prompt.includes('Generate only TWO unique skills')) result = { nodes: input.nodes.map(node => ({ id: node.id, skills: pack.advancements.find(candidate => candidate.id === node.id).skills })) };
  if (input.concept === 'OVERPOWERED') for (const key of Object.keys(result.stats)) result.stats[key] = 20;
  const content = input.concept === 'INVALID_JSON' ? '{bad' : JSON.stringify(result);
  return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: input.concept === 'TRUNCATED' ? 'length' : 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 200, prompt_cache_hit_tokens: 50 } }), { status: 200, headers: { 'content-type': 'application/json' } });
};
