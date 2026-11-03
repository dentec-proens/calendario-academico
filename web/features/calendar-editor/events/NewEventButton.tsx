import { Plus } from 'lucide-react';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useEventEditor } from './EventEditorProvider.tsx';

/** Campus date without activity, beside the Activities step heading. */
export default function NewEventButton() {
  const { readOnly } = useCalendarEditor();
  const editor = useEventEditor();
  const hasPendingEvent = Boolean(editor.context && editor.dirty);
  return (
    <button
      id="new-event"
      type="button"
      className="secondary"
      disabled={readOnly || editor.pending}
      aria-describedby={hasPendingEvent ? 'pending-event-description' : undefined}
      onClick={editor.newEvent}
    >
      <Plus aria-hidden="true" /> Adicionar data do campus
    </button>
  );
}
