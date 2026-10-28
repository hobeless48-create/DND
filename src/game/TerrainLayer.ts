import Phaser from 'phaser';
import { getTheme } from '../../shared/themes.mjs';
import type { CampaignState } from './types';
export const TERRAIN_KEY = 'waypoint-terrain';
export function preloadTerrain(scene: Phaser.Scene): void { scene.load.image(TERRAIN_KEY, '/assets/terrain-atlas.png'); }
export class TerrainLayer {
  private container: Phaser.GameObjects.Container;
  private key = '';
  constructor(private scene: Phaser.Scene) {
    this.container = scene.add.container(0, 0);
    if (scene.textures.exists(TERRAIN_KEY)) {
      const texture = scene.textures.get(TERRAIN_KEY), source = texture.getSourceImage() as HTMLImageElement;
      for (let frame = 0; frame < 16; frame++) {
        const column = frame % 4, row = Math.floor(frame / 4);
        const x = Math.floor(column * source.width / 4) + 2, y = Math.floor(row * source.height / 4) + 2;
        texture.add(String(frame), 0, x, y, Math.floor((column + 1) * source.width / 4) - x - 2, Math.floor((row + 1) * source.height / 4) - y - 2);
      }
    }
  }
  draw(state: CampaignState, size: number, offsetX: number, offsetY: number): void {
    const key = `${state.themeId || 'fantasy'}:${state.scene.id}:${state.scene.seed}:${size}:${offsetX}:${offsetY}`;
    if (key === this.key) return;
    this.key = key; this.container.removeAll(true);
    if (!this.scene.textures.exists(TERRAIN_KEY)) return;
    const theme = getTheme(state.themeId);
    for (let y = 0; y < state.scene.height; y++) for (let x = 0; x < state.scene.width; x++) {
      const tile = state.scene.tiles[y][x];
      if (tile.type === 'wall' && ![-1, 0, 1].some(dy => [-1, 0, 1].some(dx => state.scene.tiles[y + dy]?.[x + dx] && state.scene.tiles[y + dy][x + dx].type !== 'wall'))) continue;
      const frame = theme.tiles[tile.type];
      const image = this.scene.add.image(offsetX + (x + .5) * size, offsetY + (y + .5) * size, TERRAIN_KEY, String(frame)).setDisplaySize(size, size);
      if (tile.type === 'wall') image.setAlpha(.58);
      else if (tile.type === 'floor') { image.setAlpha(.93); image.setFlipX((x * 7 + y * 3) % 3 === 0); image.setFlipY((x * 3 + y * 5) % 4 === 0); }
      this.container.add(image);
    }
  }
}
