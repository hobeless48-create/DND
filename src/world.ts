import { getTheme } from '../shared/themes.mjs';
export const WORLD_KEY = 'blackstone-world-v1';
export function selectedWorld(): string { const id = localStorage.getItem(WORLD_KEY) || 'fantasy'; return getTheme(id).id; }
export function applyWorld(id: string): void { document.documentElement.dataset.world = getTheme(id).id; }
