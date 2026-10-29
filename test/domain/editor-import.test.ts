import { test } from 'vitest';
import assert from 'node:assert/strict';
import { normalizeOfferCalendar } from '../../src/domain/calendar/normalization/normalize-v4.ts';

function draft() {
  return {
    schemaVersion: 4 as const,
    campus: 'Campus de teste',
    year: 2027,
    weekdays: [1, 2, 3, 4, 5],
    weekEvidence: 'Ata de teste',
    weekConfirmed: true,
    periods: [
      {
        id: 'period',
        name: 'Ano letivo',
        start: '2027-02-01',
        end: '2027-12-10',
        targetDays: 200,
        association: { status: 'defined' as const, offers: ['integrado'], term: 'annual' as const },
      },
    ],
    events: [],
    offers: [
      {
        id: 'integrado',
        kind: 'integrado' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
      },
    ],
  };
}

test('editor imports canonical drafts and preserves day targets', () => {
  const state = normalizeOfferCalendar(draft());
  assert.deepEqual(
    state.offers.map((offer) => offer.id),
    ['integrado'],
  );
  assert.equal('ignoredHistory' in state, false);
  assert.equal(state.offers[0].stages, undefined);
  assert.equal(state.periods[0].targetDays, 200);
});

test('editor rejects legacy files and missing canonical fields without inventing history', () => {
  const legacy: Record<string, unknown> = { ...draft(), schemaVersion: 1 };
  assert.throws(() => normalizeOfferCalendar(legacy), /incompatível/);
  for (const key of ['offers', 'weekdays', 'periods', 'events']) {
    const incomplete: Record<string, unknown> = { ...draft() };
    delete incomplete[key];
    assert.throws(() => normalizeOfferCalendar(incomplete));
  }
  assert.throws(() =>
    normalizeOfferCalendar({
      ...draft(),
      teacherVacations: { julyStart: '2027-07-01', evidence: 'Ata' },
    }),
  );
});

test('editor rejects invalid JSON structures and dates before replacing the current draft', () => {
  for (const value of [
    null,
    {},
    { ...draft(), schemaVersion: 1 },
    { ...draft(), weekdays: [1, 1] },
    {
      ...draft(),
      events: [
        {
          id: 'bad',
          name: 'Data inválida',
          start: '2027-02-30',
          end: '2027-02-30',
          kind: 'note',
          evidence: 'Teste',
        },
      ],
    },
  ]) {
    assert.throws(() => normalizeOfferCalendar(value));
  }
});

test('v4 JSON copies keep events and dates while discarding retired PDF links and decisions', () => {
  const event = {
    id: 'imported',
    name: 'Evento preservado',
    start: '2027-03-10',
    end: '2027-03-10',
    kind: 'note',
    evidence: 'Ata do campus',
    offers: ['integrado'],
  };
  const input = {
    ...draft(),
    ignoredHistory: ['history:candidate'],
    events: [
      { ...event, historicalSource: { historyId: 'retired', page: 1, candidateKey: 'legacy' } },
    ],
  };
  const result = normalizeOfferCalendar(input);
  assert.equal('ignoredHistory' in result, false);
  assert.equal('historicalSource' in result.events[0], false);
  assert.equal(result.events[0].id, event.id);
  assert.equal(result.events[0].name, event.name);
  assert.equal(result.events[0].start, event.start);
  assert.equal(result.events[0].end, event.end);
  assert.equal(Object.hasOwn(result.events[0], 'evidence'), false);
});
