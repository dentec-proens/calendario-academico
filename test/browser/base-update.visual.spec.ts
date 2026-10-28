import { test, expect } from './test.ts';
import { publishBaseUpdate } from './base-update.ts';

test('institutional base changes collapsed and expanded', async ({ page, fixtureServer }) => {
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00-03:00'));
  await page.goto(await fixtureServer('editor'));
  await publishBaseUpdate(page);
  const card = page.locator('.base-update-card');
  await expect(card).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await expect(card).toHaveScreenshot('base-update-collapsed.png');
  await card.locator('summary').click();
  await expect(
    card.getByRole('button', { name: 'Incorporar mudanças ao calendário' }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await expect(page).toHaveScreenshot('base-update-expanded.png', { fullPage: true });
});

test('legacy 2027 rules require explicit adoption without changing recorded dates', async ({
  page,
  fixtureServer,
}) => {
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00-03:00'));
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => {
    const { record } = window.editorTest;
    record.state.schemaVersion = 2;
    delete record.state.rulesetVersion;
    delete record.state.organizationByModality;
    record.version++;
    return window.publishReviewerCalendar();
  });
  const card = page.locator('.base-update-card');
  await expect(card).toContainText('Regras de 2027 atualizadas: nova revisão necessária');
  await expect(card).toHaveScreenshot('rules-update-collapsed.png');
  await card.locator('summary').click();
  await expect(page).toHaveScreenshot('rules-update-expanded.png', { fullPage: true });
  const before = await page.evaluate(() =>
    window.editorTest.record.state.events.map((event) => [event.id, event.start, event.end]),
  );
  await card.getByRole('button', { name: 'Adotar regras e registrar nova versão' }).click();
  await expect(card).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      window.editorTest.record.state.events.map((event) => [event.id, event.start, event.end]),
    ),
  ).toEqual(before);
  expect(await page.evaluate(() => window.editorTest.record.state.rulesetVersion)).toBe(
    'consup-292-2027-v1',
  );
});
