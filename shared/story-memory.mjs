// Story prose is advisory memory. Engine facts remain authoritative in every prompt.
export const MEMORY_LIMITS = Object.freeze({ recapCharacters: 1800, recentEvents: 8, eventCharacters: 420, highlights: 24, retrievedHighlights: 3 });
export function createStoryMemory() {
  return { version: 1, totalEvents: 0, recapThrough: 0, recap: '', recapSource: 'local', recent: [], highlights: [], aiRecapAt: 0 };
}
const clip = (text, limit) => String(text || '').slice(0, limit);
function boundedLines(lines, limit) {
  while (lines.length > 1 && lines.join('\n').length > limit) lines.shift();
  return lines.join('\n').slice(-limit);
}
export function recordStoryEvent(state, entry) {
  if (!['story', 'important'].includes(entry.type) || /^(Round \d+|Tutorial:|EASY:|NORMAL:|HARD:|Initiative:)/.test(entry.text)) return;
  const memory = state.storyMemory ||= createStoryMemory();
  const event = { id: entry.id, seq: ++memory.totalEvents, depth: state.scene.depth, location: state.scene.title, text: clip(entry.text, MEMORY_LIMITS.eventCharacters), kind: /^You:/.test(entry.text) ? 'player-proposal' : entry.type === 'important' ? 'engine-event' : 'narrative' };
  memory.recent.push(event);
  while (memory.recent.length > MEMORY_LIMITS.recentEvents) {
    const older = memory.recent.shift();
    if (older.seq > memory.recapThrough) {
      memory.recap = boundedLines([...memory.recap.split('\n').filter(Boolean), `[${older.depth}: ${older.location}] ${older.kind}: ${older.text}`], MEMORY_LIMITS.recapCharacters);
      memory.recapThrough = older.seq;
      memory.recapSource = 'local';
    }
  }
  if (event.kind === 'engine-event') pinStoryHighlight(memory, { id: event.id, depth: event.depth, location: event.location, text: event.text });
}
export function hydrateStoryMemory(state) {
  if (state.storyMemory?.version === 1) return state.storyMemory;
  state.storyMemory = createStoryMemory();
  for (const entry of [...(state.logs || [])].reverse()) recordStoryEvent(state, entry);
  return state.storyMemory;
}
export function pinStoryHighlight(memory, highlight) {
  if (memory.highlights.some(item => item.id === highlight.id)) return;
  memory.highlights.push({ id: highlight.id, depth: highlight.depth, location: clip(highlight.location, 80), text: clip(highlight.text, 220) });
  memory.highlights = memory.highlights.slice(-MEMORY_LIMITS.highlights);
}
const words = value => new Set(String(value || '').toLowerCase().match(/[a-z0-9]{3,}/g) || []);
export function storyPromptMemory(state, query = '') {
  const memory = hydrateStoryMemory(state), search = words(`${query} ${state.scene.title} ${state.scene.objective}`);
  const ranked = memory.highlights.map((highlight, index) => ({ highlight, score: [...words(`${highlight.location} ${highlight.text}`)].filter(word => search.has(word)).length, index }));
  ranked.sort((a, b) => b.score - a.score || b.index - a.index);
  return { recap: memory.recap, recapSource: memory.recapSource, recentEvents: memory.recent, relevantHighlights: ranked.slice(0, MEMORY_LIMITS.retrievedHighlights).map(item => item.highlight) };
}
export function recapRequest(state) {
  const memory = hydrateStoryMemory(state);
  return { throughEvent: memory.totalEvents, previousRecap: memory.recap, events: memory.recent, highlights: memory.highlights.slice(-6) };
}
export function acceptRecap(state, throughEvent, text) {
  const memory = hydrateStoryMemory(state);
  // A late response must never overwrite a newer timeline, including a rewind.
  if (memory.totalEvents !== throughEvent || typeof text !== 'string' || !text.trim() || text.length > MEMORY_LIMITS.recapCharacters) return false;
  memory.recap = text.trim(); memory.recapSource = 'ai'; memory.aiRecapAt = throughEvent; memory.recapThrough = throughEvent;
  return true;
}
export function automaticHighlight(state) {
  const kind = state.storyFlags.partyDefeated ? 'Expedition ended' : state.mode === 'complete' ? 'Encounter cleared' : state.mode === 'choice' ? 'Before the choice' : 'Scene entrance';
  return { id: `${state.campaignId}:${state.scene.id}:${kind}`, kind, title: `${state.scene.title} - ${kind}` };
}
