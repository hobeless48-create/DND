import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDemoPack, makeSkill, validateContent } from '../shared/rpg.mjs';
import { classBudgetReport, packBudgetReport, classStatEnvelope, skillBudgetReport } from '../shared/balance.mjs';
import { THEMES, makeThemePack, applyThemeToScene } from '../shared/themes.mjs';
import { estimateStoryCost } from '../shared/pricing.mjs';

test('all themed starter classes obey the same class and skill ceiling', () => {
  const scores = [];
  for (const id of Object.keys(THEMES)) {
    const pack = makeThemePack(id), report = packBudgetReport(pack);
    assert.deepEqual(validateContent('class', pack), []);
    assert.ok(report.overallScore <= 100); assert.ok(report.chassis.score <= 100);
    assert.ok(report.skills.every(skill => skill.score <= skill.ceiling && skill.burst <= skill.burstCeiling));
    assert.equal(new Set(pack.advancements.filter(node => node.level === 8).map(node => node.name)).size, 9);
    scores.push(report.chassis.score);
  }
  assert.ok(scores.every(score => Math.abs(score - scores[0]) < 1e-10));
});
test('legal individual stat ranges cannot bypass aggregate class ceilings', () => {
  const allHigh = makeDemoPack(); for (const key of Object.keys(allHigh.stats)) allHigh.stats[key] = 20;
  assert.ok(validateContent('class', allHigh).some(error => error.includes('points') || error.includes('power')));
  const chassis = makeDemoPack(); Object.assign(chassis.base, { hp: 50, ac: 18, speed: 8, resourceMax: 40, resourceRegen: 5 });
  assert.ok(classBudgetReport(chassis).errors.some(error => error.includes('Class power')));
  // Negative dice modifiers cannot create a refund for otherwise illegal stats.
  chassis.base.attackDice = '1d4-49';
  assert.ok(classBudgetReport(chassis).errors.some(error => error.includes('Class power')));
  const upgrades = makeDemoPack(); for (const node of upgrades.advancements) node.statBonusPercent = 20;
  assert.ok(validateContent('class', upgrades).some(error => error.includes('total bonus') || error.includes('amplification')));
});
test('aggregate skill score catches multiple effects, AoE, burst and free recovery exploits', () => {
  const multi = makeSkill('stacked-hit', 'Stacked Hit', 1);
  multi.effects = Array.from({ length: 3 }, () => ({ op: 'damage', dice: '1d6+3', stat: 'int', coefficient: 1 }));
  assert.ok(validateContent('skill', multi).some(error => error.includes('power') || error.includes('burst')));
  const area = makeSkill('large-area', 'Large Area', 1); area.targeting.shape = 'circle'; area.targeting.radiusTiles = 5; area.maxTargets = 12;
  assert.ok(validateContent('skill', area).some(error => error.includes('power') || error.includes('burst')));
  const burst = makeSkill('burst-skip', 'Burst Skip', 10); burst.effects = [{ op: 'damage', dice: '6d20+40', stat: 'int', coefficient: 2 }]; burst.cooldownTurns = 9; burst.resourceCost = 30; burst.usesPerEncounter = 1;
  assert.ok(skillBudgetReport(burst).errors.some(error => error.includes('burst')));
  const recovery = makeSkill('free-recovery', 'Free Recovery', 1, 'heal'); recovery.cooldownTurns = 0; recovery.resourceCost = 0; recovery.usesPerEncounter = 99;
  assert.ok(validateContent('skill', recovery).some(error => error.includes('unlimited recovery')));
});
test('skill power uses level growth and the strongest advanced-class stat path', () => {
  const pack = makeDemoPack(), envelope = classStatEnvelope(pack), skill = pack.levels[9].skills[0];
  assert.ok(envelope[10].int > 5);
  assert.ok(skillBudgetReport(skill, envelope).score > skillBudgetReport(skill).score);
});
test('world packs change story and identity while preserving computed combat values', () => {
  for (const id of ['apocalypse', 'survival']) {
    const scene = { scene: { title: '', description: '', objective: '' }, enemies: [{ archetype: 'Elite', name: 'Hollow Bell Warden', hp: 88, ac: 19, level: 6 }], npcs: [{ name: 'Mara Venn', archetype: 'Surveyor' }] };
    const result = applyThemeToScene(scene, id, 3, { tookBell: true });
    assert.equal(result.enemies[0].name, THEMES[id].enemies.Elite);
    assert.deepEqual([result.enemies[0].hp, result.enemies[0].ac, result.enemies[0].level], [88, 19, 6]);
    assert.equal(result.npcs[0].name, THEMES[id].npc);
    assert.ok(result.scene.description.includes(THEMES[id].takenHint));
  }
  assert.equal(new Set(Object.values(THEMES).map(theme => theme.tiles.floor)).size, 3);
});
test('100 English story replies produce the documented direct API estimates', () => {
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
  const off = estimateStoryCost(), peak = estimateStoryCost({ period: 'peak' });
  assert.equal(off.outputTokens, 9000); assert.equal(off.inputTokens, 100000);
  near(off.outputCost, .0054); near(peak.outputCost, .0108); near(off.total, .0204); near(peak.total, .0408);
  const full = estimateStoryCost({ fullHistory: true }); assert.equal(full.inputTokens, 1000000); near(full.total, .1554);
  near(estimateStoryCost({ fullHistory: true, period: 'peak' }).total, .3108);
  assert.ok(estimateStoryCost({ cacheHitPercent: 80 }).total < off.total);
  assert.throws(() => estimateStoryCost({ cacheHitPercent: 101 }));
});
test('image atlas is a real square PNG and contains all sixteen terrain frames', () => {
  const png = readFileSync(new URL('../public/assets/terrain-atlas.png', import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), png.readUInt32BE(20)); assert.ok(png.readUInt32BE(16) >= 1024);
  for (const theme of Object.values(THEMES)) assert.ok(Object.values(theme.tiles).every(frame => Number.isInteger(frame) && frame >= 0 && frame < 16));
});
