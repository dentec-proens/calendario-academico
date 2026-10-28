import { isAssessmentStageRecord } from './activity-metadata.ts';
import type { CalendarActivity } from './domain-types.ts';

/** Remove only the source attached to an assessment-stage record, including legacy stage IDs. */
export function withoutStageReferences<T extends { events: CalendarActivity[] }>(state: T) {
  let removed = 0;
  const events = state.events.map((event) => {
    const stage =
      isAssessmentStageRecord(event) ||
      /^stage-(?:(?:start|end)-)?[1-4]$/.test(event.requirementId ?? '');
    if (!stage || !Object.hasOwn(event, 'evidence')) return event;
    const next = { ...event };
    delete next.evidence;
    removed++;
    return next;
  });
  return { state: removed ? { ...state, events } : state, removed };
}
