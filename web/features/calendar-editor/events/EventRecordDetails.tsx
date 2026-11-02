import { automaticEventSource } from '#src/domain/calendar/counting/core.ts';
import { categoryLabel } from '#src/domain/calendar/activities/categories.ts';
import type { EditorEvent } from '../types.ts';
import { civilDate } from './activity-query.ts';

/** Read-only summary of one calendar record, shared by the campus events and the record list. */
export default function EventRecordDetails({
  event,
  activity,
}: {
  event: EditorEvent;
  activity?: string;
}) {
  const source = automaticEventSource(event);
  return (
    <>
      <strong>{event.name}</strong>
      <small>
        {civilDate(event.start)} a {civilDate(event.end)} ·{' '}
        {event.effect === 'include'
          ? 'Inclusão letiva'
          : event.effect === 'exclude'
            ? 'Exclusão'
            : 'Sem efeito na contagem'}
      </small>
      {activity !== undefined && (
        <small>
          {activity ? `Atividade vinculada: ${activity}` : 'Data do campus, sem vínculo'}
        </small>
      )}
      {source && <small>Fonte: {source}</small>}
      {event.publicationStatus && (
        <small>
          {event.publicationStatus === 'planned' ? 'Publicação programada' : 'Publicação realizada'}
        </small>
      )}
      {event.admission && (
        <small>
          Ingresso: {event.admission.year} ·{' '}
          {event.admission.term === 'annual'
            ? 'ciclo anual'
            : event.admission.term === 'first'
              ? 'primeiro semestre'
              : 'segundo semestre'}
        </small>
      )}
      <small>{categoryLabel(event)}</small>
    </>
  );
}
