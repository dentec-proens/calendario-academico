import { Pencil, Trash2 } from 'lucide-react';
import { removeEvent } from '../../../../src/domain/calendar/commands.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import type { EditorEvent } from '../types.ts';
import { useEventEditor } from './EventEditorProvider.tsx';
import EventRecordDetails from './EventRecordDetails.tsx';
import { FormActions } from '../../../shared/forms/FormActions.tsx';
import { Button } from '../../../components/ui/Button.tsx';

/** Details and editing actions stay inside the panel, leaving the list compact. */
export default function CampusEventDetails({ event }: { event: EditorEvent }) {
  const { institutional, applyCommand, readOnly } = useCalendarEditor();
  const editor = useEventEditor();
  return (
    <section className="campus-event-details" aria-label="Detalhes do evento">
      <div className="campus-event-record">
        <EventRecordDetails event={event} />
      </div>
      <FormActions>
        <Button
          type="button"
          data-edit-event={event.id}
          disabled={readOnly || editor.pending}
          onClick={() => editor.edit(event.id)}
        >
          <Pencil size={18} aria-hidden="true" /> Editar evento
        </Button>
        <Button
          type="button"
          variant="danger"
          data-remove-event={event.id}
          disabled={readOnly || editor.pending}
          aria-label={`Remover ${event.name}`}
          onClick={() => {
            if (!applyCommand((current) => removeEvent(current, event.id, institutional))) return;
            if (editor.eventId === event.id) editor.discard();
            else editor.close();
          }}
        >
          <Trash2 size={18} aria-hidden="true" /> Remover
        </Button>
      </FormActions>
    </section>
  );
}
