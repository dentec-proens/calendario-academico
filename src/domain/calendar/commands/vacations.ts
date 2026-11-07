import type { CivilDate } from '../../civil-date.ts';
import { DomainError } from '../../errors.ts';
import type { ActivityState, CalendarEvent } from '../model.ts';
import { offerIds } from '../offers.ts';
import {
  defaultSchoolVacationName,
  vacationDates,
  vacationKind,
  vacationRef,
  withTeacherVacationFields,
  type VacationKind,
} from '../activities/vacations.ts';
import { planActivityDate, updateDate, type DateInput } from './events.ts';

export interface VacationPeriod {
  id: string;
  start: CivilDate;
  end: CivilDate;
  /** School vacations only: teacher vacations have a generated name and every offer. */
  name?: string;
  offers?: readonly string[];
}

/** Adds a period of one kind or, when its ID is saved, edits it. */
export function saveVacationPeriod<S extends ActivityState>(
  state: S,
  kind: VacationKind,
  period: VacationPeriod,
): S {
  const saved = state.events.find((event) => event.id === period.id);
  if (saved && vacationKind(saved.activity) !== kind)
    throw new DomainError('Este período não pertence a estas férias.');
  const base: CalendarEvent = {
    id: period.id,
    name: period.name?.trim() || defaultSchoolVacationName,
    start: period.start,
    end: period.end,
    effect: 'exclude',
    category: 'ferias',
    offers: [...(period.offers ?? offerIds(state))],
  };
  const date = (
    kind === 'teacher' ? withTeacherVacationFields(base, offerIds(state)) : base
  ) as DateInput<S>;
  return saved ? updateDate(state, date) : planActivityDate(state, vacationRef(kind), date);
}

/** Teacher vacations as one group: copying them replaces the periods the calendar has. */
export function replaceTeacherVacations<S extends ActivityState>(
  state: S,
  periods: readonly Pick<CalendarEvent, 'start' | 'end'>[],
  id: () => string,
): S {
  const without = {
    ...state,
    events: state.events.filter((event) => vacationKind(event.activity) !== 'teacher'),
  };
  return periods.reduce(
    (next, { start, end }) => saveVacationPeriod(next, 'teacher', { id: id(), start, end }),
    without,
  );
}

/** The school periods of one offer as teacher periods, independent from then on. */
export function copySchoolVacationsToTeachers<S extends ActivityState>(
  state: S,
  offerId: string,
  id: () => string,
): S {
  return replaceTeacherVacations(
    state,
    vacationDates(state.events, 'school').filter((event) => event.offers.includes(offerId)),
    id,
  );
}
