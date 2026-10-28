import { BACKGROUNDS, BACKGROUND_TRAINING, createHero, modifier } from './game/content';
import { loadPacks, type ClassPack } from './game/expansion';
import type { Actor, AbilityKey } from './game/types';
import { classBudgetReport } from '../shared/balance.mjs';
import { validateContent } from '../shared/rpg.mjs';
import { getTheme } from '../shared/themes.mjs';
const esc = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export function openExpandedCreator(host: HTMLElement, onStart: (party: Actor[]) => void, onClose: () => void, themeId = 'fantasy'): void {
  const packs = loadPacks(themeId), theme = getTheme(themeId);
  let selected = packs[0];
  const party: Actor[] = [];
  function render(): void {
    const pack: ClassPack = selected;
    const pool = pack.levels.find(level => level.level === 1)!;
    host.innerHTML = `<div class="modal-backdrop"><section class="modal hero creator-modal" role="dialog" aria-modal="true" aria-labelledby="creator-title"><div class="modal-head"><div><div class="eyebrow">${esc(theme.label)} · assemble your crew</div><h2 id="creator-title">Every story starts with someone.</h2><p>Choose a class, shape your character, and select two techniques for the road ahead.</p></div><button class="btn icon-button" id="close-creator" aria-label="Close character creator">×</button></div><div class="modal-body">
      <div class="field"><label for="class-pack">Class sheet</label><select id="class-pack">${packs.map(candidate => `<option value="${candidate.id}" ${candidate.id === pack.id ? 'selected' : ''}>${esc(candidate.name)}</option>`).join('')}</select><small>${esc(pack.concept)}</small><a href="/workshop.html" target="_blank" rel="noopener">Describe and generate a new class in the Workshop</a></div>
      <div class="creator-fields"><div class="field"><label for="hero-name">Character name</label><input id="hero-name" maxlength="28" value="${party.length ? '' : themeId === 'apocalypse' ? 'Alex Ash' : themeId === 'survival' ? 'Rowan Moss' : 'Ari Clockwell'}"></div><div class="field"><label for="hero-background">Background</label><select id="hero-background">${BACKGROUNDS.map(background => `<option value="${background}">${theme.backgrounds[background] || background}</option>`).join('')}</select></div><div class="field"><label for="hero-concept">Personal story</label><textarea id="hero-concept" rows="2" maxlength="180" placeholder="A promise, a missing friend, a reason to keep going…"></textarea></div><div class="field"><label for="hero-color">Token color</label><input type="color" id="hero-color" value="${theme.color}"></div></div>
      <div class="score-editor">${Object.entries(pack.stats).map(([stat, value]) => `<div class="field"><label for="score-${stat}">${stat.toUpperCase()}</label><input id="score-${stat}" type="number" data-score="${stat}" value="${value}" min="6" max="20"></div>`).join('')}${pack.customStats.map(stat => `<div class="field"><label for="custom-${stat.id}">${esc(stat.label)}</label><input id="custom-${stat.id}" type="number" data-custom="${stat.id}" value="${stat.base}" min="1" max="20"></div>`).join('')}</div><p class="empty" id="creator-derived"></p>
      <div id="creator-budget" class="budget-panel"></div><h3>Choose your first two skills <span class="muted">Level 01</span></h3><div class="skill-choices">${pool.skills.map(skill => `<label class="skill-choice"><input type="checkbox" data-start-skill="${skill.id}"><span><strong>${esc(skill.name)}</strong><small>${esc(skill.description)} · ${skill.targeting.shape} · ${skill.targeting.rangeTiles * 5} ft range · ${skill.resourceCost} ${esc(pack.base.resourceName)}</small></span></label>`).join('')}</div>
      <h3>Expedition · ${party.length}/4</h3><div class="party-grid">${party.map(hero => `<div class="unit-card"><div class="unit-info"><strong>${esc(hero.name)}</strong><small>${esc(hero.archetype)} · ${hero.maxHp} HP · 2 starting skills</small></div><button class="btn" data-remove="${hero.id}">Remove</button></div>`).join('') || '<p class="empty">Add a hero to begin.</p>'}</div>
      </div><div class="modal-foot"><small>10 levels · 50 regular options · nine final class paths · 26 skills learned by level 10.</small><div><button class="btn" id="add-expanded-hero" ${party.length >= 4 ? 'disabled' : ''}>Add hero</button> <button class="btn primary" id="start-expanded" ${!party.length ? 'disabled' : ''}>Begin expedition</button></div></div><p id="creator-error" role="alert" class="form-error"></p></section></div>`;
    host.querySelector('#close-creator')!.addEventListener('click', onClose);
    host.querySelector<HTMLSelectElement>('#class-pack')!.addEventListener('change', event => { selected = packs.find(candidate => candidate.id === (event.target as HTMLSelectElement).value)!; render(); });
    const candidateSheet = () => {
      const candidate = structuredClone(pack);
      candidate.stats = Object.fromEntries(Array.from(host.querySelectorAll<HTMLInputElement>('[data-score]')).map(input => [input.dataset.score!, Number(input.value)])) as Record<AbilityKey, number>;
      candidate.customStats = candidate.customStats.map(stat => ({ ...stat, base: Number(host.querySelector<HTMLInputElement>(`[data-custom="${stat.id}"]`)!.value) }));
      candidate.base.hp += modifier(candidate.stats.con) - modifier(pack.stats.con);
      candidate.base.ac += modifier(candidate.stats.dex) - modifier(pack.stats.dex);
      return candidate;
    };
    const preview = () => {
      const dex = Number(host.querySelector<HTMLInputElement>('[data-score="dex"]')!.value);
      const con = Number(host.querySelector<HTMLInputElement>('[data-score="con"]')!.value);
      host.querySelector('#creator-derived')!.textContent = `${pack.base.hp + modifier(con) - modifier(pack.stats.con)} HP · AC ${pack.base.ac + modifier(dex) - modifier(pack.stats.dex)} · ${pack.base.speed * 5} ft · ${pack.primaryStat.toUpperCase()} attacks · ${pack.base.resourceMax} ${pack.base.resourceName}`;
      const report = classBudgetReport(candidateSheet());
      host.querySelector('#creator-budget')!.innerHTML = `<div class="budget-heading"><strong>Shared power budget</strong><span class="${report.errors.length ? 'over-budget' : ''}">${report.score.toFixed(1)} / 100</span></div><div class="budget-track"><i style="width:${Math.max(0, Math.min(100, report.score))}%"></i><b></b></div><small>${report.attributePoints} / 32 attribute points · ${report.errors.length ? esc(report.errors.join(' ')) : 'Within the common class ceiling. Specialize through tradeoffs.'}</small>`;
    };
    host.querySelectorAll<HTMLInputElement>('[data-score],[data-custom]').forEach(input => input.addEventListener('input', preview)); preview();
    host.querySelectorAll<HTMLElement>('[data-remove]').forEach(button => button.addEventListener('click', () => { party.splice(party.findIndex(hero => hero.id === button.dataset.remove), 1); render(); }));
    host.querySelector('#start-expanded')!.addEventListener('click', () => { if (party.length) onStart(party); });
    host.querySelector('#add-expanded-hero')!.addEventListener('click', () => {
      try {
        const ids = Array.from(host.querySelectorAll<HTMLInputElement>('[data-start-skill]:checked')).map(input => input.dataset.startSkill!);
        if (ids.length !== 2) throw new Error('Choose exactly two level-one skills.');
        const stats = Object.fromEntries(Array.from(host.querySelectorAll<HTMLInputElement>('[data-score]')).map(input => [input.dataset.score!, Number(input.value)])) as Record<AbilityKey, number>;
        const customStats = Object.fromEntries(Array.from(host.querySelectorAll<HTMLInputElement>('[data-custom]')).map(input => [input.dataset.custom!, Number(input.value)]));
        if (Object.values(stats).some(value => !Number.isInteger(value) || value < 6 || value > 20) || Object.values(customStats).some(value => !Number.isFinite(value) || value < 1 || value > 20)) throw new Error('Core stats must be whole numbers from 6–20; custom stats must be 1–20.');
        const sheet = candidateSheet(), errors = validateContent('class', sheet);
        if (errors.length) throw new Error(errors.slice(0, 4).join(' '));
        const name = host.querySelector<HTMLInputElement>('#hero-name')!.value.trim() || pack.name;
        const background = host.querySelector<HTMLSelectElement>('#hero-background')!.value;
        const hero = createHero(name, 'Fighter', background, host.querySelector<HTMLInputElement>('#hero-color')!.value);
        Object.assign(hero, { archetype: pack.name, stats, customStats, classSheet: sheet, primaryStat: pack.primaryStat, learnedPools: [1], advancedPath: {}, abilities: ids,
          maxHp: pack.base.hp + modifier(stats.con) - modifier(pack.stats.con), ac: pack.base.ac + modifier(stats.dex) - modifier(pack.stats.dex), speed: pack.base.speed,
          attack: pack.base.attackDice, attackRange: pack.base.rangeTiles, weapon: pack.base.weapon, resource: pack.base.resourceMax, shield: 0, conditions: [] });
        hero.background = theme.backgrounds[background] || background;
        hero.hp = hero.maxHp;
        hero.flags = [`concept:${host.querySelector<HTMLTextAreaElement>('#hero-concept')!.value.trim()}`, ...BACKGROUND_TRAINING[background].skills.map(skill => `trained:${skill}`)];
        party.push(hero); render();
      } catch (error) { host.querySelector('#creator-error')!.textContent = (error as Error).message; }
    });
  }
  render();
  host.querySelector<HTMLInputElement>('#hero-name')?.focus();
}
