import { Link } from '@tanstack/react-router';
import type { FunctionReturnType } from 'convex/server';
import { FilePlus2, FileText, PenLine, RefreshCw } from 'lucide-react';
import type { functions } from '../../shared/convex/client.ts';
import { modalityLabels } from '#src/domain/calendar/modalities.ts';
import { updatedLabel } from '../../shared/dates.ts';

type QueueItem = FunctionReturnType<typeof functions.reviews.reviewQueue>['page'][number];

/** The state decides both the badge and the verb, so a reviewer never opens a parecer blindly. */
export function reviewState(review: QueueItem['review']) {
  if (!review)
    return {
      tone: 'none',
      label: 'Parecer não iniciado',
      action: 'Iniciar parecer',
      Icon: FilePlus2,
    } as const;
  if (review.calendarChanged)
    return {
      tone: 'warning',
      label: `Calendário alterado depois da rev. ${review.revision}`,
      action: 'Reavaliar parecer',
      Icon: RefreshCw,
    } as const;
  if (review.reviewed < review.total)
    return {
      tone: 'info',
      label: `Em andamento · ${review.reviewed} de ${review.total} critérios conferidos`,
      action: 'Continuar parecer',
      Icon: PenLine,
    } as const;
  return {
    tone: 'success',
    label: 'Todos os critérios conferidos',
    action: 'Ver parecer',
    Icon: FileText,
  } as const;
}

export default function ReviewQueue({ items }: { items: QueueItem[] }) {
  return (
    <ul id="review-calendars" className="records">
      {items.map((calendar) => {
        const state = reviewState(calendar.review);
        return (
          <li key={calendar.id} data-review-state={state.tone}>
            <div className="review-queue-details">
              <strong>
                {calendar.purpose === 'test' ? '[TESTE] ' : ''}
                {calendar.name}
              </strong>
              <p className="review-queue-offering">
                {calendar.offerKinds.map((m) => modalityLabels[m] || m).join(' + ')}
                {calendar.courses ? ` · ${calendar.courses}` : ''}
              </p>
              <span className="review-queue-state" data-tone={state.tone}>
                {state.label}
              </span>
              {calendar.review ? (
                <small>
                  Rev. {calendar.review.revision} · {calendar.review.reviewerName} ·{' '}
                  {updatedLabel(calendar.review.updatedAt)}
                </small>
              ) : null}
            </div>
            <Link
              to="/revisoes/$calendarId"
              params={{ calendarId: calendar.id }}
              data-open-review={calendar.id}
            >
              <state.Icon size={18} aria-hidden="true" />
              {state.action}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
