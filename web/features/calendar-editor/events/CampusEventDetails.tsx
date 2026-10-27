import { removeEvent } from '../../../../src/calendar-edits/commands.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import type { EditorEvent } from '../types.ts';
import { useEventEditor } from './EventEditorProvider.tsx';
import EventRecordDetails from './EventRecordDetails.tsx';

/** Details and editing actions stay inside the panel, leaving the list compact. */
export default function CampusEventDetails({ event }: { event: EditorEvent }) {
  const { institutional, applyCommand, readOnly } = useCalendarEditor();
  const editor = useEventEditor();
  return (
    <section className="campus-event-details" aria-label="Detalhes do evento">
      <div className="campus-event-record">
        <EventRecordDetails event={event} />
      </div>
      <div className="actions">
        <button
          type="button"
          data-edit-event={event.id}
          disabled={readOnly || editor.pending}
          onClick={() => editor.edit(event.id)}
        >
          Editar evento
        </button>
        <button
          type="button"
          data-remove-event={event.id}
          disabled={readOnly || editor.pending}
          aria-label={`Remover ${event.name}`}
          onClick={() => {
            if (!applyCommand((current) => removeEvent(current, event.id, institutional))) return;
            if (editor.eventId === event.id) editor.discard();
            else editor.close();
          }}
        >
          Remover
        </button>
      </div>
    </section>
  );
}
