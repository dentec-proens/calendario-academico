import { test, expect } from './test.ts';
import type {} from '../fixtures/editor-client.ts';

const name = (label: string) => `Calendário 2027 - Campus Campus de teste — ${label}`;

test('publishing asks about each other calendar in force and replaces only the chosen ones', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(
    (names) => {
      const { record, replacement } = window.editorTest;
      record.status = 'revisado';
      replacement.suggestedSei = '23411.000001/2026-11';
      replacement.origin = { id: 'annual' as never, name: names.annual, status: 'vigente' };
      replacement.others = [
        {
          id: 'bimonthly' as never,
          name: names.bimonthly,
          offerKinds: ['graduacao'],
          courses: 'Licenciatura em Química',
        },
        {
          id: 'quarterly' as never,
          name: names.quarterly,
          offerKinds: ['integrado', 'subsequente'],
          courses: 'Técnico em Informática',
        },
      ];
      return window.publishReviewerCalendar();
    },
    {
      annual: name('Cursos anuais'),
      bimonthly: name('Cursos bimestrais'),
      quarterly: name('Cursos trimestrais'),
    },
  );
  await page.locator('[data-lifecycle-action="publish"]').click();
  const form = page.getByRole('form', { name: 'Publicar calendário' });
  await expect(form).toContainText(`Substitui ${name('Cursos anuais')}.`);
  const publish = form.getByRole('button', { name: 'Publicar' });
  const bimonthly = form.getByRole('group', { name: name('Cursos bimestrais') });
  const quarterly = form.getByRole('group', { name: name('Cursos trimestrais') });
  await expect(bimonthly).toContainText('Graduação · Licenciatura em Química');
  await expect(quarterly).toContainText(
    'Técnico integrado, Técnico subsequente · Técnico em Informática',
  );
  // No answer comes preselected, and each one is required.
  await expect(form.getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(publish).toBeDisabled();
  await bimonthly.getByLabel('Substituído por este').check();
  await expect(publish).toBeDisabled();
  await quarterly.getByLabel('Continua vigente').check();
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(form).toBeHidden();
  expect(await page.evaluate(() => window.editorTest.calls.lastTransition)).toMatchObject({
    action: 'publish',
    sei: '23411.000001/2026-11',
    replaces: ['bimonthly'],
  });
});

test('publishing a version whose origin was already replaced says by which calendar', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(
    (names) => {
      const { record, replacement } = window.editorTest;
      record.status = 'revisado';
      replacement.suggestedSei = '23411.000001/2026-11';
      replacement.origin = {
        id: 'annual' as never,
        name: names.annual,
        status: 'arquivado',
        successorName: names.bimonthly,
      };
      return window.publishReviewerCalendar();
    },
    {
      annual: name('Cursos anuais'),
      bimonthly: name('Cursos bimestrais'),
    },
  );
  await page.locator('[data-lifecycle-action="publish"]').click();
  const form = page.getByRole('form', { name: 'Publicar calendário' });
  await expect(form).toContainText(
    `A origem, ${name('Cursos anuais')}, já foi substituída por ${name('Cursos bimestrais')}.`,
  );
  await expect(form).toContainText('Nenhum outro calendário vigente neste campus e ano.');
  await form.getByRole('button', { name: 'Publicar' }).click();
  await expect(form).toBeHidden();
  expect(await page.evaluate(() => window.editorTest.calls.lastTransition)).toMatchObject({
    action: 'publish',
    replaces: [],
  });
});
