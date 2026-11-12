import { test } from 'vitest';
import assert from 'node:assert/strict';
import { normalizeOfferCalendar } from '../../src/domain/calendar/normalization/normalize.ts';

function draft() {
  return {
    schemaVersion: 7 as const,
    campus: 'Campus de teste',
    year: 2027,
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'period',
        name: 'Ano letivo',
        start: '2027-02-01',
        end: '2027-12-10',
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

test('the save boundary reads canonical state without inventing offer stages', () => {
  const state = normalizeOfferCalendar(draft());
  assert.deepEqual(
    state.offers.map((offer) => offer.id),
    ['integrado'],
  );
  assert.equal(state.offers[0].stages, undefined);
});

test('the save boundary refuses another format and missing canonical fields', () => {
  const other: Record<string, unknown> = { ...draft(), schemaVersion: 1 };
  assert.throws(() => normalizeOfferCalendar(other), /incompatível/);
  for (const key of ['offers', 'weekdays', 'periods', 'events']) {
    const incomplete: Record<string, unknown> = { ...draft() };
    delete incomplete[key];
    assert.throws(() => normalizeOfferCalendar(incomplete));
  }
});

test('the save boundary refuses invalid structures and dates', () => {
  for (const value of [
    null,
    {},
    { ...draft(), weekdays: [1, 1] },
    {
      ...draft(),
      events: [
        {
          id: 'bad',
          name: 'Data inválida',
          start: '2027-02-30',
          end: '2027-02-30',
          effect: 'note',
        },
      ],
    },
  ]) {
    assert.throws(() => normalizeOfferCalendar(value));
  }
});
