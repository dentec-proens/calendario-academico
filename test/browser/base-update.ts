import type { Page } from '@playwright/test';
import type * as EditorFixture from '../fixtures/editor-client.ts';

export async function publishBaseUpdate(page: Page) {
  await page.evaluate(async () => {
    const modulePath = '/test/fixtures/editor-client.ts';
    const { record, publish } = (await import(modulePath)) as typeof EditorFixture;
    const original = structuredClone(record.institutionalEvents[0]!);
    record.institutionalSnapshot = [
      original,
      { ...original, id: 'removed-event', name: 'Recesso removido' },
    ];
    record.institutionalEvents = [
      { ...original, start: '2027-10-14', end: '2027-10-14', evidence: 'Portaria atualizada' },
      { ...original, id: 'added-event', name: 'Encontro institucional' },
    ];
    record.currentCatalogueRevision = 2;
    publish();
  });
}
