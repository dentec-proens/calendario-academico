import { expect, test } from 'vitest';
import { initialCatalogue, preview2027SourceUpdate } from '../src/institution.ts';

test('source update rehearsal is idempotent and preserves locally changed institutional events', () => {
  const current = initialCatalogue().events;
  expect(preview2027SourceUpdate(current)).toEqual({ year: 2027, updates: [], conflicts: [] });
  const legacy = current.map((event) =>
    event.id.startsWith('ifpr2027-')
      ? {
          ...event,
          evidence:
            event.id.endsWith('science') || event.id.endsWith('library')
              ? 'Resolução IFPR 2027 — SEI 4354987, art. 2º'
              : 'Resolução IFPR 2027 — SEI 4354987, arts. 2º e 3º; aprovação confirmada pela solicitante',
        }
      : event,
  );
  const before = structuredClone(legacy);
  const preview = preview2027SourceUpdate(legacy);
  expect(preview.updates).toHaveLength(25);
  expect(preview.conflicts).toEqual([]);
  expect(legacy).toEqual(before);
  const changed = legacy.map((event) =>
    event.id === 'ifpr2027-0' ? { ...event, start: '2027-02-07' } : event,
  );
  const protectedPreview = preview2027SourceUpdate(changed);
  expect(protectedPreview.updates.some((row) => row.id === 'ifpr2027-0')).toBe(false);
  expect(protectedPreview.conflicts).toEqual([
    { id: 'ifpr2027-0', reason: expect.stringContaining('Conteúdo local diferente') },
  ]);
  const adopted = legacy.map((event) => ({
    ...event,
    evidence: preview.updates.find((row) => row.id === event.id)?.after ?? event.evidence,
  }));
  expect(preview2027SourceUpdate(adopted)).toEqual({ year: 2027, updates: [], conflicts: [] });
});
