import { test, expect } from './test.ts';
import {
  openActivity,
  openCampusEvent,
  savedState,
  selectCampusEvents,
} from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

for (const width of [1440, 390]) {
  test(`campus rows open details, edit and remove through the panel at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const origin = new URL(await fixtureServer('editor')).origin;
    await page.goto(origin + '/calendarios/synthetic-calendar/eventos?aba=eventos');
    const row = page.locator('[data-open-event="local-event"]');
    await expect(row).toContainText('Evento local salvo');
    await expect(row).toContainText('Registrado');
    await expect(row).toContainText('10/03/2027');
    await expect(
      page.locator('#event-list [data-edit-event], #event-list [data-remove-event]'),
    ).toHaveCount(0);
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#event-panel-title')).toHaveText('Evento local salvo');
    await expect(page.locator('.campus-event-record')).toContainText('Fonte: Ata salva');
    await expect(page.locator('#event-form')).toBeHidden();
    expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
    await page.locator('#close-event-panel').click();
    await expect(row).toBeFocused();
    await openCampusEvent(page, 'local-event');
    await page.locator('[data-edit-event="local-event"]').click();
    await expect(page.locator('#event-form-title')).toBeFocused();
    await page.locator('#event-name').fill('Encontro do campus');
    await page.locator('#event-form button[type="submit"]').click();
    expect(
      (await savedState(page)).state.events.find((event) => event.id === 'local-event')?.name,
    ).toBe('Encontro do campus');
    await page.locator('#close-event-form').click();
    await expect(row).toBeFocused();
    await expect(row).toContainText('Encontro do campus');
    await openCampusEvent(page, 'local-event');
    await page.locator('[data-remove-event="local-event"]').click();
    await expect(page.locator('#event-panel')).toBeHidden();
    await expect(row).toHaveCount(0);
    await expect(page.locator('#editor-section-title')).toBeFocused();
    expect((await savedState(page)).state.events.some((event) => event.id === 'local-event')).toBe(
      false,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('campus consultation preserves another activity draft and prevents replacing it', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('editor')).origin;
  await page.goto(origin + '/calendarios/synthetic-calendar/eventos');
  await openActivity(page, 'family-meeting');
  await page.locator('#event-evidence').fill('Fonte ainda não aplicada');
  await page.locator('#close-event-form').click();
  await selectCampusEvents(page);
  await openCampusEvent(page, 'local-event');
  await expect(page.locator('#panel-pending-event')).toBeVisible();
  await expect(page.locator('.campus-event-record')).toContainText('Evento local salvo');
  await page.locator('[data-edit-event="local-event"]').click();
  await expect(page.locator('#event-form')).toBeHidden();
  await expect(page.locator('#event-evidence')).toHaveValue('Fonte ainda não aplicada');
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
  await page.locator('#panel-resume-event').click();
  await expect(page.locator('#event-form')).toBeVisible();
  await expect(page.locator('#event-evidence')).toHaveValue('Fonte ainda não aplicada');
});

for (const width of [1440, 390]) {
  test(`reviewers can open campus details with the keyboard without editing at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const origin = new URL(await fixtureServer('editor-reviewer')).origin;
    await page.goto(origin + '/calendarios/synthetic-calendar/eventos?aba=eventos');
    const row = page.locator('[data-open-event="local-event"]');
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.campus-event-record')).toContainText('Fonte: Ata salva');
    await expect(page.locator('[data-edit-event="local-event"]')).toBeDisabled();
    await expect(page.locator('[data-remove-event="local-event"]')).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(row).toBeFocused();
    expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
  });
}
