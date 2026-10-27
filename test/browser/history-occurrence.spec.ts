import { test, expect } from './test.ts';
import {
  selectEditorSection,
  selectCampusEvents,
  savedState,
  editCampusEvent,
} from './editor-navigation.ts';
import type {} from '../fixtures/editor-client.ts';
import type { Id } from '../../convex/_generated/dataModel.js';

for (const width of [1440, 390]) {
  test(`saved historical provenance survives a campus event edit at ${width}px`, async ({
    page,
    fixtureServer,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(await fixtureServer('editor'));
    await expect(page.locator('#record-title')).toBeVisible();
    const before = await page.evaluate(async () => {
      const event = window.editorTest.record.state.events[0];
      event.historicalSource = {
        historyId: 'history-a' as Id<'histories'>,
        page: 1,
        candidateKey: 'legacy-candidate',
      };
      window.editorTest.record.version++;
      await window.publishReviewerCalendar();
      return event.historicalSource;
    });
    await selectEditorSection(page, 'events');
    await selectCampusEvents(page);
    await editCampusEvent(page, 'local-event');
    await expect(page.locator('#historical-event-source')).toContainText('página 1');
    await page.locator('#event-name').fill('Evento atualizado pelo campus');
    await page.locator('#event-form button[type="submit"]').click();
    const { state } = await savedState(page);
    expect(state.events.find((event) => event.id === 'local-event')?.historicalSource).toEqual(
      before,
    );
    expect(state.events.find((event) => event.id === 'local-event')?.name).toBe(
      'Evento atualizado pelo campus',
    );
  });
}
