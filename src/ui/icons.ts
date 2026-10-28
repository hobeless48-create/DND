const paths: Record<string, string> = {
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z"/>',
  play: '<path d="m9 5 10 7-10 7V5Z"/>',
  workshop: '<path d="m14 6 4-4 4 4-4 4-2-2-9 12-4-4L15 7l-1-1Z"/>',
  journal: '<path d="M5 3h13a1 1 0 0 1 1 1v17H6a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2Zm0 14h14M8 7h7m-7 4h5"/>',
  sliders: '<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  save: '<path d="M4 3h13l3 3v15H4V3Zm3 0v7h9V3M8 21v-7h8v7"/>',
  load: '<path d="M3 8h7l2-3h8v14H3V8Zm7 8 3-3 3 3m-3-3v7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18m6-18v18M3 9h18M3 15h18"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M9 8h5m-4 0v8m0-4h4m-5 4h5"/>',
  leaf: '<path d="M20 3C5 3 3 8 5 15c6 5 15 0 15-12ZM4 21 16 8"/>',
  signal: '<path d="m5 16 2-2m-3-4a11 11 0 0 1 16 0M7 13a7 7 0 0 1 10 0m-7 3a3 3 0 0 1 4 0"/><circle cx="12" cy="20" r="1"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
};
export function icon(name: string): string { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`; }
