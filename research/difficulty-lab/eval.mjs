import { readFileSync } from 'node:fs';
import { DEFAULT_RULES, encounterPlan, scaleMonster } from '../../shared/rpg.mjs';
const target = JSON.parse(readFileSync(new URL('./target.json', import.meta.url), 'utf8'));
const rules = { ...structuredClone(DEFAULT_RULES), defenseScaling: target.defenseScaling };
function rng(seed) { let state = seed >>> 0; return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; }; }
const modifier = score => Math.floor((score - 10) / 2);
function match(partySize, level, difficulty, boss, seed) {
  const random = rng(seed), die = sides => Math.floor(random() * sides) + 1;
  const plan = encounterPlan(Array(partySize).fill(level), difficulty, rules, boss);
  const heroes = Array.from({ length: partySize }, (_, i) => ({ id: `hero-${i}`, side: 'hero', hp: 34 + 7 * (level - 1), ac: 14 + Math.floor((level - 1) / 3), attack: 4 + Math.floor((level - 1) / 4), damageSides: 6, damageBonus: level + 1, damageMultiplier: 1, dex: 13 }));
  const enemies = Array.from({ length: plan.minimumMonsters }, (_, i) => {
    const elite = boss && i === 0;
    const base = { level: elite ? 2 : 1, hp: elite ? 48 : 17, maxHp: elite ? 48 : 17, ac: elite ? 15 : 13, stats: { str: elite ? 16 : 12, dex: 12, con: 12, int: 8, wis: 10, cha: 8 }, xp: 25 };
    const actor = scaleMonster(base, plan, elite, rules);
    return { id: `enemy-${i}`, side: 'enemy', hp: actor.hp, ac: actor.ac, attack: modifier(actor.stats.str) + 2 + Math.floor((actor.level - 1) / 4), damageSides: elite ? 10 : 6, damageBonus: modifier(actor.stats.str), damageMultiplier: actor.damageMultiplier, dex: actor.stats.dex };
  });
  const order = [...heroes, ...enemies].map(actor => ({ ...actor, initiative: die(20) + modifier(actor.dex) })).sort((a, b) => b.initiative - a.initiative || a.id.localeCompare(b.id));
  for (let round = 1; round <= 40; round++) for (const actor of order) {
    if (actor.hp <= 0) continue;
    const candidates = order.filter(other => other.side !== actor.side && other.hp > 0).sort((a, b) => a.hp - b.hp || a.id.localeCompare(b.id));
    if (!candidates.length) return { won: actor.side === 'hero', timeout: false, rounds: round };
    const roll = die(20), victim = candidates[0];
    if (roll === 20 || (roll !== 1 && roll + actor.attack >= victim.ac)) victim.hp -= Math.max(1, Math.round((die(actor.damageSides) + actor.damageBonus + (roll === 20 ? die(actor.damageSides) : 0)) * actor.damageMultiplier));
  }
  return { won: false, timeout: true, rounds: 40 };
}
const rows = []; let timeouts = 0, games = 0, extreme = 0, chances = 0, squaredError = 0;
for (const partySize of [1, 2, 3, 4]) for (const level of [1, 5, 10]) for (const boss of [false, true]) for (const difficulty of ['easy', 'normal', 'hard']) {
  let wins = 0, rounds = 0;
  for (let seed = 1; seed <= 120; seed++) { const result = match(partySize, level, difficulty, boss, seed); wins += Number(result.won); timeouts += Number(result.timeout); rounds += result.rounds; games++; }
  const winRate = wins / 120;
  rows.push({ partySize, level, boss, difficulty, winRate, meanRounds: rounds / 120 });
  squaredError += (winRate - ({ easy: .8, normal: .6, hard: .35 })[difficulty]) ** 2;
  const plan = encounterPlan(Array(partySize).fill(level), difficulty, rules, boss);
  const scaled = scaleMonster({ level: 1, hp: 17, maxHp: 17, ac: 13, stats: { str: 12, dex: 12, con: 12, int: 8, wis: 10, cha: 8 }, xp: 25 }, plan, false, rules);
  const hitChance = Math.max(.05, Math.min(.95, (21 + 4 + Math.floor((level - 1) / 4) - scaled.ac) / 20));
  extreme += Number(hitChance < .15 || hitChance > .9); chances++;
}
let monotonicityViolations = 0;
for (let i = 0; i < rows.length; i += 3) if (rows[i].winRate < rows[i + 1].winRate || rows[i + 1].winRate < rows[i + 2].winRate) monotonicityViolations++;
const score = -(100 * squaredError / rows.length + 100 * monotonicityViolations + 10 * extreme / chances + timeouts / games);
console.log(JSON.stringify({ score, target, games, monotonicityViolations, timeoutFraction: timeouts / games, meanWinRates: Object.fromEntries(['easy', 'normal', 'hard'].map(name => [name, rows.filter(row => row.difficulty === name).reduce((sum, row) => sum + row.winRate, 0) / (rows.length / 3)])), rows }));
