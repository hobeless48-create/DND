import { allClassSkills, DEFAULT_RULES, makeDemoPack, validateContent, validateRules, xpThreshold } from '../../shared/rpg.mjs';
import type { Actor, AbilityKey } from './types';
import { makeThemePack } from '../../shared/themes.mjs';

type ExamplePack = ReturnType<typeof makeDemoPack>;
export interface SkillEffect { op: string; dice?: string; stat?: string; coefficient?: number; condition?: string; durationTurns?: number; movementTiles?: number }
export type CustomSkill = Omit<ExamplePack['levels'][number]['skills'][number], 'effects'> & { effects: SkillEffect[] };
export type ClassPack = Omit<ExamplePack, 'levels' | 'advancements'> & {
  levels: { level: number; skills: CustomSkill[] }[];
  advancements: (Omit<ExamplePack['advancements'][number], 'skills'> & { skills: CustomSkill[] })[];
};
export type GameRules = typeof DEFAULT_RULES;
export const RULES_KEY = 'blackstone-rules-v1';
export const PACKS_KEY = 'blackstone-published-classes-v1';

export function loadRules(): GameRules {
  try { const value = JSON.parse(localStorage.getItem(RULES_KEY) || 'null'); if (!validateRules(value).length) return value; } catch { /* Default rules remain usable. */ }
  return structuredClone(DEFAULT_RULES);
}
export function loadPacks(themeId = 'fantasy'): ClassPack[] {
  try {
    const packs: ClassPack[] = JSON.parse(localStorage.getItem(PACKS_KEY) || '[]');
    if (Array.isArray(packs)) {
      const preset = makeThemePack(themeId);
      const catalog = new Map<string, ClassPack>([[preset.id, preset]]);
      for (const pack of packs) if (!validateContent('class', pack).length) catalog.set(pack.id, pack);
      return [...catalog.values()];
    }
  } catch { /* Damaged imported packs do not prevent starting a game. */ }
  return [makeThemePack(themeId)];
}
export function statValue(actor: Actor, stat: string): number {
  return actor.stats[stat as AbilityKey] ?? actor.customStats?.[stat] ?? 10;
}
export function statModifier(actor: Actor, stat: string): number { return Math.floor((statValue(actor, stat) - 10) / 2); }
export function proficiency(actor: Actor): number { return 2 + Math.floor((actor.level - 1) / 4); }
export function customSkill(actor: Actor, id: string): CustomSkill | undefined {
  return actor.classSheet ? allClassSkills(actor.classSheet).find((skill: CustomSkill) => skill.id === id) : undefined;
}
export function nextProgression(actor: Actor): { level: number; kind: 'skills' | 'class'; options: any[] } | null {
  if (!actor.classSheet) return null;
  for (let level = 1; level <= Math.min(10, actor.level); level++) {
    if (!actor.learnedPools?.includes(level)) return { level, kind: 'skills', options: actor.classSheet.levels.find(pool => pool.level === level)!.skills };
    if ([3, 5, 8].includes(level) && !actor.advancedPath?.[level]) {
      const parent = level === 3 ? null : actor.advancedPath?.[level === 5 ? 3 : 5];
      return { level, kind: 'class', options: actor.classSheet.advancements.filter(node => node.level === level && node.parentId === parent) };
    }
  }
  return null;
}
export function learnChoices(actor: Actor, ids: string[]): void {
  const pending = nextProgression(actor);
  if (!pending || pending.kind !== 'skills' || ids.length !== 2 || new Set(ids).size !== 2 || ids.some(id => !pending.options.some(option => option.id === id))) throw new Error('Choose exactly two distinct skills from this level’s five options.');
  actor.abilities.push(...ids);
  actor.learnedPools = [...(actor.learnedPools || []), pending.level];
}
export function advanceClass(actor: Actor, id: string): void {
  const pending = nextProgression(actor);
  const choice = pending?.options.find(option => option.id === id);
  if (!pending || pending.kind !== 'class' || !choice) throw new Error('Choose an eligible class on your current branch.');
  actor.advancedPath = { ...actor.advancedPath, [pending.level]: id };
  actor.abilities.push(...choice.skills.map((skill: CustomSkill) => skill.id));
  const stat = choice.specialistStat;
  const value = Math.round(statValue(actor, stat) * (1 + choice.statBonusPercent / 100));
  if (stat in actor.stats) actor.stats[stat as AbilityKey] = value;
  else actor.customStats = { ...actor.customStats, [stat]: value };
}
export function awardProgression(actor: Actor, xp: number): number[] {
  actor.xp += xp;
  const levels: number[] = [];
  while (actor.level < 10 && actor.xp >= xpThreshold(actor.level + 1)) {
    actor.level += 1;
    const gain = (actor.classSheet?.growth.hpPerLevel ?? 5) + Math.max(0, statModifier(actor, 'con'));
    actor.maxHp += gain;
    actor.hp = Math.min(actor.maxHp, actor.hp + gain);
    if (actor.classSheet) {
      if (actor.level % actor.classSheet.growth.statEveryLevels === 0) {
        const stat = actor.classSheet.primaryStat;
        if (stat in actor.stats) actor.stats[stat as AbilityKey] += 1;
        else actor.customStats = { ...actor.customStats, [stat]: statValue(actor, stat) + 1 };
      }
      for (const stat of actor.classSheet.customStats) actor.customStats = { ...actor.customStats, [stat.id]: statValue(actor, stat.id) + stat.perLevel };
    }
    levels.push(actor.level);
  }
  return levels;
}
