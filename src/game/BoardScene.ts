import Phaser from 'phaser';
import { generateScene, reachable } from './generator';
import { effectiveSpeed, getActor, living, occupiedTiles, wallTiles } from './rules';
import { customSkill } from './expansion';
import { affectedTiles } from '../../shared/rpg.mjs';
import type { CampaignState } from './types';
import { preloadTerrain, TerrainLayer } from './TerrainLayer';

const COLORS = {
  wall: 0x191b22,
  floor: 0x514941,
  rubble: 0x62594d,
  entrance: 0x655a3e,
  exit: 0x564a36,
  altar: 0x554457,
  cover: 0x383c3d,
  grid: 0x8c7f6e,
  gold: 0xd6ad63,
  move: 0x5fc1a4,
  attack: 0xd36b69,
};

export class BoardScene extends Phaser.Scene {
  private state: CampaignState | null = null;
  private tileHandler: ((x: number, y: number) => void) | null = null;
  private art!: Phaser.GameObjects.Graphics;
  private tokens!: Phaser.GameObjects.Container;
  private boardOffsetX = 0;
  private boardOffsetY = 0;
  private tileSize = 32;
  private aim = { x: 12, y: 7 };
  private terrain!: TerrainLayer;
  private previewTheme = 'fantasy';
  private previewState: CampaignState | null = null;
  private showGrid = true;

  constructor() { super('board'); }
  preload(): void { preloadTerrain(this); }

  create(): void {
    this.terrain = new TerrainLayer(this);
    this.art = this.add.graphics();
    this.tokens = this.add.container(0, 0);
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.state || !this.tileHandler) return;
      document.querySelector<HTMLElement>('#board')?.focus({ preventScroll: true });
      const x = Math.floor((pointer.x - this.boardOffsetX) / this.tileSize);
      const y = Math.floor((pointer.y - this.boardOffsetY) / this.tileSize);
      if (x >= 0 && y >= 0 && x < this.state.scene.width && y < this.state.scene.height) this.tileHandler(x, y);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const x = Math.floor((pointer.x - this.boardOffsetX) / this.tileSize), y = Math.floor((pointer.y - this.boardOffsetY) / this.tileSize);
      if (x !== this.aim.x || y !== this.aim.y) { this.aim = { x, y }; if (this.state?.actionMode === 'ability') this.draw(); }
    });
    this.scale.on('resize', () => this.draw());
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (document.activeElement?.id !== 'board') return;
      const directions: Record<string, number[]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const direction = directions[event.key];
      if (direction) { event.preventDefault(); this.aim.x = Phaser.Math.Clamp(this.aim.x + direction[0], 0, 23); this.aim.y = Phaser.Math.Clamp(this.aim.y + direction[1], 0, 15); this.draw(); }
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.tileHandler?.(this.aim.x, this.aim.y); }
    });
    this.draw();
  }
  setPreview(themeId: string): void { this.previewTheme = themeId; this.previewState = null; this.draw(); }
  setGrid(visible: boolean): void { this.showGrid = visible; this.draw(); }
  private preview(): CampaignState {
    if (!this.previewState) {
      const generated = generateScene(1, 5471);
      this.previewState = { schemaVersion: 1, campaignId: 'preview', campaignSeed: 5471, createdAt: 0, turn: 0, round: 1, rngState: 5471, mode: 'explore', scene: generated.scene, party: [], enemies: [], npcs: [], initiativeOrder: [], activeActorId: '', selectedActorId: '', actionMode: null, movementUsed: 0, movementExtra: 0, actionUsed: false, logs: [], storyFlags: {}, gold: 0, partyInventory: [], lastRoll: '', themeId: this.previewTheme };
    }
    return this.previewState;
  }

  setState(state: CampaignState, tileHandler: (x: number, y: number) => void): void {
    this.state = state;
    this.tileHandler = tileHandler;
    if (this.sys.isActive()) this.draw();
  }

  private draw(): void {
    if (!this.art || !this.terrain) return;
    const state = this.state || this.preview();
    const { scene } = state;
    const view = this.scale;
    this.art.clear();
    this.tokens.removeAll(true);
    this.tileSize = Math.floor(Math.min((view.width - 24) / scene.width, (view.height - 24) / scene.height));
    this.tileSize = Math.max(8, this.tileSize);
    this.boardOffsetX = Math.floor((view.width - this.tileSize * scene.width) / 2);
    this.boardOffsetY = Math.floor((view.height - this.tileSize * scene.height) / 2);
    this.terrain.draw(state, this.tileSize, this.boardOffsetX, this.boardOffsetY);
    const occupied = occupiedTiles(state);
    const active = getActor(state, state.activeActorId);
    const selectable = active?.kind === 'hero' && active.id === state.selectedActorId;
    let reachableSet = new Set<string>();
    if (selectable && state.actionMode === 'move') {
      reachableSet = new Set(reachable(scene, active, occupiedTiles(state, active.id), Math.max(0, effectiveSpeed(active) + state.movementExtra - state.movementUsed)).map((p) => `${p.x},${p.y}`));
    }
    const skill = active && state.selectedSkillId ? customSkill(active, state.selectedSkillId) : undefined;
    const affected = new Set(skill && state.actionMode === 'ability' ? affectedTiles(skill.targeting, active!, this.aim, scene, wallTiles(state)).map(point => `${point.x},${point.y}`) : []);

    for (let y = 0; y < scene.height; y++) for (let x = 0; x < scene.width; x++) {
      const tile = scene.tiles[y][x];
      const px = this.boardOffsetX + x * this.tileSize;
      const py = this.boardOffsetY + y * this.tileSize;
      if (reachableSet.has(`${x},${y}`)) {
        this.art.fillStyle(COLORS.move, .25);
        this.art.fillRect(px + 2, py + 2, this.tileSize - 4, this.tileSize - 4);
        this.art.lineStyle(1, COLORS.move, .8);
        this.art.strokeRect(px + 2.5, py + 2.5, this.tileSize - 5, this.tileSize - 5);
      }
      if (state.actionMode === 'attack' && state.enemies.some((enemy) => living(enemy) && enemy.x === x && enemy.y === y)) {
        this.art.fillStyle(COLORS.attack, .28);
        this.art.fillRect(px + 2, py + 2, this.tileSize - 4, this.tileSize - 4);
      }
      if (affected.has(`${x},${y}`)) {
        this.art.fillStyle(Phaser.Display.Color.HexStringToColor(skill!.visual.color).color, .4);
        this.art.fillRect(px + 2, py + 2, this.tileSize - 4, this.tileSize - 4);
      }
      if (this.showGrid) { this.art.lineStyle(1, 0xffffff, .075); this.art.strokeRect(px, py, this.tileSize, this.tileSize); }
      if (document.activeElement?.id === 'board' && x === this.aim.x && y === this.aim.y) { this.art.lineStyle(2, 0xf5e8bc, 1); this.art.strokeRect(px + 1, py + 1, this.tileSize - 2, this.tileSize - 2); }
    }

    const actors = [...state.npcs, ...state.enemies, ...state.party].filter(living);
    for (const actor of actors) {
      const cx = this.boardOffsetX + (actor.x + .5) * this.tileSize;
      const cy = this.boardOffsetY + (actor.y + .5) * this.tileSize;
      const radius = Math.max(4, this.tileSize * .32);
      const selected = actor.id === state.selectedActorId;
      this.art.fillStyle(0x08090d, .5);
      this.art.fillCircle(cx + 2, cy + 3, radius + 2);
      this.art.fillStyle(Phaser.Display.Color.HexStringToColor(actor.color).color, 1);
      this.art.fillCircle(cx, cy, radius);
      this.art.lineStyle(selected ? 3 : 1.5, selected ? COLORS.gold : 0xe8dfc9, selected ? 1 : .58);
      this.art.strokeCircle(cx, cy, radius);
      const hpWidth = this.tileSize * .74;
      this.art.fillStyle(0x15171d, 1);
      this.art.fillRoundedRect(cx - hpWidth / 2, cy + radius + 2, hpWidth, 4, 2);
      this.art.fillStyle(actor.hp / actor.maxHp < .3 ? 0xd46b67 : 0x70bd91, 1);
      this.art.fillRoundedRect(cx - hpWidth / 2, cy + radius + 2, hpWidth * Math.max(0, actor.hp / actor.maxHp), 4, 2);
      const initial = actor.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
      this.addLabel(initial, cx, cy - 1, '#11151b', Math.max(6, this.tileSize * .22), true);
      const label = actor.name.length > 12 ? `${actor.name.slice(0, 10)}…` : actor.name;
      this.addLabel(label, cx, cy - radius - 8, actor.kind === 'monster' ? '#d7a29a' : actor.kind === 'npc' ? '#c8b7e4' : '#e3d3ad', Math.max(6, this.tileSize * .19), true);
    }
  }

  private addLabel(value: string, x: number, y: number, color: string, size: number, bold = false): void {
    const label = this.add.text(x, y, value, {
      fontFamily: 'Manrope, Arial, sans-serif', fontSize: `${size}px`, color,
      fontStyle: bold ? 'bold' : 'normal', stroke: '#0c0e13', strokeThickness: bold ? 2 : 1,
    }).setOrigin(.5);
    this.tokens.add(label);
  }
}
