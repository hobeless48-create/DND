import { mkdirSync, writeFileSync } from 'node:fs';
import { schemas } from '../shared/schema.mjs';
import { DEFAULT_RULES, makeDemoPack, makeSkill } from '../shared/rpg.mjs';
const templates = {
  class: makeDemoPack(), skill: makeSkill('ember-wheel', 'Ember Wheel', 1), rules: DEFAULT_RULES,
  monster: { schemaVersion: 1, id: 'signal-sentry', name: 'Signal Sentry', role: 'regular', level: 1, hp: 18, ac: 12, speed: 5,
    stats: { str: 12, dex: 14, con: 12, int: 10, wis: 10, cha: 8 }, attackDice: '1d6', turnProfile: 'move-or-act', skillIds: ['ember-wheel'],
    behavior: [{ priority: 1, trigger: 'selfHpBelow70FirstTime', action: 'useSkill', skillId: 'ember-wheel', oncePerEncounter: true }, { priority: 2, trigger: 'enemyInRange', action: 'attack', skillId: '', oncePerEncounter: false }, { priority: 3, trigger: 'otherwise', action: 'approach', skillId: '', oncePerEncounter: false }] },
  item: { schemaVersion: 1, id: 'cogweave-ring', name: 'Cogweave Ring', description: 'An articulated ring that steadies intricate work.', slot: 'accessory', rarity: 'uncommon', level: 2, value: 35, stackLimit: 1, modifiers: [{ stat: 'precision', operation: 'flat', value: 2 }], grantedSkillIds: [], consumedOnUse: false },
  story: { schemaVersion: 1, id: 'drowned-relay-warning', chapter: 2, title: 'The Drowned Relay', description: 'A bronze warning trembles through the relay wheel.', kind: 'exploration', objectiveId: 'reach-the-bell-vault', requiresFacts: ['enteredRelay'], choices: [{ id: 'inspect-the-wheel', label: 'Inspect the wheel', consequenceHint: 'Look for a safer passage.', eventId: 'relay-wheel-inspected' }], encounterTag: 'relay-guards', rewardTableId: 'relay-cache' },
};
templates.skill.targeting.shape = 'circle'; templates.skill.maxTargets = 4; templates.skill.effects = [{ op: 'damage', dice: '1d4', stat: 'int', coefficient: 0 }];
for (const directory of ['public/templates', 'design/contracts']) mkdirSync(directory, { recursive: true });
for (const [name, template] of Object.entries(templates)) writeFileSync(`public/templates/${name}.json`, JSON.stringify(template, null, 2) + '\n');
for (const [name, schema] of Object.entries(schemas)) writeFileSync(`design/contracts/${name}.schema.json`, JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', ...schema }, null, 2) + '\n');
for (const shape of ['single', 'self', 'circle', 'cone', 'line', 'cross', 'ring']) {
  const skill = makeSkill(`template-${shape}`, `${shape} template`, 1, shape === 'self' ? 'shield' : 'damage');
  skill.targeting.shape = shape; skill.maxTargets = shape === 'single' || shape === 'self' ? 1 : 4;
  if (skill.maxTargets > 1) skill.effects = [{ op: 'damage', dice: '1d4', stat: 'int', coefficient: 0 }];
  writeFileSync(`public/templates/skill-${shape}.json`, JSON.stringify(skill, null, 2) + '\n');
}
console.log('Exported class, rules, item, monster, story and seven Canvas targeting templates plus JSON schemas.');
