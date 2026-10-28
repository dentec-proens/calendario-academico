import { configureOffer } from './editor-navigation.ts';
import { test, expect } from './test.ts';
import { openActivity, selectCampusEvents, selectEditorSection } from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

for (const width of [1440, 390]) {
  test(`prior reference keeps civil dates and draft while filtering at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
    await expect(page.locator('#record-title')).toHaveText('2027 — Campus de teste');
    await selectEditorSection(page, 'events');
    await page.locator('#activity-status').selectOption('all');
    await expect
      .poll(() =>
        page
          .locator('[data-activity-row="enrolment-0"] .activity-status')
          .first()
          .evaluate((element) => {
            const text = document.createRange();
            text.selectNodeContents(element);
            return new Set([...text.getClientRects()].map((bounds) => bounds.top)).size;
          }),
      )
      .toBe(1);
    await selectCampusEvents(page);
    await page.locator('#new-event').click();
    await page.locator('#event-record-type').selectOption('prior-reference');
    await page.locator('#event-name').fill('Edital anterior sintético');
    await page.locator('#event-start').fill('2026-12-01');
    await page.locator('#event-end').fill('2026-12-02');
    await page.locator('#event-evidence').fill('Documento sintético de publicação');
    await page.locator('#close-event-panel').click();
    await page.locator('[data-tab="atividades"]').click();
    await page.locator('#activity-search').fill('sem resultado sintético');
    await expect(page.locator('#activity-empty')).toBeVisible();
    await expect(page).toHaveURL(/atividadeBusca=sem/);
    await page.locator('#resume-event').click();
    await expect(page.locator('#event-name')).toHaveValue('Edital anterior sintético');
    await page.locator('#event-form button[type="submit"]').click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.editorTest.record.state.events.find(
              (event) => event.name === 'Edital anterior sintético',
            )?.start,
        ),
      )
      .toBe('2026-12-01');
    await expect(page.locator('#event-list')).toContainText('Referência anterior');
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  });
}

test('typed notices preserve 2026 publication for 2027 and December 2027 for 2028 with a deadline finding', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => {
    const { record } = window.editorTest;
    record.state.schemaVersion = 3;
    record.state.rulesetVersion = 'consup-292-2027-v1';
    record.state.organizationByModality = { integrado: 'anual' };
    record.state.periods = [
      {
        id: 'annual-2027',
        name: 'Ciclo anual sintético',
        start: '2027-02-01',
        end: '2027-12-17',
        association: { status: 'defined', modalities: ['integrado'], term: 'annual' },
      },
    ];
    record.version++;
    return window.publishReviewerCalendar();
  });
  await selectEditorSection(page, 'events');
  await openActivity(page, 'admission-notice-0');
  await page.locator('#event-record-type').selectOption('prior-reference');
  await page.locator('#event-publication-status').selectOption('published');
  await expect(page.locator('#event-admission-year')).toHaveValue('2027');
  await expect(page.locator('#event-admission-period')).toHaveValue('annual-2027');
  await page.locator('#event-start').fill('2026-12-01');
  await page.locator('#event-end').fill('2026-12-01');
  await page.locator('#event-evidence').fill('Publicação sintética de transferência');
  await page.locator('#event-form button[type="submit"]').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.editorTest.record.state.events.find(
            (event) => event.requirementId === 'admission-notice-0',
          )?.start,
      ),
    )
    .toBe('2026-12-01');
  await expect(page.locator('[data-activity-row="admission-notice-0"]')).toContainText(
    'Planejamento completo',
  );
  await page.locator('#close-event-panel').click();
  await openActivity(page, 'regular-admission-notice');
  await expect(page.locator('#event-admission-year')).toHaveValue('2028');
  await page.locator('#event-publication-status').selectOption('published');
  await page.locator('#event-start').fill('2027-12-01');
  await page.locator('#event-end').fill('2027-12-01');
  await page
    .locator('#event-evidence')
    .fill('Publicação sintética em dezembro, sem ajuste documentado');
  await page.locator('#event-form button[type="submit"]').click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.editorTest.record.state.events.find(
            (event) => event.requirementId === 'regular-admission-notice',
          )?.start,
      ),
    )
    .toBe('2027-12-01');
  await expect(page.locator('#event-panel .activity-details')).toContainText(
    /15\/06\/2027|2027-06-15/,
  );
  await page.locator('#close-event-panel').click();
  await selectEditorSection(page, 'issues');
  await expect(page.locator('#issue-list')).toContainText(/prazo|Proens/);
  await page
    .getByRole('link', { name: 'Conferir esta atividade', exact: true })
    .filter({ hasText: 'Conferir' })
    .first()
    .click();
  await expect(page).toHaveURL(/atividade=/);
  const activity = new URL(page.url()).searchParams.get('atividade')!;
  await expect(page.locator(`[data-activity-detail="${activity}"]`)).toHaveAttribute('open', '');
});

test('coverage stays partial per offer while the second record is edited and removed explicitly', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => {
    const { record } = window.editorTest;
    record.modalities = ['integrado', 'subsequente', 'graduacao'];
    record.state.modalities = record.modalities;
    record.state.schemaVersion = 3;
    record.state.rulesetVersion = 'consup-292-2027-v1';
    record.state.organizationByModality = {
      integrado: 'anual',
      subsequente: 'anual',
      graduacao: 'anual',
    };
    record.state.periods = [];
    record.state.events = ['subsequente', 'graduacao'].map((modality, index) => ({
      id: `veterans-${index}`,
      name: `Veteranos ${modality}`,
      start: '2027-02-01',
      end: '2027-02-02',
      kind: 'note',
      evidence: 'Fonte sintética',
      modalities: [modality as 'subsequente' | 'graduacao'],
      requirementId: 'enrolment-0',
    }));
    record.version++;
    return window.publishReviewerCalendar();
  });
  await selectEditorSection(page, 'events');
  await openActivity(page, 'enrolment-0');
  const card = page.locator('#event-panel .activity-details');
  await card.locator('[data-edit-activity-event="veterans-1"]').click();
  await expect(page.locator('#event-name')).toHaveValue('Veteranos graduacao');
  await page.locator('#event-end').fill('2027-02-03');
  await page.locator('#event-form button[type="submit"]').click();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.editorTest.record.state.events.find((event) => event.id === 'veterans-1')?.end,
      ),
    )
    .toBe('2027-02-03');
  expect(
    await page.evaluate(
      () => window.editorTest.record.state.events.find((event) => event.id === 'veterans-0')?.end,
    ),
  ).toBe('2027-02-02');
  await card.locator('[data-remove-event="veterans-1"]').click();
  await expect(card).toContainText('Graduação: Obrigatório · Planejamento pendente');
  await expect(card).toContainText('Técnico subsequente: Obrigatório · Planejamento completo');
  await expect(card).toContainText('Técnico integrado: Opcional');
  await card.locator('[data-prepare-activity="enrolment-0"]').click();
  await expect(page.locator('#event-name')).not.toHaveValue('Veteranos subsequente');
  await expect(page.locator('#event-modalities input[value="integrado"]')).not.toBeChecked();
});

test('URL filters validate invalid input and follow browser history without losing pending form values', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await expect(page.locator('#record-title')).toBeVisible();
  await selectEditorSection(page, 'events');
  await page.evaluate(() => {
    const url = new URL(location.href);
    url.searchParams.set('atividadeOferta', 'invalid-offer');
    url.searchParams.set('atividadeSituacao', 'invalid-status');
    location.href = url.href;
  });
  await expect(page.locator('#activity-modality')).toHaveValue('');
  await expect(page.locator('#activity-status')).toHaveValue('');
  // Invalid filters fall back to the defaults instead of hiding every activity.
  await expect(page.locator('.activity-more-filters > summary')).toHaveText('Mais filtros');
  await expect(page.locator('[data-activity-row]').first()).toBeVisible();
  await selectCampusEvents(page);
  await page.locator('#new-event').click();
  await page.locator('#event-name').fill('Rascunho com filtros');
  await page.locator('#close-event-panel').click();
  await page.locator('[data-tab="atividades"]').click();
  await page.locator('.activity-more-filters > summary').click();
  await page.locator('#activity-subject').selectOption('campus');
  await page.locator('#activity-status').selectOption('optional');
  await expect(page).toHaveURL(/atividadeSituacao=optional/);
  await page.goBack();
  await expect(page.locator('#activity-subject')).toHaveValue('campus');
  await expect(page.locator('#activity-status')).toHaveValue('');
  await expect(page.locator('#event-name')).toHaveValue('Rascunho com filtros');
  await page.goForward();
  await expect(page.locator('#activity-status')).toHaveValue('optional');
  await expect(page.locator('#event-name')).toHaveValue('Rascunho com filtros');
  await selectEditorSection(page, 'issues');
  await selectEditorSection(page, 'events');
  await expect(page.locator('#activity-status')).toHaveValue('optional');
  await expect(page.locator('#event-name')).toHaveValue('Rascunho com filtros');
});

test('ambiguous v2 organization preserves period IDs until explicit offer and cycle classification', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => {
    const { record } = window.editorTest;
    record.state.schemaVersion = 2;
    record.state.regime = 'misto';
    delete record.state.organizationByModality;
    delete record.state.rulesetVersion;
    record.state.periods = [
      {
        id: 'legacy-cycle',
        name: 'Período legado sintético',
        start: '2027-02-01',
        end: '2027-12-17',
      },
    ];
    record.version++;
    return window.publishReviewerCalendar();
  });
  await selectEditorSection(page, 'periods');
  await expect(page.locator('#regime-summary')).toHaveCount(0);
  await expect(page.locator('#periods')).toContainText('associação a conferir');
  await page.locator('[data-edit-organization="integrado"]').click();
  await page.locator('#offer-integrado-source-0').selectOption('legacy-cycle');
  await configureOffer(page, 'integrado', '2027-02-01', '2027-12-17');
  await expect
    .poll(() => page.evaluate(() => window.editorTest.record.state.periods[0].association))
    .toEqual({ status: 'defined', modalities: ['integrado'], term: 'annual' });
  expect(await page.evaluate(() => window.editorTest.record.state.periods[0].id)).toBe(
    'legacy-cycle',
  );
  expect(await page.evaluate(() => window.editorTest.record.state.periods[0].start)).toBe(
    '2027-02-01',
  );
});

test('annual integrated and semester undergraduate offers keep independent overlapping periods and intake settings', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => {
    const { record } = window.editorTest;
    record.modalities = ['integrado', 'graduacao'];
    record.state.modalities = record.modalities;
    record.state.organizationByModality = { integrado: 'anual', graduacao: 'anual' };
    record.state.events = [];
    record.version++;
    return window.publishReviewerCalendar();
  });
  await selectEditorSection(page, 'periods');
  await configureOffer(page, 'integrado', '2027-02-01', '2027-12-17');
  await page.locator('[data-edit-organization="graduacao"]').click();
  await page.locator('#offer-graduacao-organization').selectOption('semestral');
  for (const [index, [start, end]] of [
    ['2027-02-01', '2027-06-30'],
    ['2027-08-02', '2027-12-17'],
  ].entries()) {
    await page.locator(`#offer-graduacao-period-${index}-start`).fill(start);
    await page.locator(`#offer-graduacao-period-${index}-end`).fill(end);
  }
  await page.locator('#offer-graduacao-count').selectOption('2');
  for (const [index, [start, end]] of [
    ['2027-02-01', '2027-06-30'],
    ['2027-08-02', '2027-12-17'],
  ].entries()) {
    await page.locator(`#offer-graduacao-stage-${index}-start`).fill(start);
    await page.locator(`#offer-graduacao-stage-${index}-end`).fill(end);
  }
  await page.locator('#offer-graduacao-apply').click();
  await expect(page.locator('[data-offer="integrado"]')).toContainText('Anual:');
  await expect(page.locator('[data-offer="graduacao"]')).toContainText('1º semestre:');
  await expect(page.locator('[data-offer="graduacao"]')).toContainText('2º semestre:');
  await expect
    .poll(() => page.evaluate(() => window.editorTest.record.state.periods.length))
    .toBe(3);
  await selectEditorSection(page, 'events');
  await openActivity(page, 'registration-2');
  await page.getByText('Exigência por regra local', { exact: true }).click();
  await page.locator('#intake-graduacao-second-required').check();
  await page.locator('#intake-graduacao-second-source').fill('Regra local sintética de ingresso');
  await page.getByRole('button', { name: 'Salvar exigência', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => window.editorTest.record.state.intakeByModality?.graduacao?.second?.required,
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(() => window.editorTest.record.state.intakeByModality?.integrado),
  ).toBeUndefined();
  await page.locator('#close-event-panel').click();
  const details = page.locator('#event-panel .activity-details');
  for (const [activity, text] of [
    ['enrolment-2', 'Graduação: Obrigatório'],
    ['registration-2', 'Graduação: Obrigatório'],
    ['enrolment-0', 'Técnico integrado: Opcional'],
  ]) {
    await openActivity(page, activity);
    await expect(details).toContainText(text);
    await page.locator('#close-event-panel').click();
  }
});
