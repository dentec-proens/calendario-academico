import type { Page } from '@playwright/test';
import { test, expect } from './test.ts';
import { completeForSubmission, selectEditorSection } from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';

const feedbackCalls = (page: Page) =>
  page.evaluate(() => window.editorTest.feedback.calls.map(({ name }) => name));

async function submitCalendar(page: Page) {
  await page.evaluate(() => {
    window.editorTest.feedback.invite = true;
  });
  await expect(page.locator('#record-title')).toBeVisible();
  await completeForSubmission(page);
  await selectEditorSection(page, 'issues');
  await page.locator('[data-lifecycle-action="submit"]').click();
  await page.locator('.confirmation-dialog__confirm').click();
  await page.waitForFunction(() => window.editorTest.record.status === 'enviado');
}

test('after submitting, one click rates and the comment follows, optional', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  await submitCalendar(page);
  const invite = page.locator('#feedback-invite');
  await expect(invite).toHaveAttribute('role', 'status');
  await expect(invite).toContainText('Como foi montar este calendário?');
  const scale = invite.getByRole('group', { name: 'Como foi montar este calendário?' });
  await expect(scale.getByRole('button')).toHaveText([
    'Muito difícil',
    'Difícil',
    'Razoável',
    'Fácil',
    'Muito fácil',
  ]);
  // The invitation does not take the focus from the page.
  await expect(invite.locator(':focus')).toHaveCount(0);

  await scale.getByRole('button', { name: 'Fácil', exact: true }).click();
  await expect(scale.getByRole('button', { name: 'Fácil', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const comment = invite.getByLabel('Obrigado! Quer contar mais? (opcional)');
  await expect(comment).toBeVisible();
  await expect(invite).toContainText('Seu nome acompanha o comentário.');
  await expect(invite.getByRole('button', { name: 'Enviar' })).toBeDisabled();
  await comment.fill('Faltou um atalho para as férias.');
  await invite.getByRole('button', { name: 'Enviar' }).click();
  await expect(invite).toContainText('Obrigado pela contribuição!');
  expect(await page.evaluate(() => window.editorTest.feedback.calls)).toEqual([
    {
      name: 'feedback:openFeedbackPrompt',
      args: expect.objectContaining({ context: 'submit', route: expect.stringMatching(/^\//) }),
    },
    { name: 'feedback:rateFeedback', args: { id: 'feedback-1', rating: 4 } },
    {
      name: 'feedback:commentFeedback',
      args: { id: 'feedback-1', comment: 'Faltou um atalho para as férias.' },
    },
  ]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('an untouched invitation leaves by itself, but not while the pointer is over it', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  await expect(page.locator('#record-title')).toBeVisible();
  // Only the timers started from here on are controlled: the invitation's among them.
  await page.clock.install();
  await submitCalendar(page);
  const invite = page.locator('#feedback-invite');
  await expect(invite).toContainText('Como foi montar este calendário?');
  await invite.locator('.ui-notice').hover();
  await page.clock.fastForward(20_000);
  await expect(invite).toContainText('Como foi montar este calendário?');
  await page.mouse.move(0, 0);
  await page.clock.fastForward(16_000);
  await expect(invite).toBeEmpty();
  // Leaving by itself is ignoring: nothing else is sent.
  expect(await feedbackCalls(page)).toEqual(['feedback:openFeedbackPrompt']);
});

test('closing an unanswered invitation records the refusal', async ({ page, fixtureServer }) => {
  await page.goto(await fixtureServer('editor'));
  await submitCalendar(page);
  const invite = page.locator('#feedback-invite');
  await invite.getByRole('button', { name: 'Fechar aviso' }).click();
  await expect(invite).toBeEmpty();
  expect(await feedbackCalls(page)).toEqual([
    'feedback:openFeedbackPrompt',
    'feedback:dismissFeedback',
  ]);
});

test('Sugestões opens a suggestion in focus, and Escape returns to the button', async ({
  page,
  fixtureServer,
}) => {
  await page.goto(await fixtureServer('editor'));
  const button = page.getByRole('button', { name: 'Sugestões' });
  await button.click();
  const invite = page.locator('#feedback-invite');
  await expect(invite).toContainText('Como está sendo usar o app Calendários Acadêmicos?');
  await expect(invite.getByRole('button', { name: 'Muito difícil' })).toBeFocused();
  // The scale and the comment span the notice: the field and Enviar end where the scale ends.
  const box = async (selector: string) => (await invite.locator(selector).boundingBox())!;
  const [scale, field, send] = await Promise.all([
    box('.feedback-scale'),
    box('textarea'),
    box('button[type="submit"]'),
  ]);
  expect(Math.abs(field.x - scale.x)).toBeLessThan(1);
  expect(Math.abs(field.x + field.width - (scale.x + scale.width))).toBeLessThan(1);
  expect(Math.abs(send.x + send.width - (scale.x + scale.width))).toBeLessThan(1);
  await expect(invite.getByLabel('Comentário (opcional)')).toBeVisible();
  await expect(invite.getByRole('button', { name: 'Enviar' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(invite).toBeEmpty();
  await expect(button).toBeFocused();

  await button.click();
  await invite.getByRole('button', { name: 'Muito fácil' }).click();
  await invite.getByRole('button', { name: 'Enviar' }).click();
  await expect(invite).toContainText('Obrigado pela contribuição!');
  expect(await page.evaluate(() => window.editorTest.feedback.calls)).toEqual([
    {
      name: 'feedback:sendFeedback',
      args: expect.objectContaining({ rating: 5 }),
    },
  ]);
});

for (const width of [1280, 390]) {
  test(`opening the account menu does not move Sugestões at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(await fixtureServer('editor'));
    const button = page.getByRole('button', { name: 'Sugestões' });
    const before = await button.boundingBox();
    await page.locator('#account').click();
    await expect(page.getByRole('menuitem', { name: 'Sair' })).toBeVisible();
    expect(await button.boundingBox()).toEqual(before);
  });
}
