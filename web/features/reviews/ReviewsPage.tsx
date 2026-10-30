import { LoadingIndicator } from '../../components/ui/LoadingIndicator.tsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { usePaginatedQuery, useQueries, type RequestForQueries } from 'convex/react';
import { Eye } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import { useFeatureRoute } from '../../app/navigation.ts';
import { functions } from '../../shared/convex/client.ts';
import type { Id } from '../../../convex/_generated/dataModel.js';
import { modalityLabels } from '#src/domain/calendar/modalities.ts';
import Pagination from '../../shared/forms/Pagination.tsx';
import ReviewEditor from './ReviewEditor.tsx';
import type { ReviewSupport } from './review-values.ts';
import { useFormDrafts } from '../../shared/forms/drafts.tsx';
import { Notice, type NoticeTone } from '../../components/ui/Notice.tsx';

export default function ReviewsPage() {
  const route = useFeatureRoute();
  const navigate = useNavigate();
  const [message, setMessage] = useState<{ text: string; tone: NoticeTone }>({
    text: '',
    tone: 'success',
  });
  const report = useCallback(
    (text: string, tone: NoticeTone = 'success') => setMessage({ text, tone }),
    [],
  );
  const [selected, setSelected] = useState('');
  const drafts = useFormDrafts();
  const requested = route.calendarId || '';
  // The list chooses a calendar; an opened analysis returns to it through the page's back link.
  const pagination = usePaginatedQuery(
    functions.calendars.calendarPage,
    requested ? 'skip' : { deleted: false },
    { initialNumItems: 50 },
  );
  const calendarId = selected || pagination.results[0]?.id || '';
  const requests = useMemo(() => {
    const result: RequestForQueries = {};
    if (requested)
      result.review = {
        query: functions.reviews.review,
        args: { id: requested as Id<'calendars'> },
      };
    return result;
  }, [requested]);
  const results = useQueries(requests);
  const result = results.review as ReviewSupport | Error | undefined;
  const opened = result instanceof Error ? undefined : result;
  useEffect(() => {
    if (
      requested &&
      result instanceof Error &&
      /removido|não encontrado|disponível/i.test(result.message)
    ) {
      drafts?.clear(`review:${requested}`);
    }
  }, [requested, result, drafts]);
  async function openReview() {
    report('Indicações automáticas disponíveis para conferência.', 'info');
    await navigate({ to: '/revisoes/$calendarId', params: { calendarId } });
  }
  const reviewMessage =
    result instanceof Error
      ? /removido|disponível/i.test(result.message)
        ? 'O calendário deixou de estar disponível para revisão. Volte à lista para abrir outra análise.'
        : result.message
      : message.text ||
        (!pagination.results.length && pagination.status === 'Exhausted'
          ? 'Nenhum calendário disponível para revisão.'
          : '');
  return (
    <section id="review-panel" className="page" aria-busy={Boolean(requested && !result)}>
      <div className="panel">
        {!requested ? <h2>Revisão técnico-pedagógica · DENTEC/PROENS</h2> : null}
        <p>
          A revisão apoia o parecer; assinatura e tramitação ocorrem no SEI. Não constitui aprovação
          institucional.
        </p>
        {!requested ? (
          <>
            <label>
              Calendário para revisão
              <select
                id="review-calendar"
                value={calendarId}
                disabled={!pagination.results.length}
                onChange={(event) => {
                  setSelected(event.target.value);
                }}
              >
                {pagination.results.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>
                    {calendar.name} · {calendar.year} ·{' '}
                    {calendar.offerKinds
                      .map((modality) => modalityLabels[modality] || modality)
                      .join(' + ')}
                  </option>
                ))}
              </select>
            </label>
            <div className="page-actions">
              <Button
                type="button"
                variant="secondary"
                className="page-action"
                id="open-review"
                disabled={!calendarId}
                onClick={() => {
                  void openReview();
                }}
              >
                <Eye size={18} aria-hidden="true" />
                Abrir análise
              </Button>
            </div>
            <Pagination
              pagination={pagination}
              label="Carregar mais calendários"
              loadingLabel="Carregando calendários para revisão…"
            />
          </>
        ) : null}
        {requested && !result ? <LoadingIndicator label="Carregando análise…" /> : null}
        <div id="review-message" role="status" aria-live="polite">
          {reviewMessage ? (
            <Notice
              tone={result instanceof Error ? 'danger' : message.text ? message.tone : 'info'}
            >
              {reviewMessage}
            </Notice>
          ) : null}
        </div>
        {opened ? (
          <ReviewEditor key={opened.calendar.id} opened={opened} onMessage={report} />
        ) : null}
      </div>
    </section>
  );
}
