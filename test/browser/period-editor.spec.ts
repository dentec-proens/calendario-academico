import { test, expect } from './test.ts';
import { addPeriod, savedState, selectEditorSection } from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

for (const width of [1440, 390]) {
  test(`one offer applies periods and stages atomically with immediate bounds feedback at ${width}px`, async ({
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
    expect(before.state.events.filter((e) => e.requirementId?.startsWith('stage-'))).toHaveLength(
      2,
    );
    const opener = page.locator('[data-edit-organization="integrado"]');
    await expect(opener).toBeFocused();
    await opener.press('Enter');
    await expect(page.locator('#offer-integrado-organization')).toBeFocused();
    await expect(page.locator('#offer-integrado-evidence')).toHaveCount(0);
    expect(
      before.state.events
        .filter((event) => event.requirementId?.startsWith('stage-'))
        .every((event) => !Object.hasOwn(event, 'evidence')),
    ).toBe(true);
    const stageBounds = await block.locator('.offer-stage-fields').evaluateAll((elements) =>
      elements.map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      }),
    );
    if (width >= 720) {
      expect(stageBounds[0].y).toBe(stageBounds[1].y);
      expect(stageBounds[0].x + stageBounds[0].width).toBeLessThanOrEqual(stageBounds[1].x);
    } else {
      expect(stageBounds[0].y + stageBounds[0].height).toBeLessThanOrEqual(stageBounds[1].y);
    }
    await page.locator('#offer-integrado-period-0-start').fill('2027-03-08');
    await expect(block.locator('#offer-integrado-stage-0-error')).toContainText(
      'inteiramente dentro',
    );
    await expect(page.locator('#offer-integrado-stage-0-start')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(page.locator('#offer-integrado-apply')).toBeDisabled();
    expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(before.saves);
    expect(await page.evaluate(() => window.editorTest.record.state)).toEqual(before.state);
    await page.locator('#offer-integrado-stage-0-start').fill('2027-03-08');
    await expect(block.locator('#offer-integrado-stage-0-error')).toBeEmpty();
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
    expect(after.state.events.find((e) => e.requirementId === 'stage-1:integrado')?.start).toBe(
      '2027-03-08',
    );
    expect(after.state.events.find((e) => e.requirementId === 'stage-2:integrado')).toEqual(
      before.state.events.find((e) => e.requirementId === 'stage-2:integrado'),
    );
    await opener.click();
    await page.locator('#offer-integrado-period-0-end').fill('2027-04-20');
    await expect(page.locator('#offer-integrado-stage-1-error')).toContainText(
      'inteiramente dentro',
    );
    await selectEditorSection(page, 'events');
    await selectEditorSection(page, 'periods');
    await expect(page.locator('#offer-integrado-period-0-end')).toHaveValue('2027-04-20');
    await expect(page.locator('#offer-integrado-stage-1-error')).toContainText(
      'inteiramente dentro',
    );
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
      offer.stages = { perTerm: 2 };
    });
    record.state.events = ['integrado', 'graduacao'].flatMap((modality) =>
      [0, 1].map((index) => ({
        id: `${modality}-${index}`,
        name: `${index + 1}ª etapa`,
        requirementId: `stage-${index + 1}:${modality}`,
        offers: [modality as 'integrado' | 'graduacao'],
        start: index ? '2027-04-01' : '2027-03-01',
        end: index ? '2027-04-30' : '2027-03-31',
        kind: 'note',
        category: 'limite',
      })),
    );
    record.state.events.push({
      id: 'sat',
      name: 'Sábado do integrado',
      start: '2027-03-06',
      end: '2027-03-06',
      kind: 'include',
      offers: ['integrado'],
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
  expect(saved.events.filter((e) => e.offers?.includes('graduacao'))).toEqual(
    original.events.filter((e) => e.offers?.includes('graduacao')),
  );
  expect(saved.events.find((e) => e.id === 'sat')).toEqual(
    original.events.find((e) => e.id === 'sat'),
  );
});
