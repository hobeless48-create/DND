import { makeDemoPack } from './rpg.mjs';
export const THEMES = {
  fantasy: {
    id: 'fantasy', label: 'Dark fantasy', kicker: 'Ruins · relics · ancient magic', campaign: 'The Bell Beneath Blackstone', color: '#d9bb7b', icon: '✦', currency: 'GP', chapterLabel: 'Depth',
    tagline: 'Some doors were sealed for a reason.', intro: 'Rain follows your party to the old road shrine. A survey crew has vanished beneath a sealed stair. The waystation offers forty gold for the crew and its brass signal bell. Under your feet, metal rings once against stone.',
    truth: 'The brass bell is a warning and a lock, installed to keep the Hollow Bell Warden asleep beneath the old road.',
    npc: 'Mara Venn', npcRole: 'Missing surveyor', relic: 'brass bell', token: 'Survey Crew Token', backgrounds: { 'Road Guard': 'Road Guard', 'Archive Scholar': 'Archive Scholar', Outlander: 'Outlander', Acolyte: 'Acolyte' },
    choiceTitle: 'The surveyor and the bell', choiceText: 'Mara is bound beside the bell frame. “The bell is a lock,” she whispers. “If you take it, the guardian below will hear you.”',
    rescueLabel: 'Free Mara', takeLabel: 'Take the brass bell', rescueResult: 'You free Mara Venn. She gives you her survey token and marks a safer route into the lower galleries.', takeResult: 'You take the brass bell. It rings in your pack, and something below answers. The waystation pays forty gold.',
    rescuedHint: 'Mara guides the party toward a dry route and the crew’s hidden supplies.', takenHint: 'The bell rings from your pack, warning the guardian below.',
    enemies: { Skirmisher: 'Silt Goblin', Bruiser: 'Blackstone Brute', Elite: 'Hollow Bell Warden' },
    items: { 'healing-potion': 'Healing Draught', 'iron-longsword': 'Iron Longsword', 'wooden-shield': 'Wooden Shield', 'survey-token': 'Survey Crew Token' },
    tiles: { floor: 0, wall: 1, rubble: 2, cover: 3, entrance: 12, exit: 15, altar: 0 },
    beats: [
      { title: 'The Sealed Stair', description: 'Wet footprints cross the flagstones. A surveyor’s chalk arrow points through the central gallery, toward a sound that should not be here.', objective: 'Clear the chamber and find the missing surveyor.' },
      { title: 'The Drowned Relay', description: 'A flooded signal station hangs over a black cistern. Chalk arrows point toward a dry ledge; fresh bootprints circle the relay wheel.', objective: 'Cross the relay chamber and reach the lower gate.' },
      { title: 'The Bell Vault', description: 'A bronze vault lies in the bedrock. The crew’s tools form a neat line before its door. A hollow guardian stirs at the sound of the bell.', objective: 'Defeat the Hollow Bell Warden and uncover the road’s secret.' },
    ],
  },
  apocalypse: {
    id: 'apocalypse', label: 'After the fall', kicker: 'Bunkers · scavengers · broken signals', campaign: 'Last Signal at Ashfall', color: '#ed9a67', icon: '◈', currency: 'credits', chapterLabel: 'Sector',
    tagline: 'The last transmission came from below.', intro: 'The city grid has been dark for nine years. Tonight a distress signal from Relay Nine names a survivor you thought was dead. Your crew reaches a sealed maintenance bunker before the scavenger patrols can strip it clean.',
    truth: 'The relay core is a security key. Removing it wakes the dormant containment drone protecting the lower bunker.',
    npc: 'Dr. Imani Voss', npcRole: 'Trapped field medic', relic: 'relay core', token: 'Medical Access Tag', backgrounds: { 'Road Guard': 'Security Officer', 'Archive Scholar': 'Researcher', Outlander: 'Scavenger', Acolyte: 'Field Medic' },
    choiceTitle: 'The medic and the relay core', choiceText: 'Imani is trapped beside the relay console. “That core keeps the containment drone asleep. Help me out, or take the core and be ready for what wakes.”',
    rescueLabel: 'Rescue Imani', takeLabel: 'Salvage the relay core', rescueResult: 'You free Dr. Imani Voss. She gives the crew a medical access tag and opens a route to hidden emergency supplies.', takeResult: 'You salvage the relay core for forty credits. Red indicators wake along the corridor; a containment system begins to boot.',
    rescuedHint: 'Imani identifies an emergency supply cache and a route around the flooded wiring.', takenHint: 'The missing relay core has woken the containment drone below.',
    enemies: { Skirmisher: 'Ashfall Scavenger', Bruiser: 'Armored Marauder', Elite: 'Containment Drone' },
    items: { 'healing-potion': 'Trauma Kit', 'iron-longsword': 'Reinforced Tool', 'wooden-shield': 'Ballistic Plate', 'survey-token': 'Medical Access Tag' },
    tiles: { floor: 4, wall: 5, rubble: 6, cover: 7, entrance: 13, exit: 13, altar: 4 },
    beats: [
      { title: 'Relay Nine', description: 'Emergency paint marks the cracked service road. A broken medical cart lies near the bunker entrance; the distress signal pulses through a shuttered relay room.', objective: 'Clear the scavenger patrol and locate the field medic.' },
      { title: 'Flooded Concourse', description: 'Black water runs below a collapsed tram platform. Live wires crackle around a service console. The signal grows clearer as you approach the lower bulkhead.', objective: 'Cross the concourse and reach the containment door.' },
      { title: 'Containment Zero', description: 'The relay’s source is a sealed shelter. A security drone unfolds from a charging cradle, its red optics tracking the crew through drifting dust.', objective: 'Disable the containment drone and uncover the last transmission.' },
    ],
  },
  survival: {
    id: 'survival', label: 'Wild frontier', kicker: 'Wilderness · expeditions · forgotten trails', campaign: 'Beyond the Last Camp', color: '#9fc6a1', icon: '△', currency: 'trade tokens', chapterLabel: 'Trail',
    tagline: 'The forest remembers every footprint.', intro: 'The autumn storms have cut the mountain pass. A trail crew searching for a safe winter route has not returned. You leave the last camp with light packs, following fresh tracks into an overgrown ravine.',
    truth: 'The copper trail marker is a ward. Removing it disturbs the ancient guardian protecting the valley’s last spring.',
    npc: 'Ranger Mila Reed', npcRole: 'Missing trail ranger', relic: 'copper trail marker', token: 'Ranger’s Route Map', backgrounds: { 'Road Guard': 'Caravan Guard', 'Archive Scholar': 'Naturalist', Outlander: 'Trail Scout', Acolyte: 'Herbalist' },
    choiceTitle: 'The ranger and the old marker', choiceText: 'Mila is caught beneath a fallen branch near the copper marker. “Free me and I can lead you to supplies. Take that marker, and the valley’s guardian will come looking.”',
    rescueLabel: 'Help Mila', takeLabel: 'Recover the trail marker', rescueResult: 'You free Ranger Mila Reed. She shares the crew’s route map and points out a sheltered supply cache.', takeResult: 'You recover the copper marker for forty trade tokens. The forest falls silent, and something heavy moves beyond the trees.',
    rescuedHint: 'Mila leads the party toward dry ground and a sheltered cache of supplies.', takenHint: 'The valley’s old guardian is following the missing copper ward.',
    enemies: { Skirmisher: 'Feral Prowler', Bruiser: 'Briarback', Elite: 'Ancient Grove Guardian' },
    items: { 'healing-potion': 'Herbal Poultice', 'iron-longsword': 'Trail Hatchet', 'wooden-shield': 'Bark Guard', 'survey-token': 'Ranger’s Route Map' },
    tiles: { floor: 8, wall: 9, rubble: 10, cover: 11, entrance: 14, exit: 14, altar: 8 },
    beats: [
      { title: 'The Overgrown Ravine', description: 'Moss covers the trail stones. A torn ranger’s ribbon hangs from a branch, and fresh tracks lead through a narrow passage in the undergrowth.', objective: 'Drive back the prowlers and locate the missing ranger.' },
      { title: 'Rainwater Crossing', description: 'A swollen stream cuts through a collapsed trail station. Weathered markers lead toward a dry ridge above the valley’s hidden spring.', objective: 'Cross the ravine and reach the sheltered ridge.' },
      { title: 'The Last Spring', description: 'At the foot of an ancient tree, clear water rises through the roots. The valley’s guardian steps from the ferns, watching every movement.', objective: 'Face the grove guardian and discover the crew’s fate.' },
    ],
  },
};
export function getTheme(id = 'fantasy') { return THEMES[id] || THEMES.fantasy; }
export function themeBeat(id, depth) {
  const theme = getTheme(id);
  return theme.beats[depth - 1] || { title: `${theme.label} · ${theme.chapterLabel} ${depth}`, description: theme.beats[1].description, objective: 'Clear a route and continue the expedition.' };
}
export function applyThemeToScene(generated, id, depth, flags = {}) {
  const theme = getTheme(id), beat = themeBeat(id, depth);
  generated.scene.title = beat.title; generated.scene.description = beat.description; generated.scene.objective = beat.objective;
  if (depth === 2 && flags.rescuedSurveyor) generated.scene.description += ` ${theme.rescuedHint}`;
  if (depth >= 3 && flags.tookBell) generated.scene.description += ` ${theme.takenHint}`;
  for (const enemy of generated.enemies) enemy.name = theme.enemies[enemy.archetype] || enemy.name;
  for (const npc of generated.npcs) { npc.name = theme.npc; npc.archetype = theme.npcRole; }
  return generated;
}
export function makeThemePack(id = 'fantasy') {
  const pack = makeDemoPack();
  if (id === 'fantasy') return pack;
  const apocalypse = id === 'apocalypse';
  pack.id = apocalypse ? 'ashfall-vault-runner' : 'frontier-trailkeeper'; pack.name = apocalypse ? 'Vault Runner' : 'Trailkeeper';
  pack.concept = apocalypse ? 'A resourceful bunker explorer who mixes salvage engineering, field medicine and precise improvised weapons. Offline example.' : 'An expedition guide who uses fieldcraft, herbal medicine, careful traps and knowledge of the wild. Offline example.';
  pack.base.weapon = apocalypse ? 'Salvaged bolt launcher' : 'Trail sling'; pack.base.resourceName = apocalypse ? 'Charge' : 'Focus'; pack.customStats[0].label = apocalypse ? 'Scavenging' : 'Fieldcraft';
  const names = apocalypse ? ['Salvage Shot', 'Field Dressing', 'Ballistic Brace', 'Combat Slide', 'Wire Snare'] : ['Sling Stone', 'Herbal Remedy', 'Bark Ward', 'Trailstep', 'Vine Snare'];
  for (const pool of pack.levels) pool.skills.forEach((skill, index) => { skill.id = `${pack.id}-l${pool.level}-${index + 1}`; skill.name = `${names[index]} ${pool.level}`; skill.description = `${names[index]}: a level ${pool.level} expedition technique.`; skill.visual.color = getTheme(id).color; });
  const rootNames = apocalypse ? ['Shield Operator', 'Scrap Scout', 'Signal Medic'] : ['Trail Warden', 'Wildstalker', 'Field Naturalist'];
  const leafNames = apocalypse ? ['Bulwark', 'Riotbreaker', 'Vanguard', 'Deadeye', 'Saboteur', 'Ghostwalker', 'Responder', 'Technician', 'Disruptor'] : ['Stoneguard', 'Rootkeeper', 'Pathwarden', 'Tracker', 'Windrunner', 'Trapper', 'Herbalist', 'Raincaller', 'Beastreader'];
  const idMap = new Map(pack.advancements.map(node => [node.id, `${pack.id}-${node.id.replace('clock-', '')}`]));
  let root = 0, leaf = 0; const nodeNames = new Map();
  for (const node of pack.advancements) {
    if (node.level === 3) node.name = rootNames[root++];
    if (node.level === 5) node.name = leafNames[leaf++];
    if (node.level === 8) node.name = `Master ${nodeNames.get(node.parentId) || 'Path'}`;
    nodeNames.set(node.id, node.name);
    node.description = `${node.name} specializes in ${node.specialistStat.toUpperCase()}.`;
    const newId = idMap.get(node.id); node.parentId = node.parentId ? idMap.get(node.parentId) : null; node.id = newId;
    node.skills.forEach((skill, index) => { skill.id = `${newId}-${index + 1}`; skill.name = `${node.name} ${index ? 'Ward' : 'Signature'}`; skill.description = `${skill.name}: a unique level ${node.level} technique.`; skill.visual.color = getTheme(id).color; });
  }
  return pack;
}
