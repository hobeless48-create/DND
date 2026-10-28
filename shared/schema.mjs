const text = (maxLength = 160) => ({ type: 'string', minLength: 1, maxLength });
const number = (minimum, maximum) => ({ type: 'number', minimum, maximum });
const integer = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const array = (items, minItems, maxItems = minItems) => ({ type: 'array', items, minItems, maxItems });
const id = { type: 'string', pattern: '^[a-z][a-z0-9-]{1,63}$' };
const dice = { type: 'string', pattern: '^[1-6]d(4|6|8|10|12|20)([+-]([0-9]|[1-4][0-9]))?$' };
export const statsSchema = object(Object.fromEntries(['str', 'dex', 'con', 'int', 'wis', 'cha'].map(key => [key, integer(6, 20)])));
export const targetingSchema = object({
  shape: { enum: ['single', 'self', 'circle', 'cone', 'line', 'cross', 'ring'] },
  rangeTiles: integer(0, 12), radiusTiles: integer(0, 5), lengthTiles: integer(1, 12), widthTiles: integer(1, 5),
  angleDegrees: integer(30, 120), metric: { enum: ['euclidean', 'chebyshev', 'manhattan'] },
  team: { enum: ['enemy', 'ally', 'self', 'any'] }, friendlyFire: { type: 'boolean' }, requiresLOS: { type: 'boolean' },
});
const scale = { stat: text(32), coefficient: number(0, 2) };
export const effectSchema = { oneOf: [
  object({ op: { enum: ['damage', 'heal', 'shield'] }, dice, ...scale }),
  object({ op: { const: 'condition' }, condition: { enum: ['burn', 'root', 'slow', 'weaken'] }, durationTurns: integer(1, 3) }),
  object({ op: { const: 'move' }, movementTiles: integer(1, 6) }),
] };
export const skillSchema = object({
  id, name: text(64), description: text(300), level: integer(1, 10),
  resolution: { enum: ['attack', 'save', 'automatic'] }, saveStat: { enum: ['str', 'dex', 'con', 'int', 'wis', 'cha'] }, halfOnSave: { type: 'boolean' },
  targeting: targetingSchema, effects: array(effectSchema, 1, 3), maxTargets: integer(1, 12),
  usesPerEncounter: integer(1, 99), cooldownTurns: integer(0, 9), resourceCost: integer(0, 30),
  visual: object({ color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }, style: { enum: ['bolt', 'burst', 'sweep', 'pulse'] }, durationMs: integer(100, 1200) }),
});
export const advancementSchema = object({
  id, parentId: { anyOf: [id, { type: 'null' }] }, level: { enum: [3, 5, 8] }, name: text(64), description: text(300),
  specialistStat: text(32), statBonusPercent: number(0, 30), skills: array(skillSchema, 2),
});
export const classSchema = object({
  schemaVersion: { const: 1 }, id, name: text(64), concept: text(500), primaryStat: text(32),
  stats: statsSchema,
  customStats: array(object({ id, label: text(32), base: integer(1, 20), perLevel: number(0, 2) }), 0, 8),
  base: object({ hp: integer(16, 50), ac: integer(10, 18), speed: integer(3, 8), attackDice: dice, weapon: text(64), rangeTiles: integer(1, 8), resourceName: text(32), resourceMax: integer(10, 40), resourceRegen: integer(0, 5) }),
  growth: object({ hpPerLevel: integer(2, 8), statEveryLevels: integer(2, 5) }),
  levels: array(object({ level: integer(1, 10), skills: array(skillSchema, 5) }), 10),
  advancements: array(advancementSchema, 21),
});
export const monsterSchema = object({
  schemaVersion: { const: 1 }, id, name: text(64), role: { enum: ['regular', 'boss'] }, level: integer(1, 11),
  hp: integer(1, 2000), ac: integer(6, 30), speed: integer(0, 10), stats: statsSchema, attackDice: dice,
  turnProfile: { enum: ['move-and-act', 'move-or-act', 'stationary'] }, skillIds: array(id, 0, 12),
  behavior: array(object({ priority: integer(1, 99), trigger: { enum: ['targetHpAbove80', 'selfHpBelow70FirstTime', 'allyWounded', 'enemyInRange', 'otherwise'] }, action: { enum: ['useSkill', 'attack', 'approach', 'retreat', 'guard'] }, skillId: { type: 'string', maxLength: 64 }, oncePerEncounter: { type: 'boolean' } }), 1, 12),
});
export const itemSchema = object({
  schemaVersion: { const: 1 }, id, name: text(64), description: text(300),
  slot: { enum: ['weapon', 'armor', 'accessory', 'consumable', 'quest'] }, rarity: { enum: ['common', 'uncommon', 'rare', 'unique'] },
  level: integer(1, 10), value: integer(0, 10000), stackLimit: integer(1, 99),
  modifiers: array(object({ stat: text(32), operation: { enum: ['flat', 'percent'] }, value: number(-30, 30) }), 0, 4),
  grantedSkillIds: array(id, 0, 3), consumedOnUse: { type: 'boolean' },
});
export const storySchema = object({
  schemaVersion: { const: 1 }, id, chapter: integer(1, 10), title: text(64), description: text(650),
  kind: { enum: ['exploration', 'social', 'combat', 'boss', 'rest', 'resolution'] }, objectiveId: id,
  requiresFacts: array(text(64), 0, 12), choices: array(object({ id, label: text(80), consequenceHint: text(160), eventId: id }), 1, 4),
  encounterTag: { type: 'string', maxLength: 64 }, rewardTableId: { type: 'string', maxLength: 64 },
});
export const schemas = { class: classSchema, skill: skillSchema, monster: monsterSchema, item: itemSchema, story: storySchema };
