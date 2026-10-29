import { expect, test } from 'vitest';
import { applyEvent } from '../../src/domain/calendar/commands/events.ts';
import { normalizeOfferCalendar } from '../../src/domain/calendar/normalization/normalize-v4.ts';
import { releaseReadiness } from '../../src/domain/calendar/readiness.ts';
import type { ActivityState } from '../../src/domain/calendar/model.ts';

const state: ActivityState & { ignoredHistory: string[] } = {
  schemaVersion: 4 as const,
  year: 2027,
  campus: 'Campus sintético',
  weekdays: [1, 2, 3, 4, 5],
  weekConfirmed: true,
  periods: [],
  events: [],
  ignoredHistory: [],
  offers: [
    {
      id: 'integrado',
      kind: 'integrado' as const,
      delivery: 'a-conferir' as const,
      organization: 'anual' as const,
      stages: { perTerm: 4 },
    },
  ],
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

test('2027 family meeting is pending only for the integrated offer', () => {
  const familyIssues = (modalities: string[]) =>
    releaseReadiness(
      {
        id: 'synthetic',
        state: {
          ...state,
          offers: modalities.map((kind) => ({
            id: kind,
            kind: kind as 'integrado' | 'subsequente' | 'graduacao' | 'posgraduacao',
            delivery: 'a-conferir' as const,
            organization: 'anual' as const,
            stages:
              Object.fromEntries(modalities.map((m) => [m, 2]))[kind] === undefined
                ? undefined
                : {
                    perTerm: Number(Object.fromEntries(modalities.map((m) => [m, 2]))[kind]) / 1,
                  },
          })),
        },
        institutionalSnapshot: [],
        catalogueRevision: 1,
      },
      { catalogue: { revision: 1 }, reviews: [] },
    ).issues.filter((issue) => issue.includes('Reunião com familiares'));
  expect(familyIssues(['subsequente', 'graduacao'])).toEqual([]);
  expect(familyIssues(['integrado', 'subsequente'])).toEqual([
    expect.stringMatching(/^Técnico integrado — Reunião com familiares.*vincule um evento/),
  ]);
});

test('a documented 2026 occurrence retains its actual dates through the event command and normalizer', () => {
  const event = {
    id: 'previous-notice',
    name: 'Edital sintético de transferência para 2027',
    start: '2026-12-01',
    end: '2026-12-01',
    kind: 'note',
    publicationStatus: 'published' as const,
    offers: ['integrado'],
  };
  const applied = applyEvent(state, event, []);
  const normalized = normalizeOfferCalendar(applied);
  expect(normalized.events[0]).toMatchObject({ start: '2026-12-01', end: '2026-12-01' });
});
