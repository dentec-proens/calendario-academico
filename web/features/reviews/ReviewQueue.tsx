import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { FunctionReturnType } from 'convex/server';
import { ExternalLink, FilePlus2, FileText, PenLine, RefreshCw, UserCheck } from 'lucide-react';
import { editorUrl } from '#src/app/routes.ts';
import { reviewEditable, type CalendarStatus } from '#src/domain/calendar/lifecycle.ts';
import type { Id } from '../../../convex/_generated/dataModel.js';
import { Button } from '../../components/ui/Button.tsx';
import { StatusBadge } from '../../components/ui/Feedback.tsx';
import type { functions } from '../../shared/convex/client.ts';
import { nativeError } from '../../shared/convex/errors.ts';
import { reviews } from '../../shared/convex/reviews.ts';
import { elapsedLabel, updatedLabel, waitingLabel } from '../../shared/dates.ts';
import { useNow } from '../../shared/useNow.ts';
import CalendarIdentityCell from '../calendar-list/CalendarIdentityCell.tsx';
import CalendarTable, { type CalendarColumn } from '../calendar-list/CalendarTable.tsx';
import { assumeReview } from './review-assignment.ts';

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
      label: `Em andamento · ${review.reviewed} de ${review.total} critérios avaliados`,
      action: 'Continuar parecer',
      Icon: PenLine,
    } as const;
  return {
    tone: 'success',
    label: 'Todos os critérios avaliados',
    action: 'Ver parecer',
    Icon: FileText,
  } as const;
}

type QueueFilters = {
  campus?: string;
  situacao?: Exclude<CalendarStatus, 'rascunho' | 'enviado'>;
  responsavel?: 'meus' | 'livres';
};

/** What the person can do depends on who holds the parecer; opening it never changes anything. */
function ReviewRowActions({
  item,
  filters,
  userId,
  onError,
}: {
  item: QueueItem;
  filters: QueueFilters;
  userId: Id<'users'>;
  onError: (message: string) => void;
}) {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const state = reviewState(item.review);
  const editable = reviewEditable(item.status);
  const holder = item.assignee;
  const free = editable && !holder;
  const mine = editable && holder?.id === userId;
  const other = editable && holder && !mine ? holder : null;
  async function run(operation: () => Promise<void>) {
    setPending(true);
    try {
      await operation();
    } catch (cause) {
      onError(nativeError(cause).message);
    } finally {
      setPending(false);
    }
  }
  const open = (
    <Link
      to="/revisoes/$calendarId"
      params={{ calendarId: item.id }}
      search={filters}
      className={`ui-button ${free ? 'ui-button--secondary' : 'ui-button--primary'}`}
      data-open-review={item.id}
    >
      {free || other ? (
        <>
          <FileText size={18} aria-hidden="true" />
          Ver parecer
        </>
      ) : (
        <>
          <state.Icon size={18} aria-hidden="true" />
          {state.action}
        </>
      )}
    </Link>
  );
  return (
    <div className="calendar-list-actions">
      {free ? (
        <Button
          data-assume-review={item.id}
          pending={pending}
          onClick={() =>
            void run(async () => {
              await reviews.assume(item.id, null);
              await navigate({
                to: '/revisoes/$calendarId',
                params: { calendarId: item.id },
                search: filters,
              });
            })
          }
        >
          <UserCheck size={18} aria-hidden="true" />
          Assumir parecer
        </Button>
      ) : null}
      {open}
      {mine ? (
        <Button
          variant="secondary"
          data-release-review={item.id}
          pending={pending}
          onClick={() => void run(() => reviews.release(item.id).then(() => undefined))}
        >
          Liberar
        </Button>
      ) : null}
      {other ? (
        <Button
          variant="secondary"
          data-assume-review={item.id}
          pending={pending}
          onClick={() => void assumeReview(item.id, other)}
        >
          <UserCheck size={18} aria-hidden="true" />
          Assumir
        </Button>
      ) : null}
    </div>
  );
}

export default function ReviewQueue({
  items,
  filters,
  userId,
  onError,
}: {
  items: QueueItem[];
  /** The selected filters, carried to the parecer so that its trail returns here. */
  filters: QueueFilters;
  userId: Id<'users'>;
  onError: (message: string) => void;
}) {
  const now = useNow();
  const columns: CalendarColumn<QueueItem>[] = [
    {
      label: 'Calendário',
      width: 'minmax(0, 1fr)',
      render: (calendar) => <CalendarIdentityCell calendar={calendar} withOrigin />,
    },
    {
      label: 'Envio',
      width: '8rem',
      render: ({ submission, status }) =>
        submission ? (
          <div className="review-queue-submission" data-submission={submission.sequence}>
            <span>
              Envio {submission.sequence}
              {submission.resubmission ? ' · reenvio' : ''}
            </span>
            {status === 'enviado' && (
              <strong className="review-queue-waiting" data-waiting>
                {waitingLabel(submission.submittedAt, now)}
              </strong>
            )}
            <small>{updatedLabel(submission.submittedAt)}</small>
          </div>
        ) : (
          <small>Envio não registrado</small>
        ),
    },
    {
      label: 'Parecer',
      width: '13rem',
      render: ({ review, assignee, status }) => {
        const state = reviewState(review);
        return (
          <div className="review-queue-progress">
            {reviewEditable(status) ? (
              <strong className="review-queue-assignee" data-review-assignee>
                {!assignee
                  ? 'Sem responsável'
                  : `Com ${assignee.id === userId ? 'você' : assignee.name} · ${elapsedLabel(assignee.at, now)}`}
              </strong>
            ) : null}
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
      render: (item) => {
        const { id } = item;
        return (
          <div className="review-queue-actions">
            <ReviewRowActions item={item} filters={filters} userId={userId} onError={onError} />
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
