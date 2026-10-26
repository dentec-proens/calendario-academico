import { test, expect } from './test.ts';
import { startFixtureServer } from './fixture-server.ts';
import { selectEditorSection } from './editor-navigation.ts';

for (const width of [1440, 390]) {
  test(`editor respects reduced motion and reveals its section heading at ${width}px`, async ({
    page,
    cleanup,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${await startFixtureServer('editor', cleanup)}?id=synthetic-calendar`);
    await expect(page.locator('#record-title')).toHaveText('2027 — Campus de teste');
    await selectEditorSection(page, 'events');
    const heading = page.locator('#editor-section-title');
    await expect(heading).toHaveText('Atividades e datas do campus');
    const headingVisibility = await heading.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const top = Math.max(0, bounds.top);
      const hit = document.elementFromPoint(
        bounds.left + bounds.width / 2,
        top + bounds.height / 2,
      );
      return { top: bounds.top, visible: hit === element || Boolean(hit && element.contains(hit)) };
    });
    expect(headingVisibility.top).toBeGreaterThanOrEqual(0);
    expect(
      headingVisibility.visible,
      'sticky feedback must not cover the newly selected heading',
    ).toBe(true);

    await page.locator('[data-edit-event="local-event"]').click();
    await expect(page.locator('#event-form')).toBeVisible();
    const positions = await page.evaluate(async () => {
      const samples: number[] = [];
      for (let index = 0; index < 6; index++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        samples.push(scrollY);
      }
      return samples;
    });
    expect(
      new Set(positions).size,
      `reduced motion must not animate scroll: ${positions.join(', ')}`,
    ).toBe(1);
  });
  test(`editor opens the event form heading below its feedback at ${width}px`, async ({
    page,
    cleanup,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${await startFixtureServer('editor', cleanup)}?id=synthetic-calendar`);
    await expect(page.locator('#record-title')).toHaveText('2027 — Campus de teste');
    await selectEditorSection(page, 'events');
    await page.locator('[data-edit-event="local-event"]').click();
    const title = page.locator('#event-form-title');
    await expect(title).toBeInViewport({ ratio: 1 });
    await expect
      .poll(() =>
        title.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const feedback = document.querySelector('.editor-feedback')!.getBoundingClientRect();
          const hit = document.elementFromPoint(
            bounds.left + bounds.width / 2,
            bounds.top + bounds.height / 2,
          );
          return (
            bounds.top >= feedback.bottom &&
            (hit === element || Boolean(hit && element.contains(hit)))
          );
        }),
      )
      .toBe(true);
  });
  test(`editor reserves space after a long status wraps at ${width}px`, async ({
    page,
    cleanup,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${await startFixtureServer('editor', cleanup)}?id=synthetic-calendar`);
    await expect(page.locator('#record-title')).toHaveText('2027 — Campus de teste');
    await selectEditorSection(page, 'events');
    await page.locator('[data-edit-event="local-event"]').click();
    const originalHeight = await page
      .locator('.editor-feedback')
      .evaluate((element) => element.getBoundingClientRect().height);
    const name =
      'Encontro de ensino, pesquisa e extensão com estudantes, familiares e comunidade do campus — preparação do calendário acadêmico';
    await page.locator('#event-name').fill(name);
    await page.locator('#event-confirmed').check();
    await page.getByRole('button', { name: 'Aplicar alterações do evento', exact: true }).click();
    await expect(page.locator('#message')).toContainText(name);
    await expect
      .poll(() =>
        page
          .locator('.editor-feedback')
          .evaluate((element) => element.getBoundingClientRect().height),
      )
      .toBeGreaterThan(originalHeight);
    await selectEditorSection(page, 'periods');
    await expect(page.locator('#editor-section-title')).toHaveText('Períodos letivos');
    await expect
      .poll(() =>
        page.locator('#editor-section-title').evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const feedback = document.querySelector('.editor-feedback')!.getBoundingClientRect();
          const sidebar = document.querySelector('.editor-sidebar')!;
          const sidebarBounds = sidebar.getBoundingClientRect();
          const sidebarClear =
            getComputedStyle(sidebar).position !== 'sticky' || sidebarBounds.top >= feedback.bottom;
          const hit = document.elementFromPoint(
            bounds.left + bounds.width / 2,
            bounds.top + bounds.height / 2,
          );
          return (
            bounds.top >= feedback.bottom &&
            sidebarClear &&
            (hit === element || Boolean(hit && element.contains(hit)))
          );
        }),
      )
      .toBe(true);
  });
  test(`editor reveals period editing and event draft actions below feedback at ${width}px`, async ({
    page,
    cleanup,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${await startFixtureServer('editor', cleanup)}?id=synthetic-calendar`);
    await expect(page.locator('#record-title')).toHaveText('2027 — Campus de teste');
    await selectEditorSection(page, 'periods');
    await page.locator('#period-name').fill('1º semestre');
    await page.locator('#period-start').fill('2027-02-01');
    await page.locator('#period-end').fill('2027-06-30');
    await page.locator('#period-submit').click();
    await expect(page.locator('#period-list')).toContainText('1º semestre');
    await page.locator('[data-edit-period]').click();
    await expect(page.locator('#period-name')).toHaveValue('1º semestre');
    await expect(page.locator('#period-name')).toBeInViewport({ ratio: 1 });
    await expect
      .poll(() =>
        page.locator('#period-name').evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const feedback = document.querySelector('.editor-feedback')!.getBoundingClientRect();
          const hit = document.elementFromPoint(
            bounds.left + bounds.width / 2,
            bounds.top + bounds.height / 2,
          );
          return bounds.top >= feedback.bottom && hit === element;
        }),
      )
      .toBe(true);
    await selectEditorSection(page, 'events');
    await page.locator('[data-edit-event="local-event"]').click();
    await page.locator('#event-name').fill('Rascunho para continuar depois');
    await page.locator('#close-event-form').click();
    await expect(page.locator('#resume-event')).toBeFocused();
    await expect(page.locator('#resume-event')).toBeInViewport({ ratio: 1 });
    await expect
      .poll(() =>
        page.locator('#resume-event').evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const feedback = document.querySelector('.editor-feedback')!.getBoundingClientRect();
          const hit = document.elementFromPoint(
            bounds.left + bounds.width / 2,
            bounds.top + bounds.height / 2,
          );
          return (
            bounds.top >= feedback.bottom &&
            (hit === element || Boolean(hit && element.contains(hit)))
          );
        }),
      )
      .toBe(true);
    await page.locator('#resume-event').click();
    await page.locator('#discard-event-form').click();
    await expect(page.locator('#new-event')).toBeFocused();
    await expect(page.locator('#new-event')).toBeInViewport({ ratio: 1 });
    await expect
      .poll(() =>
        page.locator('#new-event').evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const feedback = document.querySelector('.editor-feedback')!.getBoundingClientRect();
          const hit = document.elementFromPoint(
            bounds.left + bounds.width / 2,
            bounds.top + bounds.height / 2,
          );
          return (
            bounds.top >= feedback.bottom &&
            (hit === element || Boolean(hit && element.contains(hit)))
          );
        }),
      )
      .toBe(true);
    await selectEditorSection(page, 'history');
    await expect(page.locator('#history-file')).toBeVisible();
    // The reference is now an optional disclosure. Opening it keeps focus on
    // its summary; keyboard users reach the PDF input after the existing file actions.
    await expect(page.locator('#open-history')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Consultar PDF original' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('button', { name: 'Identificar datas e atividades' }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#history-file')).toBeFocused();
    await expect(page.locator('#history-file')).toBeInViewport({ ratio: 1 });
  });
}
