import type { Page } from '@playwright/test';
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
  await page.locator('#offer-new-organization').selectOption(organization);
  for (const [index, [start, end]] of periods.entries()) {
    await page.locator(`#offer-new-period-${index}-start`).fill(start);
    await page.locator(`#offer-new-period-${index}-end`).fill(end);
  }
  await page.locator('#offer-new-count').selectOption(String(perTerm));
  const options = await page
    .locator('#offer-new-count option')
    .evaluateAll((items) => items.map((option) => option.getAttribute('value')));
  expect(options).toEqual(organization === 'semestral' ? ['', '1', '2'] : ['', '2', '3', '4']);
  if (organization === 'semestral') {
    await expect(page.locator('#offer-new-form .offer-stage-cycle')).toHaveCount(2);
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
      { id: 'integrado', kind: 'integrado', organization: 'anual', stages: { perTerm: 2 } },
      {
        id: 'graduacao',
        kind: 'graduacao',
        label: 'Licenciatura em Química',
        organization: 'anual',
        stages: { perTerm: 3 },
      },
      {
        id: 'graduacao-2',
        kind: 'graduacao',
        label: 'Engenharia Elétrica',
        organization: 'semestral',
        stages: { perTerm: 2 },
      },
      {
        id: 'graduacao-3',
        kind: 'graduacao',
        label: 'Tecnologia em Análise de Sistemas',
        organization: 'semestral',
        stages: { perTerm: 1 },
      },
    ]);
    expect(
      saved.state.events
        .filter((event) => event.requirementId?.endsWith(':graduacao-2'))
        .map((event) => event.requirementId),
    ).toEqual([
      'stage-1:graduacao-2',
      'stage-2:graduacao-2',
      'stage-3:graduacao-2',
      'stage-4:graduacao-2',
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
    await page.locator('#calendar-scope-graduacao-2').selectOption('own-regulation');
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

  test(`creation keeps repeated offer labels and organizations in the form draft at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const origin = new URL(await fixtureServer('portal')).origin;
    await page.goto(origin + '/calendarios/novo');
    await expect(page.locator('#create-calendar')).toBeVisible();
    await page.locator('#calendar-offer-0-kind').selectOption('graduacao');
    await page.locator('#calendar-offer-0-label').fill('Licenciatura em Química');
    await page.locator('#calendar-add-offer').click();
    await page.locator('#calendar-offer-1-kind').selectOption('graduacao');
    await page.locator('#calendar-offer-1-organization').selectOption('semestral');
    await page.locator('#calendar-offer-1-label').fill('Engenharia Elétrica');
    await page.locator('#calendar-add-offer').click();
    await page.locator('#calendar-offer-2-kind').selectOption('graduacao');
    for (const index of [0, 1, 2])
      await expect(page.locator(`#calendar-offer-${index}-label`)).toHaveAttribute('required', '');
    await page.locator('#calendar-offer-2-label').fill('Tecnologia em Análise de Sistemas');
    if (!(await page.locator('[data-page="accounts"]').isVisible()))
      await page.locator('.sidebar-toggle').click();
    await page.locator('[data-page="accounts"]').click();
    await expect(page.locator('#user-list')).toBeVisible();
    if (!(await page.locator('[data-page="calendars"]').isVisible()))
      await page.locator('.sidebar-toggle').click();
    await page.locator('[data-page="calendars"]').click();
    await page.locator('#calendars .collection-heading button').click();
    await expect(page.locator('#calendar-offer-0-label')).toHaveValue('Licenciatura em Química');
    await expect(page.locator('#calendar-offer-1-label')).toHaveValue('Engenharia Elétrica');
    await expect(page.locator('#calendar-offer-1-organization')).toHaveValue('semestral');
    await expect(page.locator('#calendar-offer-2-label')).toHaveValue(
      'Tecnologia em Análise de Sistemas',
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
