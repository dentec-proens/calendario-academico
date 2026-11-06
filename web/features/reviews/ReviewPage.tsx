import { LoadingIndicator } from '../../components/ui/LoadingIndicator.tsx';
import { ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueries, type RequestForQueries } from 'convex/react';
import { useFeatureRoute } from '../../app/navigation.ts';
import { functions } from '../../shared/convex/client.ts';
import type { Id } from '../../../convex/_generated/dataModel.js';
import { updatedLabel, waitingLabel } from '../../shared/dates.ts';
import { useNow } from '../../shared/useNow.ts';
import ReviewEditor from './ReviewEditor.tsx';
import type { ReviewSupport } from './review-values.ts';
import { useFormDrafts } from '../../shared/forms/drafts.tsx';
import { Notice, type NoticeTone } from '../../components/ui/Notice.tsx';
import { useAppSession } from '../../app/session.tsx';
import LifecycleActions, { CalendarStatusBadge } from '../lifecycle/LifecycleActions.tsx';
import SubmissionComparison, {
  useSubmissionComparison,
} from '../lifecycle/SubmissionComparison.tsx';
import { statusLabels } from '#src/domain/calendar/lifecycle.ts';
import { conclusionBlock } from '#src/domain/reviews/conclusion-block.ts';
import { criteriaToReturn } from '#src/domain/reviews/returned-criteria.ts';
import { editorUrl } from '#src/app/routes.ts';
import ReviewAssignment from './ReviewAssignment.tsx';
import ReviewSummary from './ReviewSummary.tsx';
import './reviews.css';

export default function ReviewPage() {
  const calendarId = useFeatureRoute().calendarId || '';
  const [message, setMessage] = useState<{ text: string; tone: NoticeTone }>({
    text: '',
    tone: 'success',
  });
  const report = useCallback(
    (text: string, tone: NoticeTone = 'success') => setMessage({ text, tone }),
    [],
  );
  const clearConfirmation = useCallback(
    () =>
      setMessage((current) => (current.tone === 'success' ? { ...current, text: '' } : current)),
    [],
  );
  const drafts = useFormDrafts();
  // useQueries reports a removed calendar as a value instead of throwing to the error boundary.
  const requests = useMemo<RequestForQueries>(
    () => ({
      review: { query: functions.reviews.review, args: { id: calendarId as Id<'calendars'> } },
    }),
    [calendarId],
  );
  const result = useQueries(requests).review as ReviewSupport | Error | undefined;
  const opened = result instanceof Error ? undefined : result;
  useEffect(() => {
    if (result instanceof Error && /removido|não encontrado|disponível/i.test(result.message))
      drafts?.clear(`review:${calendarId}`);
  }, [calendarId, result, drafts]);
  return (
    <section id="review-panel" className="page" aria-busy={!result}>
      <div className="panel">
        {!result ? <LoadingIndicator label="Carregando parecer…" /> : null}
        {/* Stays in view while the long form scrolls, so an outcome is never out of sight. */}
        <div id="review-message" role="status" aria-live="polite">
          {result instanceof Error ? (
            <Notice tone="danger">
              {/removido|disponível/i.test(result.message)
                ? 'O calendário deixou de estar disponível para revisão. Volte à lista para escolher outro calendário.'
                : result.message}
            </Notice>
          ) : message.text ? (
            <Notice
              tone={message.tone}
              elevated
              onDismiss={() => setMessage({ text: '', tone: 'success' })}
            >
              {message.text}
            </Notice>
          ) : null}
        </div>
        {opened ? (
          <OpenedReview
            key={opened.calendar.id}
            opened={opened}
            onMessage={report}
            onClearConfirmation={clearConfirmation}
          />
        ) : null}
      </div>
    </section>
  );
}

/** The calendar's name already carries its campus unless someone renamed it without one. */
const reviewTitle = ({ name, campus }: ReviewSupport['calendar']) =>
  name.includes(campus) ? name : `${campus} · ${name}`;

function OpenedReview({
  opened,
  onMessage,
  onClearConfirmation,
}: {
  opened: ReviewSupport;
  onMessage: (text: string, tone?: NoticeTone) => void;
  onClearConfirmation: () => void;
}) {
  const { info } = useAppSession();
  const now = useNow();
  const [reviewWork, setReviewWork] = useState(false);
  const comparison = useSubmissionComparison(opened.calendar.id, !!opened.submission);
  // Follows the default until the reviewer chooses: open only when there are changes to read.
  const [comparisonChoice, setComparisonChoice] = useState<boolean | null>(null);
  const comparisonOpen = comparisonChoice ?? !!comparison.base;
  // A new edit makes "Parecer salvo" untrue, and the notice stays over the form while it scrolls.
  useEffect(() => {
    if (reviewWork) onClearConfirmation();
  }, [reviewWork, onClearConfirmation]);
  const { submission } = opened;
  return (
    <>
      <div className="review-header">
        <div className="review-header__identity">
          <h2 id="review-heading">{reviewTitle(opened.calendar)}</h2>
          <p id="review-status">
            <CalendarStatusBadge status={opened.status} />
            {submission ? (
              <span>
                Envio {submission.sequence} · {updatedLabel(submission.submittedAt)} · por{' '}
                {submission.submittedBy}
                {opened.status === 'enviado'
                  ? ` · ${waitingLabel(submission.submittedAt, now)}`
                  : ''}
              </span>
            ) : null}
          </p>
        </div>
        <a
          id="review-editor"
          className="ui-button ui-button--secondary"
          href={editorUrl(opened.calendar.id, 'calendar')}
          target="_blank"
          rel="noopener"
          aria-label="Abrir calendário em outra aba"
        >
          <ExternalLink size={18} aria-hidden="true" /> Abrir calendário
        </a>
        <LifecycleActions
          className="review-lifecycle"
          calendar={{
            id: opened.calendar.id,
            name: opened.calendar.name,
            status: opened.status,
            statusRevision: opened.statusRevision,
          }}
          role={info.user.role}
          notify={(text, error) => onMessage(text, error ? 'danger' : 'success')}
          // Submitting from here states the base this page shows.
          prepare={() => Promise.resolve({ baseIdentity: opened.baseIdentity })}
          // Concluding or returning always acts on the saved review, never on unsaved edits.
          guard={() =>
            reviewWork
              ? 'Salve ou descarte as alterações do parecer antes de mudar a situação do calendário.'
              : undefined
          }
          unavailable={{
            conclude:
              (reviewWork
                ? 'Salve ou descarte as alterações do parecer antes de concluir a revisão.'
                : conclusionBlock({
                    baseCompatible: opened.baseCompatible,
                    reviewCurrent: !!opened.review && !opened.stale,
                    criteria: opened.criteria,
                    entries: opened.review?.entries ?? [],
                  })) ?? undefined,
          }}
          returnCriteria={criteriaToReturn(opened.criteria, opened.review, {
            submissionId: submission?.id,
            rulesetVersion: opened.rulesetVersion,
          })}
          menuActions={['withdraw']}
          primaryActions={['submit', 'conclude', 'publish']}
        />
      </div>
      {opened.status === 'rascunho' ? (
        <Notice tone="info" id="review-draft-notice">
          Calendário em rascunho: o parecer só pode ser registrado depois do envio pelo campus.
        </Notice>
      ) : opened.status !== 'enviado' && opened.status !== 'em_revisao' ? (
        <Notice tone="info" id="review-locked-notice">
          Calendário {statusLabels[opened.status].toLowerCase()}: o parecer está disponível para
          consulta e exportação.
          {opened.status === 'revisado'
            ? ' Reabra a revisão para alterá-lo.'
            : opened.status === 'devolvido'
              ? ' Ele volta a ser editável quando o campus reenviar o calendário.'
              : ''}
        </Notice>
      ) : null}
      <ReviewEditor
        key={`${opened.calendar.id}:${opened.submission?.id ?? ''}`}
        opened={opened}
        userId={info.user.id}
        onMessage={onMessage}
        onWorkChange={setReviewWork}
        renderSummary={(reviewedCount) => (
          <>
            <ReviewSummary
              opened={opened}
              userId={info.user.id}
              reviewedCount={reviewedCount}
              assignment={
                <ReviewAssignment
                  calendarId={opened.calendar.id}
                  assignee={opened.assignee}
                  userId={info.user.id}
                  busyReason={
                    reviewWork ? 'Salve ou descarte as alterações antes de liberar o parecer.' : ''
                  }
                  onMessage={onMessage}
                />
              }
              comparison={submission ? comparison : null}
              comparisonOpen={comparisonOpen}
              onToggleComparison={() => setComparisonChoice(!comparisonOpen)}
            />
            <div id="review-comparison-panel" hidden={!submission || !comparisonOpen}>
              {submission ? (
                <SubmissionComparison calendarId={opened.calendar.id} comparison={comparison} />
              ) : null}
            </div>
          </>
        )}
      />
    </>
  );
}
