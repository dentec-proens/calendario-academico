import { test, expect } from './test.ts';
import {
  addPeriod,
  openCampusEvent,
  savedState,
  selectCampusEvents,
  selectEditorSection,
} from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

for (const width of [1440, 390]) {
  test(`Teacher Day keeps closed fields and discards only pending changes at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#record-title')).toBeVisible();
    await selectEditorSection(page, 'events');
    await selectCampusEvents(page);
    const opener = page.locator('#open-teacher-day');
    await opener.click();
    const date = page.locator('#teacher-day-date');
    await expect(page.locator('#teacher-day-help')).toHaveText(
      'Escolha de 11/10/2027 a 17/10/2027. A alteração vale apenas para este calendário.',
    );
    await expect(page.locator('#discard-teacher-day')).toBeHidden();
    await date.fill('2027-10-14');
    await page.locator('#close-event-panel').click();
    await expect(opener).toBeFocused();
    await opener.click();
    await expect(date).toHaveValue('2027-10-14');
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
    await opener.click();
    await expect(date).toHaveValue('2027-10-14');
    await page.locator('#apply-teacher-day').click();
    await expect(page.locator('#discard-teacher-day')).toBeHidden();
    await date.fill('2027-10-13');
    const discard = page.locator('#discard-teacher-day');
    await discard.focus();
    await expect
      .poll(() =>
        discard.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return hit === element || Boolean(hit && element.contains(hit));
        }),
      )
      .toBe(true);
    await discard.press('Enter');
    await expect(opener).toBeFocused();
    await opener.click();
    await expect(date).toHaveValue('2027-10-14');
    await expect(page.locator('#unapplied-status')).toBeHidden();
    await page.locator('#reset-teacher-day').click();
    await expect(date).toHaveValue('2027-10-15');
    await expect(page.locator('#discard-teacher-day')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

  test(`period navigation preserves the draft and discard keeps the applied period at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#record-title')).toBeVisible();
    await addPeriod(page, '2027-03-01', '2027-04-30');
    await page.locator('[data-edit-organization="integrado"]').click();
    await page.locator('#offer-integrado-period-0-start').fill('2027-03-02');
    await expect(page.locator('[data-edit-organization="integrado"]')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await selectEditorSection(page, 'events');
    await selectEditorSection(page, 'periods');
    await expect(page.locator('#offer-integrado-period-0-start')).toHaveValue('2027-03-02');
    await page.locator('#offer-integrado-cancel').click();
    await expect(page.locator('[data-edit-organization="integrado"]')).toBeFocused();
    await expect(page.locator('#offer-integrado-form')).toBeHidden();
    await expect(page.locator('#offer-integrado-cancel')).toBeHidden();
    await expect(page.locator('[data-offer="integrado"]')).toContainText('Anual:');
    await page.locator('[data-edit-organization="integrado"]').click();
    await expect(page.locator('#offer-integrado-period-0-start')).toHaveValue('2027-03-01');
    await expect(page.locator('#unapplied-status')).toBeHidden();
  });

  test(`closing a Saturday preserves its draft until explicit discard at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#record-title')).toBeVisible();
    await addPeriod(page, '2027-03-01', '2027-04-30');
    await selectEditorSection(page, 'days');
    await page.locator('#saturday-dates input[value="2027-03-06"]').check();
    if (width === 390) await page.locator('#saturday-open-panel').click();
    await page.locator('#saturday-name').fill('Reposição de aulas');

    await page.locator('#saturday-submit').click();
    const registered = page.locator('[data-saturday="2027-03-06"] [data-edit-saturday]');
    await registered.click();
    await page.locator('#saturday-edit-name').fill('Preenchimento a retomar');
    await page.locator('#saturday-edit-close').click();
    await expect(registered).toBeFocused();
    await registered.click();
    await expect(page.locator('#saturday-edit-name')).toHaveValue('Preenchimento a retomar');
    if (width === 390) {
      await page.keyboard.press('Escape');
      await expect(registered).toBeFocused();
      await registered.click();
      await expect(page.locator('#saturday-edit-name')).toHaveValue('Preenchimento a retomar');
    }
    await page.locator('#saturday-edit-discard').click();
    await expect(registered).toBeFocused();
    await registered.click();
    await expect(page.locator('#saturday-edit-name')).toHaveValue('Reposição de aulas');
    await expect(page.locator('#saturday-edit-discard')).toBeHidden();
    await expect(page.locator('#unapplied-status')).toBeHidden();
    const saved = (await savedState(page)).state.events.find(
      (event) => event.category === 'sabado',
    )!;
    expect(saved.name).toBe('Reposição de aulas');

    // Removing the applied record from another panel also retires its closed draft.
    await page.locator('#saturday-edit-name').fill('Preenchimento de um registro a remover');
    await page.locator('#saturday-edit-close').click();
    await selectEditorSection(page, 'events');
    await selectCampusEvents(page);
    await openCampusEvent(page, saved.id);
    await page.locator(`[data-remove-event="${saved.id}"]`).click();
    await expect(page.locator('#unapplied-status')).toBeHidden();
  });
}
