import { test, expect } from './test.ts';

for (const width of [1440, 390, 320]) {
  test(`calendar trash navigation and restoration at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const origin = new URL(await fixtureServer('portal')).origin;
    await page.goto(origin + '/calendarios?campus=campus-a');
    const trash = page.getByRole('link', { name: 'Lixeira', exact: true });
    await expect(trash).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.collection-heading').getByRole('link')).toHaveCount(0);
    await expect(
      page.locator('.calendar-list-tools').getByRole('link', { name: 'Lixeira' }),
    ).toBeVisible();
    await expect(trash).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(trash).toHaveCSS('border-top-width', '0px');
    const linkBox = await trash.boundingBox();
    expect(linkBox!.width).toBeLessThan(100);
    const controls = await page.locator('.calendar-list-tools').boundingBox();
    const list = await page.locator('#calendar-list').boundingBox();
    expect(controls!.y + controls!.height).toBeLessThan(list!.y);
    await trash.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/calendarios\/lixeira\?campus=campus-a$/);
    await expect(page.locator('#panel-title')).toBeFocused();
    await expect(page.locator('#calendar-list')).toHaveCount(0);
    await expect(page.locator('#calendar-trash-list')).toHaveText('A lixeira está vazia.');
    await page.reload();
    await expect(page.locator('#calendar-trash-list')).toBeVisible();
    await page.getByRole('link', { name: 'Voltar aos calendários' }).click();
    await expect(page.locator('#campus-filter')).toHaveValue('campus-a');
    await page.locator('[data-delete-calendar="calendar-a"]').click();
    await page.getByRole('button', { name: 'Mover para a lixeira', exact: true }).click();
    await expect(page.locator('#message')).toContainText('restaurá-lo na Lixeira');
    await trash.click();
    await expect(page.locator('#calendar-trash-list')).toContainText('Calendário de teste');
    const restore = page.getByRole('button', { name: 'Restaurar calendário' });
    await restore.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#message')).toContainText('Calendário restaurado.');
    await expect(page.locator('#calendar-trash-list')).toHaveText('A lixeira está vazia.');
    await page.goBack();
    await expect(page.locator('#calendar-list')).toContainText('Calendário de teste');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

for (const width of [1440, 390]) {
  test(`campus can open the discreet trash link without a campus filter at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const origin = new URL(await fixtureServer('portal')).origin;
    await page.goto(origin + '/calendarios?role=CAMPUS');
    await expect(page.locator('#campus-filter')).toHaveCount(0);
    const trash = page.getByRole('link', { name: 'Lixeira', exact: true });
    await expect(trash).toBeInViewport({ ratio: 1 });
    await trash.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#calendar-trash-list')).toBeVisible();
  });
}
