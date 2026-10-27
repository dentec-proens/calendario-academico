import { test, expect } from './test.ts';
import { openActivity, savedState, selectEditorSection } from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

for (const width of [1440, 390]) {
  test(`periods, assessments and contextual requirements work together at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#record-title')).toBeVisible();
    await selectEditorSection(page, 'periods');
    await expect(page.locator('.editor-eyebrow')).toHaveText('Etapa 2 de 6');
    await expect(page.locator('#organization-form, #intake-form, #calendar-scope')).toHaveCount(0);
    await page.locator('#period-name').fill('Ano letivo');
    await page.locator('#period-start').fill('2027-03-01');
    await page.locator('#period-days').fill('20');
    await expect(page.locator('#period-end')).toHaveValue('2027-03-26');
    await page.locator('#period-submit').click();
    await expect(page.locator('#period-list')).toContainText('Ano letivo');
    await page.locator('[data-assessment-modality="integrado"]').selectOption('4');
    await page.getByRole('button', { name: 'Definir etapas', exact: true }).click();
    await page.locator('[data-activity-open="stage-1:integrado"]').click();
    await expect(page.locator('#event-form-title')).toBeFocused();
    await page.locator('#event-start').fill('2027-03-01');
    await page.locator('#event-evidence').fill('Organização pedagógica');
    await page.locator('#apply-stage-suggestion').click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.editorTest.record.state.events.filter((event) =>
              event.requirementId?.startsWith('stage-'),
            ).length,
        ),
      )
      .toBe(4);
    await expect(page.locator('#event-panel')).toBeHidden();
    await expect(page.locator('[data-activity-open="stage-1:integrado"]')).toBeFocused();
    await expect(page.locator('#assessment-checklist [data-activity-open]')).toHaveCount(4);
    await selectEditorSection(page, 'issues');
    await page.locator('#calendar-scope').selectOption('covered');
    await page
      .locator('#calendar-scope-source')
      .fill('PPC sintético: técnico presencial abrangido');
    await page.locator('#scope-form button[type="submit"]').click();
    await expect(page.locator('#scope-summary')).toBeFocused();
    await expect(page.locator('#calendar-scope')).toBeHidden();
    await savedState(page);
    await selectEditorSection(page, 'events');
    await openActivity(page, 'registration-0');
    await page.getByText('Exigência por regra local', { exact: true }).click();
    await page.locator('#intake-integrado-annual-required').check();
    await page.locator('#intake-integrado-annual-source').fill('Regra local de matrícula');
    await page.getByRole('button', { name: 'Salvar exigência', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => window.editorTest.record.state.intakeByModality?.integrado?.annual),
      )
      .toEqual({ status: 'yes', required: true, source: 'Regra local de matrícula' });
    await page.locator('#close-event-panel').click();
    await openActivity(page, 'registration-0');
    await expect(page.locator('#event-panel .activity-details')).toContainText('Obrigatório');
    await page.locator('#close-event-panel').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const origin = new URL(page.url()).origin;
    await page.goto(origin + '/calendarios/synthetic-calendar/avaliacoes');
    await expect(page).toHaveURL(
      origin + '/calendarios/synthetic-calendar/periodos#assessment-area',
    );
    await expect(page.locator('#assessment-heading')).toBeFocused();
    await expect(page.locator('#period-form')).toBeVisible();
  });
}

for (const width of [1440, 390]) {
  test(`browser Back to the legacy assessment destination focuses its block at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const origin = new URL(await fixtureServer('editor')).origin;
    await page.goto(origin + '/calendarios/synthetic-calendar/avaliacoes');
    await expect(page.locator('#assessment-heading')).toBeFocused();
    await selectEditorSection(page, 'events');
    await expect(page.locator('#editor-section-title')).toBeFocused();
    await page.goBack();
    await expect(page).toHaveURL(
      origin + '/calendarios/synthetic-calendar/periodos#assessment-area',
    );
    await expect(page.locator('#assessment-heading')).toBeFocused();
    await expect(page.locator('#assessment-heading')).toBeInViewport({ ratio: 1 });
  });
}

test('a preserved annual intake requirement does not block the current semester period form', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(async () => {
    const { record } = window.editorTest;
    record.state.organizationByModality = { integrado: 'semestral' };
    record.state.regime = 'semestral';
    record.state.intakeByModality = {
      integrado: { annual: { status: 'yes', required: true, source: 'Regra anual preservada' } },
    };
    record.version++;
    await window.publishReviewerCalendar();
  });
  await selectEditorSection(page, 'periods');
  await page.locator('#period-name').fill('Primeiro semestre');
  await page.locator('#period-term').selectOption('first');
  await page.locator('#period-start').fill('2027-02-01');
  await page.locator('#period-end').fill('2027-06-30');
  await page.locator('#period-submit').click();
  await expect(page.locator('#period-list')).toContainText('Primeiro semestre');
  const { state } = await savedState(page);
  expect(state.intakeByModality?.integrado?.annual).toEqual({
    status: 'yes',
    required: true,
    source: 'Regra anual preservada',
  });
});

test('editing a period cannot leave a saved activity linked to another offer', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(async () => {
    const { record } = window.editorTest;
    record.state.modalities = ['integrado', 'graduacao'];
    record.state.regime = 'anual';
    record.state.organizationByModality = { integrado: 'anual', graduacao: 'anual' };
    record.state.periods = (['integrado', 'graduacao'] as const).map((modality) => ({
      id: modality,
      name: modality,
      start: '2027-02-01',
      end: '2027-12-17',
      association: { status: 'defined', modalities: [modality], term: 'annual' },
    }));
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
  await page.locator('[data-edit-period="graduacao"]').click();
  await page.locator('#period-term').selectOption('first');
  await page.locator('#period-end').fill('2027-06-30');
  await page.locator('#period-submit').click();
  await expect(page.locator('#period-form [role="alert"]')).toContainText(
    'Resultado final da graduação',
  );
  expect(
    await page.evaluate(() => window.editorTest.record.state.organizationByModality?.graduacao),
  ).toBe('anual');
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
});
