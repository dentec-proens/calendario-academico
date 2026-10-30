import { test, expect } from './test.ts';
import {
  addPeriod,
  editCampusEvent,
  selectCampusEvents,
  selectEditorSection,
} from './editor-navigation.ts';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00-03:00'));
});

test('Teacher Day groups the field and actions in the shared panel', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#record-title')).toBeVisible();
  await selectEditorSection(page, 'events');
  await selectCampusEvents(page);
  await page.locator('#open-observance-teacher-day').click();
  await expect(page.locator('#event-panel')).toHaveScreenshot('teacher-day.png');
  await page.locator('#observance-date-teacher-day').selectOption('2027-10-14');
  await expect(page.locator('#event-panel')).toHaveScreenshot('teacher-day-draft.png');
});

test('event footer has apply and discard while the shared header closes the panel', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#record-title')).toBeVisible();
  await selectEditorSection(page, 'events');
  await selectCampusEvents(page);
  await editCampusEvent(page, 'local-event');
  await expect(page.locator('#event-form-title')).toBeFocused();
  await page.locator('#event-name').fill('Evento com alteração ainda não aplicada');
  await page.locator('#event-form button[type="submit"]').focus();
  await expect(page.locator('#event-form button[type="submit"]')).toBeFocused();
  await expect(page.locator('#close-event-panel')).toBeInViewport({ ratio: 1 });
  await expect(page).toHaveScreenshot('event-actions.png');
});

test('registered Saturday uses shared header and action hierarchy', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#record-title')).toBeVisible();
  await addPeriod(page, '2027-03-01', '2027-04-30');
  await selectEditorSection(page, 'days');
  await page.locator('#saturday-dates input[value="2027-03-06"]').check();
  const open = page.locator('#saturday-open-panel');
  if (await open.isVisible()) await open.click();
  await page.locator('#saturday-name').fill('Reposição de aulas');

  await page.locator('#saturday-submit').click();
  await page.locator('[data-saturday="2027-03-06"] [data-edit-saturday]').click();
  await page.locator('#saturday-edit-name').fill('Feira de ciências');
  const actions = page.locator('#saturday-edit-form .form-actions__buttons');
  await expect(actions.getByRole('button')).toHaveText(['Aplicar', 'Descartar', 'Remover']);
  await expect(actions.locator('svg')).toHaveCount(0);
  const boxes = await actions.getByRole('button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const { top, right, left, height } = button.getBoundingClientRect();
      return { top, right, left, height, fits: button.scrollWidth <= button.clientWidth };
    }),
  );
  for (const [index, box] of boxes.entries()) {
    expect(box.top).toBe(boxes[0].top);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.fits).toBe(true);
    if (index) expect(box.left).toBeGreaterThan(boxes[index - 1].right);
  }
  await expect(page.locator('#saturday-panel')).toHaveScreenshot('saturday-edit.png');
});
