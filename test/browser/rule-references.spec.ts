import { test, expect } from './test.ts';
import { selectEditorSection } from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

const viewports = [
  ['desktop', 1440, 900],
  ['mobile', 390, 844],
] as const;

for (const [name, width, height] of viewports) {
  test(`the period fields state the norm's reference at ${name}`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
    await expect(page.locator('#record-title')).toBeVisible();
    await selectEditorSection(page, 'periods');
    await page.locator('[data-edit-organization="integrado"]').click();
    const reference = page.locator('#offer-integrado-period-reference');
    await expect(reference).toBeVisible();
    await expect(reference).toContainText('Referência 2027: 1 fev a 17 dez, início até 15 fev');
    for (const edge of ['start', 'end']) {
      const field = page.locator(`#offer-integrado-period-0-${edge}`);
      await expect(field).toHaveAttribute(
        'aria-describedby',
        /offer-integrado-period-reference offer-integrado-period-0-error/,
      );
      await expect(field).toHaveAccessibleDescription(/início até 15 fev/);
    }
    // Under its own regulation the reference no longer applies to this offer.
    await page.locator('#offer-integrado-delivery [data-choice="ead"]').click();
    await expect(reference).toHaveCount(0);
    await expect(page.locator('#offer-integrado-period-0-start')).not.toHaveAttribute(
      'aria-describedby',
      /period-reference/,
    );
    await page.locator('#offer-integrado-delivery [data-choice="presencial"]').click();
    await expect(reference).toBeVisible();
    // Nothing is suggested or filled in.
    await expect(page.locator('#offer-integrado-period-0-start')).toHaveValue('');
  });

  test(`an activity without dates explains the rule and keeps the form when opening the rules at ${name}`, async ({
    page,
    fixtureServer,
    context,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
    await expect(page.locator('#record-title')).toBeVisible();
    await selectEditorSection(page, 'events');
    await page.locator('[data-activity-open="recognition:cycle:annual"]').click();
    await expect(page.locator('#event-form-title')).toBeFocused();
    const rule = page.locator('#event-form [data-activity-rule]');
    await expect(rule).toBeVisible();
    await expect(rule).toContainText('(Art. 11, VI)');
    const start = page.locator('#event-form input[type="date"]').first();
    await expect(start).toHaveValue('');
    await start.fill('2027-03-01');
    const link = rule.getByRole('link', { name: /Ver regras do calendário/ });
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener');
    const box = await rule.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    const [rules] = await Promise.all([context.waitForEvent('page'), link.click()]);
    await expect(rules).toHaveURL(/\/regras\?ano=2027/);
    await rules.close();
    await expect(start).toHaveValue('2027-03-01');
  });
}

test('the view of an activity carries the same sentence', async ({ page, fixtureServer }) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await expect(page.locator('#record-title')).toBeVisible();
  await selectEditorSection(page, 'events');
  await page.locator('[data-activity-open="recognition:cycle:annual"]').click();
  const rule = page.locator('#event-form [data-activity-rule]');
  const text = (await rule.textContent())!.split(' (Art.')[0];
  await page.locator('#back-to-activity').click();
  const details = page.locator('[data-activity-details="recognition:cycle:annual"]');
  await expect(details.locator('[data-activity-rule]')).toContainText(text);
});
