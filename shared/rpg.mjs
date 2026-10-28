import Ajv from 'ajv';
import { schemas } from './schema.mjs';
import { packBudgetReport, skillBudgetReport } from './balance.mjs';
const ajv = new Ajv({ allErrors: true });
const validators = Object.fromEntries(Object.entries(schemas).map(([kind, schema]) => [kind, ajv.compile(schema)]));
export const CORE_STATS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const DEFAULT_RULES = {
  schemaVersion: 1, difficulty: 'normal', maxPlayerLevel: 10, skillsPerLevel: 5, skillsChosenPerLevel: 2,
  maxPartySize: 4, defenseScaling: 'raw', levelHpGrowth: 0.18, levelDamageGrowth: 0.10,
  difficulties: {
    easy: { regularLevelOffset: -1, bossLevelOffset: 0, statMultiplier: 0.90, minimumMonsters: 1, countPerHero: 1, countOffset: -1 },
    normal: { regularLevelOffset: 0, bossLevelOffset: 0, statMultiplier: 1, minimumMonsters: 2, countPerHero: 1, countOffset: 0 },
    hard: { regularLevelOffset: 0, bossLevelOffset: 1, statMultiplier: 1.20, minimumMonsters: 3, countPerHero: 1, countOffset: 1 },
  },
};
export function validateRules(value) {
  const errors = [];
  if (!value || value.schemaVersion !== 1 || !['easy', 'normal', 'hard'].includes(value.difficulty)) return ['Invalid rules version or difficulty.'];
  for (const [key, required] of Object.entries({ maxPlayerLevel: 10, skillsPerLevel: 5, skillsChosenPerLevel: 2, maxPartySize: 4 })) if (value[key] !== required) errors.push(`${key} must remain ${required} for this progression contract.`);
  if (!['raw', 'bonus'].includes(value.defenseScaling)) errors.push('defenseScaling must be raw or bonus.');
  for (const key of ['levelHpGrowth', 'levelDamageGrowth']) if (!Number.isFinite(value[key]) || value[key] < 0 || value[key] > 0.5) errors.push(`${key} must be between 0 and 0.5.`);
  for (const name of ['easy', 'normal', 'hard']) {
    const d = value.difficulties?.[name];
    if (!d) { errors.push(`Missing ${name}.`); continue; }
    for (const key of ['regularLevelOffset', 'bossLevelOffset', 'countOffset']) if (!Number.isInteger(d[key]) || Math.abs(d[key]) > 3) errors.push(`${name}.${key} must be an integer from -3 to 3.`);
    if (!Number.isFinite(d.statMultiplier) || d.statMultiplier < 0.5 || d.statMultiplier > 2) errors.push(`${name}.statMultiplier must be 0.5–2.`);
    if (!Number.isInteger(d.minimumMonsters) || d.minimumMonsters < 1 || d.minimumMonsters > 12) errors.push(`${name}.minimumMonsters must be 1–12.`);
    if (!Number.isFinite(d.countPerHero) || d.countPerHero < 0.25 || d.countPerHero > 2) errors.push(`${name}.countPerHero must be 0.25–2.`);
  }
  if (!errors.length) for (let n = 1; n <= 4; n++) {
    const counts = ['easy', 'normal', 'hard'].map(name => minimumCount(n, value.difficulties[name]));
    if (!(counts[0] < counts[1] && counts[1] < counts[2])) errors.push(`Monster minimums must increase easy < normal < hard for party size ${n}.`);
    if (counts[2] > 12) errors.push('Current board supports at most 12 enemies.');
  }
  return errors;
}
export function minimumCount(partySize, profile) { return Math.max(profile.minimumMonsters, Math.ceil(partySize * profile.countPerHero) + profile.countOffset); }
export function encounterPlan(levels, difficulty = 'normal', rules = DEFAULT_RULES, boss = false) {
  if (!Array.isArray(levels) || levels.length < 1 || levels.length > rules.maxPartySize || levels.some(l => !Number.isInteger(l) || l < 1 || l > 10)) throw new Error('Encounter needs 1–4 registered heroes at levels 1–10.');
  const average = levels.reduce((sum, level) => sum + level, 0) / levels.length;
  const anchorLevel = Math.floor(average + 0.5);
  const profile = rules.difficulties[difficulty];
  if (!profile) throw new Error('Unknown difficulty.');
  return { difficulty, partySize: levels.length, averageLevel: average, anchorLevel,
    regularLevel: Math.max(1, Math.min(10, anchorLevel + profile.regularLevelOffset)),
    bossLevel: Math.max(1, Math.min(11, anchorLevel + profile.bossLevelOffset)),
    statMultiplier: profile.statMultiplier, minimumMonsters: minimumCount(levels.length, profile), boss,
    defenseScaling: rules.defenseScaling, configVersion: rules.schemaVersion };
}
export function scaleMonster(actor, plan, isBoss, rules = DEFAULT_RULES) {
  const level = isBoss ? plan.bossLevel : plan.regularLevel;
  const delta = level - actor.level;
  const multiplier = plan.statMultiplier;
  const baseAc = Math.max(6, actor.ac + Math.floor(delta / 3));
  const maxHp = Math.max(1, Math.round(actor.maxHp * Math.max(0.5, 1 + rules.levelHpGrowth * delta) * multiplier));
  return { ...actor, level, hp: maxHp, maxHp,
    ac: Math.max(6, Math.round(plan.defenseScaling === 'bonus' ? 10 + (baseAc - 10) * multiplier : baseAc * multiplier)),
    stats: Object.fromEntries(Object.entries(actor.stats).map(([key, score]) => [key, Math.max(1, Math.round((score + Math.floor(delta / 2)) * multiplier))])),
    damageMultiplier: multiplier * Math.max(0.5, 1 + rules.levelDamageGrowth * delta),
    xp: Math.max(5, Math.round(actor.xp * (1 + 0.2 * Math.max(0, delta)))),
    encounterRole: isBoss ? 'boss' : 'regular',
  };
}
export function validateContent(kind, value) {
  const validator = validators[kind];
  if (!validator) return ['Unknown content kind.'];
  if (!validator(value)) return (validator.errors || []).map(error => `${error.instancePath || '/'} ${error.message}`);
  const errors = [];
  const skills = kind === 'class' ? [...value.levels.flatMap(pool => pool.skills), ...value.advancements.flatMap(node => node.skills)] : kind === 'skill' ? [value] : [];
  const ids = new Set();
  const knownStats = new Set([...CORE_STATS, ...(kind === 'class' ? value.customStats.map(stat => stat.id) : [])]);
  for (const skill of skills) {
    if (ids.has(skill.id)) errors.push(`Duplicate skill ID: ${skill.id}`);
    ids.add(skill.id);
    for (const effect of skill.effects) if (['damage', 'heal', 'shield'].includes(effect.op)) {
      if (!knownStats.has(effect.stat) && kind === 'class') errors.push(`${skill.id}: unknown stat ${effect.stat}.`);
      const average = diceAverage(effect.dice) + effect.coefficient * 5;
      if (average > 9 + skill.level * 4) errors.push(`${skill.id}: effect exceeds the level power budget.`);
    }
    if (skill.targeting.shape === 'self' && skill.targeting.team !== 'self' && skill.targeting.team !== 'ally') errors.push(`${skill.id}: self shape must target self or ally.`);
  }
  if (kind === 'class') {
    const allStats = [...CORE_STATS, ...value.customStats.map(stat => stat.id)];
    if (new Set(allStats).size !== allStats.length) errors.push('Custom stat IDs must be unique and cannot replace core stats.');
    if (!allStats.includes(value.primaryStat)) errors.push('Primary stat must exist on the class sheet.');
    if (new Set(value.levels.map(pool => pool.level)).size !== 10) errors.push('Each of levels 1–10 must appear exactly once.');
    for (const pool of value.levels) for (const skill of pool.skills) if (skill.level !== pool.level) errors.push(`${skill.id}: level must match its pool.`);
    const nodes = value.advancements;
    const roots = nodes.filter(node => node.level === 3);
    const branches = nodes.filter(node => node.level === 5);
    const upgrades = nodes.filter(node => node.level === 8);
    if (roots.length !== 3 || branches.length !== 9 || upgrades.length !== 9) errors.push('Tree requires 3 level-3 classes, 9 level-5 specializations and 9 level-8 upgrades.');
    if (new Set(nodes.map(node => node.id)).size !== 21) errors.push('Advanced class IDs must be unique.');
    for (const root of roots) if (root.parentId !== null || branches.filter(node => node.parentId === root.id).length !== 3) errors.push(`${root.id}: requires no parent and exactly 3 specializations.`);
    for (const branch of branches) if (!roots.some(node => node.id === branch.parentId) || upgrades.filter(node => node.parentId === branch.id).length !== 1) errors.push(`${branch.id}: requires a level-3 parent and exactly 1 upgrade.`);
    for (const upgrade of upgrades) if (!branches.some(node => node.id === upgrade.parentId)) errors.push(`${upgrade.id}: missing level-5 parent.`);
    for (const node of nodes) {
      if (!allStats.includes(node.specialistStat)) errors.push(`${node.id}: unknown specialist stat.`);
      for (const skill of node.skills) if (skill.level !== node.level) errors.push(`${skill.id}: unique skill level must match its class milestone.`);
    }
  }
  if (!errors.length && kind === 'class') errors.push(...packBudgetReport(value).errors);
  if (!errors.length && kind === 'skill') errors.push(...skillBudgetReport(value).errors);
  return errors;
}
export function diceAverage(formula) {
  const match = /^(\d+)d(\d+)([+-]\d+)?$/.exec(formula);
  if (!match) return Infinity;
  return Number(match[1]) * (Number(match[2]) + 1) / 2 + Number(match[3] || 0);
}
export function allClassSkills(pack) { return [...pack.levels.flatMap(pool => pool.skills), ...pack.advancements.flatMap(node => node.skills)]; }
export function xpThreshold(level) { return 50 * (level - 1) * (level + 2); }

export function hasLineOfSight(from, to, blocked = new Set()) {
  let x = from.x, y = from.y;
  const dx = Math.abs(to.x - x), dy = Math.abs(to.y - y), sx = x < to.x ? 1 : -1, sy = y < to.y ? 1 : -1;
  let error = dx - dy;
  while (x !== to.x || y !== to.y) {
    const twice = error * 2;
    if (twice > -dy) { error -= dy; x += sx; }
    if (twice < dx) { error += dx; y += sy; }
    if (blocked.has(`${x},${y}`)) return false;
  }
  return true;
}
export function affectedTiles(targeting, origin, aim, bounds = { width: 24, height: 16 }, blocked = new Set()) {
  const chebyshev = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  if (chebyshev(origin, aim) > targeting.rangeTiles && targeting.shape !== 'self') return [];
  if (targeting.requiresLOS && !hasLineOfSight(origin, aim, blocked)) return [];
  const center = targeting.shape === 'self' ? origin : aim;
  const vx = aim.x - origin.x, vy = aim.y - origin.y, magnitude = Math.hypot(vx, vy) || 1;
  const tiles = [];
  for (let y = 0; y < bounds.height; y++) for (let x = 0; x < bounds.width; x++) {
    const point = { x, y };
    if (blocked.has(`${x},${y}`)) continue;
    const dx = x - center.x, dy = y - center.y;
    const radius = targeting.metric === 'chebyshev' ? Math.max(Math.abs(dx), Math.abs(dy)) : targeting.metric === 'manhattan' ? Math.abs(dx) + Math.abs(dy) : Math.hypot(dx, dy);
    let included = false;
    if (['single', 'self'].includes(targeting.shape)) included = x === center.x && y === center.y;
    if (targeting.shape === 'circle') included = radius <= targeting.radiusTiles;
    if (targeting.shape === 'ring') included = radius <= targeting.radiusTiles && radius > Math.max(0, targeting.radiusTiles - targeting.widthTiles);
    if (targeting.shape === 'cross') included = (Math.abs(dx) <= Math.floor(targeting.widthTiles / 2) || Math.abs(dy) <= Math.floor(targeting.widthTiles / 2)) && Math.max(Math.abs(dx), Math.abs(dy)) <= targeting.radiusTiles;
    if (targeting.shape === 'line' || targeting.shape === 'cone') {
      const ax = x - origin.x, ay = y - origin.y, distance = Math.hypot(ax, ay);
      const forward = (ax * vx + ay * vy) / magnitude;
      const side = Math.abs(ax * vy - ay * vx) / magnitude;
      included = targeting.shape === 'line'
        ? forward > 0 && forward <= targeting.lengthTiles && side <= targeting.widthTiles / 2
        : distance > 0 && distance <= targeting.lengthTiles && forward / distance >= Math.cos(targeting.angleDegrees * Math.PI / 360) - 1e-9;
    }
    const source = ['line', 'cone'].includes(targeting.shape) ? origin : center;
    if (included && (!targeting.requiresLOS || hasLineOfSight(source, point, blocked))) tiles.push(point);
  }
  return tiles;
}

export function makeSkill(id, name, level, op = 'damage', stat = 'int') {
  return {
    id, name, description: `${name}: a level ${level} ${op} technique.`, level,
    resolution: op === 'damage' ? 'attack' : 'automatic', saveStat: 'dex', halfOnSave: true,
    targeting: { shape: ['heal', 'shield', 'move'].includes(op) ? 'self' : 'single', rangeTiles: 6, radiusTiles: 2, lengthTiles: 5, widthTiles: 1, angleDegrees: 60, metric: 'euclidean', team: ['heal', 'shield', 'move'].includes(op) ? 'self' : 'enemy', friendlyFire: false, requiresLOS: true },
    effects: op === 'move' ? [{ op: 'move', movementTiles: Math.min(6, 2 + Math.floor(level / 3)) }]
      : op === 'condition' ? [{ op: 'condition', condition: 'slow', durationTurns: 2 }]
      : [{ op, dice: `1d6+${level - 1}`, stat, coefficient: 1 }],
    maxTargets: 1, usesPerEncounter: 6, cooldownTurns: 1, resourceCost: 2,
    visual: { color: '#d6ad63', style: 'pulse', durationMs: 450 },
  };
}
export function makeDemoPack() {
  const branches = [['bastion', 'Iron Bastion', 'con'], ['ranger', 'Gear Ranger', 'dex'], ['sage', 'Signal Sage', 'int']];
  const leaves = [['Bulwark', 'Sentinel', 'Vanguard'], ['Sharpspring', 'Trailgear', 'Saboteur'], ['Resonator', 'Chronist', 'Runewright']];
  const advancements = [];
  const node = (id, parentId, level, name, stat) => ({ id, parentId, level, name, description: `${name} specializes in ${stat.toUpperCase()}.`, specialistStat: stat, statBonusPercent: level === 8 ? 15 : 10,
    skills: [makeSkill(`${id}-signature`, `${name} Signature`, level, 'damage', stat), makeSkill(`${id}-ward`, `${name} Ward`, level, 'shield', stat)] });
  branches.forEach(([key, name, stat], index) => {
    const rootId = `clock-${key}`;
    advancements.push(node(rootId, null, 3, name, stat));
    leaves[index].forEach(leaf => {
      const childId = `${rootId}-${leaf.toLowerCase()}`;
      advancements.push(node(childId, rootId, 5, leaf, stat));
      advancements.push(node(`${childId}-ascendant`, childId, 8, `Ascendant ${leaf}`, stat));
    });
  });
  return { schemaVersion: 1, id: 'clockwork-warden', name: 'Clockwork Warden', concept: 'A keeper of moving fortresses who fights with spring-loaded tools and signal magic. Offline example; new player concepts are authored by DeepSeek.', primaryStat: 'int',
    stats: { str: 10, dex: 13, con: 14, int: 15, wis: 12, cha: 8 }, customStats: [{ id: 'precision', label: 'Precision', base: 12, perLevel: 0.5 }],
    base: { hp: 30, ac: 14, speed: 6, attackDice: '1d6', weapon: 'Signal spanner', rangeTiles: 4, resourceName: 'Pressure', resourceMax: 20, resourceRegen: 2 },
    growth: { hpPerLevel: 5, statEveryLevels: 3 },
    levels: Array.from({ length: 10 }, (_, index) => ({ level: index + 1, skills: ['damage', 'heal', 'shield', 'move', 'condition'].map((op, slot) => makeSkill(`clock-l${index + 1}-${op}`, `${['Spring Bolt', 'Repair Mist', 'Gear Ward', 'Clockstep', 'Snare Cog'][slot]} ${index + 1}`, index + 1, op)) })), advancements };
}
