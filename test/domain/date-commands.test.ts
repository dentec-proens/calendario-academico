import { describe, expect, test } from 'vitest';
import { civilDate } from '../../src/domain/civil-date.ts';
import type { AdmissionDestination, CalendarEvent } from '../../src/domain/calendar/model.ts';
import {
  createCampusDate,
  planActivityDate,
  updateDate,
  type DateInput,
} from '../../src/domain/calendar/commands/events.ts';
import { linksToReview } from '../../src/domain/calendar/activities/links.ts';
import { noticeDestinationIssues } from '../../src/domain/calendar/activities/validation.ts';
import { offerCalendarContent } from '../../src/domain/calendar/normalization/normalize.ts';
import { prepareOfferCalendarSave } from '../../src/domain/calendar/prepare-save.ts';
import { cycleLink, onceLink, rowLink } from '../helpers/activity-links.ts';
import { calendarOffersFixture } from '../fixtures/calendar-offers.ts';
import {
  cascavelDraft,
  ivaiporaDraft,
  type PendingLinksFixture,
} from '../fixtures/pending-links-2027.ts';

/**
 * Date commands: `planActivityDate` takes the link from the context, `createCampusDate` refuses one
 * and `updateDate` keeps the saved one. The save boundary keeps the same contracts on the whole
 * state.
 */
type State = PendingLinksFixture;
type Input = DateInput<State>;

const campusDate = (changes: Partial<Input> = {}): Input => ({
  id: 'campus-meeting',
  name: 'Reunião do campus',
  start: civilDate('2027-05-04'),
  end: civilDate('2027-05-04'),
  effect: 'note',
  category: 'evento',
  scope: { offers: ['integrado'], confirmed: true },
  ...changes,
});

const save = (previous: State, proposed: State) =>
  prepareOfferCalendarSave(previous, proposed, {
    storedContent: offerCalendarContent(previous),
    catalogue: { events: [] },
    recalculate: false,
  });

/** A date carrying a link at runtime, as an untyped caller could send. */
const linked = (date: Input, activity: CalendarEvent['activity']) =>
  ({ ...date, activity }) as unknown as Input;

describe('createCampusDate', () => {
  test('creates a date without activity and is idempotent for the same date', () => {
    const state = ivaiporaDraft();
    const created = createCampusDate(state, campusDate(), []);
    const date = created.events.find((event) => event.id === 'campus-meeting')!;
    expect(date).not.toHaveProperty('activity');
    expect(createCampusDate(created, campusDate(), [])).toBe(created);
  });

  test('refuses an activity, even one the configuration generates', () => {
    const state = ivaiporaDraft();
    for (const activity of [onceLink('family-meeting'), cycleLink('final', 'first')])
      expect(() => createCampusDate(state, linked(campusDate(), activity), [])).toThrow(
        'Uma data do campus não tem atividade vinculada.',
      );
  });
});

describe('planActivityDate', () => {
  test('links the date to the activity of the context', () => {
    const state = ivaiporaDraft();
    const activity = rowLink(state, 'family-meeting');
    const planned = planActivityDate(state, activity, campusDate({ id: 'family' }), []);
    expect(planned.events.find((event) => event.id === 'family')?.activity).toEqual(activity);
  });

  test('requires an activity the current configuration generates', () => {
    const state = cascavelDraft();
    // `final` of the first cycle is not generated while the organization is not classified.
    expect(() =>
      planActivityDate(state, cycleLink('final', 'first'), campusDate({ id: 'final' }), []),
    ).toThrow('Atividade inválida');
  });

  test('the link of the context is not replaced by one the date carries', () => {
    const state = ivaiporaDraft();
    expect(() =>
      planActivityDate(
        state,
        rowLink(state, 'family-meeting'),
        linked(campusDate({ id: 'family' }), onceLink('cultural-week')),
        [],
      ),
    ).toThrow('A atividade da data vem do contexto do preenchimento.');
  });
});

describe('updateDate', () => {
  test('keeps the link of a date without generated activity while its fields change', () => {
    const state = ivaiporaDraft();
    const saved = state.events.find((event) => event.id === 'ivaipora-final-1')!;
    const { activity, ...fields } = saved;
    const updated = updateDate(
      state,
      {
        ...fields,
        name: 'Resultado final revisado',
        start: civilDate('2027-06-23'),
        end: civilDate('2027-06-24'),
      },
      [],
    );
    const date = updated.events.find((event) => event.id === saved.id)!;
    expect(date).toMatchObject({ name: 'Resultado final revisado', start: '2027-06-23' });
    expect(date.activity).toEqual(activity);
    expect(linksToReview({ ...updated, year: 2027 }).get(saved.id)).toBe('not-generated');
  });

  test('never changes the link: swapping is refused and a date of the campus gains none', () => {
    const state = createCampusDate(ivaiporaDraft(), campusDate(), []);
    const saved = state.events.find((event) => event.id === 'ivaipora-final-1')!;
    const { activity: _activity, ...fields } = saved;
    expect(() => updateDate(state, linked(fields, cycleLink('diary', 'first')), [])).toThrow(
      'não perde nem troca',
    );
    expect(() =>
      updateDate(state, linked(campusDate(), rowLink(state, 'family-meeting')), []),
    ).toThrow('não perde nem troca');
    const renamed = updateDate(state, campusDate({ name: 'Reunião do campus revisada' }), []);
    expect(renamed.events.find((event) => event.id === 'campus-meeting')).not.toHaveProperty(
      'activity',
    );
  });

  test('refuses a date that no longer exists', () => {
    expect(() => updateDate(ivaiporaDraft(), campusDate({ id: 'missing' }), [])).toThrow(
      'O evento não existe mais',
    );
  });

  test('keeps an orphan or incompatible destination of a notice, as recorded', () => {
    const destinations: AdmissionDestination[] = [
      { offerId: 'integrado', periodId: 'graduacao-annual' },
      { offerId: 'graduacao', periodId: 'removed' },
    ];
    const state = calendarOffersFixture() as unknown as State;
    state.events.push({
      id: 'transfer-notice',
      name: 'Edital de transferência',
      start: civilDate('2027-01-10'),
      end: civilDate('2027-01-10'),
      effect: 'note',
      category: 'prazo',
      scope: { offers: ['integrado', 'graduacao'], confirmed: true },
      activity: cycleLink('admission-notice', 'annual'),
      notice: {
        publication: 'planned',
        admission: { type: 'transfer', year: 2027, term: 'annual', destinations },
      },
    });
    const { activity: _activity, ...fields } = state.events.at(-1)!;
    const updated = updateDate(state, { ...fields, name: 'Edital revisado' }, []);
    const date = updated.events.find((event) => event.id === 'transfer-notice')!;
    expect(date.notice?.admission?.destinations).toEqual(destinations);
    expect(noticeDestinationIssues(updated, date).map(({ problem }) => problem)).toEqual([
      'unassociated',
      'orphan',
    ]);
    const stored = save(state, updated).state.events.find((event) => event.id === date.id)!;
    expect(stored.notice?.admission?.destinations).toEqual(destinations);
  });
});

describe('the save boundary keeps the contracts of the commands', () => {
  test('a saved date of the campus does not gain an activity by a save', () => {
    const previous = createCampusDate(ivaiporaDraft(), campusDate(), []);
    const activity = rowLink(previous, 'family-meeting');
    const proposed = {
      ...previous,
      events: previous.events.map((event) =>
        event.id === 'campus-meeting' ? { ...event, activity } : event,
      ),
    };
    expect(() => save(previous, proposed)).toThrow(
      'Uma data do campus não passa a ter atividade vinculada',
    );
    // The same date, new, is a planned date of the activity and is accepted.
    const fresh = save(ivaiporaDraft(), proposed).state.events.find(
      (event) => event.id === 'campus-meeting',
    );
    expect(fresh?.activity).toEqual(activity);
  });

  test('a linked date keeps its link and a new date needs a generated activity', () => {
    const previous = cascavelDraft();
    const [first] = previous.events;
    const { activity: _activity, ...unlinked } = first;
    expect(() =>
      save(previous, {
        ...previous,
        events: previous.events.map((event) => (event.id === first.id ? unlinked : event)),
      }),
    ).toThrow('não perde nem troca');
    expect(() =>
      save(previous, { ...previous, events: [...previous.events, { ...first, id: 'copy' }] }),
    ).toThrow('Vínculo de atividade inválido');
  });
});
