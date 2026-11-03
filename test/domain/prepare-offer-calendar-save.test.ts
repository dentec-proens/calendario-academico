import { civilDate } from '../../src/domain/civil-date.ts';
import { expect, test } from 'vitest';
import { linkedToRow } from '../helpers/activity-links.ts';
import { isStageActivity } from '../../src/domain/calendar/activities/activity-ref.ts';
import { calendarOffersFixture } from '../fixtures/calendar-offers.ts';
import {
  normalizeOfferCalendar,
  offerCalendarContent,
} from '../../src/domain/calendar/normalization/normalize.ts';
import { prepareOfferCalendarSave } from '../../src/domain/calendar/prepare-save.ts';

const context = (state: ReturnType<typeof calendarOffersFixture>) => ({
  storedContent: offerCalendarContent(state),
  catalogue: { events: [] },
  recalculate: false,
});

test('prepares and recovers independent undergraduate offers without legacy fields', () => {
  const source = calendarOffersFixture();
  const previous = normalizeOfferCalendar(source, source);
  const before = structuredClone(source);
  const prepared = prepareOfferCalendarSave(previous, source, context(previous));
  expect(prepared.unchanged).toBe(true);
  expect(prepared.offerKinds).toEqual(['integrado', 'graduacao']);
  expect(prepared.content).not.toHaveProperty('regime');
  expect(prepared.content).not.toHaveProperty('modalities');
  expect(prepared.content).not.toHaveProperty('campus');
  expect(prepared.content).not.toHaveProperty('assessmentStagesByModality');
  expect(
    normalizeOfferCalendar({ ...prepared.content, year: 2027, campus: source.campus }),
  ).toEqual(previous);
  expect(source).toEqual(before);
});

test('save preserves campus and protects immutable offer identities and kinds', () => {
  const previous = calendarOffersFixture();
  const prepared = prepareOfferCalendarSave(
    previous,
    { ...previous, campus: 'Outro campus' },
    context(previous),
  );
  expect(prepared.state.campus).toBe(previous.campus);
  expect(() =>
    prepareOfferCalendarSave(
      previous,
      { ...previous, offers: previous.offers.slice(1) },
      context(previous),
    ),
  ).toThrow('não podem ser removidas');
  const changed = structuredClone(previous);
  changed.offers[1].kind = 'subsequente';
  expect(() => prepareOfferCalendarSave(previous, changed, context(previous))).toThrow(
    'tipo de uma oferta',
  );
});

test('requires distinct labels for repeated kinds and validates stages per cycle', () => {
  const source = calendarOffersFixture();
  delete source.offers[1].label;
  expect(() => normalizeOfferCalendar(source)).toThrow('nome a cada oferta');
  source.offers[1].label = source.offers[2].label;
  expect(() => normalizeOfferCalendar(source)).toThrow('únicos');
  source.offers[1].label = 'Química';
  source.offers[2].stages = { status: 'defined', perTerm: 3 };
  expect(() => normalizeOfferCalendar(source)).toThrow('duas etapas por semestre');
});

test('saving another field keeps migrated stages in the wrong semester for readiness to flag', () => {
  const source = calendarOffersFixture();
  const event = source.events.find(linkedToRow(source, 'stage-3:graduacao-2'))!;
  event.start = civilDate('2027-05-03');
  event.end = civilDate('2027-06-01');
  const previous = normalizeOfferCalendar(source, source);
  const prepared = prepareOfferCalendarSave(
    previous,
    { ...previous, campus: 'nome ignorado' },
    context(previous),
  );
  expect(prepared.state.events.find((item) => item.id === event.id)?.start).toBe('2027-05-03');
});

test('saving migrated semester stages without a classified count retains their links', () => {
  const source = calendarOffersFixture();
  delete source.offers[2].stages;
  const previous = normalizeOfferCalendar(source, source);
  expect(
    previous.events.filter(
      (event) => isStageActivity(event.activity) && event.activity.offerId === 'graduacao-2',
    ),
  ).toHaveLength(4);
  expect(prepareOfferCalendarSave(previous, previous, context(previous)).content.events).toEqual(
    previous.events,
  );
});
