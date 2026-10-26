import type { Page } from '@playwright/test';
import type * as EditorFixture from '../fixtures/editor-client.ts';

export async function publishBaseUpdate(page: Page, documentsOnly = false) {
  await page.evaluate(async (documentsOnly) => {
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
    if (documentsOnly) record.institutionalSnapshot = structuredClone(record.institutionalEvents);
    record.currentDocuments = [
      {
        id: 'document-update' as (typeof record.currentDocuments)[number]['id'],
        year: 2027,
        type: 'referencia',
        title: 'Orientações atualizadas',
        source: 'PROENS',
        hash: 'b'.repeat(64),
        filename: 'orientacoes.pdf',
        status: 'vigente',
        version: 2,
        createdAt: '2026-10-23T12:00:00Z',
      },
    ];
    record.currentCatalogueRevision = 2;
    publish();
  }, documentsOnly);
}
