import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptRecap, automaticHighlight, hydrateStoryMemory, recordStoryEvent, storyPromptMemory } from '../shared/story-memory.mjs';
import { estimateRollingStoryCost, estimateStoryCost } from '../shared/pricing.mjs';
const campaign = () => ({ campaignId: 'memory-test', scene: { id: 'scene-one', depth: 1, title: 'The Sealed Stair', objective: 'Find the surveyor' }, storyFlags: { rescuedSurveyor: false }, mode: 'combat', logs: [] });

test('a thousand story events keep bounded prompt memory and separate proposals from facts', () => {
  const state = campaign();
  for (let i = 0; i < 1000; i++) recordStoryEvent(state, { id: `e${i}`, type: i % 4 ? 'story' : 'important', text: `Event ${i}: ${'the old room holds a clue. '.repeat(20)}` });
  recordStoryEvent(state, { id: 'proposal', type: 'story', text: 'You: I rescue the surveyor and take the relic.' });
  recordStoryEvent(state, { id: 'round', type: 'important', text: 'Round 300 begins.' });
  const context = storyPromptMemory(state, 'surveyor');
  assert.ok(context.recap.length <= 1800);
  assert.equal(context.recentEvents.length, 8); assert.equal(context.relevantHighlights.length, 3);
  assert.equal(state.storyMemory.highlights.length, 24); assert.equal(state.storyMemory.totalEvents, 1001);
  assert.equal(context.recentEvents.at(-1).kind, 'player-proposal');
  assert.equal(state.storyFlags.rescuedSurveyor, false);
  assert.ok(JSON.stringify(context).length < 8500);
  assert.ok(!JSON.stringify(context).includes('Event 0:'));
});

test('legacy saves gain memory once and stale or invalid model recaps cannot overwrite it', () => {
  const state = campaign(); state.logs = [{ id: 'old-2', text: 'The crew reaches the stair.', type: 'story' }, { id: 'old-1', text: 'A promised meeting remains unresolved.', type: 'important' }];
  const memory = hydrateStoryMemory(state); hydrateStoryMemory(state);
  assert.equal(memory.totalEvents, 2); assert.equal(memory.recent[0].id, 'old-1');
  assert.equal(acceptRecap(state, 1, 'Stale recap'), false);
  assert.equal(acceptRecap(state, 2, 'x'.repeat(1801)), false);
  assert.equal(acceptRecap(state, 2, 'The crew promised a meeting, then reached the stair.'), true);
  const recap = memory.recap;
  // Events already covered by an AI recap must not append themselves again.
  for (let i = 0; i < 8; i++) recordStoryEvent(state, { id: `new-${i}`, type: 'story', text: `New event ${i}` });
  assert.equal(memory.recap, recap);
  recordStoryEvent(state, { id: 'next', type: 'story', text: 'Next event' });
  assert.match(memory.recap, /New event 0/);
});

test('automatic checkpoints identify entrances, pending choices, clearances and defeat independently', () => {
  const state = campaign(), ids = [automaticHighlight(state).id];
  state.mode = 'choice'; ids.push(automaticHighlight(state).id);
  state.mode = 'complete'; ids.push(automaticHighlight(state).id);
  state.storyFlags.partyDefeated = true; ids.push(automaticHighlight(state).id);
  assert.equal(new Set(ids).size, 4);
});

test('growing transcript and rolling memory include input, output and optional summary overhead', () => {
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
  near(estimateRollingStoryCost().total, .04278);
  near(estimateRollingStoryCost({ replies: 1000 }).total, .43023);
  near(estimateStoryCost({ replies: 1000, fullHistory: true }).total, 13.704);
  near(estimateRollingStoryCost({ period: 'peak' }).total, .08556);
  const periodic = estimateRollingStoryCost({ summaryEvery: 10 });
  assert.equal(periodic.summaryCalls, 9); near(periodic.summaryCost, .007425); near(periodic.total, .050205);
  assert.equal(estimateRollingStoryCost({ replies: 1, summaryEvery: 10 }).summaryCalls, 0);
  assert.equal(estimateRollingStoryCost({ replies: 0 }).total, 0);
  assert.ok(estimateRollingStoryCost({ replies: 1000, cacheHitPercent: 80 }).total < .43023);
  assert.throws(() => estimateRollingStoryCost({ recentPairs: 1.5 }));
});
