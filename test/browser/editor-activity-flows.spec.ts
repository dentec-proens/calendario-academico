import type { Page } from '@playwright/test';
import { test, expect } from './test.ts';
import { savedState, selectEditorSection } from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

// Data contracts of the step 6 flows: each test pins what is written, not how the form looks.

async function applyEvent(page: Page) {
  await page.locator('#event-form button[type="submit"]').click();
}

async function savedEvent(page: Page, match: (name: string, id: string) => boolean) {
  const { state } = await savedState(page);
  return state.events.find((event) => match(event.name, event.id));
}

test('a new activity record keeps the prepared link, offer, effect and category', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await selectEditorSection(page, 'events');
  const card = page.locator('[data-activity-row="family-meeting"]');
  const title = (await card.locator('h4').textContent())!.trim();
  await card.locator('[data-prepare-activity="family-meeting"]').click();
  await page.locator('#event-start').fill('2027-05-08');
  await page.locator('#event-end').fill('2027-05-08');
  await page.locator('#event-evidence').fill('Ata da reunião sintética');
  await applyEvent(page);
  await expect
    .poll(() => page.evaluate(() => window.editorTest.record.state.events.length))
    .toBe(3);
  const event = await savedEvent(page, (_, id) => !['local-event', 'activity-event'].includes(id));
  expect(event).toMatchObject({
    name: title,
    requirementId: 'family-meeting',
    kind: 'note',
    category: 'prazo',
    modalities: ['integrado'],
    start: '2027-05-08',
    end: '2027-05-08',
    evidence: 'Ata da reunião sintética',
  });
  expect(event?.recordType ?? 'event').toBe('event');
});

test('editing a linked record that changes the count keeps its effect, category and identity', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => {
    const { record } = window.editorTest;
    record.state.events.push({
      id: 'linked-exclusion',
      name: 'Encontro com recesso',
      requirementId: 'family-meeting',
      start: '2027-05-10',
      end: '2027-05-10',
      kind: 'exclude',
      category: 'recesso',
      evidence: 'Portaria sintética',
      modalities: ['integrado'],
    });
    record.version++;
    return window.publishReviewerCalendar();
  });
  await selectEditorSection(page, 'events');
  const original = await page.evaluate(() =>
    window.editorTest.record.state.events.find((event) => event.id === 'linked-exclusion'),
  );
  await page.locator('[data-edit-activity-event="linked-exclusion"]').click();
  await expect(page.locator('#event-kind')).toHaveValue('exclude');
  await page.locator('#event-evidence').fill('Portaria sintética retificada');
  await applyEvent(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.editorTest.record.state.events.find((event) => event.id === 'linked-exclusion')
            ?.evidence,
      ),
    )
    .toBe('Portaria sintética retificada');
  const event = await savedEvent(page, (_, id) => id === 'linked-exclusion');
  expect(event).toMatchObject({ ...original, evidence: 'Portaria sintética retificada' });
});

test('a free admission notice is registered without an activity link', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await selectEditorSection(page, 'events');
  await page.locator('#new-event').click();
  await page.locator('#event-name').fill('Edital local de transferência');
  await chooseNoticeType(page);
  await page.locator('#event-admission-type').selectOption('transfer');
  await page.locator('#event-publication-status').selectOption('planned');
  await page.locator('#event-admission-year').fill('2027');
  await page.locator('#event-admission-term').selectOption('second');
  await page.locator('#event-start').fill('2027-05-03');
  await page.locator('#event-end').fill('2027-05-07');
  await page.locator('#event-evidence').fill('Edital sintético');
  await applyEvent(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.editorTest.record.state.events.some(
          (event) => event.name === 'Edital local de transferência',
        ),
      ),
    )
    .toBe(true);
  const event = await savedEvent(page, (name) => name === 'Edital local de transferência');
  expect(event).toMatchObject({
    kind: 'note',
    category: 'prazo',
    publicationStatus: 'planned',
    admission: { type: 'transfer', year: 2027, term: 'second' },
  });
  expect(event?.requirementId).toBeUndefined();
});

async function chooseNoticeType(page: Page) {
  await page.locator('#event-type-notice').check();
}

test('activity creation shows the known link as context and keeps it changeable', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await selectEditorSection(page, 'events');
  const card = page.locator('[data-activity-row="family-meeting"]');
  const title = (await card.locator('h4').textContent())!.trim();
  await card.locator('[data-prepare-activity="family-meeting"]').click();
  await expect(page.locator('#event-activity-header')).toContainText('Vinculado a esta atividade');
  await expect(page.locator('#event-activity-header')).not.toContainText(title);
  await expect(page.locator('#event-hours')).toHaveCount(0);
  await expect(page.locator('#event-requirement')).toHaveCount(0);
  await expect(page.locator('#event-record-type')).toHaveCount(0);
  await expect(page.locator('#event-modalities')).toHaveText(/Técnico integrado/);
  await expect(page.locator('#event-modalities input')).toHaveCount(0);
  await expect(page.locator('#event-more-options')).not.toHaveAttribute('open');
  await expect(page.locator('#event-name')).toBeHidden();

  // A field hidden in the collapsed group is revealed when the browser rejects it.
  await page.locator('#event-more-options > summary').click();
  await page.locator('#event-name').fill('');
  await page.locator('#event-more-options > summary').click();
  await page.locator('#event-start').fill('2027-05-08');
  await page.locator('#event-end').fill('2027-05-08');
  await page.locator('#event-evidence').fill('Ata sintética');
  await applyEvent(page);
  await expect(page.locator('#event-more-options')).toHaveAttribute('open', '');
  await expect(page.locator('#event-name')).toBeFocused();
  expect(await page.evaluate(() => window.editorTest.record.state.events.length)).toBe(2);
});

test('changing the activity link keeps the filled values until it is applied or removed', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await selectEditorSection(page, 'events');
  const title = (await page
    .locator('[data-activity-row="family-meeting"] h4')
    .textContent())!.trim();
  await page.locator('[data-prepare-activity="family-meeting"]').click();
  await page.locator('#event-start').fill('2027-06-12');
  await page.locator('#event-end').fill('2027-06-12');
  await page.locator('#event-evidence').fill('Ata de vínculo corrigido');
  await page.locator('#change-event-link').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#event-requirement')).toBeFocused();
  await page.locator('#event-requirement').selectOption('alumni-meeting');
  await expect(page.locator('[data-activity-row="alumni-meeting"] #event-form')).toBeVisible();
  await expect(page.locator('#event-form')).toHaveCount(1);
  await expect(page.locator('#event-start')).toHaveValue('2027-06-12');
  await expect(page.locator('#event-evidence')).toHaveValue('Ata de vínculo corrigido');

  await page.locator('#close-event-form').click();
  await page.locator('#new-event').click();
  await expect(page.locator('#pending-event')).toBeVisible();
  await page.locator('#resume-pending-event').click();
  await expect(page.locator('#event-requirement')).toHaveValue('alumni-meeting');
  await expect(page.locator('#event-end')).toHaveValue('2027-06-12');
  await applyEvent(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.editorTest.record.state.events.find(
            (event) => event.requirementId === 'alumni-meeting',
          )?.evidence,
      ),
    )
    .toBe('Ata de vínculo corrigido');
  const linked = await savedEvent(page, (_, id) => !['local-event', 'activity-event'].includes(id));
  // The description chosen at creation is not replaced by the new activity's name.
  expect(linked).toMatchObject({ name: title, start: '2027-06-12', end: '2027-06-12' });

  await page.locator('#close-event-form').click();
  await page.locator(`[data-edit-activity-event="${linked!.id}"]`).click();
  await page.locator('#event-requirement').selectOption('');
  await applyEvent(page);
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          window.editorTest.record.state.events.find((event) => event.id === id)?.requirementId,
        linked!.id,
      ),
    )
    .toBeUndefined();
  await expect(page.locator('#event-list')).toContainText(title);
  const unlinked = await savedEvent(page, (_, id) => id === linked!.id);
  expect(unlinked).toMatchObject({ ...linked, requirementId: undefined });
});

test('the free event form opens beside its button with a labelled offer group', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => {
    const { record } = window.editorTest;
    record.modalities = record.state.modalities = ['integrado', 'graduacao'];
    record.state.organizationByModality = { integrado: 'anual', graduacao: 'anual' };
    record.state.assessmentStagesByModality = { integrado: 2 };
    record.version++;
    return window.publishReviewerCalendar();
  });
  // A stage belongs to one offer, so its record shows that offer instead of a choice.
  await selectEditorSection(page, 'assessments');
  await page.locator('[data-prepare-activity="stage-1:integrado"]').click();
  await expect(page.locator('#event-modalities')).toHaveText(/Técnico integrado/);
  await expect(page.locator('#event-modalities input')).toHaveCount(0);
  await page.locator('#discard-event-form').click();
  await selectEditorSection(page, 'events');
  await page.locator('#new-event').click();
  await expect(page.locator('#event-creation #event-form')).toBeVisible();
  const offers = page.locator('fieldset#event-modalities');
  await expect(offers.locator(':scope > legend')).toHaveText('Ofertas abrangidas');
  await expect(offers.locator('input')).toHaveCount(2);
  await expect(page.locator('#event-record-type')).toBeVisible();
  await expect(page.locator('#close-event-form')).toHaveText('Fechar');
  await expect(page.locator('#event-form .actions button')).toHaveCount(3);
});

test('a free event asks what it is and the answer sets its effect and category', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await selectEditorSection(page, 'events');
  await page.locator('#new-event').click();
  await expect(page.locator('#event-type > legend')).toHaveText('O que é este evento?');
  await expect(page.locator('#event-kind')).toBeHidden();
  await page.locator('#event-name').fill('Feriado municipal sintético');
  await page.locator('#event-start').fill('2027-06-24');
  await page.locator('#event-end').fill('2027-06-24');
  await page.locator('#event-evidence').fill('Lei municipal sintética');
  // Applying without an answer is rejected by the form itself.
  await applyEvent(page);
  await expect(page.locator('#event-type-holiday')).toBeFocused();
  expect(await page.evaluate(() => window.editorTest.record.state.events.length)).toBe(2);
  await page.locator('#event-type-holiday').check();
  await page.locator('#event-more-options > summary').click();
  await expect(page.locator('#event-kind')).toHaveValue('exclude');
  await expect(page.locator('#event-category')).toHaveValue('feriado');
  await page.locator('#event-type-notice').check();
  await expect(page.locator('#event-admission-type')).toHaveAttribute('required', '');
  await page.locator('#event-type-recess').check();
  await applyEvent(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.editorTest.record.state.events.find(
          (event) => event.name === 'Feriado municipal sintético',
        ),
      ),
    )
    .toMatchObject({ kind: 'exclude', category: 'recesso' });
});

test('a record with a freely combined effect and category shows both fields when edited', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => {
    const { record } = window.editorTest;
    record.state.events.push({
      id: 'free-combination',
      name: 'Formação com efeito livre',
      start: '2027-04-12',
      end: '2027-04-12',
      kind: 'exclude',
      category: 'formacao',
      evidence: 'Portaria sintética',
      modalities: ['integrado'],
    });
    record.version++;
    return window.publishReviewerCalendar();
  });
  await selectEditorSection(page, 'events');
  await page.locator('[data-edit-event="free-combination"]').click();
  await expect(page.locator('#event-type')).toHaveCount(0);
  await expect(page.locator('#event-kind')).toBeVisible();
  await expect(page.locator('#event-kind')).toHaveValue('exclude');
  await expect(page.locator('#event-category')).toHaveValue('formacao');
  await expect(page.locator('#event-list #event-form')).toBeVisible();
});

test('answering another type after a notice keeps its draft but writes no notice data', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
  await selectEditorSection(page, 'events');
  await page.locator('#new-event').click();
  await page.locator('#event-name').fill('Recesso após edital');
  await page.locator('#event-type-notice').check();
  await page.locator('#event-admission-type').selectOption('transfer');
  await page.locator('#event-publication-status').selectOption('planned');
  await page.locator('#event-admission-year').fill('2027');
  await page.locator('#event-type-recess').check();
  await expect(page.locator('#event-admission-type')).toHaveCount(0);
  await page.locator('#event-type-notice').check();
  await expect(page.locator('#event-admission-type')).toHaveValue('transfer');
  await page.locator('#event-type-recess').check();
  await page.locator('#event-start').fill('2027-07-19');
  await page.locator('#event-end').fill('2027-07-23');
  await page.locator('#event-evidence').fill('Portaria sintética de recesso');
  await applyEvent(page);
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.editorTest.record.state.events.some((event) => event.name === 'Recesso após edital'),
      ),
    )
    .toBe(true);
  const event = await savedEvent(page, (name) => name === 'Recesso após edital');
  expect(event).toMatchObject({ kind: 'exclude', category: 'recesso' });
  expect(event?.admission).toBeUndefined();
  expect(event?.publicationStatus).toBeUndefined();
});

for (const width of [1440, 390])
  test(`event type options keep their compact size in a historical draft at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${await fixtureServer('editor')}?id=synthetic-calendar`);
    await expect(page.locator('#record-title')).toBeVisible();
    await selectEditorSection(page, 'history');
    await page.locator('[data-analyze-history="history-a"]').click();
    await page.locator('[data-history-candidate="0"]').click();
    for (const option of await page.locator('#event-type label').all()) {
      const [radio, label] = await Promise.all([
        option.locator('input').boundingBox(),
        option.boundingBox(),
      ]);
      expect(radio!.width).toBeLessThanOrEqual(24);
      expect(label!.x + label!.width).toBeLessThanOrEqual(width);
    }
  });
