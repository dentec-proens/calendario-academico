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
    await expect(page.locator('#editor-section-title')).toHaveText('Organização por oferta');
    await expect(page.locator('.editor-eyebrow')).toHaveText('Etapa 2 de 7');
    await page.locator('[data-edit-organization="integrado"]').click();
    await page.locator(`#offer-integrado-count [data-choice="4"]`).click();
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
    expect(saved.state.offers.find((offer) => offer.id === 'integrado')?.stages).toEqual({
      perTerm: 4,
    });
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
    record.state.offers[0].intake = { annual: { status: 'yes', required: true } };
    record.version++;
    await window.publishReviewerCalendar();
  });
  await selectEditorSection(page, 'periods');
  await configureOffer(page, 'integrado', '2027-02-01', '2027-12-17');
  expect(
    (await savedState(page)).state.offers.find((offer) => offer.id === 'integrado')?.intake?.annual,
  ).toEqual({
    status: 'yes',
    required: true,
  });
});

test('changing an offer cycle previews linked dates to review and keeps their links', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(async () => {
    const { record } = window.editorTest;
    record.offerKinds = ['integrado', 'graduacao'];
    record.state.offers = record.offerKinds.map((kind) => ({
      id: kind,
      kind,
      delivery: 'a-conferir',
      organization: 'anual',
    }));
    record.state.periods = [
      {
        id: 'grad',
        name: 'Anual da graduação',
        start: '2027-02-01',
        end: '2027-12-17',
        association: { status: 'defined', offers: ['graduacao'], term: 'annual' },
      },
    ];
    record.state.events = [
      {
        id: 'final-result',
        name: 'Resultado final da graduação',
        requirementId: 'final-0',
        offers: ['graduacao'],
        start: '2027-12-17',
        end: '2027-12-17',
        kind: 'note',
        category: 'prazo',
      },
    ];
    record.version++;
    await window.publishReviewerCalendar();
  });
  await selectEditorSection(page, 'periods');
  await page.locator('[data-edit-organization="graduacao"]').click();
  await page.locator(`#offer-graduacao-organization [data-choice="semestral"]`).click();
  const warnings = page.locator('#offer-graduacao-link-warnings');
  await expect(warnings).toHaveCount(0);
  for (const [index, [start, end]] of [
    ['2027-02-01', '2027-06-30'],
    ['2027-08-02', '2027-12-17'],
  ].entries()) {
    await page.locator(`#offer-graduacao-period-${index}-start`).fill(start);
    await page.locator(`#offer-graduacao-period-${index}-end`).fill(end);
  }
  await page.locator(`#offer-graduacao-count [data-choice="1"]`).click();
  for (const [index, [start, end]] of [
    ['2027-02-01', '2027-06-30'],
    ['2027-08-02', '2027-12-17'],
  ].entries()) {
    await page.locator(`#offer-graduacao-stage-${index}-start`).fill(start);
    await page.locator(`#offer-graduacao-stage-${index}-end`).fill(end);
  }
  // The annual result is not generated for a semester offer: it is kept, to review.
  await expect(warnings).toContainText(
    '“Resultado final da graduação” ficará em Vínculo a conferir (Classificação pendente)',
  );
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
  await page.locator('#offer-graduacao-apply').click();
  const saved = await savedState(page);
  expect(saved.state.events.find((event) => event.id === 'final-result')).toMatchObject({
    requirementId: 'final-0',
    start: '2027-12-17',
  });
});
