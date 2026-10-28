import { test, expect } from './test.ts';
import { addPeriod, savedState, selectEditorSection, configureOffer } from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

for (const width of [1440, 390]) {
  test(`offer organization uses a single surface and manual stages at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#record-title')).toBeVisible();
    await addPeriod(page, '2027-03-01', '2027-03-26');
    await expect(page.locator('#editor-section-title')).toHaveText('Organização letiva por oferta');
    await expect(page.locator('.editor-eyebrow')).toHaveText('Etapa 2 de 6');
    await expect(page.locator('#periods .panel')).toHaveCount(0);
    await expect(
      page.locator('#periods button').filter({ hasText: /sugerir|recalcular|distribuir/i }),
    ).toHaveCount(0);
    await page.locator('[data-edit-organization="integrado"]').click();
    await page.locator('#offer-integrado-count').selectOption('4');
    const before = await savedState(page);
    for (const [index, [start, end]] of [
      ['2027-03-01', '2027-03-05'],
      ['2027-03-08', '2027-03-12'],
      ['2027-03-15', '2027-03-19'],
      ['2027-03-22', '2027-03-26'],
    ].entries()) {
      await page.locator(`#offer-integrado-stage-${index}-start`).fill(start);
      await page.locator(`#offer-integrado-stage-${index}-end`).fill(end);
    }
    expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(before.saves);
    await page.locator('#offer-integrado-apply').click();
    const saved = await savedState(page);
    expect(saved.state.assessmentStagesByModality).toEqual({ integrado: 4 });
    expect(saved.state.events.filter((e) => e.requirementId?.startsWith('stage-'))).toHaveLength(4);
    const origin = new URL(page.url()).origin;
    await page.goto(origin + '/calendarios/synthetic-calendar/avaliacoes');
    await expect(page).toHaveURL(
      origin + '/calendarios/synthetic-calendar/periodos#assessment-area',
    );
    await expect(page.locator('#editor-section-title')).toBeFocused();
    await selectEditorSection(page, 'events');
    await page.goBack();
    await expect(page.locator('#editor-section-title')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('an existing local intake declaration survives explicit organization of its offer', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(async () => {
    const { record } = window.editorTest;
    record.state.organizationByModality = { integrado: 'anual' };
    record.state.intakeByModality = {
      integrado: { annual: { status: 'yes', required: true, source: 'Regra local preservada' } },
    };
    record.version++;
    await window.publishReviewerCalendar();
  });
  await selectEditorSection(page, 'periods');
  await configureOffer(page, 'integrado', '2027-02-01', '2027-12-17');
  expect((await savedState(page)).state.intakeByModality?.integrado?.annual).toEqual({
    status: 'yes',
    required: true,
    source: 'Regra local preservada',
  });
});

test('changing an offer cycle immediately identifies activities that need review', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(async () => {
    const { record } = window.editorTest;
    record.modalities = ['integrado', 'graduacao'];
    record.state.modalities = record.modalities;
    record.state.organizationByModality = { integrado: 'anual', graduacao: 'anual' };
    record.state.periods = [
      {
        id: 'grad',
        name: 'Anual da graduação',
        start: '2027-02-01',
        end: '2027-12-17',
        association: { status: 'defined', modalities: ['graduacao'], term: 'annual' },
      },
    ];
    record.state.events = [
      {
        id: 'final-result',
        name: 'Resultado final da graduação',
        requirementId: 'final-0',
        modalities: ['graduacao'],
        start: '2027-12-17',
        end: '2027-12-17',
        kind: 'note',
        category: 'prazo',
        evidence: 'Decisão da graduação',
      },
    ];
    record.version++;
    await window.publishReviewerCalendar();
  });
  await selectEditorSection(page, 'periods');
  await page.locator('[data-edit-organization="graduacao"]').click();
  await page.locator('#offer-graduacao-organization').selectOption('semestral');
  await expect(page.locator('[data-offer="graduacao"]')).toContainText(
    'Resultado final da graduação',
  );
  await expect(page.locator('#offer-graduacao-apply')).toBeDisabled();
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
});
