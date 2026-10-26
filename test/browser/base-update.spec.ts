import { test, expect } from './test.ts';
import { publishBaseUpdate } from './base-update.ts';

for (const width of [1440, 390]) {
  test(`institutional changes can be reviewed and incorporated at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('editor'));
    await publishBaseUpdate(page);
    const card = page.locator('.base-update-card');
    const summary = card.locator('summary');
    const action = card.getByRole('button', { name: 'Incorporar mudanças ao calendário' });
    await expect(card).toBeVisible();
    await expect(action).toBeHidden();
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(action).toBeVisible();
    await expect(card).toContainText('Incluído: Encontro institucional');
    await expect(card).toContainText('Removido: Recesso removido');
    await expect(card).toContainText('15/10/2027');
    await expect(card).toContainText('14/10/2027');
    await expect(card).toContainText('Fonte: Portaria atualizada');
    await expect(card).toContainText('Orientações atualizadas');
    expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
    await summary.click();
    await expect(action).toBeHidden();
    await summary.click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.locator('#week-evidence').fill('Campo em preenchimento');
    await expect(action).toBeDisabled();
    await expect(card).toContainText('Aplique ou descarte os campos');
    await page.locator('#week-evidence').fill('Ata sintética');
    await expect(action).toBeEnabled();
    await action.click();
    await expect(card).toHaveCount(0);
    await expect(page.locator('#message')).toContainText(
      'Mudanças da base institucional incorporadas',
    );
    expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(1);
    expect(
      await page.evaluate(() =>
        window.editorTest.record.state.events.some((event) => event.id === 'local-event'),
      ),
    ).toBe(true);
  });
}

test('a document-only update explains that calendar events did not change', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  await publishBaseUpdate(page, true);
  const card = page.locator('.base-update-card');
  await card.locator('summary').click();
  await expect(card).toContainText('Apenas os documentos de referência foram atualizados.');
  await expect(card).toContainText(
    'Não há alterações nos eventos institucionais deste calendário.',
  );
});
