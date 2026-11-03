import { describe, expect, test } from 'vitest';
import { civilDate } from '../../src/domain/civil-date.ts';
import { categories } from '../../src/domain/calendar/activities/categories.ts';
import {
  createCampusDate,
  planActivityDate,
  updateDate,
  type DateInput,
} from '../../src/domain/calendar/commands/events.ts';
import {
  canBeInternal,
  internalCategories,
  internalDateIssue,
} from '../../src/domain/calendar/internal-dates.ts';
import { projectDates } from '../../src/domain/calendar/model.ts';
import { compareContents, describeValue, type DiffSide } from '../../src/domain/calendar/diff.ts';
import { readCalendarOfferInput } from '../../src/domain/calendar/normalization/input-v4.ts';
import {
  normalizeOfferCalendar,
  offerCalendarContent,
} from '../../src/domain/calendar/normalization/normalize-v4.ts';
import { prepareOfferCalendarSave } from '../../src/domain/calendar/prepare-save.ts';
import { releaseReadiness } from '../../src/domain/calendar/readiness.ts';
import { reviewSupport } from '../../src/domain/reviews/technical-support.ts';
import { reviewCriteriaFor } from '../../src/domain/reviews/criteria.ts';
import { rulesetVersion } from '../../src/domain/policies/registry.ts';
import { rowLink } from '../helpers/activity-links.ts';
import { ivaiporaDraft, type PendingLinksFixture } from '../fixtures/pending-links-2027.ts';

/**
 * Internal dates (art. 18; plan `docs/plans/2026-11-02-atividades-e-datas.md`, section 4.5; phase
 * 2, step 14): one eligibility rule over the effective category, kept by the commands and the save
 * boundary; marking changes the official document and is never evidence of a review criterion.
 */
type State = PendingLinksFixture;
type Input = DateInput<State>;

const campusDate = (changes: Partial<Input> = {}): Input => ({
  id: 'campus-rehearsal',
  name: 'Ensaio da banda do campus',
  start: civilDate('2027-05-04'),
  end: civilDate('2027-05-06'),
  effect: 'note',
  category: 'evento',
  scope: { offers: ['integrado'], confirmed: true },
  ...changes,
});
const internal = (changes: Partial<Input> = {}) => campusDate({ internal: true, ...changes });

const save = (previous: State, proposed: State) =>
  prepareOfferCalendarSave(previous, proposed, {
    storedContent: offerCalendarContent(previous),
    catalogue: { events: [] },
    recalculate: false,
  });
/** A saved date of the campus, as the form sends it back to `updateDate`. */
const dateOf = (state: State, id = 'campus-rehearsal') =>
  state.events.find((event) => event.id === id)! as Input;

describe('eligibility (single rule over the effective category)', () => {
  test('only the four categories are allowed; holidays, recesses and the others never', () => {
    expect(internalCategories).toEqual(['comemorativo', 'evento', 'institucional', 'prazo']);
    for (const [category] of categories)
      expect(canBeInternal({ effect: 'note', category }), category).toBe(
        internalCategories.includes(category),
      );
  });

  test('a note without category is `institucional` and may be internal; inclusions and exclusions never', () => {
    expect(internalDateIssue({ effect: 'note' })).toBeUndefined();
    expect(internalDateIssue({ effect: 'include' })).toMatch(/sem efeito na contagem/);
    expect(internalDateIssue({ effect: 'exclude', category: 'evento' })).toMatch(
      /sem efeito na contagem/,
    );
    // An invalid stored category falls back to the effect's default, as `eventCategory()` does.
    expect(internalDateIssue({ effect: 'note', category: 'inexistente' })).toBeUndefined();
  });

  test('a date linked to an activity and a date of the institutional base are always official', () => {
    expect(
      internalDateIssue({ effect: 'note', category: 'evento', activity: { activityId: 'x' } }),
    ).toMatch(/vinculada a atividade/);
    const [base] = projectDates(
      [
        {
          id: 'inst:semana',
          name: 'Semana institucional',
          start: civilDate('2027-05-04'),
          end: civilDate('2027-05-04'),
          effect: 'note' as const,
          category: 'evento',
          evidence: 'Base',
        },
      ],
      [],
    );
    expect(internalDateIssue(base)).toMatch(/base institucional/);
  });
});

describe('date commands', () => {
  test('refuse an internal date with effect, in a category out of the list or with an activity', () => {
    const state = ivaiporaDraft();
    expect(() => createCampusDate(state, internal({ effect: 'exclude' }), [])).toThrow(
      /sem efeito na contagem/,
    );
    for (const category of ['feriado', 'recesso', 'ferias', 'limite', 'formacao', 'conselho'])
      expect(() => createCampusDate(state, internal({ category }), []), category).toThrow(
        /Só datas comemorativas, eventos/,
      );
    const activity = rowLink({ ...state, year: 2027 }, 'family-meeting');
    expect(() => planActivityDate(state, activity, internal(), [])).toThrow(
      /vinculada a atividade/,
    );
    const linked = state.events.find((event) => event.activity)!;
    expect(() => updateDate(state, { ...linked, internal: true } as Input, [])).toThrow(
      /vinculada a atividade/,
    );
    expect(() =>
      createCampusDate(state, { ...campusDate(), internal: false } as unknown as Input, []),
    ).toThrow('Visibilidade da data inválida.');
  });

  test('accept a note without category as `institucional`', () => {
    const created = createCampusDate(ivaiporaDraft(), internal({ category: undefined }), []);
    expect(dateOf(created)).toMatchObject({ internal: true });
    expect(dateOf(created).category).toBeUndefined();
  });

  test('marking and unmarking is an ordinary edit that keeps ID, dates and scope', () => {
    const created = createCampusDate(ivaiporaDraft(), campusDate(), []);
    const before = dateOf(created);
    const marked = updateDate(created, { ...before, internal: true }, []);
    const after = dateOf(marked);
    expect(after).toEqual({ ...before, internal: true });
    const unmarked = updateDate(marked, { ...after, internal: undefined }, []);
    expect(dateOf(unmarked)).toMatchObject({
      id: before.id,
      start: before.start,
      end: before.end,
      scope: before.scope,
    });
    expect(dateOf(unmarked).internal).toBeUndefined();
    // Changing the effect of an internal date to one that counts is refused, never unmarked.
    expect(() => updateDate(marked, { ...after, effect: 'exclude' }, [])).toThrow(
      /sem efeito na contagem/,
    );
  });
});

describe('save boundary and JSON copy', () => {
  test('the save keeps the mark and refuses an ineligible one', () => {
    const previous = ivaiporaDraft();
    const proposed = createCampusDate(previous, internal(), []);
    expect(dateOf(save(previous, proposed).state)).toMatchObject({ internal: true });
    const tamper = (change: object) => ({
      ...proposed,
      events: proposed.events.map((event) =>
        event.id === 'campus-rehearsal' ? { ...event, ...change } : event,
      ),
    });
    expect(() => save(previous, tamper({ effect: 'exclude' }))).toThrow(/sem efeito na contagem/);
    expect(() => save(previous, tamper({ category: 'feriado' }))).toThrow(/Só datas comemorativas/);
    const linked = previous.events.find((event) => event.activity)!;
    expect(() =>
      save(previous, {
        ...previous,
        events: previous.events.map((event) =>
          event.id === linked.id ? { ...event, internal: true as const } : event,
        ),
      }),
    ).toThrow(/vinculada a atividade/);
  });

  test('a note without category is accepted as `institucional` after exporting and importing JSON', () => {
    const state = createCampusDate(ivaiporaDraft(), internal({ category: undefined }), []);
    const exported = JSON.parse(
      JSON.stringify({ ...offerCalendarContent(state), year: 2027, campus: 'Ivaiporã' }, null, 2),
    ) as unknown;
    const read = readCalendarOfferInput(exported);
    expect(read.events.find((event) => event.id === 'campus-rehearsal')).toMatchObject({
      internal: true,
      effect: 'note',
    });
    const imported = normalizeOfferCalendar(exported, state);
    expect(dateOf(imported as State)).toMatchObject({
      internal: true,
      category: 'institucional',
    });
    const forged = JSON.parse(JSON.stringify(exported)) as { events: Record<string, unknown>[] };
    forged.events.find((event) => event.id === 'campus-rehearsal')!.internal = 'sim';
    expect(() => readCalendarOfferInput(forged)).toThrow('Visibilidade da data inválida.');
  });
});

describe('comparison of versions and submissions', () => {
  const side = (state: State): DiffSide => ({
    state,
    institutionalSnapshot: [],
    documentSnapshot: [],
    catalogueRevision: 1,
  });

  test('marking or unmarking, as the only change, shows as Visibilidade', () => {
    const official = createCampusDate(ivaiporaDraft(), campusDate(), []);
    const marked = updateDate(official, { ...dateOf(official), internal: true }, []);
    const diff = compareContents(side(official), side(marked));
    expect(diff.campusChanges).toBe(1);
    expect(diff.events).toEqual([
      {
        kind: 'changed',
        id: 'campus-rehearsal',
        name: 'Ensaio da banda do campus',
        fields: [{ field: 'internal', label: 'Visibilidade', before: undefined, after: true }],
      },
    ]);
    const [field] = diff.events[0].fields;
    expect([
      describeValue(field.field, field.before),
      describeValue(field.field, field.after),
    ]).toEqual(['Oficial', 'Interna']);
    const back = compareContents(side(marked), side(official)).events[0].fields[0];
    expect([describeValue(back.field, back.before), describeValue(back.field, back.after)]).toEqual(
      ['Interna', 'Oficial'],
    );
  });
});

describe('review evidence', () => {
  const offers = [
    {
      id: 'integrado',
      kind: 'integrado' as const,
      delivery: 'a-conferir' as const,
      organization: 'anual' as const,
    },
  ];
  const record = (year: number) => ({
    id: 'c',
    name: 'Teste',
    version: 1,
    state: {
      schemaVersion: 5 as const,
      year,
      campus: 'Campus',
      weekdays: [],
      weekConfirmed: false,
      periods: [],
      events: [],
      offers,
    },
  });
  const date = (id: string, name: string, extra: { internal?: true } = {}) => ({
    id,
    name,
    start: civilDate('2027-10-05'),
    end: civilDate('2027-10-05'),
    effect: 'note' as const,
    category: 'evento',
    scope: { offers: ['integrado'], confirmed: true },
    evidence: '',
    ...extra,
  });

  test('an internal date whose name matches a criterion is listed apart, never as candidate', () => {
    const internalOnly = reviewSupport(record(2027), [
      date('rehearsal', 'Ensaio da Semana Cultural', { internal: true }),
    ]).criteria.find((criterion) => criterion.id === 'XXVI')!;
    expect(internalOnly.candidates).toEqual([
      {
        id: 'rehearsal',
        name: 'Ensaio da Semana Cultural',
        start: '2027-10-05',
        end: '2027-10-05',
        evidence: '',
        internal: true,
      },
    ]);
    // In 2027 the signal describes the coverage of the activity, never the internal date.
    expect(internalOnly.signal).not.toMatch(/possivelmente relacionado|Ensaio/);
    expect(internalOnly.initial.finding).toBe('NAO_LOCALIZADO');

    const both = reviewSupport(record(2027), [
      date('rehearsal', 'Ensaio da Semana Cultural', { internal: true }),
      date('week', 'Semana Cultural Interescolar'),
    ]).criteria.find((criterion) => criterion.id === 'XXVI')!;
    expect(both.candidates.map((item) => [item.id, item.internal])).toEqual([
      ['week', undefined],
      ['rehearsal', true],
    ]);
    expect(both.initial.finding).toBe('REGISTROS_LOCALIZADOS');
  });

  test('an internal date never releases the publication by textual evidence', () => {
    // Years without configured policy check textual evidence of each criterion attended.
    const year = 2028;
    const criterion = reviewCriteriaFor(year).find((item) => item.id === 'minutes')!;
    expect(criterion.pattern).toMatch(/codic/);
    const matching = 'Reunião do CODIC';
    const readiness = (extra: { internal?: true }) => {
      const state = {
        ...record(year).state,
        events: [{ ...date('match', matching, extra), start: civilDate(`${year}-03-02`) }],
      };
      const issues = releaseReadiness(
        { id: 'c', version: 1, catalogueRevision: 1, institutionalSnapshot: [], state },
        {
          catalogue: { revision: 1 },
          reviews: [
            {
              calendarId: 'c',
              calendarVersion: 1,
              catalogueRevision: 1,
              rulesetVersion: rulesetVersion(state),
              applicableNorm: 'Norma',
              entries: reviewCriteriaFor(year).map((item) => ({
                id: item.id,
                reviewed: true,
                status: 'ATENDIDO',
                notes: '',
              })),
            },
          ],
        },
      ).issues;
      return issues.filter((issue) =>
        issue.startsWith(`${criterion.item}: ${criterion.title} — nenhum evento com data`),
      );
    };
    expect(readiness({})).toEqual([]);
    expect(readiness({ internal: true })).toHaveLength(1);
  });
});
