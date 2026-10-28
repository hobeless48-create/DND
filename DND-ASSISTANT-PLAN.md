# D&D AI Game Assistant — Detailed Improvement Plan

> This document records the original plan and source inventory. The current expansion contract for free classes, level-10 progression, difficulty, schemas and configuration pages is [DND-EXPANSION-SPEC.md](DND-EXPANSION-SPEC.md); it supersedes the initial fixed-class and progression proposals below.

## Goal

Turn the current DND board prototype into a playable, mostly 2D solo D&D-style game in which a player can say what they want to do, receive a narrated response, explore automatically created scenes, and resolve tactical combat on the board. Existing characters, monsters, items, skills, and NPC behavior should be data-driven and reusable. DeepSeek should add story variety without being asked to calculate every roll or make every combat decision.

## Recommended design

Use a hybrid system:

- **Local game engine owns truth:** character and monster state, turn order, movement, visibility, dice, hit checks, damage, status effects, cooldowns, inventory, and save data.
- **DeepSeek acts as the Dungeon Master voice:** understands a player’s free-text intent, proposes an allowed action or scene, and narrates the result the engine has already resolved.
- **Local generators make maps:** a seeded room-and-corridor generator creates a validated dungeon from room templates and a compact scene specification. The model supplies theme, story details, objectives, and a roster of known content IDs; it does not draw arbitrary board cells itself.
- **NPC tactics are authored rules:** content definitions choose a behavior profile. A deterministic evaluator selects legal actions from that profile without a model request.

Jev selected this architecture with 96% confidence in its judgment. This is confidence in the architecture choice, not a prediction of game success.

## Current implementation status

The DND folder now contains a runnable TypeScript/Phaser vertical slice alongside the original HTML board prototypes. It has a local-first rules engine, seeded 24 × 16 tile scenes, four hero archetypes, six ability scores, background skill training, a three-monster catalog, simple authored monster policies, inventory, a branching tutorial story, and campaign autosave/resume. DeepSeek is an optional server-side narrator and intent parser. The new campaign is “The Bell Beneath Blackstone”; it is authored for this app because the older DND source had no story canon.

Character creation and the first three story depths described below are in the game now. The remaining roadmap sections are next-stage improvements, not claims about the current build. The current prototype still uses lightweight rules and generated room/corridor layouts rather than a full edition or a large room-template library.

## Core play loop

1. Player enters a command such as “We go inside the dungeon.”
2. The game sends a compact campaign summary and request to the local AI service.
3. The service returns a validated scene brief: scene text, map template/constraints, encounter IDs, objective, and entry point.
4. The local generator creates a seeded tile map, checks connectivity and placement, and places the party at the entrance and authored monsters at legal spawn points.
5. The game displays the scene and narration. Exploration commands and combat actions update canonical local state.
6. The rules engine rolls dice and resolves effects. NPC policies choose their next legal action.
7. The model narrates notable outcomes using a short event summary. It never gets to overwrite HP, positions, dice results, or other authoritative state.
8. The campaign autosaves and can be resumed or replayed from its seed and event history.

## Existing work and reuse

| Project | Useful work to reuse | Boundary |
|---|---|---|
| `DND/DND-Upgrade.html` | Board UI, unit deployment/selection, terrain brush, highlight modes, skill targeting shapes, item/equipment UI, undo, local board slots, and compact AI export | Keep as the visual and interaction prototype. Refactor its rules and state out of the single HTML file before adding live AI. Audit each effect: the existing docs mark several stats, buffs, and equipment bonuses as informational/cosmetic. |
| `DND/DND-tactical-board.html` | Alternate earlier tactical-board implementation; compare only where a behavior is missing from Upgrade | Do not maintain two competing sources of truth. |
| `DND/DND Docs.txt` | Existing state shape, function inventory, interaction notes, and known limits | Update after the implementation architecture is chosen. |
| `Aurolith/shared/src/board.ts`, `pathfinding.ts` | Seeded/procedural board concepts, explicit tile types, coordinate helpers, reachability and pathfinding patterns | Aurolith uses a large hex board; DND should retain its square 5 ft grid unless playtests show a reason to change. Adapt patterns, not its map dimensions or game rules. |
| `Aurolith/shared/src/simulation.ts`, `combat.ts`, `bot.ts` | Typed canonical state, explicit commands/events, pure simulation boundaries, deterministic local opponent policy, and replayable decisions | DND needs turn-based actions and D&D-style checks, not Aurolith’s auto-battler tick economy. |
| `Void Soul Base/src/types.ts`, `skills_db.ts`, `enemies_db.ts`, `items_db.ts`, `utils/combatMath.ts` | Existing RPG character/effect/item/enemy data and derived-stat/combat formula organization | Map concepts into DND’s own schema and balance. Do not import incompatible classes, formulas, or progression wholesale. |
| `PokeChess/PokemonChess/src/components/Board.tsx` | Board component separation, target previews, selected cells, hover, hazards, and terrain overlays | Reuse UI patterns if the DND app is migrated to React; do not add a framework solely to reuse the component. |
| `Pickaxe/plan_template/` | Reusable plan structure and roster/content planning format | Use its documentation pattern where useful; no game runtime dependency. |

### What the DND files already contain

The current `DND-Upgrade.html` is a **unit deployment and board-management form**, not a full character creator. It asks for name, optional image, token color, max HP, AC, speed, attack range, and five scores (`STR`, `DEX`, `CON`, `INT`, `AGI`). Its defaults are 30 HP, AC 15, speed 30 ft, attack range 5 ft, and scores 16/14/14/10/12. The DND documentation says those scores are stored for the AI DM but are not used by rolls. There are no class, level, race/ancestry, background, biography, party setup, or character progression screens.

The authored skill library has Fireball, Magic Missile, Cure Wounds, Mass Healing Word, Action Dash, and Cleave Attack. The item sample has an Iron Longsword, Wooden Shield, Leather Armor, Ring of Protection, three healing consumables, and an Iron Ingot. Skill effects are represented partly as free-form formula/description strings; equipment bonus text such as `+2 AC` is currently informational rather than applied to combat math. Board save slots save the board dimensions and terrain, but not deployed units or a campaign.

The files contain **no authored campaign plot, setting lore, named story NPCs, quests, or dialogue**. The “AI DM” is currently a manual compressed state export for pasting into an external model. Therefore the story material below is a proposed foundation, not recovered canon from the DND prototype.

## Target architecture

Start with a small TypeScript application split into these boundaries (folder names are illustrative):

```text
src/
  content/       characters, monsters, skills, items, NPC policies, room templates
  rules/         dice, checks, movement, combat, effects, rests, validation
  simulation/    campaign state, commands, event log, reducer/turn orchestration
  generation/    seeded dungeon layout, spawn placement, map validation
  ai/            prompt construction, response schemas, context summary
  ui/            board, scene panel, character sheet, combat controls, chat log
server/          DeepSeek API adapter, schema validation, rate/cost limits
```

The board remains 2D and tile-based. Use stable IDs for rooms, units, content, and events. Keep authored content separate from runtime state. Store the generated map seed and selected template IDs so a scene is reproducible.

### Canonical data contracts

- **CampaignState:** schema version, campaign ID, RNG seed/state, current scene ID, party, world flags, quests, resources, and event sequence.
- **SceneDefinition:** ID, title, theme, grid dimensions, room graph/template IDs, objective, entry/exit, hazards, and allowed encounter tags.
- **BoardState:** dimensions, terrain per tile, fog/visibility, blockers, doors, hazards, and placements. Coordinates are integer `{x,y}` with a documented 5 ft-per-cell scale.
- **CombatantDefinition:** stable ID, role, size, HP/AC/speed, abilities, tags, senses, and `behaviorProfileId`.
- **CombatantState:** definition ID, current HP, position, conditions, resources, cooldowns, initiative, and per-encounter behavior flags.
- **AbilityDefinition:** action type, range, targeting shape, cost, cooldown/use limit, check/save, effect list, and duration. Use typed effect operations instead of parsing free-form formula text during combat.
- **NpcPolicy:** ordered condition/action rules plus a legal-action fallback. Conditions include HP ratio, cooldown readiness, target visibility/range, allies in danger, and whether a once-per-encounter trigger has fired.
- **GameEvent:** stable ID, turn/sequence, actor/targets, resolved values (including dice), and state changes. Narration is derived from these events.
- **AI response:** strict versioned JSON with allowed fields only. The server validates IDs, lengths, map constraints, and enum values; the client still validates before applying. The AI response may suggest, but never directly mutate, state.

## Character creation and stat design

### Character creation flow

Replace the current “Deploy Character” form with a guided creator. Keep **Quick Create** available so a player can accept a preset and reach the board quickly.

1. **Choose a start:** create a new hero, choose a preset hero, or add an existing saved hero to the party. Start with one to four party members.
2. **Identity:** name, portrait/token, color, pronouns if desired, and a short player-written concept. Portraits should be optional; use a generated color token with initials as the no-cost fallback.
3. **Choose an archetype:** create data templates with a role, starting ability scores, armor/weapon profile, HP rule, movement, and starting abilities. Proposed first templates: Fighter (durability/Cleave), Rogue (mobility/Dash), Wizard (ranged spells/Fireball or Magic Missile), and Cleric (Cure Wounds/Mass Healing Word). These are new templates, not existing classes in the DND code.
4. **Set ability scores:** choose a recommended standard array or a small point-buy budget. Show the modifier next to each score and explain where it matters. Presets can auto-assign; custom heroes can reassign before confirming.
5. **Select background and story hooks:** choose one background (for example, Guard, Scholar, Outlander, or Acolyte) and optionally select a bond, motive, and complication. These provide skill proficiencies and story prompts; they should not add hidden combat power in the first slice.
6. **Review derived sheet:** display max/current HP, AC, speed, initiative modifier, attack modifiers, skill save DC where relevant, proficiencies, equipment, and abilities. Values are calculated from the selected template and stats, not independently typed defaults.
7. **Confirm party:** show each hero’s role and combat summary; warn about duplicate roles only as advice. Save the party into the campaign before entering the first scene.

### Recommended stat model

The existing five-field model is too thin for skill checks and social/exploration scenes, while the user-facing goal is recognizably D&D-like. The current game uses six familiar abilities: **Strength, Dexterity, Constitution, Intelligence, Wisdom, and Charisma**. Jev selected this extension with a **78% probability in its choice distribution**; this is confidence in the six-stat choice, not a prediction of future outcomes. The original HTML fields are not imported into the new campaign schema. If legacy unit import is added, do not silently convert AGI data; preserve it in a migration field and let the player review its mapping.

For the initial lightweight rules, derive the ability modifier as `floor((score - 10) / 2)`. Keep the formulas in the local rules engine and use the same modifier in every relevant roll:

| Ability | Main uses in the proposed rules |
|---|---|
| STR | Melee weapon attacks, forceful actions, carrying/dragging, breaking obstacles |
| DEX | Ranged attacks, initiative, stealth, traps, and movement-oriented checks |
| CON | Maximum HP and endurance/resistance checks |
| INT | Arcana, investigation, history, devices, and wizard spell calculations |
| WIS | Perception, insight, survival, medicine, and noticing danger |
| CHA | Persuasion, deception, intimidation, performance, and cleric/bard-style casting if supported |

Derived values should have one authority and be explained on the sheet:

- **Max HP:** archetype hit-die/base plus Constitution modifier at level 1; on level-up use a fixed average or a local dice roll, with the choice visible to the player.
- **AC:** calculated from equipped armor and shield plus only the allowed ability modifier. The current `ac` remains the displayed result, while armor rules compute it.
- **Attack/check bonus:** relevant ability modifier plus proficiency when trained. The weapon or ability definition chooses the relevant score.
- **Initiative:** d20 plus Dexterity modifier, with ties resolved by a stable rule.
- **Spell save DC:** fixed base plus proficiency and the archetype’s casting ability modifier.
- **Speed and reach/range:** primarily archetype, equipment, and ability definitions; do not let free-form text change tile legality.

Keep the initial slice bounded: level 1, no multiclassing, a small proficiency list, and one simple advancement point after the tutorial. The exact edition and progression model remain open; do not market this as a complete implementation of a published rules edition.

### Character data shape

Separate the reusable definition from the saved hero:

```text
CharacterDefinition: id, name, archetypeId, baseAbilities, hitDie, baseSpeed,
  proficiencies, starterEquipmentIds, starterAbilityIds, portrait, tags
CharacterState: id, definitionId, level, xp, abilityOverrides, currentHp,
  temporaryHp, conditions, inventory, equippedItemIds, abilityUses,
  cooldowns, backgroundId, bonds, flags, partyOrder
DerivedCharacterSheet: abilityModifiers, maxHp, ac, initiativeBonus,
  attackBonuses, saveDc, speed, passiveScores
```

Do not persist the entire derived sheet as an independent source of truth. Recalculate it after level, equipment, ability, or condition changes, and save only values that change during play.

### Character creation acceptance checks

- A player can make a hero without entering combat math manually.
- A quick preset and a custom build both produce a valid character and a readable sheet.
- Changing one ability visibly changes only its documented derived values.
- Equipment AC bonuses apply exactly once; unequipping restores the prior AC.
- Character, party, and campaign persist across reload; board-only saves no longer masquerade as campaign saves.
- Existing DND unit data remains importable or is explicitly reported as a legacy format; the old AGI field is never discarded silently.

## Story and campaign design

### Story layer to add

Since the DND folder contains no existing plot or lore, build a small campaign framework rather than asking DeepSeek to invent untracked canon every turn. Store authored facts as data:

- **Campaign bible:** premise, tone, setting facts, allowed themes, named locations, factions, and facts that must remain true.
- **Adventure arc:** 3–5 milestones, each with an objective, clues, locations, likely encounters, and an outcome flag.
- **Scene brief:** scene ID, current location, visible details, interactable objects, exits, encounter template IDs, map constraints, and story flags read/written.
- **NPC profile:** stable ID/name, public description, goal, fear or pressure, what they know, dialogue style, faction/relationship state, and optional combatant/policy link.
- **Quest record:** objective, discovered clues, status, rewards, and links to the campaign event IDs that changed it.
- **Event-to-story summary:** only confirmed player choices, discoveries, and resolved game events become campaign facts. AI suggestions stay pending until accepted by the player or validated by the game.

### Opening adventure implemented in the current game

This is a replaceable tutorial story seed, not established DND lore:

**Working title: The Bell Beneath Blackstone.** A remote waystation has stopped sending messages. The party is hired to find a missing survey crew and recover a brass signal bell. The crew uncovered a sealed stair under an old road shrine; the first dungeon rooms show signs that someone has recently entered and moved supplies deeper underground. The first session teaches exploration, one social clue, a small tactical fight, a choice about helping a trapped scout, and a final room with a clear exit or deeper descent.

The current build persists the rescue-or-bell choice. Rescuing Mara grants her survey token, a route note in the next scene, and a stronger between-depth recovery. Taking the bell grants the 40 gp reward and adds its awakening warning to the Bell Vault scene. The current arc reaches The Sealed Stair, The Drowned Relay, and The Bell Vault; later scenes remain procedurally titled until more authored story beats are added.

### Character rules currently implemented

- Standard array assignment with live preview of HP, AC, speed, initiative, attack bonus, and caster save DC.
- The six score modifiers use `floor((score - 10) / 2)`; CON adjusts starting HP, DEX adjusts AC and initiative, and class attack ability plus +2 proficiency sets attack bonus.
- Road Guard grants Athletics and Intimidation, Archive Scholar grants Arcana and Investigation, Outlander grants Perception and Survival, and Acolyte grants Insight and Medicine. A trained skill adds +2 to its roll.
- Wizard and Cleric use INT or WIS respectively for spell save DC. Fireball and Radiant Flare use that calculated DC; Cure Wounds and Mass Healing Word include the casting modifier.
- Background training and player-written character concepts persist through campaign start, descent, and reload.

### Monster policies currently implemented

Monster profiles are local data. Skirmishers can Quickstep toward a healthy hero as an opening move and retreat once when their own HP first reaches 70% or less. Bruisers and elites can use Cleave against a healthy hero and again as a first low-health reaction when the skill remains available. Every selected action is movement/range checked and logged; no model call decides monster turns.

### What DeepSeek may contribute to story

- Propose a scene description, sensory details, NPC response, and a small set of choices using the campaign bible and current flags.
- Offer encounter/map parameters using existing room, monster, trap, item, and NPC IDs.
- Turn resolved rolls and events into concise prose, preserving exact results.
- Suggest new quest/NPC ideas as **drafts** for an offline content authoring step.

DeepSeek must not create unregistered skill/item IDs during play, decide that an attack hits, grant inventory or XP, rewrite a character backstory, or claim a dead/absent NPC is present. Persist a compact campaign summary and recent event IDs, not full chat history. Keep player-authored character facts higher priority than generated flavor.

### Story interaction loop

1. On entering a location, load its authored facts and ask the model for one scene brief within the allowed map/encounter catalog.
2. Show the description beside the generated board, with exits, visible objects, and actionable prompts.
3. Parse a player command into a bounded intent. If a rule check is needed, execute it locally and record the roll.
4. Update world and quest flags from validated game events or explicit player choices.
5. Ask for narration only when entering a new scene, resolving a meaningful check, meeting an NPC, or ending a combat round with notable events.
6. Autosave the story flags, event log, seed, and current scene. On reload, supply the saved summary so the DM voice remembers facts without resending the whole transcript.

**Story acceptance check:** a short tutorial adventure has a beginning, clue, encounter, meaningful choice, and exit; reloading preserves the choice; the model cannot contradict a saved fact or reward the party without a recorded event.

## AI boundary and token budget

### Call DeepSeek for

- Creating a new adventure hook or scene brief when entering a new location.
- Parsing a free-text player command into a small intent object such as `move`, `attack`, `cast`, `inspect`, `talk`, `use_item`, or `other`.
- Narrating a resolved game event or a short batch of uneventful turns.
- Optional between-session recap and quest/NPC dialogue.

### Keep local

- Dice and random-number generation, initiative, legality checks, hit/miss, damage, healing, pathfinding, NPC turn selection, cooldown checks, visibility, board generation, and persistence.
- Static monster/item/skill definitions and policy rules. Generate content through authoring tools or offline batches, then save it as data; do not ask the model to regenerate the same definition during play.

### Cost controls

- Make one model request when a new scene needs a story brief, rather than once per tile or NPC.
- Reuse stable campaign summaries; send only recent events and relevant character/scene data.
- Batch narration for a round or a meaningful event group. Do not narrate every movement calculation.
- Provide a local fallback line/template if the API is unavailable or a response fails validation.
- Track request count, input/output tokens, latency, and estimated cost in a debug panel/log.
- Put the API key in a local server environment file excluded from version control. Do not call DeepSeek directly from browser JavaScript or store a key in localStorage. For a single-user local app, a small local Node service is sufficient; a hosted multi-user version needs proper account-level secret handling and abuse controls.

## NPC behavior design

Define behaviors as ordered rules, not natural-language prompts. Example:

```json
{
  "id": "goblin-skirmisher",
  "rules": [
    { "when": "canFinishVisibleEnemy", "action": "useBestLegalAttack" },
    { "when": "hpRatioBelow:0.70 && readySkillExists && !flagged:panicSkillUsed", "action": "useBestLegalSkill", "once": "encounter" },
    { "when": "visibleEnemyInRange", "action": "attackLowestHpEnemy" },
    { "when": "adjacentEnemy && flankTileLegal", "action": "moveToFlankThenAttack" }
  ],
  "fallback": "moveToCoverOrApproach"
}
```

Rules must be ordered and deterministic for the same state and RNG seed. “Below 70% the first time” is represented by an encounter flag; cooldown is checked by the engine before a skill is considered available. Add configurable difficulty profiles that change target priorities or tactics, not hidden dice bonuses unless the player chooses that option.

## Phased implementation roadmap

### Phase 0 — Baseline and scope lock

- Treat `DND-Upgrade.html` as the current baseline and compare the tactical-board version for unique behavior.
- Inventory which actions currently change game state and which only update the display/log. Verify every skill, item, buff, stat, and save behavior against the code.
- Pick the initial rules scope: recommended first slice is a lightweight D&D-inspired ruleset with d20 checks, initiative, movement, attack, saving throw, HP, conditions, and a small set of skills. Defer full rulebook coverage, multiclassing, and campaign crafting.
- Decide whether to adopt six abilities or retain the current five; if adopting six, define an explicit legacy AGI import policy before importing any old character records.
- Approve or replace the proposed tutorial story seed and decide whether the tone is heroic, gritty, humorous, or mixed.
- Establish one canonical data schema and a migration note before moving existing content.

**Exit check:** a concise feature inventory and one chosen rules baseline; no conflicting claims between code and documentation.

### Phase 1 — Deterministic game engine

- Move game state and mechanics out of the HTML presentation code into typed modules.
- Implement seeded dice rolls and a dice parser with bounded formulas and clear invalid-input errors.
- Add turn order, movement costs/occupancy, attack and skill legality, hit/save checks, damage/healing, conditions, cooldowns, death, and encounter reset.
- Express actions as validated commands and append resolved results to an event log. Undo/replay should operate on commands/events, not UI snapshots alone.
- Ensure equipment and character stats affect derived values consistently, or clearly label them as display-only until implemented.
- Implement the character creator’s Quick Create and custom flows, initially limited to level 1 archetype templates, ability assignment, background hooks, and a derived-sheet preview.
- Normalize the existing six skills and starter items into typed data definitions. Replace effect strings used by the engine with validated operations; retain descriptive text separately for UI and narration.

**Exit check:** a manual one-room fight with two player characters and two monsters can be completed with all outcomes visible in the event log and reproducible from the same seed.

### Phase 2 — Automatic 2D dungeon scenes

- Create a small library of room shapes (entrance, corridor, chamber, junction, boss room) and tile palettes (stone, cave, ruin, sewer).
- Generate a room graph from a saved seed, connect every required room, then expand it into grid cells.
- Validate entrance/exit path, wall boundaries, room overlap, walkable area, monster spacing, and no unit overlap before displaying the scene.
- Place party tokens at the entrance. Place monsters/traps/treasure from encounter templates and difficulty budget. Keep authored hand-built maps as optional templates.
- Add a preview/regenerate-seed control and a manual edit escape hatch for malformed or unwanted maps.

**Exit check:** repeated generation with the same seed creates the same valid dungeon; different seeds change layout while retaining a reachable objective and legal placements.

### Phase 3 — NPC and monster automation

- Convert enemy data into normalized definitions and attach behavior profiles.
- Implement rule evaluation against only legal actions; the rules engine resolves selected actions.
- Add once-per-turn and once-per-encounter flags, cooldown state, target priority, flee/guard/support behavior, and simple difficulty settings.
- Log the policy rule that selected each NPC action for debugging and player-readable combat history.

**Exit check:** a scripted encounter runs several rounds without manual monster control, never chooses an illegal move or unavailable skill, and repeats consistently from a fixed seed.

### Phase 4 — DeepSeek DM integration

- Add a local server adapter so the API key never reaches the browser.
- Define versioned schemas for scene briefs, parsed player intents, and narration. Reject malformed or unknown content IDs safely.
- Have the server send compact context: current scene summary, relevant party facts, recent event list, and player input.
- For parsed intents, let the local rules engine check/execute the request. Ask a clarification when intent is ambiguous; never silently execute an invalid action.
- Narrate only after the engine returns resolved events. Keep the manual Export AI function as a debugging/export feature until the live integration is stable.
- Add timeout, retry limits, request cancellation, offline fallback, and visible API status/cost counters.
- Add campaign-bible and event-summary prompt inputs; generate only scene briefs, intent proposals, and post-resolution narration. Store accepted story flags locally.

**Exit check:** “enter the dungeon” creates a validated scene; a free-text “I attack the goblin” becomes a legal attack command; dice and consequences are local; DeepSeek only provides the brief/narration. API failure does not corrupt the campaign or prevent local combat.

### Phase 5 — Campaign, content workflow, and playtest polish

- Save/load full campaigns with schema versioning, recent event history, map seeds, character state, and content IDs. Preserve a migration path from existing board-only slots where feasible.
- Add content validators for duplicate IDs, invalid formulas, unknown skill references, invalid behavior actions, and impossible encounter/map constraints.
- Finish a tutorial story with one clue, one named NPC, one combat, one consequential choice, one reward, and a reloadable campaign save.
- Build an authoring workflow for monsters, NPC policies, room templates, items, skills, and encounter packs. AI-generated records must pass validation and be reviewed before entering the shipped library.
- Add a compact game log, event narration, character sheet, turn controls, AI status, and accessible board selection/keyboard controls.
- Playtest a short tutorial dungeon and tune encounter pacing, narration frequency, board readability, and token usage.

**Exit check:** a player can create/load a party, complete a tutorial dungeon from entry to reward, save, reload, and continue without losing campaign or combat state.

## First playable vertical slice

Build only this content for the first complete experience:

- One party of up to four, with a small set of preset classes/characters.
- One generated dungeon theme, 4–6 connected rooms, one optional branch, one exit objective.
- Three monster definitions with two behavior profiles, plus one boss encounter.
- A restrained set of attacks, one healing skill, one area skill, and a few consumable/equipment items.
- Initiative, movement, line of sight if needed by the selected rules scope, attack/check rolls, HP, one or two status effects, victory/defeat, and loot.
- Scene brief at entry, intent parsing when the input is free text, and event narration at meaningful moments.

This slice proves the complete loop before broad content generation. More monsters, skills, items, and room themes can then be added as data rather than new bespoke systems.

## Design contract

- **Primary verb:** choose an intent and resolve it through a readable local game rule.
- **Player promise:** the model makes the world responsive; the rules engine makes consequences consistent.
- **Scarce resources:** actions per turn, HP, consumables, spell/skill uses, and model requests. Their costs and recovery rules must be explicit.
- **Reinforcing loop:** explore → discover objectives/rewards → gain options → tackle harder encounters.
- **Balancing loop:** HP/resource loss and encounter pressure limit how long the party can push without resting.
- **Emergence risks:** NPC policy priority loops, infinite healing/rest exploits, malformed AI IDs, impossible map layouts, free repeated skill use, and player commands that try to bypass action limits. Bound each in the local engine and validate generated data.
- **Source of truth:** local typed campaign state and resolved event log. AI output is untrusted input and narration.

## Decisions to settle before implementation

1. **Rules scope:** lightweight D&D-inspired rules for the first slice (recommended), or a closer implementation of a specific published edition.
2. **Interaction style:** typed action buttons plus free-text intent (recommended), or free text as the only control.
3. **Runtime target:** local desktop/browser single-player first (recommended), or hosted/multiplayer from the start.
4. **Map format:** square 5 ft tiles (recommended because the current DND board is square), or hexes.

The recommendations keep the current project recognizable and make the first full loop small enough to finish. These choices can be revised before their corresponding phase without changing the hybrid authority boundary.
