import { describe, expect, test } from 'vitest';
import { civilDate } from '../../src/domain/civil-date.ts';
import type { CalendarEvent } from '../../src/domain/calendar/model.ts';
import {
  createCampusDate,
  planActivityDate,
  updateDate,
  type DateInput,
} from '../../src/domain/calendar/commands/events.ts';
import {
  schoolDayIssue,
  schoolDayNature,
} from '../../src/domain/calendar/activities/school-day.ts';
import { evaluatePlan } from '../../src/domain/calendar/activities/plan-evaluation.ts';
import { contentAssessment } from '../../src/domain/calendar/readiness.ts';
import { offerCalendarContent } from '../../src/domain/calendar/normalization/normalize.ts';
import { prepareOfferCalendarSave } from '../../src/domain/calendar/prepare-save.ts';
import { cycleLink, onceLink, rowLink } from '../helpers/activity-links.ts';
import {
  ivaiporaAnnual,
  stagePositionsToConfirm,
  type PendingLinksFixture,
} from '../fixtures/pending-links-2027.ts';
import {
  applyOfferOrganization,
  offerOrganizationDraft,
  organizationDraftStages,
} from '../../src/domain/calendar/organization/offers.ts';

/**
 * Art. 5º of Resolução 292: a date without students' participation never adds a day to the count.
 * New or edited dates are refused; saved ones stay as a blocking readiness issue.
 */
type State = PendingLinksFixture;
type Input = DateInput<State>;

const saturday = civilDate('2027-05-08');
const tuesday = civilDate('2027-05-04');

const date = (changes: Partial<Input> = {}): Input => ({
  id: 'council',
  name: 'Conselho de classe',
  start: tuesday,
  end: tuesday,
  effect: 'note',
  category: 'conselho',
  scope: { offers: ['integrado'], confirmed: true },
  ...changes,
});

const save = (previous: State, proposed: State) =>
  prepareOfferCalendarSave(previous, proposed, {
    storedContent: offerCalendarContent(previous),
    catalogue: { events: [] },
    recalculate: false,
  });

/** A saved date as an earlier version stored it, before the rule existed. */
const stored = (state: State, event: CalendarEvent): State => ({
  ...state,
  events: [...state.events, event],
});

const legacyMeeting = (state: State, id = 'family'): CalendarEvent => ({
  ...date({ id, name: 'Reunião com responsáveis', category: 'evento' }),
  start: saturday,
  end: saturday,
  effect: 'include',
  activity: rowLink(state, 'family-meeting'),
});

describe('schoolDayNature', () => {
  test('classifies the activities of the 2027 policy and leaves other years alone', () => {
    const nature = (activityId: string) =>
      schoolDayNature(2027, { activity: onceLink(activityId), effect: 'note' });
    for (const id of ['campus-events', 'robotics', 'cultural-week'])
      expect(nature(id), id).toBe('school-day');
    for (const id of [
      'family-meeting',
      'alumni-meeting',
      'pedagogical-training',
      'collective-planning',
    ])
      expect(nature(id), id).toBe('meeting');
    expect(nature('regular-admission-notice')).toBe('deadline');
    expect(schoolDayNature(2027, { activity: cycleLink('diary', 'first'), effect: 'note' })).toBe(
      'deadline',
    );
    expect(schoolDayNature(2027, { category: 'conselho', effect: 'include' })).toBe('meeting');
    expect(schoolDayNature(2027, { category: 'evento', effect: 'include' })).toBeUndefined();
    expect(
      schoolDayNature(2028, { activity: onceLink('family-meeting'), effect: 'include' }),
    ).toBeUndefined();
  });
});

describe('schoolDayIssue', () => {
  test('refuses only include, citing the basis, and only for offers under the norm', () => {
    const state = ivaiporaAnnual();
    const meeting = { ...date(), activity: onceLink('family-meeting') };
    expect(schoolDayIssue(state, { ...meeting, effect: 'include' })).toContain(
      'Art. 5º, parágrafo único',
    );
    expect(schoolDayIssue(state, meeting)).toBeUndefined();
    expect(schoolDayIssue(state, { ...meeting, effect: 'exclude' })).toBeUndefined();
    expect(
      schoolDayIssue(state, {
        ...meeting,
        activity: onceLink('campus-events'),
        effect: 'include',
      }),
    ).toBeUndefined();
    // The advice follows the day: classes to keep or suspend on a weekday, none on a Saturday.
    expect(schoolDayIssue(state, { ...meeting, effect: 'include' })).toContain('“Aulas suspensas”');
    expect(
      schoolDayIssue(state, { ...meeting, start: saturday, end: saturday, effect: 'include' }),
    ).toContain('Em dia sem aula');
    const ownRegulation = {
      ...state,
      offers: state.offers.map((offer) => ({
        ...offer,
        scope: { status: 'own-regulation' as const },
      })),
    };
    expect(schoolDayIssue(ownRegulation, { ...meeting, effect: 'include' })).toBeUndefined();
  });
});

describe('date commands', () => {
  test('refuse a meeting that adds a day and accept classes kept or suspended', () => {
    const state = ivaiporaAnnual();
    const activity = rowLink(state, 'family-meeting');
    expect(() =>
      planActivityDate(
        state,
        activity,
        date({ start: saturday, end: saturday, effect: 'include' }),
        [],
      ),
    ).toThrow('não constitui dia letivo');
    for (const effect of ['note', 'exclude'] as const)
      expect(() => planActivityDate(state, activity, date({ effect }), [])).not.toThrow();
  });

  test('refuse a council date of the campus that adds a day', () => {
    expect(() =>
      createCampusDate(
        ivaiporaAnnual(),
        date({ start: saturday, end: saturday, effect: 'include' }),
        [],
      ),
    ).toThrow('não constitui dia letivo');
  });

  test('refuse a municipal cause on a date linked to an activity', () => {
    const state = ivaiporaAnnual();
    expect(() =>
      planActivityDate(
        state,
        rowLink(state, 'family-meeting'),
        date({ effect: 'exclude', deadlineExtensionCause: 'municipal-holiday' }),
        [],
      ),
    ).toThrow('prorrogação municipal');
  });

  test('keep an unchanged saved date and recheck it once its effect changes', () => {
    const base = ivaiporaAnnual();
    const state = stored(base, legacyMeeting(base));
    // The form never carries the link: `updateDate` keeps the saved one.
    const { activity: _activity, ...saved } = state.events.find((event) => event.id === 'family')!;
    expect(() => updateDate(state, { ...saved, name: 'Reunião geral' }, [])).not.toThrow();
    expect(() => updateDate(state, { ...saved, end: civilDate('2027-05-09') }, [])).toThrow(
      'não constitui dia letivo',
    );
    expect(() => updateDate(state, { ...saved, effect: 'note' }, [])).not.toThrow();
  });
});

describe('save boundary', () => {
  test('saves other changes beside a legacy date and refuses a new one', () => {
    const base = ivaiporaAnnual();
    const previous = stored(stored(base, legacyMeeting(base)), legacyMeeting(base, 'family-2'));
    const fixed = previous.events.map((event) =>
      event.id === 'family' ? { ...event, effect: 'note' as const } : event,
    );
    expect(() => save(previous, { ...previous, events: fixed })).not.toThrow();
    expect(() => save(base, { ...base, events: [...base.events, legacyMeeting(base)] })).toThrow(
      'não constitui dia letivo',
    );
  });
});

describe('organization confirmation', () => {
  test('a legacy link carried to a defined position keeps its date as it was', () => {
    const state = stagePositionsToConfirm();
    state.events = state.events.map((event) =>
      event.id === 'results-one' ? { ...event, effect: 'include' as const } : event,
    );
    const draft = offerOrganizationDraft(state, 'integrado');
    draft.organization = 'anual';
    draft.count = '3';
    draft.stages = organizationDraftStages(state, 'integrado', draft);
    draft.periods[0] = {
      sourceId: 'integrado-period',
      name: 'Ano letivo',
      start: civilDate('2027-02-01'),
      end: civilDate('2027-12-17'),
    };
    draft.stages[1] = { id: '', start: '2027-05-03', end: '2027-07-30' };
    draft.stages[2] = { id: '', start: '2027-08-02', end: '2027-12-17' };
    let sequence = 0;
    const configured = applyOfferOrganization(state, 'integrado', draft, () => `new-${++sequence}`);
    const saved = save(state, configured).state;
    expect(saved.events.find((event) => event.id === 'results-one')?.effect).toBe('include');
    const { issues } = contentAssessment({ state: saved, institutionalSnapshot: [] });
    expect(issues.map((issue) => issue.code)).toContain('school-day:results-one');
  });
});

describe('readiness and coverage', () => {
  test('a legacy date blocks the conclusion and still covers its activity', () => {
    const base = ivaiporaAnnual();
    const state = stored(base, legacyMeeting(base));
    const { issues } = contentAssessment({ state, institutionalSnapshot: [] });
    expect(issues.find((issue) => issue.code === 'school-day:family')).toMatchObject({
      group: 'dates',
      target: { area: 'date', eventId: 'family' },
    });
    const row = evaluatePlan(state).rows.find(
      (item) =>
        item.requirement.activity.activityId === 'family-meeting' && item.offerId === 'integrado',
    )!;
    expect(row.issues).toEqual([]);
    expect(row.evidence.map((event) => event.id)).toContain('family');
  });
});
