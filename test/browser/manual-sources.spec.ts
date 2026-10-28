import { test, expect } from './test.ts';
import {
  addPeriod,
  savedState,
  selectEditorSection,
  selectCampusEvents,
} from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

for (const width of [1440, 390]) {
  test(`manual source fields are absent and Saturday activities keep independent identities at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#weekdays')).toBeVisible();
    await expect(page.locator('#week-evidence')).toHaveCount(0);
    const institutional = await page.evaluate(() => window.editorTest.record.institutionalSnapshot);
    await page.locator('#weekdays input[value="5"]').uncheck();
    expect((await savedState(page)).state).not.toHaveProperty('weekEvidence');
    await addPeriod(page, '2027-03-01', '2027-03-26');
    await savedState(page);
    await selectEditorSection(page, 'days');
    for (const [date, name] of [
      ['2027-03-06', 'Atividade A'],
      ['2027-03-13', 'Atividade B'],
    ]) {
      await page.locator(`#saturday-dates input[value="${date}"]`).check();
      if (await page.locator('#saturday-open-panel').isVisible())
        await page.locator('#saturday-open-panel').click();
      await page.locator('#saturday-name').fill(name);
      await expect(page.locator('#saturday-evidence')).toHaveCount(0);
      await page.locator('#saturday-submit').click();
      await savedState(page);
    }
    await expect(page.locator('.saturday-registrations')).toContainText('Atividade A');
    await expect(page.locator('.saturday-registrations')).toContainText('Atividade B');
    await page.locator('[data-saturday="2027-03-06"] [data-edit-saturday]').click();
    await expect(page.locator('#saturday-edit-evidence')).toHaveCount(0);
    await page.locator('#saturday-edit-name').fill('Atividade A retificada');
    await page.locator('#saturday-edit-save').click();
    const saved = await savedState(page);
    expect(
      saved.state.events
        .filter((event) => event.category === 'sabado')
        .map((event) => [event.start, event.name])
        .sort((a, b) => a[0].localeCompare(b[0])),
    ).toEqual([
      ['2027-03-06', 'Atividade A retificada'],
      ['2027-03-13', 'Atividade B'],
    ]);
    expect(saved.state.events.every((event) => !Object.hasOwn(event, 'evidence'))).toBe(true);
    await selectEditorSection(page, 'vacations');
    await expect(page.locator('#vacation-evidence')).toHaveCount(0);
    await page.locator('#vacation-first-start').fill('2027-01-04');
    await page.locator('#vacation-first-end').fill('2027-01-29');
    await page.locator('#vacation-form button[type="submit"]').click();
    expect((await savedState(page)).state.teacherVacations).not.toHaveProperty('evidence');
    await selectEditorSection(page, 'events');
    await selectCampusEvents(page);
    await page.locator('#new-event').click();
    await expect(page.locator('#event-evidence, #event-adjustment-evidence')).toHaveCount(0);
    await page.locator('#event-name').fill('Feriado do campus');
    await page.locator('#event-type-holiday').check();
    await page.locator('#event-start').fill('2027-03-08');
    await page.locator('#event-end').fill('2027-03-08');
    await page.locator('#event-form button[type="submit"]').click();
    const final = await savedState(page);
    expect(
      final.state.events.find((event) => event.name === 'Feriado do campus'),
    ).not.toHaveProperty('evidence');
    expect(await page.evaluate(() => window.editorTest.record.institutionalSnapshot)).toEqual(
      institutional,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
