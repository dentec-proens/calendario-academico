import { useMemo } from 'react';
import { groupPendencies } from '#src/domain/calendar/pendencies.ts';
import { contentIssues } from '#src/domain/calendar/readiness.ts';
import { useEventEditor } from './EventEditorProvider.tsx';
import { useActivityCoverage } from './useActivityCoverage.ts';
import { useActivitySearch } from './activity-query.ts';
import { activityStep } from './activity-step.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';

/** Rows and counters of the Activities step for the current URL filters. */
export function useActivityList() {
  const { state, events, institutional, baseEvents } = useCalendarEditor();
  const editor = useEventEditor();
  const search = useActivitySearch();
  const { evaluation } = useActivityCoverage();
  const pendencies = useMemo(
    () => groupPendencies(contentIssues(state, baseEvents), state),
    [state, baseEvents],
  );
  const selected =
    editor.context?.kind === 'activity'
      ? editor.context.key
      : editor.panel?.kind === 'activity'
        ? editor.panel.key
        : '';
  const step = activityStep({
    state,
    events,
    institutional,
    evaluation,
    pendencies,
    search,
    pinned: selected || search.atividade,
  });
  return { ...step, selected };
}
