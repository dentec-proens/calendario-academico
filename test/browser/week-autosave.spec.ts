import { test, expect } from './test.ts';
import { savedState, selectEditorSection } from './editor-navigation.ts';
import type * as EditorFixture from '../fixtures/editor-client.ts';

for (const width of [1440, 390]) {
  test(`week edits autosave after the last change without continuing at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.install();
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#week-evidence')).toBeVisible();
    await page.clock.pauseAt(new Date());
    await page.clock.runFor(2000);
    expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
    await page.locator('#weekdays input[value="5"]').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('.editor-save-indicator')).toHaveText('Alterações ainda não salvas');
    await page.clock.runFor(1000);
    await page.locator('#week-evidence').fill('Ata atualizada');
    await page.clock.runFor(1499);
    expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
    await page.clock.runFor(1);
    const saved = await savedState(page);
    expect(saved.saves).toBe(1);
    expect(saved.state).toMatchObject({
      weekdays: [1, 2, 3, 4],
      weekEvidence: 'Ata atualizada',
      weekConfirmed: true,
    });
    await expect(page).toHaveURL(/\/editar$/);
    await expect(page.locator('#week-confirmed')).toHaveCount(0);
    await expect(page.locator('#week-evidence')).toBeFocused();
    await selectEditorSection(page, 'periods');
    await selectEditorSection(page, 'edit');
    await expect(page.locator('#week-evidence')).toHaveValue('Ata atualizada');
    await expect(page.locator('#weekdays input[value="5"]')).not.toBeChecked();
  });
}

test('incomplete week stays in the form across navigation and resumes autosave when corrected', async ({
  page,
  fixtureServer,
}) => {
  await page.clock.install();
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#week-evidence')).toBeVisible();
  await page.clock.pauseAt(new Date());
  await page.locator('#week-evidence').fill('   ');
  await page.locator('#weekdays input[value="5"]').uncheck();
  await page.clock.runFor(2000);
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
  await expect(page.locator('#unapplied-status')).toBeVisible();
  await expect(page.locator('#week-form [role="alert"]')).toContainText('Informe a referência');
  await selectEditorSection(page, 'periods');
  await selectEditorSection(page, 'edit');
  await expect(page.locator('#week-evidence')).toHaveValue('   ');
  await expect(page.locator('#weekdays input[value="5"]')).not.toBeChecked();
  await page.locator('#week-evidence').fill('Referência corrigida');
  await page.clock.runFor(1500);
  expect((await savedState(page)).state.weekdays).toEqual([1, 2, 3, 4]);
  await expect(page.locator('#week-form [role="alert"]')).toHaveCount(0);
  await expect(page.locator('#unapplied-status')).toBeHidden();
});

test('server acknowledgements preserve spaces, caret and edits made during a save', async ({
  page,
  fixtureServer,
}) => {
  await page.clock.install();
  await page.goto(await fixtureServer('editor'));
  const evidence = page.locator('#week-evidence');
  await expect(evidence).toBeVisible();
  await page.clock.pauseAt(new Date());
  await evidence.fill('Ata ');
  await page.clock.runFor(1500);
  expect((await savedState(page)).state.weekEvidence).toBe('Ata');
  await expect(evidence).toHaveValue('Ata ');
  await expect(evidence).toBeFocused();
  await page.evaluate(async () => {
    const path = '/test/fixtures/editor-client.ts';
    const { convex } = (await import(path)) as typeof EditorFixture;
    const original = convex.mutation.bind(convex);
    let release: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    convex.mutation = (async (reference, args) => {
      if ('body' in args) {
        convex.mutation = original;
        window.addEventListener('release-week-save', () => release(), { once: true });
        await pending;
      }
      return original(reference, args);
    }) as typeof original;
  });
  await page.keyboard.type('em andamento');
  await page.clock.runFor(1500);
  await expect(page.locator('#autosave-status')).toHaveAttribute('data-state', 'saving');
  await page.keyboard.type(' com complemento');
  await page.clock.runFor(1500);
  await page.evaluate(() => window.dispatchEvent(new Event('release-week-save')));
  await expect(page.locator('#autosave-status')).toHaveAttribute('data-state', 'scheduled');
  await expect(evidence).toHaveValue('Ata em andamento com complemento');
  await page.clock.runFor(1500);
  const saved = await savedState(page);
  expect(saved.state.weekEvidence).toBe('Ata em andamento com complemento');
  expect(saved.saves).toBe(3);
  await expect(evidence).toBeFocused();
});

test('changing weekdays recalculates targets and preserves the draft when periods would overlap', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#week-evidence')).toBeVisible();
  await page.evaluate(async () => {
    const { record } = window.editorTest;
    record.state.organizationByModality = { integrado: 'semestral' };
    record.state.regime = 'semestral';
    record.state.periods = [
      {
        id: 'first',
        name: 'Primeiro período',
        start: '2027-03-01',
        end: '2027-03-05',
        targetDays: 5,
        association: { status: 'defined', modalities: ['integrado'], term: 'first' },
      },
    ];
    record.version++;
    await window.publishReviewerCalendar();
  });
  await expect(page.locator('#record-heading')).toContainText('Versão 2');
  await page.locator('#weekdays input[value="5"]').uncheck();
  expect((await savedState(page)).state.periods[0].end).toBe('2027-03-08');
  await page.locator('#weekdays input[value="5"]').check();
  expect((await savedState(page)).state.periods[0].end).toBe('2027-03-05');
  const version = await page.evaluate(async () => {
    const { record } = window.editorTest;
    record.state.periods.push({
      id: 'second',
      name: 'Segundo período',
      start: '2027-03-08',
      end: '2027-03-12',
      targetDays: 5,
      association: { status: 'defined', modalities: ['integrado'], term: 'second' },
    });
    record.version++;
    await window.publishReviewerCalendar();
    return record.version;
  });
  await expect(page.locator('#record-heading')).toContainText(`Versão ${version}`);
  const before = await savedState(page);
  await page.locator('#weekdays input[value="5"]').uncheck();
  await expect(page.locator('#week-form [role="alert"]')).toContainText('alcança Segundo período');
  await expect(page.locator('#unapplied-status')).toBeVisible();
  await page.locator('#editor-continue').click();
  await expect(page).toHaveURL(/\/editar$/);
  await expect(page.locator('#weekdays input[value="5"]')).not.toBeChecked();
  expect(await page.evaluate(() => window.editorTest.record.state)).toEqual(before.state);
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(before.saves);
  await page.locator('#weekdays input[value="5"]').check();
  await expect(page.locator('#week-form [role="alert"]')).toHaveCount(0);
  await expect(page.locator('#unapplied-status')).toBeHidden();
});

test('reverting a valid change before the debounce clears the pending save indicator', async ({
  page,
  fixtureServer,
}) => {
  await page.clock.install();
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#week-evidence')).toBeVisible();
  await page.clock.pauseAt(new Date());
  const friday = page.locator('#weekdays input[value="5"]');
  await friday.uncheck();
  await friday.check();
  await page.clock.runFor(2000);
  expect(await page.evaluate(() => window.editorTest.calls.saves)).toBe(0);
  await expect(page.locator('.editor-save-indicator')).toHaveText('Alterações salvas');
  await expect(page.locator('#unapplied-status')).toBeHidden();
});
