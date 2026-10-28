import { test, expect } from './test.ts';
import { addPeriod, savedState, selectEditorSection } from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

for (const width of [1440, 390]) {
  test(`collapsed offers expose missing stage dates and Continue requires an applied complete organization at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#record-title')).toBeVisible();
    await page.evaluate(async () => {
      const { record } = window.editorTest;
      record.state.periods = [
        {
          id: 'annual',
          name: 'Anual',
          start: '2027-03-01',
          end: '2027-03-26',
          association: { status: 'defined', modalities: ['integrado'], term: 'annual' },
        },
      ];
      record.state.assessmentStagesByModality = { integrado: 3 };
      record.version++;
      await window.publishReviewerCalendar();
    });
    await selectEditorSection(page, 'periods');
    await expect(
      page.locator('[data-offer="integrado"] [data-organization-progress]'),
    ).toContainText('0 de 3');
    await page.locator('#editor-continue').click();
    await expect(page).toHaveURL(/\/periodos$/);
    await expect(page.locator('#organization-continue [role="alert"]')).toContainText(
      'Técnico integrado',
    );
    await expect(page.locator('#organization-continue .ui-notice')).toHaveAttribute(
      'data-tone',
      'warning',
    );
    await expect(page.locator('#organization-continue .ui-notice__icon')).toBeVisible();
    await expect(page.locator('#offer-integrado-stage-0-start')).toBeFocused();
    await page.locator('[data-edit-organization="integrado"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#offer-integrado-form')).toBeHidden();
    await expect(
      page.locator('[data-offer="integrado"] [data-organization-progress]'),
    ).toContainText('0 de 3');
    await page.locator('[data-edit-organization="integrado"]').click();
    for (const [index, [start, end]] of [
      ['2027-03-01', '2027-03-08'],
      ['2027-03-09', '2027-03-17'],
      ['2027-03-18', '2027-03-26'],
    ].entries()) {
      await page.locator(`#offer-integrado-stage-${index}-start`).fill(start);
      await page.locator(`#offer-integrado-stage-${index}-end`).fill(end);
    }
    await page.locator('#offer-integrado-evidence').fill('Ata da organização');
    await expect(page.locator('[data-edit-organization="integrado"] svg')).toHaveCount(1);
    await page.locator('[data-edit-organization="integrado"]').click();
    await expect(
      page.locator('[data-offer="integrado"] [data-organization-progress]'),
    ).toContainText('não aplicadas');
    await page.locator('#editor-continue').click();
    await expect(page).toHaveURL(/\/periodos$/);
    await expect(page.locator('#organization-continue [role="alert"]')).toContainText('Aplique');
    expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
    await page.locator('#offer-integrado-apply').click();
    await savedState(page);
    await page.locator('#editor-continue').click();
    await expect(page).toHaveURL(/\/dias$/);
  });
  test(`an unfinished additional offer remains visibly pending after collapsing at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#record-title')).toBeVisible();
    await addPeriod(page, '2027-03-01', '2027-03-26');
    await savedState(page);
    await page.locator('[data-edit-organization="graduacao"]').click();
    await page.locator('#offer-graduacao-organization').selectOption('anual');
    await page.locator('#offer-graduacao-period-0-start').fill('2027-03-01');
    await page.locator('#offer-graduacao-period-0-end').fill('2027-03-26');
    await page.locator('[data-edit-organization="graduacao"]').click();
    await expect(
      page.locator('[data-offer="graduacao"] [data-organization-progress]'),
    ).toContainText('defina a quantidade e as datas');
    await page.locator('#editor-continue').click();
    await expect(page).toHaveURL(/\/periodos$/);
    await expect(page.locator('#offer-graduacao-count')).toBeFocused();
    await page.locator('#offer-graduacao-cancel').click();
    await page.locator('#editor-continue').click();
    await expect(page).toHaveURL(/\/dias$/);
  });
}
