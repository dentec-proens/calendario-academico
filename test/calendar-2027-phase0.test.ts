import { expect, test } from 'vitest';
import { applyEvent } from '../src/calendar-edits/commands.ts';
import { normalizeCalendar } from '../src/calendar-normalize.ts';
import { releaseReadiness } from '../src/release.ts';
import type { ActivityState } from '../src/domain-types.ts';

const state: ActivityState & { ignoredHistory: string[] } = {
  schemaVersion: 2,
  year: 2027,
  campus: 'Campus sintético',
  offer: 'integrado',
  modalities: ['integrado'],
  regime: 'anual',
  weekdays: [1, 2, 3, 4, 5],
  weekConfirmed: true,
  weekEvidence: 'Ata sintética',
  periods: [],
  events: [],
  ignoredHistory: [],
  assessmentStagesByModality: { integrado: 4 },
};

test('2027 integrated calendar is not blocked by veteran enrolment under article 11 V', () => {
  const result = releaseReadiness(
    { id: 'synthetic', state, institutionalSnapshot: [], catalogueRevision: 1 },
    { catalogue: { revision: 1 }, reviews: [] },
  );
  expect(result.issues.filter((issue) => /Rematrícula|Ajuste de matrículas/.test(issue))).toEqual(
    [],
  );
});

test('a documented 2026 occurrence retains its actual dates through the event command and normalizer', () => {
  const event = {
    id: 'previous-notice',
    name: 'Edital sintético de transferência para 2027',
    start: '2026-12-01',
    end: '2026-12-01',
    kind: 'note',
    recordType: 'prior-reference' as const,
    publicationStatus: 'published' as const,
    evidence: 'Documento sintético de publicação',
    modalities: ['integrado'],
  };
  const applied = applyEvent(state, event, []);
  const normalized = normalizeCalendar(applied);
  expect(normalized.events[0]).toMatchObject({ start: '2026-12-01', end: '2026-12-01' });
});
