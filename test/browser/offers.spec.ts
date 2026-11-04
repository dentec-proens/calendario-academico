import type { Page } from '@playwright/test';
import {
  activityKey,
  type ActivityRef,
} from '../../src/domain/calendar/activities/activity-ref.ts';
import { test, expect } from './test.ts';
import { configureOffer, savedState, selectEditorSection } from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

async function addUndergraduateOffer(
  page: Page,
  label: string,
  organization: 'anual' | 'semestral',
  perTerm: number,
  periods: string[][],
  stages: string[][],
) {
  await page.locator('#add-offer').click();
  await page.locator('#offer-new-kind').selectOption('graduacao');
  await page.locator('#offer-new-label').fill(label);
  await page.locator(`#offer-new-organization [data-choice="${organization}"]`).click();
  for (const [index, [start, end]] of periods.entries()) {
    await page.locator(`#offer-new-period-${index}-start`).fill(start);
    await page.locator(`#offer-new-period-${index}-end`).fill(end);
  }
  await page.locator(`#offer-new-count [data-choice="${perTerm}"]`).click();
  const options = await page
    .locator('#offer-new-count [role="radio"]')
    .evaluateAll((items) => items.map((option) => option.getAttribute('data-choice')));
  expect(options).toEqual(organization === 'semestral' ? ['1', '2'] : ['2', '3', '4']);
  if (organization === 'semestral') {
    await expect(page.locator('#offer-new-form .offer-term')).toHaveCount(2);
    await expect(page.locator('#offer-new-form .offer-stage-fields > legend')).toHaveText(
      Array.from(
        { length: 2 * perTerm },
        (_, index) =>
          `${(index % perTerm) + 1}ª etapa — ${Math.floor(index / perTerm) + 1}º semestre`,
      ),
    );
  }
  for (const [index, [start, end]] of stages.entries()) {
    await page.locator(`#offer-new-stage-${index}-start`).fill(start);
    await page.locator(`#offer-new-stage-${index}-end`).fill(end);
  }
  await expect(page.locator('#offer-new-apply')).toBeEnabled();
  await page.locator('#offer-new-apply').click();
  await expect(page.locator('#offer-new-form')).toHaveCount(0);
  return savedState(page);
}

for (const width of [1440, 390]) {
  test(`three undergraduate offers keep independent cycles, scope and URL identity at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#record-title')).toBeVisible();
    await selectEditorSection(page, 'periods');
    await configureOffer(page, 'integrado', '2027-02-01', '2027-12-17');
    await savedState(page);
    await addUndergraduateOffer(
      page,
      'Licenciatura em Química',
      'anual',
      3,
      [['2027-02-01', '2027-12-17']],
      [
        ['2027-02-01', '2027-05-28'],
        ['2027-05-31', '2027-09-17'],
        ['2027-09-20', '2027-12-17'],
      ],
    );
    await addUndergraduateOffer(
      page,
      'Engenharia Elétrica',
      'semestral',
      2,
      [
        ['2027-02-01', '2027-07-09'],
        ['2027-07-26', '2027-12-17'],
      ],
      [
        ['2027-02-01', '2027-04-16'],
        ['2027-04-19', '2027-07-09'],
        ['2027-07-26', '2027-10-01'],
        ['2027-10-04', '2027-12-17'],
      ],
    );
    const saved = await addUndergraduateOffer(
      page,
      'Tecnologia em Análise de Sistemas',
      'semestral',
      1,
      [
        ['2027-02-01', '2027-07-09'],
        ['2027-07-26', '2027-12-17'],
      ],
      [
        ['2027-02-01', '2027-07-09'],
        ['2027-07-26', '2027-12-17'],
      ],
    );
    expect(
      saved.state.offers.map(({ id, kind, label, organization, stages }) => ({
        id,
        kind,
        label,
        organization,
        stages,
      })),
    ).toMatchObject([
      {
        id: 'integrado',
        kind: 'integrado',
        organization: 'anual',
        stages: { status: 'defined', perTerm: 2 },
      },
      {
        id: 'graduacao',
        kind: 'graduacao',
        label: 'Licenciatura em Química',
        organization: 'anual',
        stages: { status: 'defined', perTerm: 3 },
      },
      {
        id: 'graduacao-2',
        kind: 'graduacao',
        label: 'Engenharia Elétrica',
        organization: 'semestral',
        stages: { status: 'defined', perTerm: 2 },
      },
      {
        id: 'graduacao-3',
        kind: 'graduacao',
        label: 'Tecnologia em Análise de Sistemas',
        organization: 'semestral',
        stages: { status: 'defined', perTerm: 1 },
      },
    ]);
    expect(
      saved.state.events
        .filter(
          (event) =>
            event.activity &&
            'offerId' in event.activity &&
            event.activity.offerId === 'graduacao-2',
        )
        .map((event) => event.activity && activityKey(event.activity as ActivityRef)),
    ).toEqual([
      'stage:stage:first:1:graduacao-2',
      'stage:stage:first:2:graduacao-2',
      'stage:stage:second:1:graduacao-2',
      'stage:stage:second:2:graduacao-2',
    ]);
    await expect(page.locator('[data-offer="graduacao-2"]')).toContainText(
      '2 etapas por semestre (4 no ano)',
    );
    await expect(page.locator('[data-offer="graduacao-3"]')).toContainText(
      '1 etapa por semestre (2 no ano)',
    );
    await page.locator('[data-edit-organization="graduacao-2"]').click();
    await page.locator('#offer-graduacao-2-stage-2-start').fill('2027-02-01');
    await page.locator('#offer-graduacao-2-stage-2-end').fill('2027-03-01');
    await expect(page.locator('#offer-graduacao-2-stage-2-error')).toContainText(
      'inteiramente dentro',
    );
    await expect(page.locator('#offer-graduacao-2-apply')).toBeDisabled();
    expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(saved.saves);
    await page.locator('#offer-graduacao-2-cancel').click();
    expect((await savedState(page)).state).toEqual(saved.state);

    await selectEditorSection(page, 'issues');
    // A presencial offer is covered by its delivery mode; the campus changes it for its own norm.
    await expect(page.locator('[data-offer-scope="graduacao-2"]')).toContainText(
      'abrangida pela Resolução 292 (oferta presencial)',
    );
    await page.locator('[data-offer-scope="graduacao-2"] button').click();
    await page.locator('#calendar-scope-graduacao-2 [data-choice="own-regulation"]').click();
    await page.locator('#scope-form-graduacao-2 button[type="submit"]').click();
    const scoped = await savedState(page);
    expect(scoped.state.offers.find((offer) => offer.id === 'graduacao-2')?.scope).toEqual({
      status: 'own-regulation',
    });
    expect(
      scoped.state.offers
        .filter((offer) => offer.id !== 'graduacao-2')
        .every((offer) => !offer.scope),
    ).toBe(true);
    await selectEditorSection(page, 'events');
    await page.locator('.activity-more-filters > summary').click();
    await page.locator('#activity-modality').selectOption('graduacao-2');
    await expect(page).toHaveURL(/atividadeOferta=graduacao-2/);
    await expect(page.locator('#activity-modality')).toHaveValue('graduacao-2');
    await expect(page.locator('#activity-modality option:checked')).toHaveText(
      'Engenharia Elétrica',
    );
    await selectEditorSection(page, 'calendar');
    await expect(page.locator('#months')).toContainText('Licenciatura em Química');
    await expect(page.locator('#months')).toContainText('Engenharia Elétrica');
    await expect(page.locator('#months')).toContainText('Tecnologia em Análise de Sistemas');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

  test(`creation keeps marked offers and organizations in the form draft at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const origin = new URL(await fixtureServer('portal')).origin;
    await page.goto(origin + '/calendarios/novo');
    await expect(page.locator('#create-calendar')).toBeVisible();
    await page.locator('#calendar-offer-integrado').check();
    await page.locator('#calendar-offer-graduacao').check();
    const semestral = page.locator(
      '#calendar-offer-graduacao-organization [data-choice="semestral"]',
    );
    await semestral.click();
    if (!(await page.locator('[data-page="accounts"]').isVisible()))
      await page.locator('.sidebar-toggle').click();
    await page.locator('[data-page="accounts"]').click();
    await expect(page.locator('#user-list')).toBeVisible();
    if (!(await page.locator('[data-page="calendars"]').isVisible()))
      await page.locator('.sidebar-toggle').click();
    await page.locator('[data-page="calendars"]').click();
    await page.locator('#calendars .collection-heading button').click();
    await expect(page.locator('#calendar-offer-integrado')).toBeChecked();
    await expect(page.locator('#calendar-offer-graduacao')).toBeChecked();
    await expect(semestral).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#calendar-offer-summary')).toContainText(
      'Técnico integrado (anual) + Graduação (semestral)',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('a draft removes an offer with its dates after confirmation and keeps the others', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#record-title')).toBeVisible();
  await selectEditorSection(page, 'periods');
  await configureOffer(page, 'integrado', '2027-02-01', '2027-12-17');
  await savedState(page);
  // The last offer of the calendar cannot be removed.
  await page.locator('[data-edit-organization="integrado"]').click();
  await expect(page.locator('#offer-integrado-remove')).toHaveCount(0);
  await page.locator('#offer-integrado-cancel').click();
  await addUndergraduateOffer(
    page,
    'Licenciatura em Química',
    'anual',
    2,
    [['2027-02-01', '2027-12-17']],
    [
      ['2027-02-01', '2027-06-30'],
      ['2027-07-01', '2027-12-17'],
    ],
  );
  await page.locator('[data-edit-organization="graduacao"]').click();
  await page.locator('#offer-graduacao-remove').click();
  const dialog = page.locator('.confirmation-dialog');
  await expect(dialog).toContainText('Remover a oferta Licenciatura em Química?');
  await expect(dialog).toContainText('Período removido: Ano letivo — Licenciatura em Química');
  await expect(dialog).toContainText(
    'Data removida: 1ª etapa de avaliação — Licenciatura em Química',
  );
  await page.locator('.confirmation-dialog__confirm').click();
  await expect(page.locator('[data-offer="graduacao"]')).toHaveCount(0);
  const saved = await savedState(page);
  expect(saved.state.offers.map((offer) => offer.id)).toEqual(['integrado']);
  expect(saved.state.periods.every((period) => !period.id.includes('graduacao'))).toBe(true);
  expect(
    saved.state.events.every(
      (event) =>
        !event.scope.offers.includes('graduacao') &&
        !(event.activity && 'offerId' in event.activity && event.activity.offerId === 'graduacao'),
    ),
  ).toBe(true);
});
