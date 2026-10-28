# Difficulty experiment

Mutable target: `target.json`, only `defenseScaling` may change (`raw` or `bonus`).
Immutable evaluator: `eval.mjs`; freeze its SHA-256 before the baseline. It imports the current shared scaling formulas; record that module's SHA-256 too.

Preserve the user's 0.90 / 1.00 / 1.20 stat multipliers, level offsets, player cap 10 and increasing monster counts. Compare a literal raw-AC multiplier with the optional defense-above-10 multiplier. Keep the game's requested raw default regardless of the lab's recommendation.

Metric: maximize the evaluator score: negative mean squared deviation from provisional easy/normal/hard win targets of 0.80/0.60/0.35 (scaled by 100), plus penalties of 100 per monotonicity violation, 10 times extremeHitFraction, and timeoutFraction. These targets are experiment assumptions, not claims about the current game. A monotonicity violation means a harder difficulty wins more frequently than an easier one, paired by scenario. Extreme hit chances mean below 15% or above 90% against a regular monster. Seeds are fixed. 120 seeds per party-size/level/boss/difficulty cell. Budget is 30 seconds per candidate. One variable changes per experiment.

This is an abstract encounter simulation: local d20 attacks, focus fire, fixed representative hero stats, initiative, HP and monster scaling. It omits movement, healing, items, custom classes, area skills, conditions, cooldowns, terrain and player decisions. Results compare formulas within this model and cannot establish real-game win rates or fairness. Full-game seeded evaluations and player sessions remain necessary before claiming balance.
