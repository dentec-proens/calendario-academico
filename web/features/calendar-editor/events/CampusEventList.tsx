import { observanceForEvent } from '#src/domain/calendar/observances.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { Notice } from '../../../components/ui/Notice.tsx';
import type { EditorEvent } from '../types.ts';
import { useEventEditor } from './EventEditorProvider.tsx';
import ActivityRow from './ActivityRow.tsx';
import { civilDate } from './activity-query.ts';

/** Saved campus events use the same row and panel entry point as resolution activities. */
export default function CampusEventList({ events }: { events: EditorEvent[] }) {
  const editor = useEventEditor();
  const { state } = useCalendarEditor();
  const selectedKey = editor.panel?.kind === 'observance' ? editor.panel.key : undefined;
  const selected = editor.open
    ? editor.context?.kind === 'event'
      ? editor.eventId
      : null
    : editor.panel?.kind === 'event'
      ? editor.panel.eventId
      : editor.panel?.kind === 'observance'
        ? events.find((event) => observanceForEvent(state.year, event.id)?.key === selectedKey)?.id
        : null;
  return events.length ? (
    <ul id="event-list" className="activity-rows">
      {events.map((event) => {
        const observance = observanceForEvent(state.year, event.id);
        const planned = event.publicationStatus === 'planned';
        const status = planned ? 'pending' : 'complete';
        return (
          <li key={event.id} data-campus-event={event.id}>
            <ActivityRow
              id={observance ? `open-observance-${observance.key}` : `campus-event-${event.id}`}
              data-observance={observance?.key}
              data-open-event={event.id}
              label={event.name}
              status={status}
              statusLabel={planned ? 'Publicação prevista' : 'Registrado'}
              dates={`${civilDate(event.start)} a ${civilDate(event.end)}`}
              selected={selected === event.id}
              onClick={() =>
                observance ? editor.viewObservance(observance.key) : editor.viewEvent(event.id)
              }
            />
          </li>
        );
      })}
    </ul>
  ) : (
    <Notice tone="info">Nenhum evento do campus cadastrado.</Notice>
  );
}
