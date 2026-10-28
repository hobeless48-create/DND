# Waypoint

A local browser tactical campaign with fantasy, apocalypse and wilderness survival worlds, image terrain, and freely generated class sheets. The original DND HTML prototypes are kept beside the app for reference. The latest UI, worlds, power limits and DeepSeek cost calculations are in [UI-THEMES-BALANCE.md](UI-THEMES-BALANCE.md); the progression and difficulty specification is [DND-EXPANSION-SPEC.md](DND-EXPANSION-SPEC.md).

## Run it

1. Install Node.js 20.19+ or 22.12+.
2. Open PowerShell in this folder and run `npm install` once.
3. Run `npm run dev`.
4. Open the Vite URL printed in the terminal. The game uses port 5173 when free and selects another port if it is occupied.

The local Dungeon Master, procedural maps, combat, dice, and save/load work without an API key. To enable optional DeepSeek narration and free-text intent parsing, copy `.env.example` to `.env`, add your own `DEEPSEEK_API_KEY`, then restart `npm run dev`. The key is read only by the local Node service; never place it in browser code. Keep `.env` private; it is ignored by Git.

## Current play loop

- Choose the world for your next campaign. Each has its own terrain, story, NPC/enemy names, equipment labels and starting class.
- Open **Workshop** to edit difficulty rules, describe a custom class, generate its sheet with DeepSeek, validate it and publish it. An offline Clockwork Warden example includes the complete progression structure.
- Create one to four heroes from the published class catalog. Customize core and custom stats, choose a background, and learn two of the class's five level-one skills.
- Choose easy, normal or hard for the next battle. The Workshop previews the exact count, party average, level offsets and stat multipliers.
- Enter the generated 24 × 16 dungeon, move on 5 ft squares, attack, use abilities, examine details, and end turns while the monsters act locally.
- Clear the first encounter and choose between rescuing the expedition NPC and taking the objective item. In fantasy, these are surveyor Mara Venn and the brass bell. That choice changes later story text and the rest bonus.
- Save locally or resume the last saved campaign on refresh.
- At each level through level 10, choose two skills from five options. At levels 3/5/8 select the advanced path and receive two unique skills each time. The full class catalog has nine final paths; one hero learns 26 skills at cap.

The separate `/workshop.html` page also includes an editable Canvas 2D targeting/animation preview and exportable item, monster and story-beat templates. Class sheets and difficulty settings are connected to gameplay. Individual monster/item/story library records are currently authoring templates; their generic runtime publication is specified as the next integration, not represented as already active.

The **Story** inspector now maintains bounded narrator memory and named scene checkpoints. Each prompt contains canonical facts, a local recap, eight recent story events and up to three relevant highlights. An optional **Improve recap with AI** button makes one explicit compression request. Entrances, unresolved choices, encounter clearances and defeat create immutable IndexedDB snapshots; resume or export them from Story, including earlier expeditions. See [STORY-MEMORY.md](STORY-MEMORY.md) for memory behavior and growing-story cost comparisons.

## Rules notes

This is a homebrew rules layer. The six abilities and custom attributes use `floor((score - 10) / 2)`. Proficiency grows from +2 to +4 through level 10; attacks and save DCs use the class's declared primary stat. Background skill training adds +2 to matching checks. The local engine owns rolls, legal actions, damage, positions, enemy turns and progression. DeepSeek authors class sheets, proposes player intent and adds bounded narration.

Easy uses regular enemies one level below party average (minimum 1), same-level bosses and ×0.90 combat stats. Normal uses same-level enemies/bosses and ×1.00. Hard uses same-level regular enemies, bosses one level higher (up to 11), and ×1.20. Minimum counts increase with difficulty. Full rounding, count and level-growth formulas are in the expansion specification.

Class generation is staged and resumable: one identity/tree sheet, ten regular skill pools and seven advanced skill batches. Accepted segments are saved. The complete pack must pass validation before publishing. The Workshop shows request and token counts; stopping generation preserves completed segments. No API call is used to select monster actions.

Every new class also passes a shared 100-point chassis ceiling, 32-point combined attribute allowance and level-based aggregate skill ceilings. All effects, target counts, control, range, resources, cooldowns and amplified class growth contribute. The Power budget page exposes the calculation; character creation also rejects excessive manual stat edits. These are design limits awaiting playtest calibration. Older saved campaigns retain their existing sheets.

Workshop > API costs includes a calculator using direct DeepSeek Flash rates checked 27 October 2026. At 100 replies of 300 English characters and 1,000 uncached input tokens per reply, the estimate is $0.0204 off-peak or $0.0408 peak. Full assumptions and official sources are in the UI document. The adapter disables thinking explicitly.

The campaign story is new material authored for this prototype because the original DND folder contained no setting, plot, named NPC, or quest canon. “The Bell Beneath Blackstone” follows a missing survey crew through The Sealed Stair, The Drowned Relay, and The Bell Vault.

## Useful files

- `UI-THEMES-BALANCE.md` — current interface, world packs, power formulas, screenshots and pricing assumptions.
- `shared/themes.mjs`, `shared/balance.mjs`, `shared/pricing.mjs` — common world data, validated generation budgets and API cost calculator.
- `public/assets/terrain-atlas.png` and `design/TERRAIN-ASSETS.md` — generated terrain art and full prompt/provenance.
- `DND-ASSISTANT-PLAN.md` — implementation plan, source inventory, story and future roadmap.
- `DND-EXPANSION-SPEC.md` — exact difficulty/progression rules, page designs, templates, prompt protocol, research findings and next features.
- `server/prompts.mjs` — active DeepSeek story and class-authoring prompts.
- `shared/schema.mjs` and `design/contracts/` — content schemas and exported JSON Schema files.
- `public/templates/` — complete example class, skills, radius shapes, item, monster, story and rules templates.
- `shared/canvas.mjs` — reusable Canvas 2D preview/animation renderer sharing targeting geometry with combat.
- `research/difficulty-lab/` — isolated, fixed-evaluator auto-research results and experiment ledger.
- `src/game/content.ts` — authored classes, backgrounds, skills, items, monsters, and campaign story.
- `src/game/rules.ts` — dice, stats, combat, healing, turn order, and dungeon progression.
- `src/game/generator.ts` — seeded 2D map generation and movement/pathfinding.
- `server/index.mjs` — optional local DeepSeek adapter.
- `DND-Upgrade.html` and `DND-tactical-board.html` — preserved original board prototypes.

## Checks

Run `npm run typecheck`, `npm test`, and `npm run build`. Eighteen automated checks include fixture API calls, shared power limits, all world presets, bounded story memory and pricing arithmetic; they make no paid DeepSeek calls. Interactive browser checks are `tests/browser-check.js`, `tests/progression-browser-check.js`, `tests/ui-worlds-browser-check.js` and `tests/memory-browser-check.js`. Start the dev server and use a named isolated Playwright CLI session; run the original browser script before the progression script because it uses the created party. Live DeepSeek response quality requires a configured key and is separate from these checks.
