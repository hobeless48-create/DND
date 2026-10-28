async (page) => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  await page.goto('http://127.0.0.1:5173/workshop.html');
  await page.evaluate(() => localStorage.setItem('blackstone-world-v1', 'fantasy'));
  assert(await page.locator('#difficulty-preview article').count() === 3, 'Three difficulty previews must render.');
  await page.locator('#default-difficulty').selectOption('hard');
  await page.getByRole('button', { name: 'Save rules for next battle' }).click();
  assert((await page.locator('#notice').textContent()).includes('Rules saved'), 'Rules were not saved.');
  await page.getByRole('button', { name: 'Classes & progression', exact: true }).click();
  assert((await page.locator('h3').first().textContent()).includes('92/92'), 'Full class catalog was not rendered.');
  assert(await page.locator('tbody tr').count() === 9, 'There must be nine final paths.');
  await page.getByRole('button', { name: 'Validate & publish class' }).click();
  assert((await page.locator('#notice').textContent()).includes('published'), 'Class did not publish.');
  await page.locator('.level-pools summary').first().click();
  await page.locator('[data-preview-skill]').first().click();
  await page.locator('#shape-template').selectOption('circle');
  await page.waitForFunction(() => JSON.parse(document.querySelector('#skill-json').value).targeting.shape === 'circle');
  await page.locator('[data-targeting="radiusTiles"]').fill('3');
  assert((await page.locator('#affected-count').textContent()).includes('15 ft'), 'Radius preview did not update.');
  await page.getByRole('button', { name: 'Play effect' }).click();
  await page.getByRole('button', { name: 'Items, monsters & story', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#template-json')?.value.includes('signal-sentry'));
  await page.getByRole('button', { name: 'Validate & save authoring record' }).click();
  assert((await page.locator('#notice').textContent()).includes('record saved'), 'Monster template did not validate/save.');
  await page.goto('http://127.0.0.1:5173/');
  await page.getByRole('button', { name: 'New campaign', exact: true }).click();
  await page.locator('#hero-name').fill('Integration Hero');
  await page.locator('[data-start-skill]').nth(0).check();
  await page.locator('[data-start-skill]').nth(2).check();
  await page.getByRole('button', { name: 'Add hero', exact: true }).click();
  await page.getByRole('button', { name: 'Begin expedition', exact: true }).click();
  await page.getByRole('button', { name: 'Enter the dungeon →', exact: true }).click();
  const initial = await page.evaluate(() => JSON.parse(localStorage.getItem('blackstone-campaign-v1')));
  assert(initial.party[0].abilities.length === 2, 'Level one must learn exactly two skills.');
  assert(initial.enemies.length === 3 && initial.encounterPlan.difficulty === 'hard', 'Hard solo battle must contain three monsters.');
  assert(initial.activeActorId === initial.party[0].id, 'Initial monster turns must resolve before hero input.');
  const shieldButton = page.locator('.spell-row').filter({ hasText: 'Gear Ward 1' }).getByRole('button', { name: 'Use', exact: true });
  await shieldButton.click();
  const cast = await page.evaluate(() => JSON.parse(localStorage.getItem('blackstone-campaign-v1')));
  assert(cast.party[0].shield > 0 && cast.actionUsed && cast.party[0].resource === 18, 'Custom shielding must spend one action and its resource cost.');
  await page.reload();
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('blackstone-campaign-v1')));
  assert(restored.party[0].shield === cast.party[0].shield && restored.party[0].abilities.length === 2, 'Custom class save/resume must preserve its state.');
  const engine = await page.evaluate(async () => {
    const { makeDemoPack, DEFAULT_RULES, encounterPlan } = await import('/shared/rpg.mjs');
    const { createHero } = await import('/src/game/content.ts');
    const { nextProgression, learnChoices, advanceClass, awardProgression } = await import('/src/game/expansion.ts');
    const { generateScene } = await import('/src/game/generator.ts');
    const { createCampaign, useAbility, endHeroTurn, runMonsterTurn } = await import('/src/game/rules.ts');
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const create = () => Object.assign(createHero('Fixture', 'Fighter', 'Road Guard'), { classSheet: makeDemoPack(), archetype: 'Clockwork Warden', primaryStat: 'int', resource: 20, customStats: { precision: 12 }, abilities: [], learnedPools: [], advancedPath: {} });
    let paths = 0;
    for (const terminal of makeDemoPack().advancements.filter(node => node.level === 8)) {
      const actor = create();
      const leaf = actor.classSheet.advancements.find(node => node.id === terminal.parentId);
      for (let level = 1; level <= 10; level++) {
        actor.level = level;
        const pool = nextProgression(actor); check(pool?.kind === 'skills' && pool.options.length === 5, 'Missing five-skill pool.');
        learnChoices(actor, pool.options.slice(0, 2).map(skill => skill.id));
        const branch = nextProgression(actor);
        if (branch?.kind === 'class') advanceClass(actor, level === 3 ? leaf.parentId : level === 5 ? leaf.id : terminal.id);
      }
      check(actor.abilities.length === 26 && actor.learnedPools.length === 10 && Object.keys(actor.advancedPath).length === 3, 'Every final path must learn 26 skills.');
      check(nextProgression(actor) === null, 'Level-10 choices must finish.');
      awardProgression(actor, 1_000_000); check(actor.level === 10, 'Player exceeded level 10.');
      paths++;
    }
    let encounters = 0;
    for (const level of [1, 5, 10]) for (let size = 1; size <= 4; size++) for (const difficulty of ['easy', 'normal', 'hard']) for (const depth of [1, 3]) {
      const plan = encounterPlan(Array(size).fill(level), difficulty, DEFAULT_RULES, depth >= 3);
      const generated = generateScene(depth, 123456, undefined, undefined, undefined, size, plan, DEFAULT_RULES);
      check(generated.enemies.length === plan.minimumMonsters, 'Encounter underfilled.');
      const occupied = new Set();
      for (const actor of [...generated.enemies, ...generated.npcs]) {
        check(generated.scene.tiles[actor.y][actor.x].type !== 'wall', 'Actor spawned in a wall.');
        const key = `${actor.x},${actor.y}`; check(!occupied.has(key), 'Actors overlap at spawn.'); occupied.add(key);
        if (actor.kind === 'monster') check(actor.level === (actor.encounterRole === 'boss' ? plan.bossLevel : plan.regularLevel), 'Monster level differs from plan.');
      }
      encounters++;
    }
    const hero = create(); hero.learnedPools = [1]; hero.abilities = hero.classSheet.levels[0].skills.slice(0, 2).map(skill => skill.id);
    hero.classSheet.levels[0].skills[0].resolution = 'automatic';
    const state = createCampaign([hero], { ...structuredClone(DEFAULT_RULES), difficulty: 'easy' });
    const enemy = state.enemies[0]; hero.x = 2; hero.y = 6; hero.hp = hero.maxHp;
    enemy.x = 3; enemy.y = 6; enemy.hp = enemy.maxHp = 100; enemy.abilities = [];
    state.activeActorId = hero.id; state.initiativeOrder = [hero.id, enemy.id]; state.actionUsed = false;
    const skillId = hero.abilities[0], initialResource = hero.resource;
    check(!useAbility(state, hero, skillId, undefined, { x: 23, y: 0 }), 'Out-of-range cast should fail.');
    check(hero.resource === initialResource && !state.actionUsed, 'Illegal cast consumed a resource.');
    check(useAbility(state, hero, skillId, enemy), 'Legal custom attack failed.');
    check(enemy.hp < 100 && hero.resource === initialResource - 2 && state.actionUsed, 'Custom damage did not resolve costs and HP.');
    check(!useAbility(state, hero, skillId, enemy), 'Two actions occurred in one turn.');
    endHeroTurn(state); check(!useAbility(state, hero, skillId, enemy), 'Cooldown did not block the next actor turn.');
    endHeroTurn(state); check(useAbility(state, hero, skillId, enemy), 'Cooldown did not expire.');
    enemy.x = 5; enemy.y = 6; enemy.turnProfile = 'move-or-act'; const beforeHp = hero.hp;
    runMonsterTurn(state, enemy); check(hero.hp === beforeHp, 'Move-or-act monster moved and attacked.');
    return { paths, encounters, learnedAtCap: 26, customEffectsAndCooldowns: 'passed' };
  });
  return { workshop: 'rules, class publication, templates and Canvas passed', creator: 'two starting choices, custom shielding, hard roster and persistence passed', engine };
}
