import { automaticEventSource } from '#src/domain/calendar/counting/core.ts';
import { categoryLabel } from '#src/domain/calendar/activities/categories.ts';
import type { EditorEvent } from '../types.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { civilDate } from './activity-query.ts';
import { destinationIssueLines, destinationText, publicationLabels } from './notice-details.ts';

/** Read-only summary of one calendar record, shared by the campus events and the record list. */
export default function EventRecordDetails({
  event,
  activity,
}: {
  event: EditorEvent;
  activity?: string;
}) {
  const { state } = useCalendarEditor();
  const source = automaticEventSource(event);
  const publication = event.notice?.publication;
  const admission = event.notice?.admission;
  const destination = admission && destinationText(state, admission.destinations);
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
      {publication && <small>{publicationLabels[publication]}</small>}
      {admission && (
        <small>
          Ingresso: {admission.year} ·{' '}
          {admission.term === 'annual'
            ? 'ciclo anual'
            : admission.term === 'first'
              ? 'primeiro semestre'
              : 'segundo semestre'}
        </small>
      )}
      {destination && <small>{destination}</small>}
      {!event.institutional &&
        event.scope &&
        destinationIssueLines(state, { notice: event.notice, scope: event.scope }).map((issue) => (
          <small key={issue.offerId} className="notice-destination-issue">
            {issue.text}
          </small>
        ))}
      <small>{categoryLabel(event)}</small>
    </>
  );
}
