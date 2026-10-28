import { teacherDayId } from '../../../../src/domain/institution/teacher-day.ts';
import { Notice } from '../../../components/ui/Notice.tsx';
import type { EditorEvent } from '../types.ts';
import { useEventEditor } from './EventEditorProvider.tsx';
import ActivityRow from './ActivityRow.tsx';
import { civilDate } from './activity-query.ts';

/** Saved campus events use the same row and panel entry point as resolution activities. */
export default function CampusEventList({ events }: { events: EditorEvent[] }) {
  const editor = useEventEditor();
  const selected = editor.open
    ? editor.context?.kind === 'event'
      ? editor.eventId
      : null
    : editor.panel?.kind === 'event'
      ? editor.panel.eventId
      : editor.panel?.kind === 'teacher-day'
        ? teacherDayId
        : null;
  return events.length ? (
    <ul id="event-list" className="activity-rows">
      {events.map((event) => {
        const reference = event.recordType === 'prior-reference';
        const planned = event.publicationStatus === 'planned';
        const status = reference ? 'optional' : planned ? 'pending' : 'complete';
        return (
          <li key={event.id} data-campus-event={event.id}>
            <ActivityRow
              id={event.id === teacherDayId ? 'open-teacher-day' : `campus-event-${event.id}`}
              data-open-event={event.id}
              label={event.name}
              status={status}
              statusLabel={
                reference ? 'Referência anterior' : planned ? 'Publicação prevista' : 'Registrado'
              }
              dates={`${civilDate(event.start)} a ${civilDate(event.end)}`}
              selected={selected === event.id}
              onClick={() =>
                event.id === teacherDayId ? editor.viewTeacherDay() : editor.viewEvent(event.id)
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
