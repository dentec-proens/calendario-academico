import { observanceForEvent } from '#src/domain/calendar/observances.ts';
import { activityChecklist } from '#src/domain/calendar/activities/checklist.ts';
import type { CalendarState, EditorEvent } from '../types.ts';

/** Requirements answered in the resolution step; other records belong to the campus step. */
export function resolutionActivities(state: CalendarState) {
  return new Set(activityChecklist(state).map((item) => item.id));
}

/** Records answering a resolution activity live with it; the rest are the campus' own events. */
export function campusEvents(state: CalendarState, events: readonly EditorEvent[]) {
  const activities = resolutionActivities(state);
  return [...events]
    .sort((a, b) => a.start.localeCompare(b.start))
    .filter(
      (event) =>
        Boolean(observanceForEvent(state.year, event.id)) ||
        (!event.institutional && !(event.requirementId && activities.has(event.requirementId))),
    );
}
