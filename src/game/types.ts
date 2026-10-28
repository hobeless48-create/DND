export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export type AbilityScores = Record<AbilityKey, number>;
export type TileType = 'wall' | 'floor' | 'rubble' | 'entrance' | 'exit' | 'altar' | 'cover';
export type ActorKind = 'hero' | 'monster' | 'npc';
export type TurnMode = 'explore' | 'combat' | 'choice' | 'complete';
export type ActionMode = 'move' | 'attack' | 'ability' | null;
export type AbilityId = string;

export interface Actor {
  id: string;
  kind: ActorKind;
  name: string;
  archetype: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  ac: number;
  speed: number;
  stats: AbilityScores;
  color: string;
  level: number;
  xp: number;
  initiative: number;
  attack: string;
  weapon: string;
  abilities: AbilityId[];
  cooldowns: Record<string, number>;
  flags: string[];
  background?: string;
  inventory: string[];
  equipment: string[];
  condition?: string;
  gold: number;
  classSheet?: import('./expansion').ClassPack;
  customStats?: Record<string, number>;
  learnedPools?: number[];
  advancedPath?: Record<number, string>;
  primaryStat?: string;
  attackRange?: number;
  resource?: number;
  shield?: number;
  conditions?: { id: string; remainingTurns: number }[];
  damageMultiplier?: number;
  encounterRole?: string;
  turnProfile?: 'move-and-act' | 'move-or-act' | 'stationary';
}

export interface Tile { type: TileType; seen: boolean; }
export interface GameLogEntry { id: string; text: string; type: 'story' | 'combat' | 'system' | 'important'; }
export interface SceneData {
  id: string;
  title: string;
  description: string;
  objective: string;
  depth: number;
  width: number;
  height: number;
  tiles: Tile[][];
  seed: number;
  entrance: { x: number; y: number };
  exit: { x: number; y: number };
  choicesComplete: boolean;
}
export interface CampaignState {
  schemaVersion: 1;
  campaignId: string;
  campaignSeed: number;
  createdAt: number;
  turn: number;
  round: number;
  rngState: number;
  mode: TurnMode;
  scene: SceneData;
  party: Actor[];
  enemies: Actor[];
  npcs: Actor[];
  initiativeOrder: string[];
  activeActorId: string;
  selectedActorId: string;
  actionMode: ActionMode;
  movementUsed: number;
  movementExtra: number;
  actionUsed: boolean;
  logs: GameLogEntry[];
  storyFlags: Record<string, boolean | number | string>;
  gold: number;
  partyInventory: string[];
  lastRoll: string;
  rules?: import('./expansion').GameRules;
  encounterPlan?: ReturnType<typeof import('../../shared/rpg.mjs').encounterPlan>;
  selectedSkillId?: string;
  themeId?: string;
  storyMemory?: ReturnType<typeof import('../../shared/story-memory.mjs').createStoryMemory>;
}

export interface CharacterDraft {
  name: string;
  archetype: string;
  background: string;
  concept: string;
  stats: AbilityScores;
  color: string;
}

export interface AbilityDefinition {
  id: AbilityId;
  name: string;
  description: string;
  range: number;
  uses: number;
  action: 'attack' | 'heal' | 'movement' | 'save';
  score: AbilityKey;
}
