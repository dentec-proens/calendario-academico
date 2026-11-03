import { test, expect } from './test.ts';

for (const width of [1440, 390]) {
  test(`the review step summarizes, groups and concludes the content issues at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const origin = new URL(await fixtureServer('editor')).origin;
    await page.goto(origin + '/calendarios/synthetic-calendar/pendencias');
    const summary = page.locator('#review-summary');
    await expect(summary).toBeVisible();

    // The summary, the menu and the listed rows count the same content issues.
    const title = (await summary.locator('h3').textContent())!;
    const count = Number(title.match(/^(\d+) pendências/)![1]);
    await expect(page.locator('#issue-list .issue-item')).toHaveCount(count);
    await expect(page.locator('[data-view="issues"] .editor-step-note')).toHaveAttribute(
      'data-issue-count',
      String(count),
    );
    // Reminders the campus confirms by itself are listed apart and never counted.
    await expect(page.locator('#review-reminders li')).toHaveCount(2);
    await expect(page.locator('#issue-list')).not.toContainText('Feriados municipais');

    // A pending norm is a decision on the step; once confirmed it becomes one line.
    await page.locator('#calendar-scope-integrado [data-choice="covered"]').click();
    await page.locator('#scope-form-integrado button[type="submit"]').click();
    const confirmed = page.locator('[data-offer-scope="integrado"]');
    await expect(confirmed).toContainText('abrangida pela');
    await expect(confirmed.getByRole('button', { name: 'Alterar' })).toBeVisible();
    await expect(page.locator('#issue-list [data-issue="scope"]')).toHaveCount(0);

    // The step ends in the submission, as the other steps end in Continue.
    await expect(page.locator('[data-lifecycle-footer-action="submit"]')).toHaveText(
      'Enviar para análise',
    );
    // An activity row leads to that activity in the Activities step.
    await page.locator('#review-group-activities a.review-row').first().click();
    await expect(page).toHaveURL(/\/atividades\?.*atividade=/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
