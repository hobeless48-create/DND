async (page) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const worlds = [];
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [id, className, itemName] of [['apocalypse', 'Vault Runner', 'Trauma Kit'], ['survival', 'Trailkeeper', 'Herbal Poultice'], ['fantasy', 'Clockwork Warden', 'Healing Draught']]) {
    await page.goto('http://127.0.0.1:5173/');
    await page.locator('#world-select').selectOption(id);
    await page.getByRole('button', { name: 'New campaign', exact: true }).click();
    assert((await page.locator('#class-pack option').first().textContent()) === className, `Wrong starting class for ${id}.`);
    assert((await page.locator('#creator-budget').textContent()).includes('/ 100'), 'Creator has no live power ceiling.');
    await page.locator('#hero-name').fill(`${id} Tester`);
    await page.locator('[data-start-skill]').nth(0).check(); await page.locator('[data-start-skill]').nth(2).check();
    await page.getByRole('button', { name: 'Add hero', exact: true }).click();
    await page.getByRole('button', { name: 'Begin expedition', exact: true }).click();
    await page.locator('#enter-dungeon').click();
    assert(await page.locator('#board canvas').count() === 1, 'Terrain canvas did not render.');
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('blackstone-campaign-v1')));
    assert(state.themeId === id && state.party[0].archetype === className, 'World identity was not saved.');
    assert(!['survival', 'apocalypse'].includes(id) || state.enemies.every(enemy => !['Silt Goblin', 'Blackstone Brute'].includes(enemy.name)), 'Fantasy enemies leaked into another world.');
    await page.locator('[data-inspector="inventory"]').click();
    assert((await page.locator('#inventory-panel').textContent()).includes(itemName), 'Equipment theme was not applied.');
    await page.locator('[data-inspector="character"]').click();
    assert(await page.locator('#character-sheet').isVisible(), 'Character inspector tab did not open.');
    assert(!await page.locator('#turn-panel').isVisible(), 'Inactive inspector page stayed visible.');
    await page.locator('[data-inspector="actions"]').click();
    await page.locator('#grid-toggle').click(); assert(await page.locator('#grid-toggle').getAttribute('aria-pressed') === 'false', 'Grid toggle failed.');
    await page.locator('#grid-toggle').click();
    await page.reload(); assert(await page.evaluate(() => document.documentElement.dataset.world) === id, 'Campaign world was lost after reload.');
    const atlas = await page.request.get('http://127.0.0.1:5173/assets/terrain-atlas.png'); assert(atlas.ok() && (await atlas.body()).length > 100000, 'Terrain atlas was not served as an image.');
    await page.screenshot({ path: `design/previews/${id}.png`, scale: 'css' });
    worlds.push({ id, className, scene: state.scene.title, enemies: state.enemies.map(enemy => enemy.name) });
  }
  // A manual character edit must not bypass the same ceiling as generated sheets.
  await page.getByRole('button', { name: 'New campaign', exact: true }).click();
  for (const input of await page.locator('[data-score]').all()) await input.fill('20');
  await page.locator('[data-start-skill]').nth(0).check(); await page.locator('[data-start-skill]').nth(1).check();
  await page.getByRole('button', { name: 'Add hero', exact: true }).click();
  assert((await page.locator('#creator-error').textContent()).match(/points|power/), 'Overpowered character override bypassed validation.');
  assert(await page.getByRole('button', { name: 'Begin expedition', exact: true }).isDisabled(), 'Rejected character was added to the party.');
  await page.getByRole('button', { name: 'Close character creator' }).click();
  await page.goto('http://127.0.0.1:5173/workshop.html?view=balance');
  assert(await page.locator('.balance-summary').isVisible(), 'Power budget page did not render.');
  await page.screenshot({ path: 'design/previews/power-budget.png', scale: 'css' });
  assert((await page.locator('#workshop-panel').textContent()).includes('design ceiling'), 'The baseline was not explained.');
  await page.getByRole('button', { name: 'API costs', exact: true }).click();
  assert((await page.locator('#cost-results').textContent()).includes('$0.0204'), 'Compact story-cost estimate is wrong.');
  await page.locator('#cost-history').selectOption('full');
  assert((await page.locator('#cost-results').textContent()).includes('$0.1554'), 'Full-transcript estimate is wrong.');
  await page.getByRole('button', { name: 'Worlds', exact: true }).click(); assert(await page.locator('.world-studio-card').count() === 3, 'Workshop world cards are missing.');
  await page.setViewportSize({ width: 390, height: 844 });
  assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), 'Workshop overflows a narrow screen.');
  await page.goto('http://127.0.0.1:5173/');
  assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), 'Game overflows a narrow screen.');
  assert(await page.locator('#board').isVisible(), 'Mobile game map is missing.');
  await page.setViewportSize({ width: 1440, height: 1000 });
  return { worlds, manualBudgetBypass: 'rejected', inspector: 'passed', imageTerrain: 'loaded', costCalculator: 'passed', narrowViewports: 'passed' };
}
