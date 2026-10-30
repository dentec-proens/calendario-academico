import { addPeriod, editCampusEvent, selectEditorSection } from './editor-navigation.ts';
import type { Page } from '@playwright/test';
import { test, expect } from './test.ts';
import type {} from '../fixtures/editor-session-client.ts';

async function editAppliedEvent(page: Page, name = 'Evento aplicado sem confirmação') {
  await selectEditorSection(page, 'events');
  await page.locator('[data-tab="eventos"]').click();
  await editCampusEvent(page, 'local-event');
  await page.locator('#event-name').fill(name);
  await page.getByRole('button', { name: 'Aplicar alterações', exact: true }).click();
  await expect(page.locator('#message')).toContainText(name);
}

test.describe('compact Saturday access interruptions', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const reason of ['maintenance', 'expiration'] as const) {
    test(`${reason} leaves the notice reachable and keeps the Saturday draft`, async ({
      page,
      fixtureServer,
    }) => {
      await page.goto(await fixtureServer('editor-session'));
      await expect(page.locator('#record-title')).toBeVisible();
      await addPeriod(page, '2027-03-01', '2027-04-30');
      await selectEditorSection(page, 'days');
      await page.locator('#saturday-dates input[value="2027-03-06"]').check();
      await page.locator('#saturday-open-panel').click();
      await page.locator('#saturday-name').fill('Atividade em preenchimento');
      await page.evaluate((reason) => {
        if (reason === 'maintenance') window.editorSessionTest.maintenance(true);
        else window.editorSessionTest.expire();
      }, reason);
      await expect(page.locator('#editor-access-title')).toBeFocused();
      await expect(page.locator('#editor-access-title')).toBeInViewport();
      await expect(page.locator('dialog#saturday-panel')).toHaveJSProperty('open', false);
      if (reason === 'maintenance') {
        await expect(page.locator('#editor-access-notice').getByRole('button')).toHaveCount(0);
        await page.evaluate(() => window.editorSessionTest.maintenance(false));
      } else {
        await page.locator('#expired-editor-login').click();
        await page.locator('#email').fill('editor@example.invalid');
        await page.locator('#password').fill('synthetic-password');
        await page.locator('#auth-submit').click();
      }
      await expect(page.locator('#editor-access-notice')).toHaveCount(0);
      await expect(page.locator('dialog#saturday-panel')).toHaveJSProperty('open', true);
      await expect(page.locator('#saturday-name')).toBeVisible();
      await expect(page.locator('#saturday-name')).toBeEnabled();
      await expect(page.locator('#saturday-name')).toHaveValue('Atividade em preenchimento');
    });
  }
});

test('portal logout redirects to the access form without an active editor recovery', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor-session'));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.locator('.ui-back-link').click();
  await expect(page.locator('#calendar-list')).toBeVisible();
  await page.locator('#logout').click();
  await expect(page.locator('#account')).toHaveText('Portal PROENS');
  await expect(page.locator('#auth-title')).toHaveText('Entrar');
  await expect(page).toHaveURL(/\/?\?retorno=%2Fcalendarios$/);
});

test('login focuses the destination title instead of announcing the access', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor-session'));
  await page.locator('.ui-back-link').click();
  await expect(page.locator('#calendar-list')).toBeVisible();
  await page.locator('#logout').click();
  await page.locator('#email').fill('editor@example.invalid');
  await page.locator('#password').fill('synthetic-password');
  await page.locator('#auth-submit').click();
  await expect(page.locator('#panel-title')).toBeFocused();
  await expect(page.locator('#message')).toBeEmpty();
});

test('a new login in the same tab protects the editor on its next expiration', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor-session'));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.locator('#logout').click();
  await expect(page.locator('#auth-title')).toHaveText('Entrar');
  await page.locator('#email').fill('editor@example.invalid');
  await page.locator('#password').fill('synthetic-password');
  await page.locator('#auth-submit').click();
  await expect(page.locator('#record-title')).toBeFocused();
  await editAppliedEvent(page, 'Alteração da nova sessão de acesso');
  await page.evaluate(() => window.editorSessionTest.expire());
  await expect(page.locator('#editor-access-notice')).toBeVisible();
  // The applied change stays in the calendar while the expired session closes the panel.
  await expect(page.locator('#event-panel')).toBeHidden();
  await expect(page.locator('#event-list')).toContainText('Alteração da nova sessão de acesso');
});

test('header logout can be cancelled and waits for an in-flight save before sign-out', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor-session'));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => window.editorSessionTest.holdSaves());
  await editAppliedEvent(page);
  await page.locator('#event-name').fill('Campo não aplicado');
  // The side panel is modal; Fechar keeps the unapplied field.
  await page.locator('#close-event-panel').click();
  await page.locator('#logout').click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Os campos ainda não aplicados serão descartados');
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.locator('#event-name')).toHaveValue('Campo não aplicado');
  expect(await page.evaluate(() => window.editorSessionTest.counters.signOuts)).toBe(0);
  await expect
    .poll(() => page.evaluate(() => window.editorSessionTest.counters.saveStarted))
    .toBe(1);
  await page.locator('#logout').click();
  await dialog.getByRole('button', { name: 'Salvar e sair', exact: true }).click();
  await expect(dialog).toContainText('Salvando');
  expect(await page.evaluate(() => window.editorSessionTest.counters.signOuts)).toBe(0);
  await page.evaluate(() => window.editorSessionTest.releaseSaves());
  await expect(page.locator('#auth-title')).toHaveText('Entrar');
  expect(await page.evaluate(() => window.editorSessionTest.counters.signOuts)).toBe(1);
  expect(await page.evaluate(() => window.editorTest.record.state.events[0].name)).toBe(
    'Evento aplicado sem confirmação',
  );
});

test('expired editor offers only reauthentication and preserves applied changes and form drafts', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor-session'));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => window.editorSessionTest.holdSaves());
  await editAppliedEvent(page, 'Evento preservado após expiração');
  await page.locator('#event-name').fill('Rascunho também preservado');
  await expect
    .poll(() => page.evaluate(() => window.editorSessionTest.counters.saveStarted))
    .toBe(1);
  await page.evaluate(() => window.editorSessionTest.expire());
  await expect(page.locator('#editor-access-notice')).toBeVisible();
  await expect(page.locator('#event-name')).toBeDisabled();
  const notice = page.locator('#editor-access-notice');
  await expect(notice.getByRole('heading', { level: 2 })).toHaveText(
    'Entre novamente para continuar',
  );
  await expect(notice.getByRole('button')).toHaveCount(1);
  await expect(notice).toContainText('Mantenha esta aba aberta para preservar suas alterações.');
  await page.locator('#expired-editor-login').click();
  await page.locator('#email').fill('editor@example.invalid');
  await page.locator('#password').fill('synthetic-password');
  await page.locator('#auth-submit').click();
  await expect(page.locator('#editor-access-notice')).toHaveCount(0);
  await expect(page.locator('#record-title')).toBeFocused();
  await expect(page.locator('#event-name')).toHaveValue('Rascunho também preservado');
  await expect(page.locator('#event-name')).toBeEnabled();
  await page.evaluate(() => window.editorSessionTest.releaseSaves());
  await expect
    .poll(() => page.evaluate(() => window.editorTest.record.state.events[0].name))
    .toBe('Evento preservado após expiração');
});

test('expired editor never carries local changes to a different identity', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor-session'));
  await expect(page.locator('#record-title')).toBeVisible();
  await page.evaluate(() => window.editorSessionTest.holdSaves());
  await editAppliedEvent(page, 'Alteração exclusiva da primeira conta');
  await page.evaluate(() => window.editorSessionTest.expire());
  await expect(page.locator('#editor-access-notice')).toBeVisible();
  await page.evaluate(() => window.editorSessionTest.switchUser('another-user', 'PARECERISTA'));
  await expect(page.locator('#editor-access-notice')).toHaveCount(0);
  await expect(page.locator('#event-name')).not.toHaveValue(
    'Alteração exclusiva da primeira conta',
  );
  await expect(page.locator('#event-list')).not.toContainText(
    'Alteração exclusiva da primeira conta',
  );
});

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test.describe(`editor access at ${viewport.width}px`, () => {
    test.use({ viewport });

    test('maintenance pauses editing without actions and resumes the same draft automatically', async ({
      page,
      fixtureServer,
    }) => {
      await page.goto(await fixtureServer('editor-session'));
      await expect(page.locator('#record-title')).toBeVisible();
      await editAppliedEvent(page, 'Evento antes da manutenção');
      await expect
        .poll(() => page.evaluate(() => window.editorTest.record.state.events[0].name))
        .toBe('Evento antes da manutenção');
      await page.locator('#event-name').fill('Campo mantido durante manutenção');
      await page.evaluate(() => window.editorSessionTest.maintenance(true));
      const notice = page.locator('#editor-access-notice');
      await expect(notice.getByRole('heading', { level: 2 })).toHaveText('Portal em manutenção');
      await expect(
        page.getByRole('heading', { name: 'Portal em manutenção', exact: true }),
      ).toHaveCount(1);
      await expect(notice).toContainText('Não feche nem atualize esta página.');
      await expect(notice.getByRole('button')).toHaveCount(0);
      await expect(page.locator('#editor-access-title')).toBeFocused();
      await expect(page.locator('#editor-access-title')).toBeInViewport();
      await expect(page.locator('#event-panel')).toBeHidden();
      await expect(page.locator('#event-name')).toBeDisabled();
      await page.evaluate(() => window.editorSessionTest.maintenance(false));
      await expect(notice).toHaveCount(0);
      await expect(page.locator('#event-name')).toHaveValue('Campo mantido durante manutenção');
      await expect(page.locator('#event-name')).toBeEnabled();
      await expect(page.locator('#event-list')).toContainText('Evento antes da manutenção');
    });

    test('maintenance hides an expired login until completion, then reauthenticates with the keyboard', async ({
      page,
      fixtureServer,
    }) => {
      await page.goto(await fixtureServer('editor-session'));
      await expect(page.locator('#record-title')).toBeVisible();
      await editAppliedEvent(page, 'Evento preservado na manutenção');
      await page.locator('#event-name').fill('Rascunho da manutenção');
      await page.evaluate(() => window.editorSessionTest.expire());
      await page.locator('#expired-editor-login').click();
      await expect(page.locator('#auth')).toBeVisible();
      await page.evaluate(() => window.editorSessionTest.maintenance(true));
      const notice = page.locator('#editor-access-notice');
      await expect(notice.getByRole('heading', { level: 2 })).toHaveText('Portal em manutenção');
      await expect(notice.getByRole('button')).toHaveCount(0);
      await expect(page.locator('#auth')).toHaveCount(0);
      await page.evaluate(() => window.editorSessionTest.maintenance(false));
      await expect(notice.getByRole('heading', { level: 2 })).toHaveText(
        'Entre novamente para continuar',
      );
      await expect(page.locator('#auth')).toBeVisible();
      await expect(page.locator('#editor-access-title')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('#expired-editor-login')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('#email')).toBeFocused();
      await page.keyboard.type('editor@example.invalid');
      await page.keyboard.press('Tab');
      await expect(page.locator('#password')).toBeFocused();
      await page.keyboard.type('synthetic-password');
      await page.keyboard.press('Tab');
      await expect(page.locator('#auth-submit')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(notice).toHaveCount(0);
      await expect(page.locator('#record-title')).toBeFocused();
      await expect(page.locator('#event-name')).toHaveValue('Rascunho da manutenção');
      await expect(page.locator('#event-name')).toBeEnabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });

    test('identity verification asks the user to wait instead of signing in again', async ({
      page,
      fixtureServer,
    }) => {
      await page.goto(await fixtureServer('editor-session'));
      await expect(page.locator('#record-title')).toBeVisible();
      await page.evaluate(() => window.editorSessionTest.bootstrapLoading(true));
      const notice = page.locator('#editor-access-notice');
      await expect(notice.getByRole('heading', { level: 2 })).toHaveText('Verificando seu acesso');
      await expect(notice.getByRole('button')).toHaveCount(0);
      await page.evaluate(() => window.editorSessionTest.bootstrapLoading(false));
      await expect(notice).toHaveCount(0);
      await expect(page.locator('#record-title')).toBeVisible();
    });
  });
}
