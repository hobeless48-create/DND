import { ABILITY_DEFS, ITEMS, MONSTER_BEHAVIORS, modifier } from './content';
import { generateScene, pathDistance, reachable, seeded, walkable } from './generator';
import type { AbilityId, Actor, CampaignState, GameLogEntry } from './types';
import { DEFAULT_RULES, affectedTiles, encounterPlan, hasLineOfSight } from '../../shared/rpg.mjs';
import { awardProgression, customSkill, nextProgression, proficiency, statModifier, type GameRules } from './expansion';
import { applyThemeToScene, getTheme } from '../../shared/themes.mjs';
import { recordStoryEvent } from '../../shared/story-memory.mjs';

export function log(state: CampaignState, text: string, type: GameLogEntry['type'] = 'system'): void {
  const entry = { id: crypto.randomUUID(), text, type };
  state.logs.unshift(entry);
  recordStoryEvent(state, entry);
  state.logs = state.logs.slice(0, 80);
}

export function roll(state: CampaignState, formula: string): { total: number; detail: string } {
  const random = seeded(state.rngState);
  const normalized = formula.replace(/\s+/g, '').toLowerCase();
  if (!/^[+-]?(?:\d*d\d+|\d+)(?:[+-](?:\d*d\d+|\d+))*$/.test(normalized)) throw new Error(`Unsupported dice formula: ${formula}`);
  const terms = normalized.match(/[+-]?(?:\d*d\d+|\d+)/g) || [];
  let total = 0;
  const details: string[] = [];
  let rolls = 0;
  for (const term of terms) {
    const sign = term.startsWith('-') ? -1 : 1;
    const raw = term.replace(/^[+-]/, '');
    const die = raw.match(/^(\d*)d(\d+)$/);
    if (die) {
      const count = Math.min(20, Math.max(1, Number(die[1] || 1)));
      const sides = Math.min(1000, Math.max(2, Number(die[2])));
      const values = Array.from({ length: count }, () => Math.floor(random() * sides) + 1);
      rolls += count;
      total += sign * values.reduce((sum, value) => sum + value, 0);
      details.push(`${sign < 0 ? '−' : ''}${values.join(' + ')}`);
    } else {
      const amount = Math.min(10000, Number(raw));
      total += sign * amount;
      details.push(`${sign < 0 ? '−' : ''}${amount}`);
    }
  }
  state.rngState = Math.floor(random() * 4294967296) >>> 0;
  return { total, detail: `${details.join(' + ')} = ${total} (${rolls} dice)` };
}

export function getActor(state: CampaignState, id: string): Actor | undefined {
  return [...state.party, ...state.enemies, ...state.npcs].find((actor) => actor.id === id);
}

export function living(actor: Actor): boolean { return actor.hp > 0; }
export function occupiedTiles(state: CampaignState, omitId?: string): Set<string> {
  return [...state.party, ...state.enemies, ...state.npcs].filter((actor) => actor.hp > 0 && actor.id !== omitId).map((actor) => `${actor.x},${actor.y}`).reduce((set, tile) => set.add(tile), new Set<string>());
}
export function distance(a: Actor, b: Actor): number { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }
export function wallTiles(state: CampaignState): Set<string> {
  return new Set(state.scene.tiles.flatMap((row, y) => row.flatMap((tile, x) => tile.type === 'wall' ? [`${x},${y}`] : [])));
}
export function dealDamage(target: Actor, amount: number): number {
  const damage = Math.max(0, amount);
  const absorbed = Math.min(target.shield || 0, damage);
  target.shield = Math.max(0, (target.shield || 0) - absorbed);
  const actual = Math.min(target.hp, damage - absorbed);
  target.hp = Math.max(0, target.hp - actual);
  return actual;
}
function startActorTurn(state: CampaignState, actor: Actor): void {
  for (const key of Object.keys(actor.cooldowns)) if (key.startsWith('cd:')) actor.cooldowns[key] = Math.max(0, actor.cooldowns[key] - 1);
  if (actor.classSheet) actor.resource = Math.min(actor.classSheet.base.resourceMax, (actor.resource ?? actor.classSheet.base.resourceMax) + actor.classSheet.base.resourceRegen);
  actor.conditions = (actor.conditions || []).filter(condition => condition.remainingTurns > 0);
  for (const condition of actor.conditions) {
    if (condition.id === 'burn') { const damage = dealDamage(actor, 2); log(state, `${actor.name} takes ${damage} burning damage.`, 'combat'); }
    condition.remainingTurns -= 1;
  }
  if (!living(actor) && actor.kind === 'monster') afterAction(state);
}
export function attackBonus(actor: Actor): number { return statModifier(actor, actor.primaryStat || (actor.archetype === 'Wizard' ? 'int' : actor.archetype === 'Rogue' ? 'dex' : 'str')) + proficiency(actor); }
export function spellSaveDC(actor: Actor): number {
  const ability = actor.primaryStat || (actor.archetype === 'Wizard' ? 'int' : actor.archetype === 'Cleric' ? 'wis' : 'cha');
  return 8 + statModifier(actor, ability) + proficiency(actor);
}
export function damageFormula(actor: Actor): string {
  const score = actor.archetype === 'Wizard' ? 'int' : actor.archetype === 'Rogue' ? 'dex' : 'str';
  const bonus = statModifier(actor, actor.primaryStat || score) + (actor.equipment.includes('iron-longsword') ? 1 : 0);
  return `${actor.attack}${bonus >= 0 ? `+${bonus}` : bonus}`;
}
export function effectiveAC(actor: Actor): number { return actor.ac + (actor.equipment.includes('wooden-shield') ? 1 : 0); }
export function effectiveSpeed(actor: Actor): number { return actor.conditions?.some(condition => condition.id === 'root') || actor.turnProfile === 'stationary' ? 0 : actor.conditions?.some(condition => condition.id === 'slow') ? Math.floor(actor.speed / 2) : actor.speed; }

function livingActors(state: CampaignState): Actor[] { return [...state.party, ...state.enemies].filter(living); }
export function beginCombat(state: CampaignState): void {
  const actors = livingActors(state);
  for (const actor of actors) actor.initiative = roll(state, '1d20').total + modifier(actor.stats.dex);
  state.initiativeOrder = actors.sort((a, b) => b.initiative - a.initiative || a.id.localeCompare(b.id)).map((actor) => actor.id);
  state.activeActorId = state.initiativeOrder[0] || '';
  state.selectedActorId = state.party[0]?.id || '';
  state.mode = 'combat';
  state.round = 1;
  state.turn = 0;
  state.movementUsed = 0;
  state.movementExtra = 0;
  state.actionUsed = false;
  const order = state.initiativeOrder.map((id) => getActor(state, id)?.name).filter(Boolean).join(' · ');
  log(state, `Initiative: ${order}. Round 1 begins.`, 'important');
  // Initiative can put monsters before the first hero. Resolve those turns now
  // so a player is never left waiting on a disabled action panel.
  let guard = 0;
  while (getActor(state, state.activeActorId)?.kind === 'monster' && guard < state.initiativeOrder.length) {
    const monster = getActor(state, state.activeActorId)!;
    startActorTurn(state, monster);
    if (living(monster)) runMonsterTurn(state, monster);
    if (state.party.every((hero) => !living(hero))) {
      state.mode = 'complete';
      state.storyFlags.partyDefeated = true;
      log(state, 'The crew falls before it can act. The expedition is recorded.', 'important');
      return;
    }
    const nextIndex = (state.initiativeOrder.indexOf(state.activeActorId) + 1) % state.initiativeOrder.length;
    if (nextIndex === 0) { state.round += 1; log(state, `Round ${state.round} begins.`, 'important'); }
    state.activeActorId = state.initiativeOrder[nextIndex];
    state.movementUsed = 0;
    state.movementExtra = 0;
    state.actionUsed = false;
    guard += 1;
  }
  const firstHero = getActor(state, state.activeActorId);
  if (firstHero?.kind === 'hero') { state.selectedActorId = firstHero.id; startActorTurn(state, firstHero); }
}

export function createCampaign(party: Actor[], rules: GameRules = DEFAULT_RULES, themeId = 'fantasy'): CampaignState {
  const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  const plan = encounterPlan(party.map(hero => hero.level), rules.difficulty, rules, false);
  const generated = applyThemeToScene(generateScene(1, seed, undefined, undefined, undefined, party.length, plan, rules), themeId, 1);
  const placements = [[2, 6], [2, 7], [2, 8], [3, 7]];
  party.forEach((actor, index) => { actor.x = placements[index][0]; actor.y = placements[index][1]; actor.hp = actor.maxHp; actor.flags = actor.flags.filter((flag) => flag.startsWith('concept:') || flag.startsWith('trained:')); actor.cooldowns = {}; });
  const state: CampaignState = {
    schemaVersion: 1, campaignId: `campaign-${seed.toString(16)}`, campaignSeed: seed, createdAt: Date.now(),
    turn: 0, round: 1, rngState: seed, mode: 'combat', scene: generated.scene, party, enemies: generated.enemies, npcs: generated.npcs,
    initiativeOrder: [], activeActorId: '', selectedActorId: party[0]?.id || '', actionMode: null, movementUsed: 0, movementExtra: 0, actionUsed: false,
    logs: [], storyFlags: {}, gold: 0, partyInventory: ['healing-potion', 'iron-longsword', 'wooden-shield'], lastRoll: '', rules: structuredClone(rules), encounterPlan: plan, themeId: getTheme(themeId).id,
  };
  log(state, getTheme(themeId).intro, 'story');
  log(state, 'Tutorial: use Move to reposition, then Attack or an ability. End Turn passes control to the party and its foes.', 'important');
  log(state, `${plan.difficulty.toUpperCase()}: average party level ${plan.averageLevel}, monsters level ${plan.regularLevel}, minimum ${plan.minimumMonsters}, stat multiplier ${plan.statMultiplier}.`, 'important');
  beginCombat(state);
  return state;
}

function rollAttack(state: CampaignState, attacker: Actor, target: Actor, formula: string, label: string): string {
  const first = roll(state, '1d20');
  const advantage = attacker.flags.includes('edge-next-attack');
  const second = advantage ? roll(state, '1d20') : null;
  const d20 = second && second.total > first.total ? second : first;
  if (advantage) attacker.flags = attacker.flags.filter((flag) => flag !== 'edge-next-attack');
  const total = d20.total + attackBonus(attacker);
  if (d20.total === 1 || (d20.total !== 20 && total < effectiveAC(target))) {
    const message = `${attacker.name} ${label} misses ${target.name} (${d20.total} + ${attackBonus(attacker)} vs AC ${effectiveAC(target)}).`;
    log(state, message, 'combat');
    state.lastRoll = `${advantage ? `${first.total}, ${second?.total} (advantage) · ` : ''}${d20.detail} + ${attackBonus(attacker)} = ${total} vs AC ${effectiveAC(target)} · miss`;
    return message;
  }
  const damage = roll(state, formula);
  const rolled = d20.total === 20 ? damage.total + roll(state, formula).total : damage.total;
  const final = dealDamage(target, Math.max(1, Math.round(rolled * (attacker.damageMultiplier ?? 1) * (attacker.conditions?.some(condition => condition.id === 'weaken') ? 0.75 : 1))));
  const critical = d20.total === 20 ? ' Critical hit!' : '';
  const message = `${attacker.name} ${label} ${target.name} for ${final} damage.${critical} (${d20.total} + ${attackBonus(attacker)} vs AC ${effectiveAC(target)}).`;
  state.lastRoll = `${advantage ? `${first.total}, ${second?.total} (advantage) · ` : ''}d20 ${d20.total} + ${attackBonus(attacker)} = ${total} vs AC ${effectiveAC(target)} · ${d20.total === 20 ? 'critical' : 'hit'} · ${damage.detail}`;
  log(state, message, 'combat');
  if (target.hp === 0) log(state, `${target.name} falls.`, 'important');
  return message;
}

export function moveActor(state: CampaignState, actor: Actor, x: number, y: number): boolean {
  if (state.mode !== 'combat' || actor.id !== state.activeActorId || !living(actor) || actor.conditions?.some(condition => condition.id === 'root') || actor.turnProfile === 'stationary' || (actor.turnProfile === 'move-or-act' && state.actionUsed)) return false;
  if (!walkable(state.scene, x, y) || occupiedTiles(state, actor.id).has(`${x},${y}`)) return false;
  const paths = reachable(state.scene, actor, occupiedTiles(state, actor.id), effectiveSpeed(actor) + state.movementExtra);
  if (!paths.some((point) => point.x === x && point.y === y)) return false;
  const distanceMoved = pathDistance(state.scene, actor, { x, y }, occupiedTiles(state, actor.id));
  if (state.movementUsed + distanceMoved > effectiveSpeed(actor) + state.movementExtra) return false;
  actor.x = x;
  actor.y = y;
  state.movementUsed += distanceMoved;
  if (actor.turnProfile === 'move-or-act') state.actionUsed = true;
  state.actionMode = null;
  log(state, `${actor.name} moves ${distanceMoved * 5} ft.`, 'system');
  state.turn += 1;
  return true;
}

export function attackTarget(state: CampaignState, actor: Actor, target: Actor): boolean {
  if (state.mode !== 'combat' || actor.id !== state.activeActorId || !living(actor) || state.actionUsed || distance(actor, target) > (actor.attackRange || 1) || target.kind !== 'monster' || !living(target) || !hasLineOfSight(actor, target, wallTiles(state))) return false;
  rollAttack(state, actor, target, damageFormula(actor), 'attacks');
  state.actionUsed = true;
  state.actionMode = null;
  state.turn += 1;
  afterAction(state);
  return true;
}

export function useAbility(state: CampaignState, actor: Actor, abilityId: AbilityId, target?: Actor, aim?: { x: number; y: number }): boolean {
  if (customSkill(actor, abilityId)) return useCustomSkill(state, actor, abilityId, aim || target || actor);
  if (state.mode !== 'combat' || actor.id !== state.activeActorId || !living(actor)) return false;
  const definition = ABILITY_DEFS[abilityId];
  if (!definition || state.actionUsed || !actor.abilities.includes(abilityId)) return false;
  const uses = actor.cooldowns[`uses:${abilityId}`] || 0;
  if (uses >= definition.uses) return false;
  const score = modifier(actor.stats[definition.score]);
  const prof = 2;
  let valid = false;
  switch (abilityId) {
    case 'magic-missile':
      if (!target || target.kind !== 'monster' || !living(target) || distance(actor, target) > definition.range) return false;
      { const damage = roll(state, '3d4+3'); target.hp = Math.max(0, target.hp - damage.total); log(state, `${actor.name} casts Magic Missile. Three darts deal ${damage.total} force damage to ${target.name}.`, 'combat'); state.lastRoll = `Magic Missile · ${damage.detail}`; }
      valid = true; break;
    case 'fireball':
      if (!target || target.kind !== 'monster' || distance(actor, target) > definition.range) return false;
      { const victims = state.enemies.filter((enemy) => living(enemy) && Math.max(Math.abs(enemy.x - target.x), Math.abs(enemy.y - target.y)) <= 2);
        for (const enemy of victims) { const damage = roll(state, '4d6'); const save = roll(state, '1d20').total + modifier(enemy.stats.dex); const dc = spellSaveDC(actor); const total = save >= dc ? Math.floor(damage.total / 2) : damage.total; enemy.hp = Math.max(0, enemy.hp - total); log(state, `Fireball scorches ${enemy.name} for ${total} fire damage${save >= dc ? ' (Dex save succeeds; half damage)' : ''}.`, 'combat'); state.lastRoll = `Fireball · ${damage.detail} · ${enemy.name} Dex save ${save} vs DC ${dc}`; }
      }
      valid = true; break;
    case 'cure-wounds':
      if (!target || target.kind !== 'hero' || !living(target) || distance(actor, target) > definition.range || target.hp === target.maxHp) return false;
      { const healing = roll(state, `1d8${score >= 0 ? '+' : ''}${score}`); const actual = Math.min(Math.max(1, healing.total), target.maxHp - target.hp); target.hp += actual; log(state, `${actor.name} restores ${actual} HP to ${target.name}.`, 'important'); state.lastRoll = `Cure Wounds · ${healing.detail}`; }
      valid = true; break;
    case 'mass-healing-word':
      for (const ally of state.party.filter(living)) { const healing = roll(state, `1d4${score >= 0 ? '+' : ''}${score}`); ally.hp = Math.min(ally.maxHp, ally.hp + Math.max(1, healing.total)); }
      log(state, `${actor.name} speaks a healing word over the party.`, 'important'); valid = true; break;
    case 'second-wind':
      if (actor.hp >= actor.maxHp) return false;
      { const healing = roll(state, '1d10+1'); const actual = Math.min(healing.total, actor.maxHp - actor.hp); actor.hp += actual; log(state, `${actor.name} catches their breath and restores ${actual} HP.`, 'important'); state.lastRoll = `Second Wind · ${healing.detail}`; }
      valid = true; break;
    case 'dash':
      state.movementExtra = actor.speed; log(state, `${actor.name} uses Quickstep and gains ${actor.speed * 5} ft of movement.`, 'system'); valid = true; state.actionUsed = false; break;
    case 'cleave': case 'sneak-attack': case 'radiant-flare':
      if (abilityId === 'radiant-flare') {
        const victims = state.enemies.filter((enemy) => living(enemy) && distance(actor, enemy) <= 2);
        if (!victims.length) return false;
        const dc = spellSaveDC(actor);
        for (const enemy of victims) { const save = roll(state, '1d20').total + modifier(enemy.stats.dex); const damage = roll(state, '2d6+2'); const total = save >= dc ? Math.floor(damage.total / 2) : damage.total; enemy.hp = Math.max(0, enemy.hp - total); log(state, `${enemy.name} takes ${total} radiant damage${save >= dc ? ' after resisting the flare' : ''}.`, 'combat'); state.lastRoll = `Radiant Flare · ${damage.detail} · Dex save ${save} vs DC ${dc}`; }
        valid = true;
      } else {
        if (!target || target.kind !== 'monster' || !living(target) || distance(actor, target) > 1) return false;
        const formula = abilityId === 'sneak-attack' ? `${damageFormula(actor)}+1d6` : damageFormula(actor);
        rollAttack(state, actor, target, formula, abilityId === 'sneak-attack' ? 'strikes from the shadows and attacks' : 'uses Cleave on');
        if (abilityId === 'cleave') for (const other of state.enemies.filter((enemy) => enemy.id !== target.id && living(enemy) && distance(actor, enemy) <= 1)) { const damage = roll(state, '1d4'); other.hp = Math.max(0, other.hp - damage.total); log(state, `The wide swing clips ${other.name} for ${damage.total}.`, 'combat'); }
        valid = true;
      }
      break;
    default: return false;
  }
  if (!valid) return false;
  actor.cooldowns[`uses:${abilityId}`] = uses + 1;
  if (abilityId !== 'dash') state.actionUsed = true;
  state.actionMode = null;
  state.turn += 1;
  afterAction(state);
  return true;
}

export function useCustomSkill(state: CampaignState, actor: Actor, id: string, aim: { x: number; y: number }): boolean {
  const skill = customSkill(actor, id);
  if (!skill || state.mode !== 'combat' || state.activeActorId !== actor.id || !living(actor) || state.actionUsed || !actor.abilities.includes(id)) return false;
  if ((actor.cooldowns[`uses:${id}`] || 0) >= skill.usesPerEncounter || (actor.cooldowns[`cd:${id}`] || 0) > 0 || (actor.resource ?? 0) < skill.resourceCost) return false;
  const tiles = affectedTiles(skill.targeting, actor, aim, state.scene, wallTiles(state));
  const keys = new Set(tiles.map(point => `${point.x},${point.y}`));
  const allies = actor.kind === 'hero' ? state.party : state.enemies;
  const enemies = actor.kind === 'hero' ? state.enemies : state.party;
  const candidates = skill.targeting.team === 'self' ? [actor] : skill.targeting.team === 'ally' ? allies : skill.targeting.team === 'enemy' ? enemies : [...allies, ...enemies];
  const victims = candidates.filter(target => (living(target) || (skill.effects.some(effect => effect.op === 'heal') && allies.includes(target))) && keys.has(`${target.x},${target.y}`)).sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id)).slice(0, skill.maxTargets);
  if (skill.targeting.friendlyFire && skill.targeting.team === 'enemy') victims.push(...allies.filter(target => living(target) && keys.has(`${target.x},${target.y}`)).slice(0, Math.max(0, skill.maxTargets - victims.length)));
  if (!victims.length) return false;
  for (const victim of victims) {
    let hit = true, saved = false, critical = false;
    if (skill.resolution === 'attack') {
      const first = roll(state, '1d20').total;
      const d20 = actor.flags.includes('edge-next-attack') ? Math.max(first, roll(state, '1d20').total) : first;
      actor.flags = actor.flags.filter(flag => flag !== 'edge-next-attack');
      hit = d20 === 20 || (d20 !== 1 && d20 + attackBonus(actor) >= effectiveAC(victim));
      critical = d20 === 20;
      state.lastRoll = `${skill.name}: d20 ${d20} + ${attackBonus(actor)} vs AC ${effectiveAC(victim)} · ${hit ? 'hit' : 'miss'}`;
      log(state, `${actor.name} uses ${skill.name} on ${victim.name}: ${hit ? 'hit' : 'miss'}.`, 'combat');
    } else if (skill.resolution === 'save') {
      const save = roll(state, '1d20').total + statModifier(victim, skill.saveStat);
      saved = save >= spellSaveDC(actor);
      state.lastRoll = `${skill.name}: ${victim.name} save ${save} vs DC ${spellSaveDC(actor)} · ${saved ? 'saved' : 'failed'}`;
    }
    if (!hit) continue;
    for (const effect of skill.effects) {
      if (effect.op === 'move') { state.movementExtra = Math.max(state.movementExtra, effect.movementTiles || 0); log(state, `${skill.name} grants ${(effect.movementTiles || 0) * 5} ft of movement this turn.`, 'system'); continue; }
      if (effect.op === 'condition') {
        if (!saved) { victim.conditions = [...(victim.conditions || []).filter(condition => condition.id !== effect.condition), { id: effect.condition || 'slow', remainingTurns: effect.durationTurns || 1 }]; log(state, `${skill.name} applies ${effect.condition} to ${victim.name} for ${effect.durationTurns} turns.`, 'combat'); }
        continue;
      }
      const dice = roll(state, effect.dice || '1d4');
      let amount = Math.max(1, Math.round(dice.total + statModifier(actor, effect.stat || actor.primaryStat || 'int') * (effect.coefficient || 0)));
      if (critical && effect.op === 'damage') amount += roll(state, effect.dice || '1d4').total;
      if (saved && effect.op === 'damage') amount = skill.halfOnSave ? Math.floor(amount / 2) : 0;
      if (effect.op === 'damage') amount = dealDamage(victim, Math.round(amount * (actor.damageMultiplier ?? 1) * (actor.conditions?.some(condition => condition.id === 'weaken') ? 0.75 : 1)));
      if (effect.op === 'heal') { amount = Math.min(amount, victim.maxHp - victim.hp); victim.hp += amount; }
      if (effect.op === 'shield') { const old = victim.shield || 0; victim.shield = Math.min(Math.ceil(victim.maxHp / 2), old + amount); amount = victim.shield - old; }
      log(state, `${skill.name}: ${victim.name} ${effect.op === 'damage' ? 'takes' : 'gains'} ${amount} ${effect.op === 'damage' ? 'damage' : effect.op === 'heal' ? 'HP' : 'shield'}.`, 'combat');
      state.lastRoll += ` · ${dice.detail}`;
    }
  }
  actor.resource = Math.max(0, (actor.resource || 0) - skill.resourceCost);
  actor.cooldowns[`uses:${id}`] = (actor.cooldowns[`uses:${id}`] || 0) + 1;
  actor.cooldowns[`cd:${id}`] = skill.cooldownTurns + 1;
  state.actionUsed = true;
  state.actionMode = null;
  state.selectedSkillId = undefined;
  state.turn += 1;
  afterAction(state);
  return true;
}

export function useItem(state: CampaignState, actor: Actor, itemId: string): boolean {
  if (state.actionUsed || !state.partyInventory.includes(itemId)) return false;
  const item = ITEMS[itemId];
  if (!item) return false;
  if (item.kind === 'consumable' && item.healFormula) {
    if (actor.hp >= actor.maxHp) return false;
    const healed = roll(state, item.healFormula);
    const actual = Math.min(healed.total, actor.maxHp - actor.hp);
    actor.hp += actual;
    state.partyInventory.splice(state.partyInventory.indexOf(itemId), 1);
    log(state, `${actor.name} uses ${getTheme(state.themeId).items[itemId] || item.name} and recovers ${actual} HP.`, 'important');
    state.actionUsed = true;
    state.turn += 1;
    afterAction(state);
    return true;
  }
  return false;
}

export function abilityCheck(state: CampaignState, actor: Actor, score: keyof Actor['stats'], label: string, dc = 12, trained = false): boolean {
  if (state.actionUsed || actor.kind !== 'hero') return false;
  const die = roll(state, '1d20');
  const bonus = modifier(actor.stats[score]);
  const proficiency = trained ? 2 : 0;
  const total = die.total + bonus + proficiency;
  const success = die.total === 20 || (die.total !== 1 && total >= dc);
  state.lastRoll = `${label} · d20 ${die.total} ${bonus >= 0 ? '+' : '−'} ${Math.abs(bonus)}${proficiency ? ` + ${proficiency} proficiency` : ''} = ${total} vs DC ${dc} · ${success ? 'success' : 'failure'}`;
  log(state, `${actor.name} ${label}: ${success ? 'success' : 'failure'} (${die.total} + ${bonus} ability${proficiency ? ` + ${proficiency} proficiency` : ''} = ${total} vs DC ${dc}).${success ? ' You spot an opening; your next attack has advantage.' : ''}`, success ? 'important' : 'system');
  if (success) actor.flags.push('edge-next-attack');
  state.actionUsed = true;
  state.turn += 1;
  return true;
}

export function equipItem(state: CampaignState, actor: Actor, itemId: string): void {
  if (!state.partyInventory.includes(itemId)) return;
  if (actor.equipment.includes(itemId)) actor.equipment = actor.equipment.filter((id) => id !== itemId);
  else actor.equipment.push(itemId);
  const item = ITEMS[itemId];
  log(state, `${actor.name} ${actor.equipment.includes(itemId) ? 'equips' : 'unequips'} ${getTheme(state.themeId).items[itemId] || item?.name || itemId}.`);
}

function nearestHero(state: CampaignState, monster: Actor): Actor | undefined {
  return state.party.filter(living).sort((a, b) => distance(monster, a) - distance(monster, b) || a.hp - b.hp || a.id.localeCompare(b.id))[0];
}

function monsterSkillReady(monster: Actor, skill: AbilityId | undefined): skill is AbilityId {
  if (!skill) return false;
  const definition = ABILITY_DEFS[skill];
  return (monster.cooldowns[`uses:${skill}`] || 0) < definition.uses;
}

function monsterCleave(state: CampaignState, monster: Actor, target: Actor, label: string): void {
  monster.cooldowns['uses:cleave'] = (monster.cooldowns['uses:cleave'] || 0) + 1;
  log(state, `${monster.name} uses Cleave ${label}.`, 'combat');
  rollAttack(state, monster, target, damageFormula(monster), 'strikes');
  for (const ally of state.party.filter((hero) => hero.id !== target.id && living(hero) && distance(monster, hero) <= 1)) {
    const damage = roll(state, '1d4');
    const actual = dealDamage(ally, Math.round(damage.total * (monster.damageMultiplier ?? 1) * (monster.conditions?.some(condition => condition.id === 'weaken') ? 0.75 : 1)));
    log(state, `${ally.name} is clipped for ${actual}.`, 'combat');
  }
}

export function runMonsterTurn(state: CampaignState, monster: Actor): void {
  if (!living(monster)) return;
  const target = nearestHero(state, monster);
  if (!target) return;
  const movement = effectiveSpeed(monster);
  const behavior = MONSTER_BEHAVIORS[monster.archetype];
  const openingSkill = behavior?.openingSkill;
  const panicSkill = behavior?.panicSkill;
  const canUseOpening = target.hp / target.maxHp > 0.8 && !monster.flags.includes('opening-skill-used') && monster.abilities.includes(openingSkill as AbilityId) && monsterSkillReady(monster, openingSkill);
  if (canUseOpening && openingSkill === 'cleave' && distance(monster, target) <= 1) {
    monster.flags.push('opening-skill-used');
    monsterCleave(state, monster, target, 'at the start of the fight');
    return;
  }
  if (canUseOpening && openingSkill === 'dash' && distance(monster, target) > 1 && movement > 0) {
    const spots = reachable(state.scene, monster, occupiedTiles(state, monster.id), movement * 2);
    const move = spots.sort((a, b) => distance({ ...monster, ...a }, target) - distance({ ...monster, ...b }, target) || a.y - b.y || a.x - b.x)[0];
    if (move) {
      monster.flags.push('opening-skill-used');
      monster.cooldowns['uses:dash'] = (monster.cooldowns['uses:dash'] || 0) + 1;
      monster.x = move.x;
      monster.y = move.y;
      log(state, `${monster.name} uses Quickstep to rush ${target.name}.`, 'combat');
      if (monster.turnProfile !== 'move-or-act' && distance(monster, target) <= 1) rollAttack(state, monster, target, damageFormula(monster), 'attacks');
      return;
    }
  }
  const wantsPanicSkill = monster.hp / monster.maxHp <= 0.7 && !monster.flags.includes('panic-skill-used') && monster.abilities.includes(panicSkill as AbilityId) && monsterSkillReady(monster, panicSkill);
  if (wantsPanicSkill && panicSkill === 'cleave' && distance(monster, target) <= 1) {
    monster.flags.push('panic-skill-used');
    monsterCleave(state, monster, target, 'in a desperate counterattack');
    return;
  }
  if (wantsPanicSkill && panicSkill === 'dash' && movement > 0) {
    monster.flags.push('panic-skill-used');
    monster.cooldowns['uses:dash'] = (monster.cooldowns['uses:dash'] || 0) + 1;
    const spots = reachable(state.scene, monster, occupiedTiles(state, monster.id), movement * 2);
    const flee = spots.sort((a, b) => distance({ ...monster, ...b }, target) - distance({ ...monster, ...a }, target) || a.y - b.y || a.x - b.x)[0];
    if (flee) {
      monster.x = flee.x;
      monster.y = flee.y;
      log(state, `${monster.name} panics and Quicksteps away from ${target.name}.`, 'combat');
      return;
    }
  }
  if (distance(monster, target) <= 1) {
    rollAttack(state, monster, target, damageFormula(monster), 'attacks');
    return;
  }
  const spots = reachable(state.scene, monster, occupiedTiles(state, monster.id), movement);
  const move = spots.sort((a, b) => Math.max(Math.abs(a.x - target.x), Math.abs(a.y - target.y)) - Math.max(Math.abs(b.x - target.x), Math.abs(b.y - target.y)) || a.y - b.y || a.x - b.x)[0];
  if (move) { monster.x = move.x; monster.y = move.y; log(state, `${monster.name} closes in on ${target.name}.`, 'combat'); }
  if (monster.turnProfile !== 'move-or-act' && distance(monster, target) <= 1) rollAttack(state, monster, target, damageFormula(monster), 'attacks');
}

function afterAction(state: CampaignState): void {
  if (state.enemies.every((enemy) => !living(enemy))) {
    if (!state.storyFlags[`rewarded:${state.scene.id}`]) {
      state.storyFlags[`rewarded:${state.scene.id}`] = true;
      const xp = Math.max(1, Math.floor(state.enemies.reduce((sum, enemy) => sum + enemy.xp, 0) / state.party.length));
      for (const hero of state.party) {
        const levels = awardProgression(hero, xp);
        for (const level of levels) log(state, `${hero.name} reaches level ${level}${nextProgression(hero) ? '. Choose two skills and any pending advanced class before the next battle' : ''}.`, 'important');
      }
      const reward = 8 + state.scene.depth * 4;
      state.gold += reward;
      state.partyInventory.push('healing-potion');
      const theme = getTheme(state.themeId);
      log(state, `Encounter won. Each hero gains ${xp} XP; the party finds ${reward} ${theme.currency} and a ${theme.items['healing-potion']}.`, 'important');
    }
    state.mode = state.scene.depth === 1 && !state.scene.choicesComplete ? 'choice' : 'complete';
    state.actionMode = null;
  }
}

export function advanceToPlayer(state: CampaignState): void {
  if (state.mode !== 'combat') return;
  if (state.party.every((hero) => !living(hero))) {
    state.mode = 'complete';
    state.storyFlags.partyDefeated = true;
    log(state, 'The crew falls. The expedition is recorded.', 'important');
    return;
  }
  const maxSteps = state.initiativeOrder.length * 2 + 1;
  for (let i = 0; i < maxSteps; i++) {
    state.turn += 1;
    let index = state.initiativeOrder.indexOf(state.activeActorId);
    index = (index + 1) % state.initiativeOrder.length;
    if (index === 0) { state.round += 1; log(state, `Round ${state.round} begins.`, 'important'); }
    state.activeActorId = state.initiativeOrder[index];
    const actor = getActor(state, state.activeActorId);
    if (!actor || !living(actor)) continue;
    state.movementUsed = 0;
    state.movementExtra = 0;
    state.actionUsed = false;
    startActorTurn(state, actor);
    if (state.mode !== 'combat') return;
    if (!living(actor)) continue;
    if (actor.kind === 'hero') {
      state.selectedActorId = actor.id;
      state.actionMode = null;
      log(state, `${actor.name}'s turn.`, 'system');
      return;
    }
    runMonsterTurn(state, actor);
    if (state.party.every((hero) => !living(hero))) {
      state.mode = 'complete';
      state.storyFlags.partyDefeated = true;
      log(state, 'The crew falls. The expedition is recorded.', 'important');
      return;
    }
    if (state.mode !== 'combat') return;
  }
}

export function resolvePendingEnemyTurn(state: CampaignState): void {
  const active = getActor(state, state.activeActorId);
  if (state.mode !== 'combat' || active?.kind !== 'monster') return;
  startActorTurn(state, active);
  if (living(active)) runMonsterTurn(state, active);
  if (state.party.every((hero) => !living(hero))) {
    state.mode = 'complete';
    state.storyFlags.partyDefeated = true;
    log(state, 'The crew falls. The expedition is recorded.', 'important');
    return;
  }
  advanceToPlayer(state);
}

export function endHeroTurn(state: CampaignState): void {
  const active = getActor(state, state.activeActorId);
  if (!active || active.kind !== 'hero') return;
  advanceToPlayer(state);
}

export function interactScout(state: CampaignState, choice: 'rescue' | 'bell'): void {
  const theme = getTheme(state.themeId);
  state.storyFlags.rescuedSurveyor = choice === 'rescue';
  state.storyFlags.tookBell = choice === 'bell';
  state.scene.choicesComplete = true;
  if (choice === 'rescue') {
    state.storyFlags.maraAlive = true;
    state.partyInventory.push('survey-token');
    log(state, theme.rescueResult, 'story');
  } else {
    state.gold += 40;
    log(state, theme.takeResult, 'story');
  }
  state.mode = 'complete';
}

export function descend(state: CampaignState): void {
  if (state.party.some(hero => nextProgression(hero))) throw new Error('Finish all pending level and class choices before the next battle.');
  const depth = state.scene.depth + 1;
  const seed = (state.rngState + depth * 0x9e3779b9) >>> 0;
  const rules = state.rules || DEFAULT_RULES;
  const plan = encounterPlan(state.party.map(hero => hero.level), rules.difficulty, rules, depth >= 3);
  state.encounterPlan = plan;
  const generated = applyThemeToScene(generateScene(depth, seed, undefined, undefined, undefined, state.party.length, plan, rules), state.themeId || 'fantasy', depth, state.storyFlags);
  state.scene = generated.scene;
  state.enemies = generated.enemies;
  state.npcs = generated.npcs;
  const restHealing = state.storyFlags.rescuedSurveyor ? 5 : 3;
  state.party.forEach((hero, index) => { hero.x = 2 + (index === 3 ? 1 : 0); hero.y = 6 + index % 3; hero.hp = Math.min(hero.maxHp, hero.hp + restHealing); hero.flags = hero.flags.filter((flag) => flag.startsWith('concept:') || flag.startsWith('trained:')); hero.cooldowns = {}; hero.conditions = []; hero.shield = 0; if (hero.classSheet) hero.resource = hero.classSheet.base.resourceMax; });
  state.mode = 'combat';
  state.storyFlags[`descended:${depth}`] = true;
  state.initiativeOrder = [];
  log(state, `The party reaches ${getTheme(state.themeId).chapterLabel.toLowerCase()} ${depth} and recovers ${restHealing} HP${state.storyFlags.rescuedSurveyor ? ` with ${getTheme(state.themeId).npc}’s guidance` : ''}.`, 'story');
  log(state, `${plan.difficulty.toUpperCase()}: average ${plan.averageLevel}, regular L${plan.regularLevel}, boss L${plan.bossLevel}, ${plan.minimumMonsters} monsters, ×${plan.statMultiplier} stats.`, 'important');
  beginCombat(state);
}

export function findPathDistance(scene: CampaignState['scene'], from: Actor, to: { x: number; y: number }): number {
  const queue = [{ x: from.x, y: from.y, distance: 0 }];
  const seen = new Set([`${from.x},${from.y}`]);
  while (queue.length) {
    const current = queue.shift()!;
    if (current.x === to.x && current.y === to.y) return current.distance;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = current.x + dx, y = current.y + dy, key = `${x},${y}`;
      if (seen.has(key) || !walkable(scene, x, y)) continue;
      seen.add(key); queue.push({ x, y, distance: current.distance + 1 });
    }
  }
  return Infinity;
}
