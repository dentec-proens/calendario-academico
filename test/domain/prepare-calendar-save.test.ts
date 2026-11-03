import { readCalendarDates } from '../../src/domain/calendar/civil-dates.ts';
import { civilDate } from '../../src/domain/civil-date.ts';
import { expect, test } from 'vitest';
import { normalizeOfferCalendar } from '../../src/domain/calendar/normalization/normalize.ts';
import { calendarContent } from '../../src/domain/calendar/normalization/content.ts';
import { prepareOfferCalendarSave } from '../../src/domain/calendar/prepare-save.ts';
import {
  applyOfferOrganization,
  offerOrganizationDraft,
} from '../../src/domain/calendar/organization/offers.ts';

function calendar() {
  return normalizeOfferCalendar({
    schemaVersion: 5 as const,
    year: 2027,
    campus: 'Campus confirmado',
    weekdays: [],
    weekConfirmed: false,
    periods: [],
    events: [
      {
        id: 'legacy',
        name: 'Registro anterior',
        start: civilDate('2027-03-01'),
        end: civilDate('2027-03-01'),
        effect: 'note' as const,
        // Converted from a v4 date without offers (plan, section 5.3).
        scope: { offers: ['integrado'], confirmed: false },
      },
      {
        id: 'chosen',
        name: 'Registro com ofertas escolhidas',
        start: civilDate('2027-03-02'),
        end: civilDate('2027-03-02'),
        effect: 'note' as const,
        scope: { offers: ['integrado'], confirmed: true },
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
  const previous = normalizeOfferCalendar({
    ...calendar(),
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'classes',
        name: 'Ano',
        start: civilDate('2027-03-01'),
        end: civilDate('2027-03-05'),
        targetDays: 5,
        association: { status: 'defined', offers: ['integrado'], term: 'annual' },
      },
    ],
  });
  const storedContent = calendarContent(previous);
  const holiday = {
    id: 'holiday',
    name: 'Impedimento institucional',
    start: civilDate('2027-03-02'),
    end: civilDate('2027-03-02'),
    effect: 'exclude' as const,
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
    prepareOfferCalendarSave(previous, readCalendarDates(proposed), {
      storedContent: calendarContent(previous),
      catalogue: { events: [] },
      recalculate: false,
    }),
  ).toThrow(TypeError);
});

test('adding an offer neither extends nor confirms any scope and does not mutate either input', () => {
  const previous = calendar();
  const draft = offerOrganizationDraft(previous, 'graduacao');
  draft.organization = 'anual';
  draft.periods[0].start = civilDate('2027-03-01');
  draft.periods[0].end = civilDate('2027-03-26');
  draft.count = '2';
  draft.stages[0].start = civilDate('2027-03-01');
  draft.stages[0].end = civilDate('2027-03-12');
  draft.stages[1].start = civilDate('2027-03-15');
  draft.stages[1].end = civilDate('2027-03-26');
  let sequence = 0;
  const proposed = applyOfferOrganization(
    previous,
    'graduacao',
    draft,
    () => `added-${sequence++}`,
    { id: 'graduacao', kind: 'graduacao', delivery: 'a-conferir', organization: 'a-classificar' },
  );
  const before = structuredClone({ previous, proposed });
  const prepared = prepareOfferCalendarSave(previous, proposed, {
    storedContent: calendarContent(previous),
    catalogue: { events: [] },
    recalculate: false,
  });
  // Every form of scope stays as recorded: same offers, same confirmation (plan, section 5.3).
  for (const id of ['legacy', 'chosen'])
    expect(prepared.state.events.find((event) => event.id === id)?.scope).toEqual(
      previous.events.find((event) => event.id === id)?.scope,
    );
  // A date always lists its offers: an empty scope is refused, never read as every offer.
  expect(() =>
    prepareOfferCalendarSave(
      previous,
      {
        ...proposed,
        events: [
          ...proposed.events,
          { ...previous.events[0], id: 'new-unscoped', scope: { offers: [], confirmed: true } },
        ],
      },
      { storedContent: calendarContent(previous), catalogue: { events: [] }, recalculate: false },
    ),
  ).toThrow('Oferta do registro fora do calendário.');
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
