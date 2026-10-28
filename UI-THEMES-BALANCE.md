# Waypoint: UI, worlds and shared power limits

Implemented 27 October 2026 in the existing DND app. Start with `npm run dev`; open the game, or use Workshop > Worlds, Power budget and API costs. The original HTML boards remain available as historical prototypes.

Later update: [STORY-MEMORY.md](STORY-MEMORY.md) documents the implemented bounded recap, recent-event context, highlight checkpoints, optional manual AI compression and extended growing-story calculator. Its memory behavior supersedes the earlier five-log-event context.

## Interface and terrain

The campaign screen now has persistent navigation, campaign and encounter selectors, a map toolbar, a crew roster, a field journal and tabbed Actions / Character / Pack / Story inspectors. Character creation, progression, story choices and defeat dialogs share the new visual style. The Workshop uses the same palette, controls and responsive layout. Keyboard users can focus the map, aim with arrow keys and select with Enter or Space. Grid and fullscreen controls are active.

The board renders a real PNG atlas: sixteen top-down terrain images covering floors, walls, rubble, supplies and entrances. Phaser creates individual texture frames and caches the terrain layer between actor updates. Only boundary wall cells render; navigation and targeting still use the underlying grid. Unit tokens remain circles with initials. No image-model call runs during play.

Asset provenance and the full generation prompt are in [TERRAIN-ASSETS.md](design/TERRAIN-ASSETS.md). Browser previews: [fantasy](design/previews/fantasy.png), [apocalypse](design/previews/apocalypse.png), [survival](design/previews/survival.png), [power budget](design/previews/power-budget.png).

## Three world packs

| World | Campaign | Starting class | Materials and identity |
| --- | --- | --- | --- |
| Fantasy | The Bell Beneath Blackstone | Clockwork Warden | Flagstones, masonry, crates, stone stairs; surveyor Mara Venn and the brass bell |
| Apocalypse | Last Signal at Ashfall | Vault Runner | Asphalt, concrete, rusty debris, bunker hatch; Dr. Imani Voss and a distress transmitter |
| Survival | Beyond the Last Camp | Trailkeeper | Moss, bushes, mud, logs, campsite; Ranger Mila Reed and a seed cache |

Each pack supplies its own palette, three authored story beats, NPC and enemy names, item labels, background labels, class names, ability names and terrain frames. Their underlying combat values are equal. They are theme packs over one tactical rules engine; this release does not add hunger, radiation or crafting simulations. DeepSeek receives the selected world's canonical facts for narration and class generation. NPC actions remain local.

Choose a world before creating a campaign. The campaign freezes that choice in its save; changing the selector sets the next campaign. Older saves without a theme use fantasy. Published custom classes remain available across worlds, so players can mix their own concepts with a selected setting.

## What the value line means

All generated classes share a versioned **100-point design ceiling**. This is a reference scale, not a measured population average, a target every build must reach, or a guarantee of equal win rates. A class must pass every individual and aggregate check; a weak skill cannot excuse an excessive chassis. The Workshop shows the class score, attribute allowance, skill scores and rejection reasons. Character creation shows the same limits and checks manual stat edits.

### Attributes and chassis

For scores 8 through 20, the point costs are:

| Score | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cost | 0 | 1 | 2 | 3 | 4 | 5 | 7 | 9 | 12 | 15 | 19 | 23 | 28 |

Core stats may spend at most 30 points, custom stats at most 8, and the combined allowance is 32. Scores below 8 give no refund. The existing schema's starting-score ranges still apply.

```
chassis = (HP - 16) + 4*(AC - 10) + 3*(speed - 3)
        + 2*expectedBasicAttackDamage + max(0, attackRange - 1)
        + 0.4*(resourceMax - 10) + 2*resourceRegen
        + 2*(HPGrowth - 2) + 5*sum(customStatGrowth)
        + 5*(5/statGrowthInterval - 1)
classScore = 100 * (1.4*attributePoints + chassis) / 115
```

The class score must be <=100. Expected dice values respect combat's minimum-one result, including negative dice modifiers, to prevent a fake point refund. The example chassis is about 97.6/100 with 31/32 attribute points.

Each selected level-3/5/8 path has a combined 40% stat-bonus allowance. A single node may grant at most 20%; repeatedly multiplying the same stat cannot exceed 1.5 times its pre-upgrade value. Skill evaluation simulates growth and every legal advanced path to use the largest possible modifier for each skill level.

### Skills and the complete build

```
skillCeiling(L) = 12 + 4*(L - 1)    // level 1: 12; level 10: 48
burst = sum(weighted effects) * targetCapacity * resolutionFactor + utility
score = burst * uptimeFactor * resourceFactor * encounterUseFactor
```

- Damage weight 1, healing 0.9, shield 0.7. Every effect contributes.
- Root costs 6 per turn, slow 3, weaken 5, burn 2; forced movement costs 1.5 per tile.
- Target capacity accounts for the shape and the declared maximum affected units. Automatic resolution costs x1.2; saves that still deal half cost x1.1.
- Range, safe area targeting and ignoring sight add utility cost.
- Cooldown factor is `0.55 + 0.45/(1+cooldown)`. Resource discounts stop at 15%; limited-use discounts stop at 15%.
- Score must stay within its level ceiling. Burst must also stay within twice that ceiling, even with expensive costs or long cooldowns.
- Zero-resource, zero-cooldown recovery is rejected if it has more than three uses per encounter.

The complete build display combines 45% chassis score and 55% strongest learned-skill path. That path uses the best two regular options at each level plus the six class skills on its advanced path. Every chassis and skill is checked independently before this display score is calculated. This preserves the confirmed nine final paths and 26 learned skills at level ten.

The authoritative policy is [shared/balance.mjs](shared/balance.mjs). The API validates generated segments and the complete pack with the same implementation used by the Workshop. Prompts describe the budget, but local validation makes the acceptance decision. Existing campaign sheets are preserved rather than silently rewritten. Pairwise synergy, map-specific tactics and party composition still need empirical playtesting; the numeric ceiling alone cannot prove balance.

## DeepSeek story cost

Rates checked 27 October 2026 against [official pricing](https://api-docs.deepseek.com/quick_start/pricing/). The old `deepseek-v4-flash` alias is accepted but now served by `deepseek-flash`, version DeepSeek-V4.1-Flash-1017. Prices are per million tokens:

| Token category | Off-peak | Peak |
| --- | --- | --- |
| Uncached input | $0.15 | $0.30 |
| Cached input | $0.003 | $0.006 |
| Output | $0.60 | $1.20 |

The official [token guide](https://api-docs.deepseek.com/quick_start/token_usage/) estimates one English character at about 0.3 tokens. For **100 AI replies of 300 English characters**, output is approximately 9,000 tokens. Calculated scenarios:

| Assumptions | Input tokens | Off-peak total | Peak total |
| --- | --- | --- | --- |
| Output only; excludes all input | 0 | $0.0054 | $0.0108 |
| 1,000 uncached input tokens per request | 100,000 | $0.0204 | $0.0408 |
| Entire growing transcript, 300-character player messages and repeated 1,000-token system prompt | 1,000,000 | $0.1554 | $0.3108 |

The full-transcript sum is `100*(1000+90) + (90+90)*100*99/2`. Actual billing uses returned token usage. Caching can lower the input bill; its share is an assumption in the calculator. JSON overhead, class generation and extra model calls add to these examples. Thinking is explicitly disabled in this app's requests. If “100 messages” means fifty player messages and fifty AI replies, set the calculator to fifty replies rather than one hundred. The theme has no separate model surcharge.

## Verification and design decisions

Fourteen automated checks pass, including schema/API fixtures, inflated stats and chassis, stacked damage, area attacks, extreme burst, free recovery, amplified stat paths, theme equivalence, pricing arithmetic and atlas validity. TypeScript and the production build pass. Three browser scripts cover previous class/combat/progression flows plus the new worlds, save persistence, inspector/grid controls, manual stat rejection, calculator values and 390-pixel layouts. Screenshots were captured from the running game. No paid DeepSeek call was made; live generated prose/class quality is not asserted.

Jev selected aggregate power budgets and shared-rule content packs, each with 100% probability for the selected option in its returned distribution. Those percentages express Jev's confidence in the design judgments, not the probability of successful balance. Questions and recorded selections are in `design/ui-balance-decisions.json` and `design/ui-balance-results.json`.

The older difficulty lab remains historical evidence for its own encounter-scaling comparison; its saved source hashes do not certify the new power-budget implementation.
