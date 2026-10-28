# Long-story costs, recaps and highlight saves

Implemented 27 October 2026. Open **Story** in the campaign inspector to see the recap, save a named highlight, resume a scene or export it. **Workshop > API costs** now compares growing transcripts with a bounded memory strategy.

## What goes into a narration request

1. **Current engine facts:** party, levels/HP, location, objective, encounter plan, canonical choice values and unresolved milestones. These are authoritative even if a recap contradicts them.
2. **Recap:** up to 1,800 characters covering older story material. A local excerpt recap is maintained automatically, without an additional model call.
3. **Recent context:** up to eight story events, each at most 420 characters. Player proposals are labeled separately from resolved engine events and narrative. Routine combat messages, initiative announcements, tutorial text and round counters do not fill this window. The last three combat results are sent separately when available.
4. **Relevant highlights:** up to three short records selected by lexical overlap with the request, location and objective, with recency as a tie-breaker. At most 24 highlight records are held in prompt memory.

The model receives this packet on every scene, intent or narration request, rather than an unbounded transcript. Its returned prose cannot change stats, award an item or complete a quest. The engine still resolves those operations.

Local recaps preserve bounded excerpts; they are not semantic summaries of every past sentence. When useful, click **Improve recap with AI**. That makes one extra request using the existing recap, recent events and recent highlights, and accepts a recap no longer than 1,800 characters. The app does not automatically make repeated summary requests. Failed, malformed or stale responses leave the current memory intact. An AI recap remains advisory, so it cannot override game facts. Events already included in that recap are not appended to it again when they leave the recent window.

Important old details can still be omitted by either kind of compression. Confirmed quest/choice state remains separate, and saved scene snapshots retain their own version of the game and its memory. This release uses lightweight lexical retrieval, not embeddings or an external vector database. It does not archive an unlimited verbatim transcript; the on-screen game log remains bounded.

## Highlight scenes are actual saves

The app automatically records an immutable snapshot at a scene entrance, before an unresolved choice, after clearing an encounter and after defeat. **Save this moment** creates a named manual snapshot and a short prompt-memory highlight. Snapshots include the map, party and class sheets, HP/resources, inventory, choices, progression, turn/initiative, seeded random state and story memory.

Snapshots live in IndexedDB, separately from the current campaign's localStorage autosave. Repeated autosaves never overwrite an existing scene checkpoint. Resuming a snapshot replaces the active timeline with that saved state; later checkpoints stay available. The scene list covers all expeditions, so creating another party does not hide prior highlights. A defeated expedition has **Review saved scenes** to reach recovery saves.

**Export** downloads the checkpoint's campaign-state JSON. In-app selection/restoration uses the browser database; JSON import is not added in this release. These are local device/browser saves, with no cloud synchronization. Clearing site storage can remove them. Storage failures are shown without stopping the local game; the ordinary campaign autosave remains separate.

## Cost of a growing story

Rates checked against [DeepSeek's official pricing](https://api-docs.deepseek.com/quick_start/pricing/) on 27 October 2026. The legacy V4 Flash alias is served at current Flash pricing. Per million tokens: uncached input $0.15 off-peak / $0.30 peak; output $0.60 / $1.20; cached input $0.003 / $0.006. The official [token guide](https://api-docs.deepseek.com/quick_start/token_usage/) estimates an English character at about 0.3 token.

The following calculations assume:

- One 300-character player message and one 300-character AI response per exchange, about 90 tokens each.
- A repeated 1,000-token base for instructions and current state.
- No cache discount, no thinking output, and one model call per AI reply.
- Full history sends all preceding exchanges every time.
- Rolling memory reserves 500 recap tokens, 200 retrieved-highlight tokens and up to four preceding conversation pairs. The recent window ramps up over the first four turns. Reserving recap/highlight allowances from the first turn is conservative for an empty opening.

| AI replies | Full growing transcript, off-peak / peak | Bounded recap + recent + highlights, off-peak / peak |
| --- | --- | --- |
| 100 | $0.1554 / $0.3108 | $0.0428 / $0.0856 |
| 500 | $3.4770 / $6.9540 | $0.2150 / $0.4300 |
| 1,000 | $13.7040 / $27.4080 | $0.4302 / $0.8605 |

For N replies:

```
fullInputTokens = N*(1000 + 90) + 180*N*(N-1)/2
rollingInputTokens = N*(1000 + 500 + 200 + 90)
                   + 180*sum(min(turnIndex, 4), turnIndex=0..N-1)
storyOutputTokens = 90*N
cost = inputTokens*inputRate/1,000,000 + outputTokens*outputRate/1,000,000
```

Full-history cumulative billing grows approximately quadratically because past text is billed again on later requests. A bounded packet keeps cumulative billing approximately linear. For the 100-reply case, full history totals 1,000,000 input tokens and rolling memory totals 249,200; both generate about 9,000 output tokens. At 1,000 replies the respective input totals are 91,000,000 and 2,508,200. These are accumulated across requests, not the size of one context window.

### If an AI writes the recap

The calculator also supports a **what-if** scenario with one AI recap every ten replies. Assume 3,500 uncached input and 500 output tokens per recap request, and no recap after the last reply because it cannot help that session. This adds 9 / 49 / 99 requests for 100 / 500 / 1,000 replies respectively.

| AI replies | Rolling memory including these recap requests, off-peak / peak |
| --- | --- |
| 100 | $0.0502 / $0.1004 |
| 500 | $0.2554 / $0.5108 |
| 1,000 | $0.5119 / $1.0238 |

The current app only makes those recap requests on an explicit button click; selecting a cadence in the cost calculator does not schedule them. Local excerpt recaps have no generation-request cost, but their text still counts as input when sent to the narrator.

These are scenarios, not measured bills. JSON wrappers, prompt/event metadata, longer output, extra intent/scene/narration calls and class generation add usage. The implemented eight-event window does not always equal four conversation pairs, and events may be longer than 300 characters. The calculator exposes the budgets for that reason. Returned API usage is the billing source of truth. The previous $0.0204 / $0.0408 estimate used only 1,000 total input tokens per call; this larger packet reserves more space for continuity. If “100 messages” includes both sides, use fifty replies.

## Implementation and checks

- `shared/story-memory.mjs`: bounded event memory, local recap, relevance selection, stale recap protection, legacy migration and checkpoint identities.
- `src/checkpoints.ts`: immutable IndexedDB snapshots and a metadata index.
- `src/main.ts`: narrator context, Story controls, manual AI recap, checkpoint creation/restoration, defeat recovery and export.
- `server/prompts.mjs` and `server/index.mjs`: distinct compression prompt, bounded sources and validated output; thinking remains disabled.
- `shared/pricing.mjs`: original full-history estimate plus rolling context and optional recap overhead.
- `tests/story-memory.test.mjs`: thousand-event bounds, proposals/facts, legacy hydration, stale/oversized recap rejection, checkpoint types and exact cost arithmetic. The API fixture also checks accepted/oversized/invalid recap responses.
- `tests/memory-browser-check.js`: actual bounded request after a thousand events, full-state rewind, defeat recovery, saves across expeditions, exactly one manual recap request, persistence, calculator values and mobile fit. All model calls in this check are intercepted fixtures; no paid API call is made.

Jev selected layered memory over summary-only or full-transcript-only designs with 100% probability for the selected option. This expresses confidence in that design judgment, not the probability of perfect recall or a predicted cost saving.
