import { Link } from '@tanstack/react-router';
import type { FunctionReturnType } from 'convex/server';
import { ExternalLink, FilePlus2, FileText, PenLine, RefreshCw } from 'lucide-react';
import { editorUrl } from '#src/app/routes.ts';
import type { CalendarStatus } from '#src/domain/calendar/lifecycle.ts';
import { StatusBadge } from '../../components/ui/Feedback.tsx';
import type { functions } from '../../shared/convex/client.ts';
import { updatedLabel } from '../../shared/dates.ts';
import CalendarIdentityCell from '../calendar-list/CalendarIdentityCell.tsx';
import CalendarTable, { type CalendarColumn } from '../calendar-list/CalendarTable.tsx';

type QueueItem = FunctionReturnType<typeof functions.reviews.reviewQueue>['page'][number];

/** The state decides both the badge and the verb, so a reviewer never opens a parecer blindly. */
export function reviewState(review: QueueItem['review']) {
  if (!review)
    return {
      tone: 'neutral',
      label: 'Parecer não iniciado',
      action: 'Iniciar parecer',
      Icon: FilePlus2,
    } as const;
  if (review.otherSubmission)
    return {
      tone: 'warning',
      label: `Parecer de outro envio (rev. ${review.revision})`,
      action: 'Reavaliar parecer',
      Icon: RefreshCw,
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

export default function ReviewQueue({
  items,
  filters,
}: {
  items: QueueItem[];
  /** The selected filters, carried to the parecer so that its trail returns here. */
  filters: { campus?: string; situacao?: Exclude<CalendarStatus, 'rascunho' | 'enviado'> };
}) {
  const columns: CalendarColumn<QueueItem>[] = [
    {
      label: 'Calendário',
      width: 'minmax(0, 1fr)',
      render: (calendar) => <CalendarIdentityCell calendar={calendar} withOrigin />,
    },
    {
      label: 'Envio',
      width: '8rem',
      render: ({ submission }) =>
        submission ? (
          <div className="review-queue-submission" data-submission={submission.sequence}>
            <span>
              Envio {submission.sequence}
              {submission.resubmission ? ' · reenvio' : ''}
            </span>
            <small>{updatedLabel(submission.submittedAt)}</small>
          </div>
        ) : (
          <small>Envio não registrado</small>
        ),
    },
    {
      label: 'Parecer',
      width: '13rem',
      render: ({ review }) => {
        const state = reviewState(review);
        return (
          <div className="review-queue-progress">
            <span className="visually-hidden">Parecer: </span>
            <StatusBadge tone={state.tone} data-review-label>
              {state.label}
            </StatusBadge>
            {review ? (
              <small>
                Rev. {review.revision} · {review.reviewerName} · {updatedLabel(review.updatedAt)}
              </small>
            ) : null}
          </div>
        );
      },
    },
    {
      label: 'Ações',
      width: '12rem',
      render: ({ id, review }) => {
        const state = reviewState(review);
        return (
          <div className="review-queue-actions">
            <div className="calendar-list-actions">
              <Link
                to="/revisoes/$calendarId"
                params={{ calendarId: id }}
                search={filters}
                className="ui-button ui-button--primary"
                data-open-review={id}
              >
                <state.Icon size={18} aria-hidden="true" />
                {state.action}
              </Link>
            </div>
            <a
              className="review-queue-calendar"
              href={editorUrl(id, 'calendar')}
              target="_blank"
              rel="noopener"
              data-open-calendar={id}
            >
              <ExternalLink size={16} aria-hidden="true" />
              Abrir calendário<span className="visually-hidden"> em outra aba</span>
            </a>
          </div>
        );
      },
    },
  ];
  return (
    <CalendarTable
      id="review-calendars"
      items={items}
      columns={columns}
      rowProps={({ review }) => ({ 'data-review-state': reviewState(review).tone })}
    />
  );
}
