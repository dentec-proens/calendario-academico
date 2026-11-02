import { useMemo } from 'react';
import { activityCoverage } from '#src/domain/calendar/activities/coverage.ts';
import { assessmentDayCounts } from '#src/domain/calendar/counting/assessment-days.ts';
import { activityStatus } from '#src/domain/calendar/activities/status.ts';
import { activityKey } from '#src/domain/calendar/activities/activity-ref.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';

/** Per-offer coverage, card status and stage day counts shared by the list and the side panel. */
export function useActivityCoverage() {
  const { state, events, record, dirty } = useCalendarEditor();
  const coverage = useMemo(
    () => activityCoverage(state, state.events, dirty ? undefined : record.readiness.humanReview),
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
    const rows = new Map<string, typeof coverage>();
    for (const row of coverage) {
      const key = activityKey(row.requirement.activity);
      rows.set(key, [...(rows.get(key) ?? []), row]);
    }
    return rows;
  }, [coverage]);
  return {
    coverage,
    counts,
    rowsFor: (key: string) => byKey.get(key) ?? [],
    statusFor: (key: string) => activityStatus(byKey.get(key) ?? []),
  };
}
