import { useMemo } from 'react';
import { activityCoverage } from '#src/domain/calendar/activities/coverage.ts';
import { assessmentDayCounts } from '#src/domain/calendar/counting/assessment-days.ts';
import { activityStatus } from '#src/domain/calendar/activities/status.ts';
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
  return {
    coverage,
    counts,
    rowsFor: (id: string) => coverage.filter((row) => row.requirement.id === id),
    statusFor: (id: string) => activityStatus(coverage.filter((row) => row.requirement.id === id)),
  };
}
