// Versioned authoring limits. These are design budgets, not win-rate predictions.
export const BALANCE_POLICY = Object.freeze({ version: 1, classBaseline: 100, classRawBaseline: 115, attributePoints: 32, corePoints: 30, customPoints: 8, pathBonusPercent: 40, maxSpecialistBonus: 20, maxSameStatAmplifier: 1.5, skillBase: 12, skillPerLevel: 4, burstMultiplier: 2 });
export const BALANCE_PROMPT = `Shared power-budget version 1 is mandatory. All classes use the same 100-point chassis ceiling. Core attribute point costs above 8 rise as [0,1,2,3,4,5,7,9,12,15,19,23,28] for scores 8..20; core points<=30, custom points<=8 and combined<=32. More HP, AC, speed, basic attack damage/range, resources, regeneration and growth all spend the same chassis budget; specialize through tradeoffs. Default recommended chassis: 30 HP, AC14, speed6, 1d6 basic attack, range4, resource20, regen2, HP growth5, stat interval3; do not increase all of these together. Per-path advanced bonus sum<=40%, individual bonus<=20%, same-stat multiplier<=1.5. A skill's shared level ceiling is 12+4*(level-1). Aggregate every effect, affected target, condition duration and range/area utility. Damage weight1, healing0.9, shield0.7; root6/turn, slow3/turn, weaken5/turn, burn2/turn; movement1.5/tile. Automatic effects cost1.2x, save+half effects1.1x. Cooldowns and resources offer only bounded discounts; burst score must still be <=2x the ceiling. No free unlimited healing/shielding. The server independently calculates and rejects over-budget data, including amplified class stats. Budget formulas are the same for fantasy, apocalypse and survival.`;
const CORE = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const COSTS = [0, 1, 2, 3, 4, 5, 7, 9, 12, 15, 19, 23, 28];
const diceExpectations = new Map();
// Combat clamps each rolled result to at least one. A large negative dice
// modifier must never refund chassis points or hide a high-variance skill.
const expected = (formula, modifier = 0) => {
  const key = `${formula}:${modifier}`;
  if (diceExpectations.has(key)) return diceExpectations.get(key);
  const match = /^(\d+)d(\d+)([+-]\d+)?$/.exec(formula || '');
  if (!match) return Infinity;
  const count = Number(match[1]), sides = Number(match[2]), bonus = Number(match[3] || 0) + modifier;
  let distribution = [1];
  for (let die = 0; die < count; die++) {
    const next = Array(distribution.length + sides).fill(0);
    for (let total = 0; total < distribution.length; total++) for (let face = 1; face <= sides; face++) next[total + face] += distribution[total] / sides;
    distribution = next;
  }
  const value = distribution.reduce((sum, probability, total) => sum + probability * Math.max(1, Math.round(total + bonus)), 0);
  diceExpectations.set(key, value);
  return value;
};
export function attributeCost(value) { return value <= 8 ? 0 : value <= 20 ? COSTS[Math.ceil(value) - 8] : 28 + (value - 20) * 6; }
export function classBudgetReport(pack) {
  const policy = BALANCE_POLICY;
  const corePoints = CORE.reduce((sum, stat) => sum + attributeCost(pack.stats[stat]), 0);
  const customPoints = pack.customStats.reduce((sum, stat) => sum + attributeCost(stat.base), 0);
  const points = corePoints + customPoints;
  const b = pack.base, g = pack.growth;
  const chassis = (b.hp - 16) + (b.ac - 10) * 4 + (b.speed - 3) * 3 + expected(b.attackDice) * 2 + Math.max(0, b.rangeTiles - 1) + (b.resourceMax - 10) * .4 + b.resourceRegen * 2 + (g.hpPerLevel - 2) * 2 + pack.customStats.reduce((sum, stat) => sum + stat.perLevel * 5, 0) + (5 / g.statEveryLevels - 1) * 5;
  const score = (points * 1.4 + chassis) / policy.classRawBaseline * 100;
  const errors = [];
  if (corePoints > policy.corePoints) errors.push(`Core stats spend ${corePoints}/${policy.corePoints} points.`);
  if (customPoints > policy.customPoints) errors.push(`Custom stats spend ${customPoints}/${policy.customPoints} points.`);
  if (points > policy.attributePoints) errors.push(`Attributes spend ${points}/${policy.attributePoints} shared points.`);
  if (score > policy.classBaseline + 1e-8) errors.push(`Class power ${score.toFixed(1)}/${policy.classBaseline}: reduce chassis or stat costs.`);
  for (const terminal of pack.advancements.filter(node => node.level === 8)) {
    const branch = pack.advancements.find(node => node.id === terminal.parentId);
    const root = pack.advancements.find(node => node.id === branch?.parentId);
    const path = [root, branch, terminal].filter(Boolean);
    if (path.length !== 3) continue;
    if (path.reduce((sum, node) => sum + node.statBonusPercent, 0) > policy.pathBonusPercent) errors.push(`${terminal.name}: advanced path exceeds ${policy.pathBonusPercent}% total bonus.`);
    const multipliers = {};
    for (const node of path) {
      if (node.statBonusPercent > policy.maxSpecialistBonus) errors.push(`${node.name}: specialist bonus exceeds ${policy.maxSpecialistBonus}%.`);
      multipliers[node.specialistStat] = (multipliers[node.specialistStat] || 1) * (1 + node.statBonusPercent / 100);
    }
    if (Object.values(multipliers).some(value => value > policy.maxSameStatAmplifier + 1e-8)) errors.push(`${terminal.name}: same-stat amplification exceeds ×${policy.maxSameStatAmplifier}.`);
  }
  return { version: policy.version, score, ceiling: policy.classBaseline, corePoints, customPoints, attributePoints: points, attributeCeiling: policy.attributePoints, chassis, errors };
}
export function classStatEnvelope(pack) {
  const envelope = {};
  const paths = pack.advancements.filter(node => node.level === 8).map(node => {
    const branch = pack.advancements.find(parent => parent.id === node.parentId);
    const root = pack.advancements.find(parent => parent.id === branch?.parentId);
    return [root, branch, node].filter(Boolean);
  });
  for (const path of paths.length ? paths : [[]]) {
    const stats = { ...pack.stats, ...Object.fromEntries(pack.customStats.map(stat => [stat.id, stat.base])) };
    for (let level = 1; level <= 10; level++) {
      if (level > 1) {
        if (level % pack.growth.statEveryLevels === 0) stats[pack.primaryStat] += 1;
        for (const stat of pack.customStats) stats[stat.id] += stat.perLevel;
      }
      for (const node of path) if (node.level === level) stats[node.specialistStat] = Math.round(stats[node.specialistStat] * (1 + node.statBonusPercent / 100));
      envelope[level] ||= {};
      for (const [stat, value] of Object.entries(stats)) envelope[level][stat] = Math.max(envelope[level][stat] ?? -Infinity, Math.floor((value - 10) / 2));
    }
  }
  return envelope;
}
export function skillBudgetReport(skill, envelope) {
  const t = skill.targeting, policy = BALANCE_POLICY, cap = policy.skillBase + policy.skillPerLevel * (skill.level - 1);
  const geometricTargets = ['single', 'self'].includes(t.shape) ? 1 : t.shape === 'line' ? t.lengthTiles * t.widthTiles : t.shape === 'cone' ? Math.ceil(Math.PI * t.lengthTiles ** 2 * t.angleDegrees / 360) : t.shape === 'cross' ? (t.radiusTiles * 4 + 1) * t.widthTiles : t.shape === 'ring' ? Math.max(1, Math.ceil(Math.PI * (t.radiusTiles ** 2 - Math.max(0, t.radiusTiles - t.widthTiles) ** 2))) : Math.ceil(Math.PI * t.radiusTiles ** 2);
  const targets = Math.min(skill.maxTargets, Math.max(1, geometricTargets));
  const parts = skill.effects.map(effect => {
    const mod = envelope?.[skill.level]?.[effect.stat] ?? (2 + Math.floor((skill.level - 1) / 3));
    if (['damage', 'heal', 'shield'].includes(effect.op)) return expected(effect.dice, Math.max(0, mod) * effect.coefficient) * ({ damage: 1, heal: .9, shield: .7 })[effect.op];
    if (effect.op === 'condition') return ({ root: 6, slow: 3, weaken: 5, burn: 2 })[effect.condition] * effect.durationTurns;
    return effect.op === 'move' ? effect.movementTiles * 1.5 : Infinity;
  });
  const resolution = skill.resolution === 'automatic' ? 1.2 : skill.resolution === 'save' && skill.halfOnSave ? 1.1 : 1;
  const utility = Math.max(0, t.rangeTiles - 1) * .2 + (['single', 'self'].includes(t.shape) ? 0 : t.radiusTiles * .15 + (t.friendlyFire ? 0 : .5)) + (t.requiresLOS ? 0 : 1.5);
  const burst = parts.reduce((sum, value) => sum + value, 0) * targets * resolution + utility;
  const uptime = .55 + .45 / (1 + skill.cooldownTurns);
  const resourceDiscount = 1 - Math.min(.15, skill.resourceCost / 20 * .15);
  const useDiscount = skill.usesPerEncounter <= 1 ? .85 : skill.usesPerEncounter <= 3 ? .95 : 1;
  const score = burst * uptime * resourceDiscount * useDiscount;
  const errors = [];
  if (score > cap + 1e-8) errors.push(`${skill.name}: power ${score.toFixed(1)}/${cap} at level ${skill.level}; trade damage, area, control or utility for cost.`);
  if (burst > cap * policy.burstMultiplier + 1e-8) errors.push(`${skill.name}: burst ${burst.toFixed(1)}/${cap * policy.burstMultiplier} exceeds its hard burst cap.`);
  if (!skill.resourceCost && !skill.cooldownTurns && skill.usesPerEncounter > 3 && skill.effects.some(effect => ['heal', 'shield'].includes(effect.op))) errors.push(`${skill.name}: free unlimited recovery needs a cooldown, resource cost or limited uses.`);
  return { score, ceiling: cap, percent: score / cap * 100, burst, burstCeiling: cap * policy.burstMultiplier, targets, utility, uptime, parts, errors };
}
export function packBudgetReport(pack) {
  const chassis = classBudgetReport(pack), envelope = classStatEnvelope(pack);
  const skills = [...pack.levels.flatMap(pool => pool.skills), ...pack.advancements.flatMap(node => node.skills)].map(skill => ({ id: skill.id, name: skill.name, ...skillBudgetReport(skill, envelope) }));
  const reports = new Map(skills.map(skill => [skill.id, skill]));
  const regularBest = pack.levels.flatMap(pool => pool.skills.map(skill => reports.get(skill.id)?.percent || 0).sort((a, b) => b - a).slice(0, 2));
  const pathScores = pack.advancements.filter(node => node.level === 8).map(terminal => {
    const branch = pack.advancements.find(node => node.id === terminal.parentId), root = pack.advancements.find(node => node.id === branch?.parentId);
    const unique = [root, branch, terminal].filter(Boolean).flatMap(node => node.skills.map(skill => reports.get(skill.id)?.percent || 0));
    const learned = [...regularBest, ...unique];
    return learned.length ? learned.reduce((sum, value) => sum + value, 0) / learned.length : 0;
  });
  const strongestSkillPath = Math.max(0, ...pathScores);
  const overallScore = chassis.score * .45 + strongestSkillPath * .55;
  return { chassis, skills, overallScore, strongestSkillPath, ceiling: 100, errors: [...chassis.errors, ...skills.flatMap(skill => skill.errors)] };
}
