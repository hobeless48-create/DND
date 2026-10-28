import type { AbilityDefinition, AbilityId, AbilityKey, AbilityScores, Actor } from './types';

export const ABILITIES: { key: AbilityKey; label: string; hint: string }[] = [
  { key: 'str', label: 'STR', hint: 'Force, melee, breaking' },
  { key: 'dex', label: 'DEX', hint: 'Aim, reflex, initiative' },
  { key: 'con', label: 'CON', hint: 'Health, endurance' },
  { key: 'int', label: 'INT', hint: 'Knowledge, arcana' },
  { key: 'wis', label: 'WIS', hint: 'Perception, insight' },
  { key: 'cha', label: 'CHA', hint: 'Presence, persuasion' },
];

export const ARCHETYPES = {
  Fighter: {
    color: '#d67863', blurb: 'Front line protector. Tough, steady, and dangerous up close.',
    stats: { str: 15, dex: 12, con: 14, int: 10, wis: 13, cha: 8 },
    hp: 34, ac: 16, speed: 6, attack: '1d8', weapon: 'Iron longsword', abilities: ['cleave', 'second-wind'] as AbilityId[],
    background: 'Road Guard',
  },
  Rogue: {
    color: '#72ad91', blurb: 'Fast scout. Spots danger, finds angles, and strikes hard once.',
    stats: { str: 8, dex: 15, con: 12, int: 13, wis: 14, cha: 10 },
    hp: 27, ac: 14, speed: 7, attack: '1d6', weapon: 'Short blade', abilities: ['dash', 'sneak-attack'] as AbilityId[],
    background: 'Outlander',
  },
  Wizard: {
    color: '#8194d4', blurb: 'Arcane scholar. Fragile at close range, with spells for any distance.',
    stats: { str: 8, dex: 13, con: 12, int: 15, wis: 14, cha: 10 },
    hp: 22, ac: 12, speed: 6, attack: '1d4', weapon: 'Arcane bolt', abilities: ['magic-missile', 'fireball'] as AbilityId[],
    background: 'Archive Scholar',
  },
  Cleric: {
    color: '#d8b468', blurb: 'Field medic. Keeps the party standing and can hold a doorway.',
    stats: { str: 12, dex: 8, con: 13, int: 10, wis: 15, cha: 14 },
    hp: 31, ac: 15, speed: 6, attack: '1d6', weapon: 'Mace', abilities: ['cure-wounds', 'radiant-flare'] as AbilityId[],
    background: 'Acolyte',
  },
} satisfies Record<string, { color: string; blurb: string; stats: AbilityScores; hp: number; ac: number; speed: number; attack: string; weapon: string; abilities: AbilityId[]; background: string }>;

export type ArchetypeName = keyof typeof ARCHETYPES;
export const BACKGROUNDS = ['Road Guard', 'Archive Scholar', 'Outlander', 'Acolyte'];

// Background training is deliberately a small, authored rules layer. It gives
// identity choices mechanical weight without asking the model to invent bonuses.
export const BACKGROUND_TRAINING: Record<string, { skills: string[]; description: string }> = {
  'Road Guard': { skills: ['Athletics', 'Intimidation'], description: 'Hold a line, force a door, or command a frightened witness.' },
  'Archive Scholar': { skills: ['Arcana', 'Investigation'], description: 'Read old wards, compare clues, and examine strange mechanisms.' },
  Outlander: { skills: ['Perception', 'Survival'], description: 'Notice danger, track movement, and find safe routes.' },
  Acolyte: { skills: ['Insight', 'Medicine'], description: 'Read intentions, recognize suffering, and tend the wounded.' },
};

export const SKILL_CHECKS: Record<string, AbilityKey> = {
  Athletics: 'str', Intimidation: 'cha', Arcana: 'int', Investigation: 'int',
  Perception: 'wis', Survival: 'wis', Insight: 'wis', Medicine: 'wis',
  Stealth: 'dex', Sleight: 'dex', Deception: 'cha', Persuasion: 'cha',
};

export const STORY_DEPTHS: Record<number, { title: string; description: string; objective: string }> = {
  2: {
    title: 'The Drowned Relay',
    description: 'A flooded signal station hangs over a black cistern. Chalk arrows from Mara’s crew point toward a dry ledge, while fresh bootprints circle the relay wheel.',
    objective: 'Cross the relay chamber, learn who moved the bell, and reach the sealed lower gate.',
  },
  3: {
    title: 'The Bell Vault',
    description: 'The road ends at a bronze vault sunk into the bedrock. The missing crew’s tools lie in a neat line before the door. A hollow guardian stirs whenever the bell answers from above.',
    objective: 'Defeat the Hollow Bell Warden and discover why the old road was sealed.',
  },
};

export const ABILITY_DEFS: Record<AbilityId, AbilityDefinition> = {
  'fireball': { id: 'fireball', name: 'Fireball', description: 'Blast a cluster of foes. Nearby enemies make a Dexterity save; success halves damage.', range: 6, uses: 2, action: 'save', score: 'int' },
  'magic-missile': { id: 'magic-missile', name: 'Magic Missile', description: 'Three sure darts of force strike one target.', range: 8, uses: 3, action: 'attack', score: 'int' },
  'cure-wounds': { id: 'cure-wounds', name: 'Cure Wounds', description: 'Restore an adjacent ally with a steady touch.', range: 1, uses: 3, action: 'heal', score: 'wis' },
  'mass-healing-word': { id: 'mass-healing-word', name: 'Mass Healing Word', description: 'A brief prayer mends the party.', range: 0, uses: 1, action: 'heal', score: 'wis' },
  'dash': { id: 'dash', name: 'Quickstep', description: 'Gain extra movement this turn.', range: 0, uses: 99, action: 'movement', score: 'dex' },
  'cleave': { id: 'cleave', name: 'Cleave', description: 'A broad sword swing can catch two nearby enemies.', range: 1, uses: 99, action: 'attack', score: 'str' },
  'second-wind': { id: 'second-wind', name: 'Second Wind', description: 'Recover a little health once each delve.', range: 0, uses: 1, action: 'heal', score: 'con' },
  'sneak-attack': { id: 'sneak-attack', name: 'Sneak Attack', description: 'Hit a distracted foe with a precise strike.', range: 1, uses: 1, action: 'attack', score: 'dex' },
  'radiant-flare': { id: 'radiant-flare', name: 'Radiant Flare', description: 'A close burst of light harms nearby enemies.', range: 0, uses: 2, action: 'save', score: 'wis' },
};

// Ordered, local policies keep monster turns predictable and free of model calls.
// An opening skill triggers against a healthy hero; a panic skill triggers once
// when the monster falls to 70% HP and the skill is still available.
export const MONSTER_BEHAVIORS: Record<string, { openingSkill?: AbilityId; panicSkill?: AbilityId }> = {
  Skirmisher: { openingSkill: 'dash', panicSkill: 'dash' },
  Bruiser: { openingSkill: 'cleave', panicSkill: 'cleave' },
  Elite: { openingSkill: 'cleave', panicSkill: 'cleave' },
};

export const MONSTER_TEMPLATES: Record<string, Omit<Actor, 'id' | 'x' | 'y' | 'initiative' | 'cooldowns' | 'flags' | 'inventory' | 'equipment'>> = {
  'goblin-scout': {
    kind: 'monster', name: 'Silt Goblin', archetype: 'Skirmisher', hp: 17, maxHp: 17, ac: 13, speed: 6,
    stats: { str: 9, dex: 14, con: 10, int: 10, wis: 9, cha: 8 }, color: '#87a95e', level: 1, xp: 25,
    attack: '1d6', weapon: 'Jagged knife', abilities: ['dash'], condition: undefined, gold: 3, turnProfile: 'move-and-act',
  },
  'cave-brute': {
    kind: 'monster', name: 'Blackstone Brute', archetype: 'Bruiser', hp: 29, maxHp: 29, ac: 12, speed: 5,
    stats: { str: 15, dex: 8, con: 14, int: 7, wis: 9, cha: 7 }, color: '#9f7957', level: 1, xp: 45,
    attack: '1d8', weapon: 'Stone maul', abilities: ['cleave'], condition: undefined, gold: 5, turnProfile: 'move-or-act',
  },
  'bell-warden': {
    kind: 'monster', name: 'Hollow Bell Warden', archetype: 'Elite', hp: 48, maxHp: 48, ac: 15, speed: 5,
    stats: { str: 16, dex: 10, con: 16, int: 11, wis: 13, cha: 12 }, color: '#bb765f', level: 2, xp: 90,
    attack: '1d10', weapon: 'Echoing hammer', abilities: ['cleave'], condition: undefined, gold: 15, turnProfile: 'move-and-act',
  },
};

export const STORY = {
  title: 'The Bell Beneath Blackstone',
  subtitle: 'A short first delve',
  intro: 'The rain has followed you to the old road shrine. Three nights ago, the Blackstone waystation stopped answering its brass signal bell. The survey crew went below to inspect a sealed stair and never returned. A quartermaster offers 40 gold for the crew and the bell. Somewhere under the shrine, metal rings once against stone.',
  firstScene: 'A cracked stair opens into a low chamber. Wet footprints lead inward. A surveyor’s chalk mark points toward the sound, and a second trail has been dragged through the dust.',
  deeperScene: 'The stair narrows as the old road descends beneath the hill. The stone is warmer here. A slow bronze note travels through the walls whenever the party pauses.',
  scoutName: 'Mara Venn',
  scoutText: 'Mara Venn, the missing surveyor, is tied beside the bell frame. She saw the goblins carrying something toward a deeper chamber.',
  campaignTruth: 'The brass bell is a warning and a lock. It was installed to keep the Hollow Bell Warden asleep beneath the old road.',
  rescuedMara: 'Mara marks a dry route through the drowned relay and shows the party where the old crew hid its supplies.',
  tookBell: 'The bell rings from the party’s pack. Its answering note carries through the stone and wakes the guardian below.',
};

export function modifier(score: number): number { return Math.floor((score - 10) / 2); }
export function createHero(name: string, archetype: ArchetypeName, background: string, color?: string): Actor {
  const base = ARCHETYPES[archetype];
  return {
    id: `hero-${crypto.randomUUID()}`, kind: 'hero', name: name.trim() || archetype, archetype, x: 2, y: 6,
    hp: base.hp, maxHp: base.hp, ac: base.ac, speed: base.speed, stats: { ...base.stats }, color: color || base.color,
    level: 1, xp: 0, initiative: 0, attack: base.attack, weapon: base.weapon, abilities: [...base.abilities],
    cooldowns: {}, flags: [], gold: 0, background, inventory: [], equipment: [],
  };
}

export function createMonster(templateId: string, x: number, y: number): Actor {
  const base = MONSTER_TEMPLATES[templateId];
  if (!base) throw new Error(`Unknown monster template: ${templateId}`);
  return { ...structuredClone(base), id: `enemy-${crypto.randomUUID()}`, x, y, initiative: 0, cooldowns: {}, flags: [], inventory: [], equipment: [] };
}

export interface ItemDefinition {
  id: string;
  name: string;
  kind: 'weapon' | 'armor' | 'consumable' | 'treasure';
  description: string;
  value: number;
  healFormula?: string;
  attackBonus?: number;
  acBonus?: number;
}

export const ITEMS: Record<string, ItemDefinition> = {
  'healing-potion': { id: 'healing-potion', name: 'Healing Draught', kind: 'consumable', description: 'Restore 2d4 + 2 HP.', value: 8, healFormula: '2d4+2' },
  'iron-longsword': { id: 'iron-longsword', name: 'Iron Longsword', kind: 'weapon', description: '+1 damage while equipped.', value: 15, attackBonus: 1 },
  'wooden-shield': { id: 'wooden-shield', name: 'Wooden Shield', kind: 'armor', description: '+1 AC while equipped.', value: 10, acBonus: 1 },
  'survey-token': { id: 'survey-token', name: 'Survey Crew Token', kind: 'treasure', description: 'Proof that Mara’s crew reached the lower gallery.', value: 20 },
};
