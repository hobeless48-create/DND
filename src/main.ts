import Phaser from 'phaser';
import { ABILITIES, ABILITY_DEFS, ARCHETYPES, SKILL_CHECKS, ITEMS, modifier, type ArchetypeName } from './game/content';
import { BoardScene } from './game/BoardScene';
import { abilityCheck, attackBonus, createCampaign, attackTarget, descend, distance, effectiveSpeed, endHeroTurn, equipItem, getActor, interactScout, living, log, moveActor, resolvePendingEnemyTurn, spellSaveDC, useAbility, useItem } from './game/rules';
import { customSkill, loadRules, nextProgression, RULES_KEY } from './game/expansion';
import { openExpandedCreator } from './creator';
import { openProgression } from './progression';
import type { AbilityId, AbilityKey, Actor, CampaignState } from './game/types';
import './ui.css';
import { gameShell } from './ui/shell';
import { getTheme } from '../shared/themes.mjs';
import { applyWorld, selectedWorld, WORLD_KEY } from './world';
import { acceptRecap, automaticHighlight, hydrateStoryMemory, pinStoryHighlight, recapRequest, storyPromptMemory } from '../shared/story-memory.mjs';
import { listCheckpoints, readCheckpoint, saveCheckpoint, type CheckpointHeader } from './checkpoints';

const SAVE_KEY = 'blackstone-campaign-v1';
const app = document.querySelector<HTMLDivElement>('#app')!;
let state: CampaignState | null = null;
let game: Phaser.Game;
let boardScene: BoardScene | null = null;
let modal: 'creator' | 'progression' | 'prologue' | 'choice' | 'defeat' | null = null;
let selectedAbility: AbilityId | null = null;
let aiConfigured = false;
let aiModel = '';
let busy = false;
let lastToast = '';
let recapBusy = false;
let checkpoints: CheckpointHeader[] = [];
let checkpointError = '';
const queuedCheckpoints = new Set<string>();
let reviewedDefeat: CampaignState | null = null;

const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const signed = (value: number): string => value >= 0 ? `+${value}` : String(value);

function shell(): void {
  app.innerHTML = gameShell(selectedWorld());

  document.querySelector('#new-btn')?.addEventListener('click', openCreator);
  document.querySelector('#sidebar-new')?.addEventListener('click', openCreator);
  document.querySelector('#board-new')?.addEventListener('click', openCreator);
  document.querySelector('#progression-btn')?.addEventListener('click', showProgression);
  document.querySelector('#character-progression')?.addEventListener('click', showProgression);
  applyWorld(selectedWorld());
  updateWorldHeading(selectedWorld());
  document.querySelector<HTMLSelectElement>('#world-select')!.addEventListener('change', event => selectWorld((event.target as HTMLSelectElement).value));
  document.querySelectorAll<HTMLButtonElement>('button[data-world]').forEach(button => button.addEventListener('click', () => selectWorld(button.dataset.world!)));
  document.querySelectorAll<HTMLButtonElement>('[data-inspector]').forEach(button => button.addEventListener('click', () => selectInspector(button.dataset.inspector!)));
  document.querySelector<HTMLButtonElement>('#grid-toggle')!.addEventListener('click', event => { const button = event.currentTarget as HTMLButtonElement; const visible = button.getAttribute('aria-pressed') !== 'true'; button.setAttribute('aria-pressed', String(visible)); boardScene?.setGrid(visible); });
  document.querySelector('#expand-board')?.addEventListener('click', () => { const map = document.querySelector<HTMLElement>('.map-wrap'); if (document.fullscreenElement) void document.exitFullscreen(); else if (map?.requestFullscreen) void map.requestFullscreen().catch(() => toast('Fullscreen is not available in this window.')); });
  const difficulty = document.querySelector<HTMLSelectElement>('#difficulty-select')!;
  difficulty.value = loadRules().difficulty;
  difficulty.addEventListener('change', () => { const rules = loadRules(); rules.difficulty = difficulty.value; localStorage.setItem(RULES_KEY, JSON.stringify(rules)); toast(`${difficulty.value.toUpperCase()} rules apply to the next generated battle.`); });
  document.querySelector('#save-btn')?.addEventListener('click', () => saveCampaign());
  document.querySelector('#load-btn')?.addEventListener('click', loadCampaign);
  document.querySelector<HTMLFormElement>('#command-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = document.querySelector<HTMLInputElement>('#command-input');
    const value = input?.value.trim();
    if (!value || !input || !state || busy) return;
    input.value = '';
    void handleCommand(value);
  });
}

function selectInspector(id: string): void {
  document.querySelectorAll<HTMLButtonElement>('[data-inspector]').forEach(button => { const selected = button.dataset.inspector === id; button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected)); });
  document.querySelectorAll<HTMLElement>('[data-inspector-page]').forEach(page => { page.hidden = page.dataset.inspectorPage !== id; });
}
function updateWorldHeading(id: string): void {
  const theme = getTheme(id); applyWorld(id);
  for (const [selector, text] of [['#world-label', theme.label], ['#campaign-heading', theme.campaign], ['#campaign-description', theme.tagline], ['#nav-world-name', theme.campaign], ['#nav-world-tag', theme.tagline]]) document.querySelector(selector)!.textContent = text;
  document.title = `${theme.campaign} · Waypoint`;
}
function selectWorld(id: string): void {
  localStorage.setItem(WORLD_KEY, getTheme(id).id);
  document.querySelector<HTMLSelectElement>('#world-select')!.value = id;
  document.querySelectorAll<HTMLButtonElement>('button[data-world]').forEach(button => { const selected = button.dataset.world === id; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
  if (state) { toast(`${getTheme(id).label} is selected for your next campaign.`); return; }
  updateWorldHeading(id); boardScene?.setPreview(id);
  document.querySelector('#scene-title')!.textContent = getTheme(id).beats[0].title;
  document.querySelector('#narrative')!.innerHTML = `<strong>The opening</strong><p>${esc(getTheme(id).intro)}</p>`;
  document.querySelector('#board-welcome .eyebrow')!.textContent = getTheme(id).label;
}

shell();
game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'board',
  backgroundColor: '#0f1117',
  width: 920,
  height: 560,
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BoardScene],
  render: { antialias: true, roundPixels: true },
});
game.events.once('ready', () => {
  boardScene = game.scene.getScene('board') as BoardScene;
  if (state) drawBoard(); else boardScene.setPreview(selectedWorld());
});
restoreCampaignQuietly();
void refreshCheckpoints();
void checkAIStatus();

async function checkAIStatus(): Promise<void> {
  try {
    const response = await fetch('/api/status');
    const info = await response.json();
    aiConfigured = Boolean(info.configured);
    aiModel = info.model || '';
  } catch { aiConfigured = false; }
  updateAIStatus();
  if (state) renderStoryFacts();
}

function updateAIStatus(): void {
  const status = document.querySelector<HTMLElement>('#ai-status');
  if (!status) return;
  status.classList.toggle('ready', aiConfigured);
  status.textContent = aiConfigured ? 'DeepSeek narrator' : 'Local narrator';
}

function openCreator(): void {
  const world = selectedWorld(); applyWorld(world);
  modal = 'creator';
  openExpandedCreator(document.querySelector<HTMLElement>('#modal-host')!, (party) => {
    state = createCampaign(party, loadRules(), world);
    saveCampaign(true); closeModal(); renderGame(); void introduceScene();
  }, closeModal, world);
}

function showProgression(): void {
  if (!state) { toast('Create a party first.'); return; }
  if (state.mode === 'combat') { toast('Finish the encounter before learning skills or advancing classes.'); return; }
  modal = 'progression';
  openProgression(document.querySelector<HTMLElement>('#modal-host')!, state.party, () => saveCampaign(true), () => { closeModal(); renderGame(); });
}

function closeModal(): void { modal = null; document.querySelector('#modal-host')!.innerHTML = ''; applyWorld(state?.themeId || selectedWorld()); }

function campaignContext(query = ''): string {
  if (!state) return '';
  return JSON.stringify({
    title: getTheme(state.themeId).campaign, theme: getTheme(state.themeId).label, campaignTruth: getTheme(state.themeId).truth, depth: state.scene.depth, location: state.scene.title, objective: state.scene.objective,
    facts: Object.entries(state.storyFlags).filter(([key]) => !key.startsWith('descended:')).map(([key, value]) => ({ fact: storyFactName(key), value })), encounterPlan: state.encounterPlan, currentChapter: Math.min(10, state.scene.depth), unresolvedChoice: state.scene.choicesComplete ? null : getTheme(state.themeId).choiceTitle,
    party: state.party.map((hero) => ({ name: hero.name, role: hero.archetype, level: hero.level, hp: `${hero.hp}/${hero.maxHp}`, background: hero.background, advancedPath: hero.advancedPath, proficiencies: hero.flags.filter((flag) => flag.startsWith('trained:')).map((flag) => flag.slice(8)), concept: hero.flags.find((flag) => flag.startsWith('concept:'))?.slice(8) })),
    storyMemory: storyPromptMemory(state, query), recentResolvedEvents: state.logs.filter(entry => entry.type === 'combat').slice(0, 3).map(entry => entry.text), allowedMonsters: Object.values(getTheme(state.themeId).enemies),
  });
}

async function askDM(mode: 'scene' | 'intent' | 'narrate' | 'summarize', input: string): Promise<Record<string, unknown> | null> {
  if (!aiConfigured) return null;
  const response = await fetch('/api/dm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode, context: mode === 'summarize' ? '' : campaignContext(input), input }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The DM service could not answer.');
  return result.result as Record<string, unknown>;
}

async function introduceScene(): Promise<void> {
  if (!state) return;
  log(state, `${state.scene.title}: ${state.scene.description}`, 'story');
  if (aiConfigured) {
    busy = true; renderGame();
    try {
      const result = await askDM('scene', JSON.stringify({ request: 'Add one sensory detail to this authored scene. Preserve its title, objective, and facts.', title: state.scene.title, description: state.scene.description, objective: state.scene.objective }));
      if (result?.description) state.scene.description = `${state.scene.description} ${String(result.description)}`.slice(0, 1_100);
    } catch (error) { toast(error instanceof Error ? error.message : 'The local narrator will take over.'); }
    busy = false;
  }
  saveCampaign(true);
  modal = 'prologue';
  renderModal();
  renderGame();
}

function renderModal(): void {
  const host = document.querySelector<HTMLElement>('#modal-host')!;
  if (modal === 'creator' || modal === 'progression') return;
  if (!modal || !state) { host.innerHTML = ''; return; }
  const theme = getTheme(state.themeId);
  if (modal === 'prologue') {
    host.innerHTML = `<div class="modal-backdrop"><article class="modal hero" role="dialog" aria-modal="true" aria-labelledby="scene-dialog-title"><div class="modal-head"><div><div class="eyebrow">${esc(theme.label)} · ${esc(theme.chapterLabel)} ${state.scene.depth}</div><h2 id="scene-dialog-title">${esc(state.scene.title)}</h2></div></div><div class="modal-body"><div class="hero-intro"><div class="hero-copy"><h3>${esc(state.scene.depth === 1 ? theme.tagline : 'Another step into the unknown.')}</h3><p>${esc(state.scene.depth === 1 ? theme.intro : state.scene.description)}</p>${state.scene.depth === 1 ? `<p>${esc(state.scene.description)}</p>` : ''}<p><strong>Your objective</strong><br>${esc(state.scene.objective)}</p></div><div class="hero-art ${theme.id}" role="img" aria-label="${esc(theme.label)} entrance"></div></div></div><div class="modal-foot"><small>${state.encounterPlan?.difficulty.toUpperCase()} · ${state.enemies.length} enemies · level ${state.encounterPlan?.regularLevel} regulars${state.scene.depth >= 3 ? ` · level ${state.encounterPlan?.bossLevel} boss` : ''}</small><button class="btn primary" id="enter-dungeon">${theme.id === 'fantasy' ? 'Enter the dungeon →' : theme.id === 'apocalypse' ? 'Enter the sector →' : 'Follow the trail →'}</button></div></article></div>`;
    document.querySelector('#enter-dungeon')?.addEventListener('click', () => { closeModal(); renderGame(); });
  } else if (modal === 'choice') {
    host.innerHTML = `<div class="modal-backdrop"><article class="modal" role="dialog" aria-modal="true" aria-labelledby="choice-dialog-title"><div class="modal-head"><div><div class="eyebrow">A choice that follows you</div><h2 id="choice-dialog-title">${esc(theme.choiceTitle)}</h2></div></div><div class="modal-body hero-copy"><p>${esc(theme.choiceText)}</p><div class="choice-row"><button class="btn" id="rescue-choice"><strong>${esc(theme.rescueLabel)}</strong><small>Gain a ${esc(theme.token)} and a guide. Recover 2 extra HP between encounters.</small></button><button class="btn" id="bell-choice"><strong>${esc(theme.takeLabel)}</strong><small>Receive 40 ${esc(theme.currency)}. The consequences follow you into the next chapter.</small></button></div></div></article></div>`;
    document.querySelector('#rescue-choice')?.addEventListener('click', () => { interactScout(state!, 'rescue'); saveCampaign(true); closeModal(); renderGame(); void narrateAftermath(); });
    document.querySelector('#bell-choice')?.addEventListener('click', () => { interactScout(state!, 'bell'); saveCampaign(true); closeModal(); renderGame(); void narrateAftermath(); });
  } else {
    host.innerHTML = `<div class="modal-backdrop"><article class="modal" role="dialog" aria-modal="true" aria-labelledby="defeat-title"><div class="modal-head"><div><div class="eyebrow">Expedition complete</div><h2 id="defeat-title">Every story leaves a mark.</h2><p>Your crew was overcome. The campaign and its final record are saved on this device.</p></div></div><div class="modal-foot"><button class="btn" id="review-scene-saves">Review saved scenes</button><button class="btn primary" id="new-after-fall">Gather another crew</button></div></article></div>`;
    document.querySelector('#new-after-fall')?.addEventListener('click', openCreator);
    document.querySelector('#review-scene-saves')?.addEventListener('click', () => { reviewedDefeat = state; closeModal(); renderGame(); selectInspector('story'); document.querySelector('#story-panel')?.scrollIntoView({ block: 'start' }); });
  }
}

function renderGame(): void {
  if (!state) return;
  const scene = state.scene;
  const theme = getTheme(state.themeId); updateWorldHeading(theme.id);
  document.querySelector<HTMLElement>('#world-chooser')!.hidden = true;
  document.querySelector<HTMLElement>('#board-welcome')!.hidden = true;
  document.querySelector('#crew-count')!.textContent = `${state.party.length} / 4`;
  document.querySelector('#scene-eyebrow')!.textContent = `${theme.chapterLabel} ${String(scene.depth).padStart(2, '0')} · ${theme.label}`;
  document.querySelector('#scene-title')!.textContent = scene.title;
  document.querySelector('#scene-meta')!.textContent = `${state.encounterPlan?.difficulty.toUpperCase() || 'LEGACY'} · ${state.enemies.length} MONSTERS · PARTY AVG ${state.encounterPlan?.averageLevel ?? '—'} · 5 FT TILES`;
  document.querySelector('#narrative')!.innerHTML = `<strong>The scene</strong><p>${esc(scene.description)} <span style="color:var(--accent)">${esc(scene.objective)}</span></p>`;
  document.querySelector('#board-hint')!.textContent = state.mode === 'combat' ? 'Click a highlighted tile or enemy · movement is in 5 ft steps' : state.mode === 'complete' ? 'Encounter complete · the passage awaits' : 'Choose a story outcome';
  document.querySelector('#turn-meta')!.textContent = state.mode === 'combat' ? `Round ${state.round} · ${getActor(state, state.activeActorId)?.name}` : state.mode === 'choice' ? 'A decision remains' : 'Encounter cleared';
  document.querySelector('#round-label')!.textContent = state.mode === 'combat' ? `ROUND ${state.round}` : state.mode.toUpperCase();
  const current = getActor(state, state.activeActorId);
  const isHeroTurn = state.mode === 'combat' && current?.kind === 'hero';
  const selected = getActor(state, state.selectedActorId) || state.party[0];
  const selectedCanAct = isHeroTurn && selected?.id === current?.id && !busy;
  renderParty();
  renderTurnPanel(current, isHeroTurn);
  renderCharacterSheet(selected, isHeroTurn);
  renderInventory(selected, selectedCanAct);
  renderStoryFacts();
  renderLog();
  document.querySelector<HTMLInputElement>('#command-input')!.disabled = !state || busy || state.mode !== 'combat';
  document.querySelector<HTMLButtonElement>('#command-send')!.disabled = !state || busy || state.mode !== 'combat';
  renderModal();
  if (state.mode === 'choice' && modal !== 'choice') { modal = 'choice'; renderModal(); }
  if (state.storyFlags.partyDefeated && modal !== 'defeat' && reviewedDefeat !== state) { modal = 'defeat'; renderModal(); }
  drawBoard();
  updateAIStatus();
  document.querySelectorAll<HTMLButtonElement>('#new-btn,#sidebar-new,#board-new,#load-btn,#progression-btn').forEach(button => { button.disabled = busy; });
}

function drawBoard(): void {
  if (state && boardScene) boardScene.setState(state, handleBoardClick);
}

function renderParty(): void {
  const host = document.querySelector<HTMLElement>('#party-list')!;
  if (!state) return;
  host.innerHTML = state.party.map((hero) => `<div class="unit-card ${hero.id === state!.selectedActorId ? 'active' : ''}" data-select-hero="${hero.id}"><div class="unit-avatar" style="background:${hero.color}">${esc(hero.name.slice(0,1).toUpperCase())}</div><div class="unit-info"><div class="unit-name">${esc(hero.name)}${hero.id === state!.activeActorId ? ' · turn' : ''}</div><div class="unit-role">${esc(hero.archetype)} · LV ${hero.level} · ${hero.xp} XP</div><div class="hp-track"><div class="hp-fill" style="width:${Math.max(0, hero.hp / hero.maxHp * 100)}%"></div></div><div class="hp-label">${hero.hp}/${hero.maxHp} HP · AC ${effectiveDisplayAC(hero)}</div></div></div>`).join('');
  host.querySelectorAll<HTMLElement>('[data-select-hero]').forEach((element) => element.addEventListener('click', () => { if (!state) return; const actor = getActor(state, element.dataset.selectHero || ''); if (actor) state.selectedActorId = actor.id; renderGame(); }));
}

function effectiveDisplayAC(actor: Actor): number { return actor.ac + (actor.equipment.includes('wooden-shield') ? 1 : 0); }

function abilityPresentation(actor: Actor, id: string) {
  const generated = customSkill(actor, id);
  const builtIn = ABILITY_DEFS[id];
  return generated ? { ...generated, uses: generated.usesPerEncounter, range: generated.targeting.rangeTiles, shape: generated.targeting.shape }
    : { name: builtIn?.name || id, description: builtIn?.description || 'Unknown legacy skill', uses: builtIn?.uses || 0, range: builtIn?.range || 0, shape: 'single', resourceCost: 0, cooldownTurns: 0 };
}

function renderTurnPanel(current: Actor | undefined, isHeroTurn: boolean): void {
  const host = document.querySelector<HTMLElement>('#turn-panel')!;
  if (!state) return;
  if (state.mode === 'complete') {
    const pending = state.party.some(hero => nextProgression(hero));
    const theme = getTheme(state.themeId);
    host.innerHTML = `<div class="empty">The route is clear. ${state.storyFlags.rescuedSurveyor ? theme.rescuedHint : state.storyFlags.tookBell ? theme.takenHint : 'Catch your breath, then decide what comes next.'}</div>${pending ? '<button class="btn primary" id="learn-next">Choose earned skills and classes</button>' : ''}<button class="btn primary" id="descend-btn" ${pending ? 'disabled' : ''} style="width:100%;margin-top:10px">Continue to ${theme.chapterLabel.toLowerCase()} ${state.scene.depth + 1} →</button><button class="btn" id="retreat-btn" style="width:100%;margin-top:7px">Save expedition</button>`;
    document.querySelector('#learn-next')?.addEventListener('click', showProgression);
    document.querySelector('#descend-btn')?.addEventListener('click', () => { if (!state) return; state.rules = loadRules(); descend(state); saveCampaign(true); renderGame(); void introduceScene(); });
    document.querySelector('#retreat-btn')?.addEventListener('click', () => { saveCampaign(); toast('Expedition saved. Return when you’re ready.'); });
    return;
  }
  if (state.mode !== 'combat') { host.innerHTML = '<div class="empty">Resolve the story choice to continue.</div>'; return; }
  const actor = getActor(state, state.selectedActorId) || current;
  const moveLeft = actor ? Math.max(0, effectiveSpeed(actor) + state.movementExtra - state.movementUsed) * 5 : 0;
  const canAct = isHeroTurn && actor?.id === current?.id && !busy;
  host.innerHTML = `<div class="ability"><div class="ability-copy"><strong>${esc(current?.name || 'Preparing turn')}</strong><small>${isHeroTurn ? `${esc(current!.archetype)} · initiative ${current!.initiative}` : 'The enemy is acting automatically.'}</small></div><span class="tag">${isHeroTurn ? `${moveLeft} ft move` : 'Enemy turn'}</span></div>
    <div style="display:flex;gap:6px;margin-top:9px"><button class="btn ${state.actionMode === 'move' ? 'primary' : ''}" id="move-action" ${!canAct || moveLeft <= 0 ? 'disabled' : ''}>Move</button><button class="btn ${state.actionMode === 'attack' ? 'primary' : ''}" id="attack-action" ${!canAct || state.actionUsed ? 'disabled' : ''}>Attack</button><button class="btn" id="end-turn" ${!isHeroTurn || busy ? 'disabled' : ''}>End turn ↷</button></div>
    <div class="abilities" style="margin-top:10px">${actor ? actor.abilities.map((id) => {
      const ability = abilityPresentation(actor, id);
      const used = actor.cooldowns[`uses:${id}`] || 0;
      const cooldown = actor.cooldowns[`cd:${id}`] || 0;
      return `<div class="spell-row"><div><strong>${esc(ability.name)}</strong><small>${esc(ability.description)} · ${Math.max(0, ability.uses - used)} uses · ${ability.range * 5} ft · ${ability.shape}${ability.resourceCost ? ` · ${ability.resourceCost} resource` : ''}${cooldown ? ` · CD ${cooldown}` : ''}</small></div><button class="btn" data-use-ability="${id}" ${!canAct || state!.actionUsed || used >= ability.uses || cooldown > 0 || (actor.resource ?? 0) < ability.resourceCost ? 'disabled' : ''}>Use</button></div>`;
    }).join('') : ''}</div>`;
  document.querySelector('#move-action')?.addEventListener('click', () => { state!.selectedActorId = current!.id; state!.actionMode = state!.actionMode === 'move' ? null : 'move'; renderGame(); });
  document.querySelector('#attack-action')?.addEventListener('click', () => { state!.selectedActorId = current!.id; state!.actionMode = state!.actionMode === 'attack' ? null : 'attack'; renderGame(); });
  document.querySelector('#end-turn')?.addEventListener('click', () => { if (!state) return; state.actionMode = null; endHeroTurn(state); saveCampaign(true); renderGame(); });
  host.querySelectorAll<HTMLButtonElement>('[data-use-ability]').forEach((button) => button.addEventListener('click', () => useAbilityFromButton(button.dataset.useAbility as AbilityId, actor!)));
}

function renderCharacterSheet(actor: Actor | undefined, isHeroTurn: boolean): void {
  const host = document.querySelector<HTMLElement>('#character-sheet')!;
  document.querySelector('#character-label')!.textContent = actor ? `${actor.archetype.toUpperCase()} · LEVEL ${actor.level}` : 'No hero selected';
  if (!actor || actor.kind !== 'hero') { host.innerHTML = '<div class="empty">Select a hero in the expedition roster.</div>'; return; }
  const trainedSkills = actor.flags.filter((flag) => flag.startsWith('trained:')).map((flag) => flag.slice(8));
  const passivePerception = 10 + modifier(actor.stats.wis) + (trainedSkills.includes('Perception') ? 2 : 0);
  host.innerHTML = `<div class="stats-grid">${ABILITIES.map(({ key, label }) => `<div class="stat"><label>${label}</label><strong>${actor.stats[key]} (${modifier(actor.stats[key]) >= 0 ? '+' : ''}${modifier(actor.stats[key])})</strong><small>${abilityUse(key)}</small></div>`).join('')}</div><div class="stats-grid" style="margin-top:7px"><div class="stat"><label>MAX HP</label><strong>${actor.maxHp}</strong><small>CON based</small></div><div class="stat"><label>ARMOR</label><strong>${effectiveDisplayAC(actor)}</strong><small>equipped defense</small></div><div class="stat"><label>SPEED</label><strong>${actor.speed * 5} ft</strong><small>${actor.speed} tiles</small></div><div class="stat"><label>INITIATIVE</label><strong>${signed(modifier(actor.stats.dex))}</strong><small>DEX modifier</small></div><div class="stat"><label>ATTACK</label><strong>${signed(attackBonus(actor))}</strong><small>ability + proficiency</small></div><div class="stat"><label>NOTICE</label><strong>${passivePerception}</strong><small>passive Perception</small></div>${actor.archetype === 'Wizard' || actor.archetype === 'Cleric' ? `<div class="stat"><label>SPELL DC</label><strong>${spellSaveDC(actor)}</strong><small>${actor.archetype === 'Wizard' ? 'INT' : 'WIS'} + proficiency</small></div>` : ''}</div><div style="margin-top:10px" class="tag">${esc(actor.background || 'No background')} · ${esc(actor.weapon)}</div><div class="empty" style="padding-bottom:0"><strong>Trained:</strong> ${trainedSkills.length ? trainedSkills.map(esc).join(' · ') : 'No skill proficiencies'}<br>${esc(actor.flags.find((flag) => flag.startsWith('concept:'))?.slice(8) || ARCHETYPES[actor.archetype as ArchetypeName]?.blurb || 'A member of the expedition.')}</div>`;
  if (actor.classSheet) host.insertAdjacentHTML('beforeend', `<div class="stats-grid" style="margin-top:10px">${Object.entries(actor.customStats || {}).map(([id, value]) => `<div class="stat"><label>${esc(actor.classSheet!.customStats.find(stat => stat.id === id)?.label || id)}</label><strong>${value}</strong><small>custom attribute</small></div>`).join('')}<div class="stat"><label>${esc(actor.classSheet.base.resourceName)}</label><strong>${actor.resource ?? 0}/${actor.classSheet.base.resourceMax}</strong><small>+${actor.classSheet.base.resourceRegen} per turn</small></div><div class="stat"><label>SPELL DC</label><strong>${spellSaveDC(actor)}</strong><small>${esc(actor.primaryStat)} based</small></div><div class="stat"><label>SHIELD</label><strong>${actor.shield || 0}</strong><small>absorbs damage</small></div></div><p class="empty">L${actor.level}/10 · ${actor.abilities.length}/26 learned skills<br>${Object.values(actor.advancedPath || {}).map(id => esc(actor.classSheet!.advancements.find(node => node.id === id)?.name || id)).join(' → ') || 'Base class'}${actor.conditions?.length ? `<br>${actor.conditions.map(condition => esc(condition.id)).join(' · ')}` : ''}</p>`);
}

function abilityUse(key: AbilityKey): string {
  return ({ str: 'Melee & force', dex: 'Aim & reflex', con: 'Health & grit', int: 'Lore & arcana', wis: 'Notice & judge', cha: 'Talk & lead' } as Record<AbilityKey, string>)[key];
}

function renderInventory(actor: Actor | undefined, isHeroTurn: boolean): void {
  const host = document.querySelector<HTMLElement>('#inventory-panel')!;
  const theme = getTheme(state?.themeId);
  document.querySelector('#gold-label')!.textContent = `${state?.gold || 0} ${theme.currency}`;
  if (!state || !actor) { host.innerHTML = '<div class="empty">No supplies yet.</div>'; return; }
  host.innerHTML = `${state.partyInventory.length ? state.partyInventory.map((id, index) => {
    const item = ITEMS[id]; if (!item) return '';
    const equipped = actor.equipment.includes(id);
    return `<div class="spell-row"><div><strong>${esc(theme.items[id] || item.name)}</strong><small>${esc(item.description)}</small></div>${item.kind === 'consumable' ? `<button class="btn" data-use-item="${index}" ${!isHeroTurn || state!.actionUsed || actor.hp >= actor.maxHp ? 'disabled' : ''}>Use</button>` : `<button class="btn" data-equip-item="${index}" ${!isHeroTurn ? 'disabled' : ''}>${equipped ? 'Unequip' : 'Equip'}</button>`}</div>`;
  }).join('') : '<div class="empty">No supplies in the shared pack.</div>'}<div class="ability" style="margin-top:8px"><div class="ability-copy"><strong>Shared supplies</strong><small>${state.gold} ${theme.currency} · ${state.partyInventory.length} items</small></div><span class="tag">${state.scene.depth}</span></div>`;
  host.querySelectorAll<HTMLButtonElement>('[data-use-item]').forEach((button) => button.addEventListener('click', () => { if (!state) return; const itemId = state.partyInventory[Number(button.dataset.useItem)]; if (useItem(state, actor, itemId)) afterStateChange(); }));
  host.querySelectorAll<HTMLButtonElement>('[data-equip-item]').forEach((button) => button.addEventListener('click', () => { if (!state) return; const itemId = state.partyInventory[Number(button.dataset.equipItem)]; equipItem(state, actor, itemId); saveCampaign(true); renderGame(); }));
}

function renderStoryFacts(): void {
  const host = document.querySelector<HTMLElement>('#story-panel')!;
  if (!state) return;
  const facts = Object.entries(state.storyFlags).filter(([, value]) => value === true);
  const memory = hydrateStoryMemory(state);
  host.innerHTML = `<div class="story-memory"><p class="eyebrow">Memory for the narrator</p><p class="empty">Each request sends current facts, a recap, up to eight recent story events and three relevant highlights. Combat rounds do not fill the recap.</p><details open><summary>Story recap <span class="tag">${memory.recapSource === 'ai' ? 'AI RECAP' : 'LOCAL'}</span></summary><p id="story-recap" class="recap-text">${esc(memory.recap || 'The opening is still in recent memory. A local recap forms as the story grows.')}</p></details><p class="empty">${memory.totalEvents} story events recorded. Local recaps use excerpts and cost no API tokens to create. AI recaps are optional and may omit details; game facts always take priority.</p><button class="btn" id="refresh-recap" ${!aiConfigured || recapBusy || busy ? 'disabled' : ''}>${recapBusy ? 'Writing recap...' : 'Improve recap with AI'}</button><p class="empty">${aiConfigured ? 'One extra API request when clicked. No automatic summary calls.' : 'Connect DeepSeek to enable optional AI compression.'}</p><h4>Confirmed choices</h4>${facts.length ? facts.map(([key]) => `<div class="spell-row"><div><strong>${esc(storyFactName(key))}</strong><small>Recorded in this campaign</small></div><span class="tag">FACT</span></div>`).join('') : '<p class="empty">Your choices will appear here.</p>'}<h4>Save a highlight</h4><label class="sr-only" for="highlight-title">Highlight title</label><input id="highlight-title" maxlength="100" placeholder="Name this moment" value="${esc(state.scene.title)}"><button class="btn primary" id="save-highlight" ${busy ? 'disabled' : ''}>Save this moment</button><p class="empty">Entrances, cleared encounters, pending choices and defeat are saved automatically. Restoring a scene returns the entire game to that moment. Later checkpoints remain available.</p><h4>Saved scenes <small>(all expeditions)</small></h4><div id="checkpoint-list"></div></div>`;
  host.querySelector('#save-highlight')?.addEventListener('click', () => { void savePlayerHighlight(); });
  host.querySelector('#refresh-recap')?.addEventListener('click', () => { void improveRecap(); });
  renderCheckpointList();
}

function renderCheckpointList(): void {
  const host = document.querySelector<HTMLElement>('#checkpoint-list');
  if (!host) return;
  host.innerHTML = checkpointError ? `<p class="form-error">${esc(checkpointError)}</p>` : checkpoints.length ? checkpoints.map(checkpoint => `<div class="checkpoint-row"><strong>${esc(checkpoint.title)}</strong><small>${esc(getTheme(checkpoint.themeId).label)} / ${esc(checkpoint.kind)} / ${new Date(checkpoint.createdAt).toLocaleString()}</small><div class="button-row"><button class="btn" data-restore-checkpoint="${esc(checkpoint.id)}" ${busy ? 'disabled' : ''}>Resume scene</button><button class="btn" data-export-checkpoint="${esc(checkpoint.id)}">Export</button></div></div>`).join('') : '<p class="empty">Scene saves will appear here.</p>';
  host.querySelectorAll<HTMLButtonElement>('[data-restore-checkpoint]').forEach(button => button.addEventListener('click', () => { void restoreCheckpoint(button.dataset.restoreCheckpoint!); }));
  host.querySelectorAll<HTMLButtonElement>('[data-export-checkpoint]').forEach(button => button.addEventListener('click', () => { void exportCheckpoint(button.dataset.exportCheckpoint!); }));
}
async function refreshCheckpoints(): Promise<void> {
  try { checkpoints = await listCheckpoints(); checkpointError = ''; } catch (error) { checkpointError = error instanceof Error ? error.message : 'Scene storage is unavailable.'; }
  renderCheckpointList();
}
async function savePlayerHighlight(): Promise<void> {
  if (!state || busy) return;
  const campaign = state, id = crypto.randomUUID(), title = document.querySelector<HTMLInputElement>('#highlight-title')?.value.trim() || state.scene.title;
  pinStoryHighlight(hydrateStoryMemory(campaign), { id, depth: campaign.scene.depth, location: campaign.scene.title, text: `${title}: ${campaign.scene.description}` });
  try { await saveCheckpoint(campaign, title, 'Player highlight', id); saveCampaign(true); await refreshCheckpoints(); toast('Highlight saved with party, map, choices and roll state.'); }
  catch (error) { toast(error instanceof Error ? error.message : 'Highlight could not be saved.'); }
}
async function restoreCheckpoint(id: string): Promise<void> {
  if (busy) return;
  busy = true; renderGame();
  try {
    const loaded = await readCheckpoint(id);
    applyLoadedCampaign(loaded);
    toast('Scene restored. Later saved scenes are still available.');
  } catch (error) { toast(error instanceof Error ? error.message : 'Scene could not be restored.'); }
  finally { busy = false; renderGame(); }
}
async function exportCheckpoint(id: string): Promise<void> {
  try {
    const saved = await readCheckpoint(id), url = URL.createObjectURL(new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `waypoint-scene-${saved.scene.depth}-${saved.rngState}.json`; link.click(); URL.revokeObjectURL(url);
  } catch (error) { toast(error instanceof Error ? error.message : 'Scene could not be exported.'); }
}
async function improveRecap(): Promise<void> {
  if (!state || !aiConfigured || recapBusy || busy) return;
  const campaign = state, source = recapRequest(campaign);
  recapBusy = true; renderStoryFacts();
  try {
    const result = await askDM('summarize', JSON.stringify(source));
    if (state === campaign && acceptRecap(campaign, source.throughEvent, result?.recap)) { saveCampaign(true); toast('AI recap saved. Confirmed game facts remain authoritative.'); }
    else toast('The story changed during compression; the newer memory was kept.');
  } catch (error) { toast(error instanceof Error ? error.message : 'Local recap kept after an API failure.'); }
  finally { recapBusy = false; renderStoryFacts(); }
}

function storyFactName(key: string): string {
  const theme = getTheme(state?.themeId);
  const names: Record<string, string> = { rescuedSurveyor: `${theme.npc} was rescued`, tookBell: `The ${theme.relic} was taken`, maraAlive: `${theme.npc} knows a safer route`, partyDefeated: 'The expedition fell' };
  if (names[key]) return names[key];
  if (key.startsWith('descended:')) return `Descended to depth ${key.split(':')[1]}`;
  return key.replaceAll(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

function renderLog(): void {
  const host = document.querySelector<HTMLElement>('#combat-log')!;
  if (!state) return;
  host.innerHTML = state.logs.map((entry) => `<div class="log-entry ${entry.type === 'story' ? 'important' : entry.type === 'combat' ? 'combat' : ''}">${esc(entry.text)}</div>`).join('');
  document.querySelector('#log-count')!.textContent = `${state.logs.length} entries · ${state.lastRoll ? 'last roll shown above' : 'no roll yet'}`;
  if (state.lastRoll) host.insertAdjacentHTML('afterbegin', `<div class="log-entry important"><span class="dice">DICE · ${esc(state.lastRoll)}</span></div>`);
}

function useAbilityFromButton(id: AbilityId, actor: Actor): void {
  if (!state) return;
  const generated = customSkill(actor, id);
  if (generated && (generated.targeting.team === 'self' || generated.targeting.shape === 'self')) { if (useAbility(state, actor, id, actor)) afterStateChange(); return; }
  if (id === 'dash' || id === 'second-wind' || id === 'mass-healing-word' || id === 'radiant-flare') {
    if (useAbility(state, actor, id)) afterStateChange();
    return;
  }
  selectedAbility = id;
  state.selectedSkillId = id;
  state.selectedActorId = actor.id;
  state.actionMode = 'ability';
  toast(`Choose a ${id === 'fireball' ? 'target tile' : 'target'} on the board.`);
  renderGame();
}

function handleBoardClick(x: number, y: number): void {
  if (!state || state.mode !== 'combat') return;
  const current = getActor(state, state.activeActorId);
  if (!current || current.kind !== 'hero') return;
  const actor = getActor(state, state.selectedActorId) || current;
  if (actor.id !== current.id) { state.selectedActorId = current.id; renderGame(); return; }
  if (state.actionMode === 'move') {
    if (moveActor(state, actor, x, y)) { state.actionMode = null; saveCampaign(true); renderGame(); }
    return;
  }
  const target = [...state.enemies, ...state.party, ...state.npcs].find((unit) => unit.x === x && unit.y === y && living(unit));
  if (state.actionMode === 'attack') {
    if (!target || !attackTarget(state, actor, target)) { toast(`Attack a visible enemy within ${(actor.attackRange || 1) * 5} ft.`); return; }
    afterStateChange(); return;
  }
  if (state.actionMode === 'ability' && selectedAbility) {
    if (customSkill(actor, selectedAbility)) {
      if (!useAbility(state, actor, selectedAbility, target, { x, y })) { toast('Choose an eligible target inside the highlighted area and range.'); return; }
    } else if (selectedAbility === 'fireball') {
      const tileTarget = state.enemies.find((enemy) => Math.max(Math.abs(enemy.x - x), Math.abs(enemy.y - y)) <= 2 && living(enemy));
      if (!tileTarget || !useAbility(state, actor, selectedAbility, tileTarget)) { toast('Choose a target area with at least one nearby enemy.'); return; }
    } else if (!target || !useAbility(state, actor, selectedAbility, target)) { toast('That target is out of range or this ability is unavailable.'); return; }
    selectedAbility = null;
    afterStateChange(); return;
  }
  if (target?.kind === 'hero') state.selectedActorId = target.id;
  renderGame();
}

async function handleCommand(text: string): Promise<void> {
  if (!state || busy) return;
  log(state, `You: “${text}”`, 'story');
  busy = true;
  renderGame();
  try {
    let intent: Record<string, unknown> | null = null;
    const active = getActor(state, state.activeActorId);
    if (aiConfigured) intent = await askDM('intent', JSON.stringify({ playerCommand: text, activeHero: active?.name, currentEnemies: state.enemies.filter(living).map((enemy) => enemy.name), abilities: active?.abilities.map(id => ({ id, name: abilityPresentation(active, id).name })), allowedActions: ['attack', 'cast', 'move', 'talk', 'examine'] }));
    await executeIntent(text, intent);
  } catch (error) {
    log(state, error instanceof Error ? error.message : 'The local DM could not parse that. Use the action buttons or try another command.', 'system');
  } finally {
    busy = false;
    saveCampaign(true);
    renderGame();
  }
}

async function executeIntent(text: string, intent: Record<string, unknown> | null): Promise<void> {
  if (!state) return;
  const active = getActor(state, state.activeActorId);
  if (!active || active.kind !== 'hero') { log(state, 'Wait for a hero’s turn before acting.', 'system'); return; }
  const normalized = text.toLowerCase();
  const namesLearnedSkill = active.abilities.some(id => normalized.includes(abilityPresentation(active, id).name.toLowerCase()));
  const kind = String(intent?.kind || (namesLearnedSkill ? 'cast' : normalized.match(/\b(attack|strike|hit|fight)\b/) ? 'attack' : normalized.match(/\b(cast|spell|fireball|missile|heal|cure)\b/) ? 'cast' : normalized.match(/\b(move|walk|run|go|approach)\b/) ? 'move' : normalized.match(/\b(talk|speak|rescue|free|untie|persuade|convince|intimidate)\b/) ? 'talk' : 'examine'));
  const targetName = String(intent?.targetName || '');
  const namedTarget = [...state.enemies, ...state.npcs, ...state.party].find((actor) => targetName && actor.name.toLowerCase().includes(targetName.toLowerCase()));
  const nearestEnemy = state.enemies.filter(living).sort((a, b) => distance(active, a) - distance(active, b))[0];
  const target = namedTarget || nearestEnemy;
  const selectedAbilityId = active.abilities.find(id => { const ability = abilityPresentation(active, id); return normalized.includes(ability.name.toLowerCase()) || normalized.includes(id.replaceAll('-', ' ')) || (intent?.abilityName && ability.name.toLowerCase() === String(intent.abilityName).toLowerCase()); }) || '';
  if (kind === 'attack') {
    if (target && attackTarget(state, active, target)) return;
    state.actionMode = 'attack';
    log(state, `Choose a nearby target for ${active.name} to attack.`, 'system');
    return;
  }
  if (kind === 'cast') {
    const abilityId = selectedAbilityId || active.abilities[0];
    if (!active.abilities.includes(abilityId)) { log(state, `${active.name} does not know that ability.`, 'system'); return; }
    if (customSkill(active, abilityId)) { useAbilityFromButton(abilityId, active); return; }
    if (['dash', 'second-wind', 'mass-healing-word'].includes(abilityId)) { if (!useAbility(state, active, abilityId)) log(state, 'That ability is unavailable or has no valid target.', 'system'); return; }
    const castTarget = abilityId === 'cure-wounds' && (!target || target.kind !== 'hero')
      ? state.party.filter((hero) => living(hero) && hero.hp < hero.maxHp).sort((a, b) => distance(active, a) - distance(active, b))[0] || active
      : target;
    if (castTarget && useAbility(state, active, abilityId, castTarget)) return;
    selectedAbility = abilityId; state.actionMode = 'ability';
    log(state, `Choose a valid target for ${abilityPresentation(active, abilityId).name}.`, 'system');
    return;
  }
  if (kind === 'move') { state.actionMode = 'move'; log(state, 'Choose a highlighted tile to move. Movement remains limited by speed and walls.', 'system'); return; }
  if (kind === 'talk' && !state.enemies.some(living) && state.scene.depth === 1 && !state.scene.choicesComplete) { state.mode = 'choice'; modal = 'choice'; return; }
  if (kind === 'examine' || kind === 'interact' || kind === 'talk') {
    if (state.mode === 'combat' && !state.actionUsed) {
      const matchedSkill = Object.keys(SKILL_CHECKS).find((skill) => normalized.includes(skill.toLowerCase()));
      const score: AbilityKey = matchedSkill ? SKILL_CHECKS[matchedSkill]
        : normalized.match(/\b(break|force|shove|lift)\b/) ? 'str'
        : normalized.match(/\b(sneak|hide|trap|disarm|pick)\b/) ? 'dex'
        : normalized.match(/\b(endure|resist|hold breath)\b/) ? 'con'
        : normalized.match(/\b(study|rune|identify|device|history)\b/) ? 'int'
        : normalized.match(/\b(persuade|convince|intimidate|lie|deceive|bluff)\b/) ? 'cha' : 'wis';
      abilityCheck(state, active, score, `${matchedSkill || score.toUpperCase()} check`, 12, Boolean(matchedSkill && active.flags.includes(`trained:${matchedSkill}`)));
      return;
    }
    const reply = String(intent?.reply || state.scene.description);
    log(state, reply, 'story');
    return;
  }
  log(state, String(intent?.reply || 'I can help with the scene, but the game needs a legal action. Try moving, attacking, casting an ability, or examining something.'), 'system');
}

async function narrateAftermath(): Promise<void> {
  if (!state || !aiConfigured) return;
  const campaign = state, sceneId = state.scene.id;
  try {
    const result = await askDM('narrate', JSON.stringify({ event: state.logs[0]?.text, storyFlags: state.storyFlags, nextObjective: state.scene.objective }));
    if (result?.text && state === campaign && state.scene.id === sceneId) { log(state, String(result.text), 'story'); saveCampaign(true); renderGame(); }
  } catch { /* Narration falls back to the local story text. */ }
}

function afterStateChange(): void {
  if (!state) return;
  saveCampaign(true);
  renderGame();
}

function saveCampaign(silent = false): void {
  if (!state) { if (!silent) toast('Create an expedition before saving.'); return; }
  try {
    hydrateStoryMemory(state);
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    if (!silent) toast('Campaign saved on this device.');
  } catch { toast('Could not save. Browser storage may be full.'); }
  const automatic = automaticHighlight(state);
  if (!queuedCheckpoints.has(automatic.id)) {
    queuedCheckpoints.add(automatic.id);
    void saveCheckpoint(state, automatic.title, automatic.kind, automatic.id).then(refreshCheckpoints).catch(error => { queuedCheckpoints.delete(automatic.id); checkpointError = error.message; renderCheckpointList(); });
  }
}

function applyLoadedCampaign(loaded: CampaignState): void {
  if (loaded.schemaVersion !== 1 || !loaded.scene || !Array.isArray(loaded.party) || !Array.isArray(loaded.enemies)) throw new Error('Save file version is not supported.');
  state = loaded;
  if (!Array.isArray(state.npcs)) state.npcs = [];
  if (!Array.isArray(state.partyInventory)) state.partyInventory = [];
  if (typeof state.movementExtra !== 'number') state.movementExtra = 0;
  if (typeof state.rngState !== 'number') state.rngState = state.campaignSeed;
  hydrateStoryMemory(state);
  resolvePendingEnemyTurn(state);
  saveCampaign(true); selectedAbility = null; closeModal(); renderGame();
}

function loadCampaign(): void {
  if (busy) return;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) { toast('No saved campaign found on this device.'); return; }
    const loaded = JSON.parse(raw) as CampaignState;
    applyLoadedCampaign(loaded);
    toast('Campaign loaded.');
  } catch (error) { toast(error instanceof Error ? error.message : 'Unable to load that campaign.'); }
}

function restoreCampaignQuietly(): void {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const loaded = JSON.parse(raw) as CampaignState;
    applyLoadedCampaign(loaded);
  } catch { /* Ignore an invalid browser save and leave the new-campaign screen ready. */ }
}

function toast(message: string): void {
  lastToast = message;
  const host = document.querySelector<HTMLElement>('#toast-host');
  if (!host) return;
  host.innerHTML = `<div class="toast">${esc(message)}</div>`;
  window.setTimeout(() => { if (lastToast === message && host.isConnected) host.innerHTML = ''; }, 3600);
}

// All player commands and game data are local first. The optional AI service may flavor a
// scene or parse text, but the rules engine validates and resolves every gameplay effect.
