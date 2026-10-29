import { expect, test } from 'vitest';
import { normalizeCalendar } from '../../src/domain/calendar/normalization/normalize.ts';
import { calendarContent } from '../../src/domain/calendar/normalization/content.ts';
import { prepareOfferCalendarSave } from '../../src/domain/calendar/prepare-save.ts';
import {
  applyOfferOrganization,
  offerOrganizationDraft,
} from '../../src/domain/calendar/organization/offers.ts';

function calendar() {
  return normalizeCalendar({
    schemaVersion: 4 as const,
    year: 2027,
    campus: 'Campus confirmado',
    weekdays: [],
    weekConfirmed: false,
    periods: [],
    events: [
      {
        id: 'legacy',
        name: 'Registro anterior',
        start: '2027-03-01',
        end: '2027-03-01',
        kind: 'note',
      },
    ],
    offers: [
      {
        id: 'integrado',
        kind: 'integrado' as const,
        delivery: 'a-conferir' as const,
        organization: 'anual' as const,
      },
    ],
  });
}

test('save preparation preserves record identity and detects unchanged editable content', () => {
  const previous = calendar();
  const proposed = { ...previous, campus: 'Campus enviado pelo cliente' };
  const before = structuredClone(proposed);
  const prepared = prepareOfferCalendarSave(previous, proposed, {
    storedContent: calendarContent(previous),
    catalogue: { events: [] },
    recalculate: false,
  });
  expect(prepared.unchanged).toBe(true);
  expect(prepared.state.campus).toBe('Campus confirmado');
  expect(prepared.content).not.toHaveProperty('campus');
  expect(prepared.content).not.toHaveProperty('year');
  expect(proposed).toEqual(before);
  expect(() =>
    prepareOfferCalendarSave(
      previous,
      { ...previous, year: 2028 },
      { storedContent: {}, catalogue: { events: [] }, recalculate: false },
    ),
  ).toThrow('O ano não pode mudar');
});

test('accepting a changed institutional base recalculates unchanged input and preserves inherited sources', () => {
  const previous = normalizeCalendar({
    ...calendar(),
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'classes',
        name: 'Ano',
        start: '2027-03-01',
        end: '2027-03-05',
        targetDays: 5,
        association: { status: 'defined', offers: ['integrado'], term: 'annual' },
      },
    ],
  });
  const storedContent = calendarContent(previous);
  const holiday = {
    id: 'holiday',
    name: 'Impedimento institucional',
    start: '2027-03-02',
    end: '2027-03-02',
    kind: 'exclude',
    active: true,
    evidence: 'Fonte institucional',
    modalities: ['integrado'],
  };
  const before = structuredClone({ previous, holiday });
  const unchanged = prepareOfferCalendarSave(previous, previous, {
    storedContent,
    catalogue: { events: [] },
    recalculate: true,
  });
  expect(unchanged.unchanged).toBe(true);
  const changed = prepareOfferCalendarSave(previous, previous, {
    storedContent,
    catalogue: { events: [holiday] },
    recalculate: true,
  });
  expect(changed.state.periods[0].end).toBe('2027-03-08');
  expect(changed.unchanged).toBe(false);
  expect(changed.institutionalSnapshot).toEqual([
    { ...holiday, offers: ['integrado'], id: 'inst:holiday', institutional: true },
  ]);
  expect({ previous, holiday }).toEqual(before);
});

test('malformed civil dates remain structural errors rather than being relabelled as recalculation failures', () => {
  const previous = calendar();
  const proposed = { ...previous, events: [{ ...previous.events[0], start: 'data inválida' }] };
  expect(() =>
    prepareOfferCalendarSave(previous, proposed, {
      storedContent: calendarContent(previous),
      catalogue: { events: [] },
      recalculate: false,
    }),
  ).toThrow(TypeError);
});

test('adding an offer does not silently broaden a legacy event and does not mutate either input', () => {
  const previous = calendar();
  const draft = offerOrganizationDraft(previous, 'graduacao');
  draft.organization = 'anual';
  draft.periods[0].start = '2027-03-01';
  draft.periods[0].end = '2027-03-26';
  draft.count = '2';
  draft.stages[0].start = '2027-03-01';
  draft.stages[0].end = '2027-03-12';
  draft.stages[1].start = '2027-03-15';
  draft.stages[1].end = '2027-03-26';
  let sequence = 0;
  const proposed = applyOfferOrganization(
    previous,
    'graduacao',
    draft,
    () => `added-${sequence++}`,
    { id: 'graduacao', kind: 'graduacao', delivery: 'a-conferir', organization: 'a-classificar' },
  );
  proposed.events = proposed.events.map((event) =>
    event.id === 'legacy' ? { ...event, offers: undefined } : event,
  );
  proposed.events.push({ ...previous.events[0], id: 'new-unscoped', offers: undefined });
  const before = structuredClone({ previous, proposed });
  const prepared = prepareOfferCalendarSave(previous, proposed, {
    storedContent: calendarContent(previous),
    catalogue: { events: [] },
    recalculate: false,
  });
  expect(prepared.state.events.find((event) => event.id === 'legacy')?.offers).toEqual([
    'integrado',
  ]);
  expect(
    prepared.state.events.find((event) => event.id === 'new-unscoped')?.offers,
  ).toBeUndefined();
  expect(prepared.state.offers.map((offer) => offer.id)).toEqual(['integrado', 'graduacao']);
  expect(prepared.unchanged).toBe(false);
  expect({ previous, proposed }).toEqual(before);
  expect(() =>
    prepareOfferCalendarSave(
      previous,
      {
        ...previous,
        offers: [
          {
            id: 'graduacao',
            kind: 'graduacao' as const,
            delivery: 'a-conferir' as const,
            organization: 'anual' as const,
          },
        ],
      },
      { storedContent: {}, catalogue: { events: [] }, recalculate: false },
    ),
  ).toThrow('não podem ser removidas');
});
