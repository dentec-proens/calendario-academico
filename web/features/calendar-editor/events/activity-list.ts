import { useEventEditor } from './EventEditorProvider.tsx';
import { useActivityCoverage } from './useActivityCoverage.ts';
import { useActivitySearch } from './activity-query.ts';
import { activityStep } from './activity-step.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';

/** Rows and counters of the Activities step for the current URL filters. */
export function useActivityList() {
  const { state, events, institutional } = useCalendarEditor();
  const editor = useEventEditor();
  const search = useActivitySearch();
  const { coverage } = useActivityCoverage();
  const selected =
    editor.context?.kind === 'activity'
      ? editor.context.itemId
      : editor.panel?.kind === 'activity'
        ? editor.panel.itemId
        : '';
  const step = activityStep({
    state,
    events,
    institutional,
    coverage,
    search,
    pinned: selected || search.atividade,
  });
  return { ...step, selected };
}
