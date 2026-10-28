import { advanceClass, learnChoices, nextProgression } from './game/expansion';
import type { Actor } from './game/types';
const esc = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export function openProgression(host: HTMLElement, party: Actor[], onChanged: () => void, onClose: () => void): void {
  function render(): void {
    const hero = party.find(candidate => nextProgression(candidate));
    const pending = hero && nextProgression(hero);
    host.innerHTML = `<div class="modal-backdrop"><section class="modal hero" role="dialog" aria-modal="true" aria-labelledby="progression-title"><div class="modal-head"><div><div class="eyebrow">Character progression</div><h2 id="progression-title">${hero && pending ? `${esc(hero.name)} · level ${pending.level}` : 'Your party is ready'}</h2><p>${pending?.kind === 'skills' ? 'Choose two of the five skills in this level’s pool.' : pending ? 'Choose your advanced class. Both unique skills are granted with its specialist stat bonus.' : 'All earned skill and class choices are saved.'}</p></div><button class="btn" id="close-progression">Close</button></div><div class="modal-body">
      ${pending?.kind === 'skills' ? `<div class="skill-choices">${pending.options.map(skill => `<label class="skill-choice"><input type="checkbox" data-learn="${skill.id}"><span><strong>${esc(skill.name)}</strong><small>${esc(skill.description)} · ${skill.targeting.shape} · ${skill.targeting.rangeTiles * 5} ft range · ${skill.resourceCost} resource</small></span></label>`).join('')}</div><button class="btn primary" id="confirm-skills">Learn two skills</button>` : pending ? `<div class="skill-choices">${pending.options.map(node => `<button class="skill-choice" data-advance="${node.id}"><span><strong>${esc(node.name)}</strong><small>${esc(node.description)} · +${node.statBonusPercent}% ${esc(node.specialistStat)}<br>${node.skills.map((skill: any) => esc(skill.name)).join(' + ')}</small></span></button>`).join('')}</div>` : party.map(actor => `<p>${esc(actor.name)}: L${actor.level}/10 · ${actor.abilities.length} learned skills · ${Object.values(actor.advancedPath || {}).map(esc).join(' → ') || 'Base class'}</p>`).join('')}
      <p id="progression-error" class="form-error" role="alert"></p></div></section></div>`;
    host.querySelector('#close-progression')!.addEventListener('click', onClose);
    host.querySelector('#confirm-skills')?.addEventListener('click', () => { try { learnChoices(hero!, Array.from(host.querySelectorAll<HTMLInputElement>('[data-learn]:checked')).map(input => input.dataset.learn!)); onChanged(); render(); } catch (error) { host.querySelector('#progression-error')!.textContent = (error as Error).message; } });
    host.querySelectorAll<HTMLElement>('[data-advance]').forEach(button => button.addEventListener('click', () => { try { advanceClass(hero!, button.dataset.advance!); onChanged(); render(); } catch (error) { host.querySelector('#progression-error')!.textContent = (error as Error).message; } }));
  }
  render();
}
