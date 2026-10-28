import { affectedTiles } from './rpg.mjs';

// Presentation only. Combat and this preview use affectedTiles from the same module.
export function renderSkillCanvas(canvas, skill, origin = { x: 4, y: 6 }, aim = { x: 9, y: 6 }, options = {}) {
  const width = 16, height = 12, cell = 36, ratio = Math.min(2, globalThis.devicePixelRatio || 1);
  canvas.width = width * cell * ratio; canvas.height = height * cell * ratio;
  const context = canvas.getContext('2d');
  if (!context) return [];
  context.scale(ratio, ratio);
  const blocked = options.blocked || new Set(['11,4', '11,5', '11,6', '11,7']);
  const tiles = affectedTiles(skill.targeting, origin, aim, { width, height }, blocked);
  const included = new Set(tiles.map(point => `${point.x},${point.y}`));
  context.fillStyle = '#11151e'; context.fillRect(0, 0, width * cell, height * cell);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const distance = Math.max(Math.abs(origin.x - x), Math.abs(origin.y - y));
    context.fillStyle = blocked.has(`${x},${y}`) ? '#47505d' : included.has(`${x},${y}`) ? skill.visual.color : distance <= skill.targeting.rangeTiles ? '#243d40' : '#1b202c';
    context.globalAlpha = included.has(`${x},${y}`) ? .7 : 1;
    context.fillRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
  }
  context.globalAlpha = 1;
  for (const [point, color, label] of [[origin, '#f5e4b3', 'YOU'], [aim, '#df7e72', 'AIM']]) {
    context.beginPath(); context.arc((point.x + .5) * cell, (point.y + .5) * cell, 11, 0, Math.PI * 2);
    context.fillStyle = color; context.fill(); context.font = '9px monospace'; context.textAlign = 'center'; context.fillText(label, (point.x + .5) * cell, point.y * cell - 3);
  }
  if (options.progress !== undefined) {
    const progress = options.progress;
    const x = (aim.x + .5) * cell, y = (aim.y + .5) * cell;
    context.strokeStyle = skill.visual.color; context.lineWidth = 4; context.globalAlpha = 1 - progress;
    context.beginPath();
    if (skill.visual.style === 'bolt') { context.moveTo((origin.x + .5) * cell, (origin.y + .5) * cell); context.lineTo(x, y); }
    else if (skill.visual.style === 'sweep') context.arc((origin.x + .5) * cell, (origin.y + .5) * cell, (1 + progress * skill.targeting.lengthTiles) * cell, -Math.PI / 3, Math.PI / 3);
    else context.arc(x, y, Math.max(6, progress * Math.max(1, skill.targeting.radiusTiles) * cell), 0, Math.PI * 2);
    context.stroke(); context.globalAlpha = 1;
  }
  return tiles;
}
export function animateSkillCanvas(canvas, skill, origin, aim, options = {}) {
  let frame = 0, stopped = false;
  const start = performance.now();
  const draw = now => {
    if (stopped) return;
    const progress = Math.min(1, (now - start) / skill.visual.durationMs);
    renderSkillCanvas(canvas, skill, origin, aim, { ...options, progress });
    if (progress < 1) frame = requestAnimationFrame(draw);
    else renderSkillCanvas(canvas, skill, origin, aim, options);
  };
  frame = requestAnimationFrame(draw);
  return () => { stopped = true; cancelAnimationFrame(frame); };
}
