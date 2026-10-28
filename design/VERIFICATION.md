# Expansion delivery and verification — 26 October 2026

## Story memory and checkpoint update — 27 October 2026

- Current behavior and cost arithmetic: [STORY-MEMORY.md](../STORY-MEMORY.md).
- Eighteen automated checks pass, including a thousand-event memory bound, proposal/fact separation, idempotent legacy hydration, stale/oversized AI recap rejection, checkpoint identities and growing/full/rolling cost calculations with optional summary overhead. The fixture API accepts valid recaps and rejects malformed sources and excessive output.
- The memory browser check passes actual bounded request inspection after a thousand story events; manual highlight snapshot restoration (map, HP, gold, choices, RNG); recovery after defeat; earlier saves accessible from a new expedition; one explicit AI recap request; recap persistence; calculator values and narrow viewport fit. It intercepts model requests and makes no paid calls.
- Existing Workshop/game/combat and level-three progression browser checks pass with memory recording enabled. TypeScript and production build pass; the existing large Phaser bundle warning remains.
- [Story memory preview](previews/story-memory.png) captured and visually inspected. No live model quality or perfect historical recall is claimed. Local recaps are bounded excerpts, snapshots are local to this browser, and JSON export has no new import UI.

## UI, themes and power-budget update — 27 October 2026

- Current implementation and formulas: [UI-THEMES-BALANCE.md](../UI-THEMES-BALANCE.md).
- Fourteen automated checks pass. New coverage includes all three class presets against identical budgets, excessive aggregate attributes/chassis, negative-dice refund prevention, stacked skill effects, large areas, hard burst caps, free recovery, amplified stats, themed story identity, price arithmetic and actual PNG validity. Mock API output above the power ceiling is rejected; thinking is explicitly disabled in outgoing requests.
- TypeScript and the production build pass. Phaser's existing large game bundle warning remains.
- Original game/Workshop regression and level-three progression browser checks pass after the redesign, preserving nine class paths, 26 learned skills at cap and encounter rules.
- New world browser checks pass for apocalypse, survival and fantasy creation, class/enemy/equipment labels, save/reload, image serving, inspector/grid controls, excessive manual stat rejection, power display, compact/full-history cost calculations and 390-pixel layouts.
- [Preview images](previews/) were captured from the running application; apocalypse and power-budget previews were visually inspected. Final browser console: zero errors and warnings.
- Local fixture tests made no paid DeepSeek calls. Empirical balance and live model output quality are not established by these checks. Old saves are retained; individual generic monster/item/story template publication remains a future integration.
- The difficulty lab below is historical evidence for its own experiment; its original shared-code hashes do not certify the new budget module.

The remainder records the earlier expansion delivery.

The requested detailed design is `DND-EXPANSION-SPEC.md`. It preserves all requested systems, the two user-confirmed progression interpretations, exact formulas, schemas, page designs and proposed extra features. The working additions are listed separately from the next runtime integrations.

| Requested detail | Authoritative evidence |
| --- | --- |
| Story progression rules in DeepSeek prompts | `server/prompts.mjs` is imported by the active `/api/dm` handler; game context supplies level, chapter, unresolved choice and the computed encounter plan |
| Easy/normal/hard selection and increasing minimum counts | Game selector, Workshop editor, `shared/rpg.mjs` encounterPlan/validateRules; contract tests cover party sizes 1–4 and levels 1–10 |
| Average of the entire party | The engine passes every registered hero's level; formulas and positive round-half-up policy are explicit in the spec |
| Requested level offsets and 0.90/1.00/1.20 modifiers | Exact contract assertions and numeric examples; 72 generated encounter cases confirm actual levels/counts and legal distinct spawns |
| Boss levels and player cap | Hard level-10 party produces a level-11 boss; all nine class-path progression cases keep players at level 10 even with excess XP |
| Auto-research and useful additions | `research/difficulty-lab` fixed evaluator, baseline/candidate results, hashes, commits, ledger; feature priorities and benchmark limits documented in the spec |
| Canvas 2D and radius templates | Shared Canvas renderer, seven exported skill shape templates, shared affectedTiles geometry in the Phaser board and Canvas; geometry tests cover radius, range, orientation and sight blocking |
| Item/monster/skill/story templates | Exported JSON schemas and valid examples; Workshop authoring library validation/save/export; individual monster/item/story runtime publication is explicitly planned, not claimed active |
| Turn-based movement/action profiles | Runtime move-and-act, move-or-act and stationary handling; built-in monster profiles declared; browser engine check confirms move-or-act cannot move and attack in one turn |
| Freely created class/stat/skill sheets | Concept authoring page, staged DeepSeek API modes, custom attributes, runtime effect interpreter, full schema/reference validation; real model response quality is not tested without a key |
| 50 regular options and choose 2 per level, including level 1 | Complete 10×5 class template, creator two-choice gate, progression UI and runtime guards |
| Nine final class paths and 3/5/8 milestones | Full 3/9/9 node topology, parent validation and progression execution along all nine paths |
| Two unique grants at each advanced choice | All nine terminal-path checks reach 26 learned skills; visible level-3 UI produces eight total learned skills |
| Configuration pages | Workshop rules, class/progression, Canvas and typed content editors; browser checks exercise saves, publication, targeting updates and mobile fit |
| Detailed plan and further features | All fifteen sections of the expansion specification, including remaining monster/item/story runtime integration, waves, intent telegraphs and active loadouts |

## Completed checks

- `npm run typecheck`: passed.
- `npm test`: seven checks passed, including the local HTTP API with a fixture provider, truncation rejection, input validation, schemas, staged generation, scaling and targeting.
- `npm run build`: both game and Workshop built. Vite still reports the existing large Phaser game chunk (about 1.44 MB uncompressed); this is not a build failure.
- `tests/browser-check.js` through isolated Playwright session: rules editing/publication, class publication, Canvas controls, template save, character creation, initial enemy turns, custom shield/action/resource use, save/resume, all nine class paths, 72 encounter setups, custom damage, illegal casts, cooldowns and move/action handling passed.
- `tests/progression-browser-check.js`: one-skill rejection, two-of-five choices, three eligible level-3 classes, two unique skill grants, saved level-3 character with eight skills, next-fight plan at the party's new level, preserved advancement through descent and 390-pixel Workshop layout passed.
- Browser console: zero errors and zero warnings on the final checks.
- Auto-research: 8,640 matches for each of two candidates. Evaluator SHA-256 unchanged from baseline. Requested game defaults remain intact; the alternate AC rule is optional.
- Research commits are preserved in `research/difficulty-lab/history.bundle`; local Git metadata is stored outside that artifact folder in the ignored `.research-history` directory, so the lab's source/results can be versioned normally with the game.

## Coverage limits

API checks use deterministic fixtures and never contact the paid DeepSeek endpoint. They verify request/response plumbing and validation, not real-model creativity, latency or quality. The built-in example class is openly labeled offline content. The balance lab omits tactics, terrain, healing and custom skill combinations; its win rates are not player outcome estimates. Templates for individual item/monster/story records are complete authoring artifacts; their generic campaign publication remains a next implementation step, fully specified in the design.
