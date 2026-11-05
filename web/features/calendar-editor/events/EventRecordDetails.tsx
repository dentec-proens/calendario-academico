import { automaticEventSource } from '#src/domain/calendar/counting/core.ts';
import { CategoryMark } from '../../../components/ui/CategoryMark.tsx';
import { isInternalDate } from '#src/domain/calendar/internal-dates.ts';
import { StatusBadge } from '../../../components/ui/Feedback.tsx';
import type { EditorEvent } from '../types.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { longRange } from '#src/domain/date-labels.ts';
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
      {isInternalDate(event) && (
        <small data-internal-date>
          <StatusBadge data-internal-badge>Interna</StatusBadge> Data de organização interna (art.
          18), fora do calendário oficial.
        </small>
      )}
      <small>
        {longRange(event)} ·{' '}
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
        destinationIssueLines(state, event).map((issue) => (
          <small key={issue.offerId} className="notice-destination-issue">
            {issue.text}
          </small>
        ))}
      <small>
        <CategoryMark event={event} withLabel />
      </small>
    </>
  );
}
