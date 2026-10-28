import { createMonster } from './content';
import type { Actor, SceneData, Tile } from './types';
import { DEFAULT_RULES, encounterPlan, scaleMonster } from '../../shared/rpg.mjs';

export function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function carve(tiles: Tile[][], x1: number, y1: number, x2: number, y2: number): void {
  for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) tiles[y][x] = { type: 'floor', seen: true };
}

export function generateScene(depth: number, seed: number, description?: string, title?: string, objective?: string, partySize = 4, plan = encounterPlan(Array(partySize).fill(1), 'normal', DEFAULT_RULES, depth >= 3), rules = DEFAULT_RULES): { scene: SceneData; enemies: Actor[]; npcs: Actor[] } {
  const width = 24;
  const height = 16;
  const random = seeded(seed);
  const tiles: Tile[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => ({ type: 'wall' as const, seen: true })));
  const shift = depth === 1 ? Math.floor(random() * 2) : Math.floor(random() * 3) - 1;
  carve(tiles, 1, 5, 5, 10);
  carve(tiles, 6, 7 + shift, 8, 8 + shift);
  carve(tiles, 8, 4, 11, 11);
  carve(tiles, 11, 7, 13, 8);
  carve(tiles, 13, 4, 17, 11);
  carve(tiles, 17, 7 - shift, 18, 8 - shift);
  carve(tiles, 18, 5, 22, 10);
  tiles[7][2] = { type: 'entrance', seen: true };
  tiles[7][21] = { type: 'exit', seen: true };
  tiles[7][20] = { type: 'altar', seen: true };
  for (const [x, y] of [[9, 5], [10, 10], [15, 5], [16, 10], [19, 6], [19, 9]]) tiles[y][x] = { type: 'cover', seen: true };
  if (depth > 1) {
    const rubbleX = 9 + Math.floor(random() * 2);
    tiles[6][rubbleX] = { type: 'rubble', seen: true };
  }
  const entrance = { x: 2, y: 7 };
  const exit = { x: 21, y: 7 };
  const enemyCount = plan.minimumMonsters;
  const enemySpots = [[14, 6], [16, 9], [18, 6], [20, 8], [15, 10], [21, 9], [19, 5], [14, 9], [17, 6], [22, 6], [21, 10], [13, 5]];
  if (enemyCount > enemySpots.length) throw new Error('Encounter exceeds legal spawn capacity.');
  const enemies: Actor[] = Array.from({ length: enemyCount }, (_, index) => {
    const template = depth >= 3 && index === enemyCount - 1 ? 'bell-warden'
      : index === 0 ? (depth % 2 === 1 ? 'goblin-scout' : 'cave-brute')
      : index % 2 === 1 ? 'cave-brute' : 'goblin-scout';
    const [x, y] = enemySpots[index];
    return scaleMonster(createMonster(template, x, y), plan, template === 'bell-warden', rules) as Actor;
  });
  const npcs: Actor[] = depth === 1
    ? [{
      id: 'npc-mara-venn', kind: 'npc', name: 'Mara Venn', archetype: 'Surveyor', x: 20, y: 7,
      hp: 8, maxHp: 8, ac: 10, speed: 5, stats: { str: 9, dex: 11, con: 10, int: 14, wis: 13, cha: 12 },
      color: '#b8a7db', level: 1, xp: 0, initiative: 0, attack: '1d4', weapon: 'Survey knife', abilities: [], cooldowns: {}, flags: [], gold: 0, inventory: [], equipment: [],
    }]
    : [];
  return {
    scene: {
      id: `blackstone-depth-${depth}`, title: title || (depth === 1 ? 'The Sealed Stair' : `The Lower Galleries · ${depth}`),
      description: description || (depth === 1 ? 'A cracked stair opens into a low chamber. Wet footprints lead inward; beyond the gallery, a bronze note travels through the stone.' : 'The old road winds deeper under the hill. Dust stirs ahead, and something answers the faint bell.'),
      objective: objective || (depth === 1 ? 'Defeat the chamber guards and find the missing surveyor.' : 'Clear the gallery and reach the next descent.'),
      depth, width, height, tiles, seed, entrance, exit, choicesComplete: depth > 1,
    }, enemies, npcs,
  };
}

export function walkable(scene: SceneData, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < scene.width && y < scene.height && scene.tiles[y][x].type !== 'wall';
}

export function reachable(scene: SceneData, actor: Actor, occupied: Set<string>, allowance: number): { x: number; y: number }[] {
  const queue = [{ x: actor.x, y: actor.y, distance: 0 }];
  const visited = new Set([`${actor.x},${actor.y}`]);
  const found: { x: number; y: number }[] = [];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (queue.length) {
    const current = queue.shift()!;
    if (current.distance > 0) found.push({ x: current.x, y: current.y });
    if (current.distance >= allowance) continue;
    for (const [dx, dy] of dirs) {
      const x = current.x + dx;
      const y = current.y + dy;
      const key = `${x},${y}`;
      if (visited.has(key) || occupied.has(key) || !walkable(scene, x, y)) continue;
      if (dx !== 0 && dy !== 0) {
        const blockedX = !walkable(scene, current.x + dx, current.y) || occupied.has(`${current.x + dx},${current.y}`);
        const blockedY = !walkable(scene, current.x, current.y + dy) || occupied.has(`${current.x},${current.y + dy}`);
        if (blockedX && blockedY) continue;
      }
      visited.add(key);
      queue.push({ x, y, distance: current.distance + 1 });
    }
  }
  return found;
}

export function pathDistance(scene: SceneData, start: { x: number; y: number }, goal: { x: number; y: number }, occupied: Set<string>): number {
  const queue = [{ ...start, distance: 0 }];
  const visited = new Set([`${start.x},${start.y}`]);
  while (queue.length) {
    const current = queue.shift()!;
    if (current.x === goal.x && current.y === goal.y) return current.distance;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = current.x + dx, y = current.y + dy, key = `${x},${y}`;
      if (visited.has(key) || (occupied.has(key) && !(x === goal.x && y === goal.y)) || !walkable(scene, x, y)) continue;
      if (dx !== 0 && dy !== 0) {
        const blockedX = !walkable(scene, current.x + dx, current.y) || occupied.has(`${current.x + dx},${current.y}`);
        const blockedY = !walkable(scene, current.x, current.y + dy) || occupied.has(`${current.x},${current.y + dy}`);
        if (blockedX && blockedY) continue;
      }
      visited.add(key);
      queue.push({ x, y, distance: current.distance + 1 });
    }
  }
  return Infinity;
}
