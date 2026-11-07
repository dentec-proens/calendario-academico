import { civilDate, type CivilDate } from '../civil-date.ts';
import { activityRef, type ActivityRef } from './activities/activity-ref.ts';

type RangeDates<T> = { [K in keyof T]: K extends 'start' | 'end' ? CivilDate : T[K] };
type ActivityDateKey = 'start' | 'end' | 'originalStart' | 'originalEnd' | 'assessmentAutoStart';
type AdjustmentDates<T> = T extends { date: string } ? Omit<T, 'date'> & { date: CivilDate } : T;
type ActivityDates<T> = {
  [K in keyof T]: K extends ActivityDateKey
    ? CivilDate
    : K extends 'deadlineAdjustment'
      ? AdjustmentDates<T[K]>
      : K extends 'activity'
        ? ActivityRef | Extract<T[K], undefined>
        : T[K];
};
type CalendarDates<T extends CalendarInput> = {
  [K in keyof T]: K extends 'periods'
    ? RangeDates<T['periods'][number]>[]
    : K extends 'events'
      ? ActivityDates<T['events'][number]>[]
      : K extends 'observanceDates'
        ? Record<string, CivilDate>
        : T[K];
};
interface CalendarInput {
  periods: RangeInput[];
  events: ActivityInput[];
  observanceDates?: Record<string, string>;
}

interface RangeInput {
  start: string;
  end: string;
}
interface ActivityInput extends RangeInput {
  originalStart?: string;
  originalEnd?: string;
  assessmentAutoStart?: string;
  deadlineAdjustment?: { date: string };
  activity?: unknown;
}
export function readDateRange<T extends RangeInput>(value: T) {
  return { ...value, start: civilDate(value.start), end: civilDate(value.end) };
}

/**
 * Decode civil dates and the activity link (checked against the declared IDs, `activityRef()`)
 * without reinterpreting the policy or changing historical evidence.
 */
export function readActivityDates<T extends ActivityInput>(value: T): ActivityDates<T> {
  return {
    ...readDateRange(value),
    ...(value.originalStart === undefined ? {} : { originalStart: civilDate(value.originalStart) }),
    ...(value.originalEnd === undefined ? {} : { originalEnd: civilDate(value.originalEnd) }),
    ...(value.assessmentAutoStart === undefined
      ? {}
      : { assessmentAutoStart: civilDate(value.assessmentAutoStart) }),
    ...(value.deadlineAdjustment === undefined
      ? {}
      : {
          deadlineAdjustment: {
            ...value.deadlineAdjustment,
            date: civilDate(value.deadlineAdjustment.date),
          },
        }),
    ...(value.activity === undefined ? {} : { activity: activityRef(value.activity) }),
  } as ActivityDates<T>;
}

export function readCalendarDates<T extends CalendarInput>(value: T): CalendarDates<T> {
  return {
    ...value,
    periods: value.periods.map((period: T['periods'][number]) => readDateRange(period)),
    events: value.events.map((event: T['events'][number]) => readActivityDates(event)),
    ...(value.observanceDates === undefined
      ? {}
      : {
          observanceDates: Object.fromEntries(
            Object.entries(value.observanceDates).map(([key, date]) => [key, civilDate(date)]),
          ),
        }),
  } as CalendarDates<T>;
}
