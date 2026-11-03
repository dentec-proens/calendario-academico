import { useMemo } from 'react';
import {
  activitySituation,
  evaluatePlan,
  type ActivityEvaluation,
} from '#src/domain/calendar/activities/plan-evaluation.ts';
import { assessmentDayCounts } from '#src/domain/calendar/counting/assessment-days.ts';
import { activityKey } from '#src/domain/calendar/activities/activity-ref.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';

/** Plan evaluation, situation and stage day counts shared by the list and the side panel. */
export function useActivityCoverage() {
  const { state, events, record, dirty } = useCalendarEditor();
  const evaluation = useMemo(
    () => evaluatePlan(state, state.events, dirty ? undefined : record.readiness.humanReview),
    [state, dirty, record.readiness.humanReview],
  );
  const counts = useMemo(() => {
    try {
      return assessmentDayCounts(state, events);
    } catch {
      return {};
    }
  }, [state, events]);
  // Rows of each generated activity, by the key of its link.
  const byKey = useMemo(() => {
    const rows = new Map<string, ActivityEvaluation[]>();
    for (const row of evaluation.rows) {
      const key = activityKey(row.requirement.activity);
      rows.set(key, [...(rows.get(key) ?? []), row]);
    }
    return rows;
  }, [evaluation]);
  return {
    evaluation,
    coverage: evaluation.rows,
    counts,
    rowsFor: (key: string) => byKey.get(key) ?? [],
    statusFor: (key: string) => activitySituation(byKey.get(key) ?? []),
  };
}
