import Ajv from 'ajv';
import { classSchema, skillSchema } from './schema.mjs';
import { validateContent } from './rpg.mjs';
import { classBudgetReport, classStatEnvelope, skillBudgetReport } from './balance.mjs';
const ajv = new Ajv({ allErrors: true });
const sheetSchema = structuredClone(classSchema);
delete sheetSchema.properties.levels;
sheetSchema.required = sheetSchema.required.filter(key => key !== 'levels');
delete sheetSchema.properties.advancements.items.properties.skills;
sheetSchema.properties.advancements.items.required = sheetSchema.properties.advancements.items.required.filter(key => key !== 'skills');
const validateSheet = ajv.compile(sheetSchema);
const validateSkill = ajv.compile(skillSchema);
export function validateGeneration(mode, value, input) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Generated JSON must be an object.');
  if (mode === 'class_sheet') {
    if (!validateSheet(value)) errors.push(...(validateSheet.errors || []).map(e => `${e.instancePath} ${e.message}`));
    if (!errors.length) {
      errors.push(...classBudgetReport(value).errors);
      const stats = ['str', 'dex', 'con', 'int', 'wis', 'cha', ...value.customStats.map(stat => stat.id)];
      if (new Set(stats).size !== stats.length || !stats.includes(value.primaryStat)) errors.push('Stats must be unique and contain the primary stat.');
      if (value.advancements.some(node => !stats.includes(node.specialistStat))) errors.push('Every specialist stat must exist.');
      const placeholder = { ...value, levels: Array.from({ length: 10 }, (_, i) => ({ level: i + 1, skills: [] })) };
      // Check parent topology before spending tokens on any skill pools.
      for (const [level, count] of [[3, 3], [5, 9], [8, 9]]) if (value.advancements.filter(node => node.level === level).length !== count) errors.push(`Expected ${count} nodes at level ${level}.`);
      if (new Set(value.advancements.map(node => node.id)).size !== 21) errors.push('Duplicate advanced class IDs.');
      for (const node of value.advancements) {
        const parent = value.advancements.find(candidate => candidate.id === node.parentId);
        if (node.level === 3 && node.parentId !== null) errors.push(`${node.id}: root must have no parent.`);
        if (node.level === 5 && parent?.level !== 3) errors.push(`${node.id}: missing level-3 parent.`);
        if (node.level === 8 && parent?.level !== 5) errors.push(`${node.id}: missing level-5 parent.`);
        const expectedChildren = node.level === 3 ? 3 : node.level === 5 ? 1 : 0;
        if (placeholder.advancements.filter(candidate => candidate.parentId === node.id).length !== expectedChildren) errors.push(`${node.id}: wrong child count.`);
      }
    }
  } else if (mode === 'level_skills') {
    if (value.level !== input.level || !Array.isArray(value.skills) || value.skills.length !== 5) errors.push('A level response needs exactly five skills for the requested level.');
    else for (const skill of value.skills) {
      if (!validateSkill(skill)) errors.push(...(validateSkill.errors || []).map(e => `${e.instancePath} ${e.message}`));
      if (skill.level !== input.level) errors.push('Skill level does not match requested pool.');
    }
  } else if (mode === 'advanced_skills') {
    if (!Array.isArray(value.nodes) || value.nodes.length !== input.nodes?.length) errors.push('Response must match every requested node exactly once.');
    else for (const requested of input.nodes) {
      const matches = value.nodes.filter(node => node.id === requested.id);
      if (matches.length !== 1 || !Array.isArray(matches[0].skills) || matches[0].skills.length !== 2) errors.push(`${requested.id}: expected two unique skills.`);
      else for (const skill of matches[0].skills) {
        if (!validateSkill(skill)) errors.push(...(validateSkill.errors || []).map(e => `${e.instancePath} ${e.message}`));
        if (skill.level !== requested.level) errors.push('Unique skill level does not match its node.');
      }
    }
  } else errors.push('Unsupported authoring mode.');
  if (!errors.length && mode !== 'class_sheet') {
    let envelope;
    if (input.classProfile) { validateGeneration('class_sheet', input.classProfile, {}); envelope = classStatEnvelope(input.classProfile); }
    const skills = mode === 'level_skills' ? value.skills : value.nodes.flatMap(node => node.skills);
    for (const skill of skills) errors.push(...skillBudgetReport(skill, envelope).errors);
  }
  if (errors.length) throw new Error(errors.slice(0, 8).join('\n'));
  return value;
}
export function mergeGeneration(draft, mode, value) {
  if (mode === 'class_sheet') return { ...value, levels: [], advancements: value.advancements.map(node => ({ ...node, skills: [] })) };
  const next = structuredClone(draft);
  if (mode === 'level_skills') next.levels = [...next.levels.filter(pool => pool.level !== value.level), value].sort((a, b) => a.level - b.level);
  if (mode === 'advanced_skills') for (const node of value.nodes) next.advancements.find(target => target.id === node.id).skills = node.skills;
  return next;
}
export function generationTasks(draft) {
  const tasks = [];
  for (let level = 1; level <= 10; level++) if (!draft.levels.some(pool => pool.level === level && pool.skills.length === 5)) tasks.push({ mode: 'level_skills', input: { level } });
  const missing = draft.advancements.filter(node => node.skills.length !== 2);
  for (let i = 0; i < missing.length; i += 3) tasks.push({ mode: 'advanced_skills', input: { nodes: missing.slice(i, i + 3).map(({ skills, ...node }) => node) } });
  return tasks;
}
export function publishable(draft) { return validateContent('class', draft); }
export function validateDraft(value) {
  if (!value || !Array.isArray(value.levels) || !Array.isArray(value.advancements)) throw new Error('Draft needs levels and advancements arrays.');
  const { levels, advancements, ...sheet } = value;
  validateGeneration('class_sheet', { ...sheet, advancements: advancements.map(({ skills, ...node }) => node) }, {});
  const ids = new Set();
  if (new Set(levels.map(pool => pool.level)).size !== levels.length) throw new Error('Duplicate level pools.');
  for (const pool of levels) {
    if (!Number.isInteger(pool.level) || pool.level < 1 || pool.level > 10) throw new Error('Invalid pool level.');
    validateGeneration('level_skills', pool, { level: pool.level });
  }
  for (const node of advancements) {
    if (!Array.isArray(node.skills) || ![0, 2].includes(node.skills.length)) throw new Error('Advanced draft nodes need either 0 or 2 skills.');
    if (node.skills.length) validateGeneration('advanced_skills', { nodes: [node] }, { nodes: [node] });
  }
  for (const skill of [...levels.flatMap(pool => pool.skills), ...advancements.flatMap(node => node.skills)]) {
    if (ids.has(skill.id)) throw new Error(`Duplicate generated skill ID ${skill.id}. Retry or edit the segment before publishing.`);
    ids.add(skill.id);
  }
  return value;
}
