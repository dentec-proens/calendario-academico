import { test, expect } from './test.ts';
import {
  activityKey,
  type ActivityRef,
} from '../../src/domain/calendar/activities/activity-ref.ts';
import { addPeriod, savedState, selectEditorSection } from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

for (const width of [1440, 390]) {
  test(`one offer applies periods and stages atomically with immediate cycle feedback at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#record-title')).toBeVisible();
    await selectEditorSection(page, 'periods');
    const block = page.locator('[data-offer="integrado"]');
    await expect(block.locator('form')).toBeHidden();
    await expect(page.getByRole('button', { name: /sugerir|recalcular|distribuir/i })).toHaveCount(
      0,
    );
    await addPeriod(page, '2027-03-01', '2027-04-30');
    const before = await savedState(page);
    expect(before.state.events.filter((e) => e.activity?.activityId === 'stage')).toHaveLength(2);
    const opener = page.locator('[data-edit-organization="integrado"]');
    await expect(opener).toBeFocused();
    await opener.press('Enter');
    await expect(page.locator('#offer-integrado-organization [aria-checked="true"]')).toBeFocused();
    expect(
      before.state.events
        .filter((event) => event.activity?.activityId === 'stage')
        .every((event) => !Object.hasOwn(event, 'evidence')),
    ).toBe(true);
    const stageBounds = await block.locator('.offer-stage-fields').evaluateAll((elements) =>
      elements.map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      }),
    );
    // Stages are rows of their term; wide layouts place each row's dates beside its name.
    expect(stageBounds[0].y + stageBounds[0].height).toBeLessThanOrEqual(stageBounds[1].y);
    if (width >= 720) {
      const [legend, start, end] = await Promise.all(
        [
          '.offer-stage-fields >> nth=0 >> legend',
          '#offer-integrado-stage-0-start',
          '#offer-integrado-stage-0-end',
        ].map((selector) => block.locator(selector).boundingBox()),
      );
      expect(start!.y).toBe(end!.y);
      expect(legend!.x + legend!.width).toBeLessThanOrEqual(start!.x);
    }
    // Moving the period never blocks it: the recorded stage left out is previewed to review.
    await page.locator('#offer-integrado-period-0-start').fill('2027-03-08');
    const warnings = page.locator('#offer-integrado-link-warnings');
    await expect(warnings).toContainText('Fora do período do ciclo');
    await expect(block.locator('#offer-integrado-stage-0-error')).toBeEmpty();
    await expect(page.locator('#offer-integrado-apply')).toBeEnabled();
    expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(before.saves);
    expect(await page.evaluate(() => window.editorTest.record.state)).toEqual(before.state);
    // An edited stage is validated: it must fit the new period.
    await page.locator('#offer-integrado-stage-0-start').fill('2027-03-05');
    await expect(block.locator('#offer-integrado-stage-0-error')).toContainText(
      'inteiramente dentro',
    );
    await expect(page.locator('#offer-integrado-apply')).toBeDisabled();
    await page.locator('#offer-integrado-stage-0-start').fill('2027-03-08');
    await expect(block.locator('#offer-integrado-stage-0-error')).toBeEmpty();
    await expect(warnings).toHaveCount(0);
    await page.locator('#offer-integrado-stage-0-start').focus();
    expect(
      await page.locator('#offer-integrado-stage-0-start').evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const hit = document.elementFromPoint(
          bounds.x + bounds.width / 2,
          bounds.y + bounds.height / 2,
        );
        return hit === element;
      }),
    ).toBe(true);

    await expect(page.locator('#offer-integrado-apply')).toBeEnabled();
    await page.locator('#offer-integrado-apply').focus();
    expect(
      await page.locator('#offer-integrado-apply').evaluate((element) => {
        const r = element.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return hit === element || Boolean(hit && element.contains(hit));
      }),
    ).toBe(true);
    await page.locator('#offer-integrado-apply').press('Enter');
    await expect(block.locator('form')).toBeHidden();
    await expect(opener).toBeFocused();
    const after = await savedState(page);
    expect(after.state.periods[0].start).toBe('2027-03-08');
    const stage = (n: number) => (e: { activity?: unknown }) =>
      e.activity !== undefined &&
      activityKey(e.activity as ActivityRef) === `stage:stage:annual:${n}:integrado`;
    expect(after.state.events.find(stage(1))?.start).toBe('2027-03-08');
    expect(after.state.events.find(stage(2))).toEqual(before.state.events.find(stage(2)));
    await opener.click();
    await page.locator('#offer-integrado-period-0-end').fill('2027-04-20');
    await expect(warnings).toContainText('Fora do período do ciclo');
    await selectEditorSection(page, 'events');
    await selectEditorSection(page, 'periods');
    await expect(page.locator('#offer-integrado-period-0-end')).toHaveValue('2027-04-20');
    await expect(warnings).toContainText('Fora do período do ciclo');
    await page.locator('#offer-integrado-cancel').click();
    await expect(opener).toBeFocused();
    expect((await savedState(page)).state).toEqual(after.state);
    await opener.click();
    await expect(page.locator('#offer-integrado-period-0-end')).toHaveValue('2027-04-30');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
}

test('editing one shared offer preserves the other offer and existing inclusions', async ({
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
        id: 'shared',
        name: 'Anual',
        start: '2027-03-01',
        end: '2027-04-30',
        association: { status: 'defined', offers: ['integrado', 'graduacao'], term: 'annual' },
      },
    ];
    record.state.offers.forEach((offer) => {
      offer.stages = { status: 'defined', perTerm: 2 };
    });
    record.state.events = ['integrado', 'graduacao'].flatMap((modality) =>
      [0, 1].map((index) => ({
        id: `${modality}-${index}`,
        name: `${index + 1}ª etapa`,
        activity: {
          activityId: 'stage',
          offerId: modality,
          position: { status: 'defined' as const, term: 'annual' as const, number: index + 1 },
        },
        scope: { offers: [modality as 'integrado' | 'graduacao'], confirmed: true },
        start: index ? '2027-04-01' : '2027-03-01',
        end: index ? '2027-04-30' : '2027-03-31',
        effect: 'note',
        category: 'limite',
      })),
    );
    record.state.events.push({
      id: 'sat',
      name: 'Sábado do integrado',
      start: '2027-03-06',
      end: '2027-03-06',
      effect: 'include',
      scope: { offers: ['integrado'], confirmed: true },
    });
    record.version++;
    await window.publishReviewerCalendar();
  });
  const original = await page.evaluate(() => window.editorTest.record.state);
  await selectEditorSection(page, 'periods');
  await page.locator('[data-edit-organization="integrado"]').click();
  await page.locator('#offer-integrado-period-0-start').fill('2027-03-08');
  await page.locator('#offer-integrado-stage-0-start').fill('2027-03-08');
  await expect(page.locator('[data-offer="integrado"]')).toContainText('Sábado do integrado');
  await expect(page.locator('#offer-integrado-apply')).toBeDisabled();
  await page.locator('#offer-integrado-period-0-start').fill('2027-03-01');
  await page.locator('#offer-integrado-stage-0-start').fill('2027-03-01');
  await page.locator('#offer-integrado-period-0-end').fill('2027-05-07');
  await page.locator('#offer-integrado-stage-1-end').fill('2027-05-07');
  await page.locator('#offer-integrado-apply').click();
  const saved = (await savedState(page)).state;
  expect(saved.periods).toHaveLength(2);
  expect(saved.periods.find((p) => p.id === 'shared')?.association).toEqual({
    status: 'defined',
    offers: ['graduacao'],
    term: 'annual',
  });
  expect(saved.events.filter((e) => e.scope.offers.includes('graduacao'))).toEqual(
    original.events.filter((e) => e.scope.offers.includes('graduacao')),
  );
  expect(saved.events.find((e) => e.id === 'sat')).toEqual(
    original.events.find((e) => e.id === 'sat'),
  );
});
