import { test, expect } from './test.ts';
import {
  editCampusEvent,
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
    // A campus date is a kind of date, shown apart from a completed activity.
    await expect(row.locator('.activity-status')).toHaveCSS('color', 'rgb(23, 74, 126)');
    await expect(row).toContainText('10/03/2027');
    // The row repeats the printed legend color of the category, with its name as text.
    const category = row.locator('.category-mark[data-category="evento"]');
    await expect(category).toContainText('Eventos artísticos');
    await expect(category.locator('.category-mark__swatch')).toHaveCSS(
      'background-color',
      'rgb(192, 242, 255)',
    );
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
      effect: 'note',
      category: 'evento',
      scope: { offers: ['integrado'], confirmed: true },
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

for (const width of [1440, 390]) {
  test(`a campus date is marked internal (art. 18) and unmarked with a notice on an incompatible change at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const origin = new URL(await fixtureServer('editor')).origin;
    await page.goto(origin + '/calendarios/synthetic-calendar/atividades');
    const row = page.locator('[data-open-event="local-event"]');
    await expect(row.locator('[data-internal-badge]')).toHaveCount(0);
    const before = await page.evaluate(() =>
      window.editorTest.record.state.events.find((event) => event.id === 'local-event')!,
    );
    await editCampusEvent(page, 'local-event');
    const option = page.locator('#event-internal');
    await expect(option).not.toBeChecked();
    await expect(option).toHaveAccessibleName('Data interna (art. 18)');
    await option.focus();
    await page.keyboard.press('Space');
    await expect(option).toBeChecked();
    await page.locator('#event-form button[type="submit"]').click();
    const marked = (await savedState(page)).state.events.find(
      (event) => event.id === 'local-event',
    );
    expect(marked).toEqual({ ...before, internal: true });
    await page.locator('#close-event-panel').click();
    await expect(row).toBeFocused();
    await expect(row.locator('[data-internal-badge]')).toHaveText('Interna');
    await openCampusEvent(page, 'local-event');
    await expect(page.locator('.campus-event-record [data-internal-badge]')).toHaveText('Interna');

    await page.locator('[data-edit-event="local-event"]').click();
    await expect(option).toBeChecked();
    // A category that must stay in the official calendar unmarks the option before saving.
    const more = page.locator('#event-more-options');
    if ((await more.getAttribute('open')) === null) await more.locator('summary').click();
    await page.locator('#event-category').selectOption('conselho');
    // Open, the group shows the legend color under the field instead of repeating its summary.
    await expect(more.locator('.event-more-summary')).toBeHidden();
    await expect(page.locator('#event-category-color .category-mark__swatch')).toHaveCSS(
      'background-color',
      'rgb(255, 0, 255)',
    );
    await expect(option).toHaveCount(0);
    const notice = page.locator('#event-internal-unmarked');
    await expect(notice).toContainText('Data interna desmarcada');
    await expect(notice).toContainText('passa a constar do calendário oficial');
    await page.locator('#event-category').selectOption('evento');
    await expect(option).not.toBeChecked();
    await option.check();
    await expect(notice).toHaveCount(0);
    // So does an answer that changes the count of school days.
    await page.locator('#event-type-holiday').check();
    await expect(option).toHaveCount(0);
    await expect(notice).toContainText('sem efeito na contagem');
    await page.locator('#event-type-campus-event').check();
    await expect(option).not.toBeChecked();
    await page.locator('#event-form button[type="submit"]').click();
    const unmarked = (await savedState(page)).state.events.find(
      (event) => event.id === 'local-event',
    );
    expect(unmarked).toEqual(before);
    await expect(row.locator('[data-internal-badge]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
