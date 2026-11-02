import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useEventEditor } from './EventEditorProvider.tsx';

/** Campus date without activity, the main action beside the Activities step heading. */
export default function NewEventButton() {
  const { readOnly } = useCalendarEditor();
  const editor = useEventEditor();
  const hasPendingEvent = Boolean(editor.context && editor.dirty);
  return (
    <button
      id="new-event"
      type="button"
      disabled={readOnly || editor.pending}
      aria-describedby={hasPendingEvent ? 'pending-event-description' : undefined}
      onClick={editor.newEvent}
    >
      Nova data do campus
    </button>
  );
}
