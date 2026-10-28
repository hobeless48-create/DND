import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_RULES, affectedTiles, allClassSkills, encounterPlan, makeDemoPack, makeSkill, scaleMonster, validateContent, validateRules } from '../shared/rpg.mjs';
import { generationTasks, mergeGeneration, validateDraft, validateGeneration } from '../shared/generation.mjs';

test('difficulty keeps the requested offsets/multipliers and strictly increasing counts for every party size and level', () => {
  assert.deepEqual(validateRules(DEFAULT_RULES), []);
  for (let level = 1; level <= 10; level++) for (let size = 1; size <= 4; size++) {
    const [easy, normal, hard] = ['easy', 'normal', 'hard'].map(name => encounterPlan(Array(size).fill(level), name, DEFAULT_RULES, true));
    assert.equal(easy.regularLevel, Math.max(1, level - 1)); assert.equal(easy.bossLevel, level); assert.equal(easy.statMultiplier, .9);
    assert.equal(normal.regularLevel, level); assert.equal(normal.bossLevel, level); assert.equal(normal.statMultiplier, 1);
    assert.equal(hard.regularLevel, level); assert.equal(hard.bossLevel, level + 1); assert.equal(hard.statMultiplier, 1.2);
    assert.ok(easy.minimumMonsters < normal.minimumMonsters && normal.minimumMonsters < hard.minimumMonsters);
  }
  assert.equal(encounterPlan([1, 2]).anchorLevel, 2);
  assert.equal(encounterPlan([3, 4, 5, 4]).averageLevel, 4);
  assert.throws(() => encounterPlan([])); assert.throws(() => encounterPlan([11]));
  const invalid = structuredClone(DEFAULT_RULES); invalid.difficulties.hard.countOffset = -1;
  assert.ok(validateRules(invalid).length > 0);
});
test('documented scaling example is exact and does not mutate template data', () => {
  const base = { level: 1, hp: 20, maxHp: 20, ac: 12, stats: { str: 12, dex: 12, con: 10, int: 10, wis: 10, cha: 8 }, xp: 25 };
  const results = ['easy', 'normal', 'hard'].map(name => scaleMonster(base, encounterPlan([3, 4, 5, 4], name), false));
  assert.deepEqual(results.map(actor => actor.maxHp), [24, 31, 37]);
  assert.deepEqual(results.map(actor => actor.ac), [11, 13, 16]);
  assert.deepEqual(results.map(actor => actor.stats.str), [12, 13, 16]);
  assert.equal(base.maxHp, 20); assert.equal(base.stats.str, 12);
});
test('complete free class has 50 regular skills, 42 unique skills and nine valid terminal paths', () => {
  const pack = makeDemoPack();
  assert.deepEqual(validateContent('class', pack), []);
  assert.equal(pack.levels.flatMap(pool => pool.skills).length, 50);
  assert.equal(pack.advancements.flatMap(node => node.skills).length, 42);
  assert.equal(pack.advancements.filter(node => node.level === 8).length, 9);
  assert.equal(new Set(allClassSkills(pack).map(skill => skill.id)).size, 92);
  const wrongParent = structuredClone(pack); wrongParent.advancements.find(node => node.level === 8).parentId = 'missing-parent';
  assert.ok(validateContent('class', wrongParent).some(error => error.includes('parent') || error.includes('upgrade')));
  const duplicate = structuredClone(pack); duplicate.levels[1].skills[0].id = duplicate.levels[0].skills[0].id;
  assert.ok(validateContent('class', duplicate).some(error => error.includes('Duplicate')));
  const unknown = structuredClone(pack); unknown.levels[0].skills[0].effects[0].stat = 'imaginary';
  assert.ok(validateContent('class', unknown).some(error => error.includes('unknown stat')));
});
test('resumable generation merges exactly the requested segments and rejects malformed output', () => {
  const pack = makeDemoPack(), { levels, advancements, ...identity } = pack;
  const sheet = { ...identity, advancements: advancements.map(({ skills, ...node }) => node) };
  validateGeneration('class_sheet', sheet, {});
  let draft = mergeGeneration(null, 'class_sheet', sheet); validateDraft(draft);
  assert.equal(generationTasks(draft).length, 17);
  for (const pool of levels) { validateGeneration('level_skills', pool, { level: pool.level }); draft = mergeGeneration(draft, 'level_skills', pool); }
  for (let i = 0; i < advancements.length; i += 3) {
    const nodes = advancements.slice(i, i + 3), response = { nodes: nodes.map(({ id, skills }) => ({ id, skills })) };
    validateGeneration('advanced_skills', response, { nodes }); draft = mergeGeneration(draft, 'advanced_skills', response);
  }
  assert.equal(generationTasks(draft).length, 0); assert.deepEqual(validateContent('class', draft), []);
  assert.throws(() => validateGeneration('level_skills', { level: 1, skills: levels[0].skills.slice(0, 4) }, { level: 1 }));
  assert.throws(() => validateGeneration('advanced_skills', { nodes: [] }, { nodes: advancements.slice(0, 3) }));
});
test('Canvas geometry matches area, range, orientation and wall-blocking contracts', () => {
  const skill = makeSkill('shape-test', 'Shape Test', 1), origin = { x: 4, y: 6 }, aim = { x: 8, y: 6 }, bounds = { width: 20, height: 16 };
  skill.targeting.shape = 'circle'; skill.targeting.radiusTiles = 2; skill.targeting.requiresLOS = false;
  assert.equal(affectedTiles(skill.targeting, origin, aim, bounds).length, 13);
  skill.targeting.metric = 'chebyshev'; assert.equal(affectedTiles(skill.targeting, origin, aim, bounds).length, 25);
  assert.equal(affectedTiles(skill.targeting, origin, { x: 19, y: 6 }, bounds).length, 0);
  skill.targeting.shape = 'line'; skill.targeting.requiresLOS = true; skill.targeting.lengthTiles = 8;
  const keys = new Set(affectedTiles(skill.targeting, origin, aim, bounds, new Set(['9,6'])).map(point => `${point.x},${point.y}`));
  assert.ok(keys.has('8,6')); assert.ok(!keys.has('10,6'));
  skill.targeting.shape = 'cone'; const cone = new Set(affectedTiles(skill.targeting, origin, aim, bounds).map(point => `${point.x},${point.y}`));
  assert.ok(cone.has('5,6')); assert.ok(!cone.has('3,6')); assert.ok(!cone.has('4,5'));
});
test('exported item, monster, story and targeting templates validate', () => {
  for (const kind of ['class', 'item', 'monster', 'skill', 'story']) assert.deepEqual(validateContent(kind, JSON.parse(readFileSync(new URL(`../public/templates/${kind}.json`, import.meta.url), 'utf8'))), []);
  for (const shape of ['single', 'self', 'circle', 'cone', 'line', 'cross', 'ring']) assert.deepEqual(validateContent('skill', JSON.parse(readFileSync(new URL(`../public/templates/skill-${shape}.json`, import.meta.url), 'utf8'))), []);
  const executable = makeSkill('bad-script', 'Bad Script', 1); executable.effects = [{ op: 'executeJavaScript', script: 'doAnything()' }];
  assert.ok(validateContent('skill', executable).length > 0);
});
