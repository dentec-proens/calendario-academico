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
    await page.goto(origin + '/calendarios/synthetic-calendar/atividades');
    const row = page.locator('[data-open-event="local-event"]');
    await expect(row).toContainText('Evento local salvo');
    await expect(row).toContainText('Data do campus');
    await expect(row).toContainText('10/03/2027');
    await expect(
      page.locator('#event-list [data-edit-event], #event-list [data-remove-event]'),
    ).toHaveCount(0);
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#event-panel-title')).toHaveText('Evento local salvo');
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
    await page.locator('#close-event-panel').click();
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
  await page.goto(origin + '/calendarios/synthetic-calendar/atividades');
  await openActivity(page, 'family-meeting');
  await page.locator('#event-start').fill('2027-05-08');

  await page.locator('#close-event-panel').click();
  await selectCampusEvents(page);
  await openCampusEvent(page, 'local-event');
  await expect(page.locator('#panel-pending-event')).toBeVisible();
  await expect(page.locator('.campus-event-record')).toContainText('Evento local salvo');
  await page.locator('[data-edit-event="local-event"]').click();
  await expect(page.locator('#event-form')).toBeHidden();
  await expect(page.locator('#event-start')).toHaveValue('2027-05-08');
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
  await page.locator('#panel-resume-event').click();
  await expect(page.locator('#event-form')).toBeVisible();
  await expect(page.locator('#event-start')).toHaveValue('2027-05-08');
});

for (const width of [1440, 390]) {
  test(`reviewers can open campus details with the keyboard without editing at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const origin = new URL(await fixtureServer('editor-reviewer')).origin;
    await page.goto(origin + '/calendarios/synthetic-calendar/atividades');
    const row = page.locator('[data-open-event="local-event"]');
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-edit-event="local-event"]')).toBeDisabled();
    await expect(page.locator('[data-remove-event="local-event"]')).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(row).toBeFocused();
    expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
  });
}

test('a local date whose ID imitates the base prefix stays a campus date', async ({
  page,
  fixtureServer,
}) => {
  const origin = new URL(await fixtureServer('editor')).origin;
  await page.goto(origin + '/calendarios/synthetic-calendar/atividades');
  await expect(page.locator('[data-open-event="local-event"]')).toBeVisible();
  // The origin comes from the container (`state.events`), never from the `inst:` prefix; the
  // stray `evidence` must not be shown as an automatic source.
  await page.evaluate(() => {
    const record = window.editorTest.record;
    record.state.events.push({
      id: 'inst:campus-lookalike',
      name: 'Data local com prefixo da base',
      start: '2027-03-11',
      end: '2027-03-11',
      kind: 'note',
      category: 'evento',
      offers: ['integrado'],
      evidence: 'Fonte que não é da base',
    } as (typeof record.state.events)[number]);
    record.version++;
    return window.publishReviewerCalendar();
  });
  const row = page.locator('[data-open-event="inst:campus-lookalike"]');
  await expect(row).toContainText('Data do campus');
  await openCampusEvent(page, 'inst:campus-lookalike');
  const details = page.locator('.campus-event-details');
  await expect(details).toContainText('Data local com prefixo da base');
  await expect(details).not.toContainText('Fonte:');
  await expect(details).not.toContainText('Data da base institucional');
  await expect(page.locator('[data-edit-event="inst:campus-lookalike"]')).toBeEnabled();
});
