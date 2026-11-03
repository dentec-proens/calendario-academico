import type { ActivityState, InstitutionalEventSnapshot } from '../../src/domain/calendar/model.ts';
import {
  createCampusDate,
  planActivityDate,
  updateDate,
  type DateInput,
} from '../../src/domain/calendar/commands/events.ts';

/**
 * The command the editor uses for a date of these tests: editing a saved date (`updateDate`),
 * planning a date of the activity it carries (`planActivityDate`) or creating a date of the campus
 * (`createCampusDate`). The date's own link stands for the context where it is filled.
 */
export function applyDate<S extends ActivityState>(
  state: S,
  date: S['events'][number],
  institutional: InstitutionalEventSnapshot[],
  editing = false,
): S {
  const { activity, ...rest } = date;
  if (editing) return updateDate(state, date as DateInput<S>, institutional);
  return activity
    ? planActivityDate(state, activity, rest as DateInput<S>, institutional)
    : createCampusDate(state, rest as DateInput<S>, institutional);
}
