import { LoadingIndicator } from '../../components/ui/LoadingIndicator.tsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
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
import type { ReviewDraft } from './review-values.ts';
import { useFormDrafts } from '../../shared/forms/drafts.tsx';
import { confirmAction } from '../../components/confirmation.ts';
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
  const [candidate, setCandidate] = useState({ routeId: '', value: '' });
  const drafts = useFormDrafts();
  const pagination = usePaginatedQuery(
    functions.calendars.calendarPage,
    { deleted: false },
    { initialNumItems: 50 },
  );
  const requested = route.calendarId || '';
  const calendarId =
    (candidate.routeId === requested ? candidate.value : '') ||
    requested ||
    pagination.results[0]?.id ||
    '';
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
    const current = requested
      ? drafts?.read(`review:${requested}`, { values: { draft: null as ReviewDraft | null } })
          .values.draft
      : null;
    if (requested && calendarId !== requested && current?.dirty) {
      const discard = await confirmAction({
        title: 'Descartar observações não salvas?',
        description: 'Abrir outra revisão descartará as observações que ainda não foram salvas.',
        consequence: 'As observações descartadas não poderão ser recuperadas.',
        intent: 'danger',
        confirmLabel: 'Descartar e abrir revisão',
        cancelLabel: 'Continuar editando',
      });
      if (!discard) return;
      drafts?.clear(`review:${requested}`);
    }
    setCandidate({ routeId: calendarId, value: '' });
    report('Indicações automáticas disponíveis para conferência.', 'info');
    await navigate({ to: '/revisoes/$calendarId', params: { calendarId } });
  }
  const reviewMessage =
    result instanceof Error
      ? /removido|disponível/i.test(result.message)
        ? 'O calendário deixou de estar disponível para revisão. Selecione outro calendário para abrir a análise.'
        : result.message
      : message.text ||
        (!pagination.results.length && pagination.status === 'Exhausted'
          ? 'Nenhum calendário disponível para revisão.'
          : '');
  return (
    <section id="review-panel" className="page" aria-busy={Boolean(requested && !result)}>
      <div className="panel">
        <h2>Revisão técnico-pedagógica · DENTEC/PROENS</h2>
        <p>
          A revisão apoia o parecer; assinatura e tramitação ocorrem no SEI. Não constitui aprovação
          institucional.
        </p>
        <label>
          Calendário para revisão
          <select
            id="review-calendar"
            value={calendarId}
            disabled={!pagination.results.length && !requested}
            onChange={(event) => {
              setCandidate({ routeId: requested, value: event.target.value });
            }}
          >
            {requested && !pagination.results.some((calendar) => calendar.id === requested) ? (
              <option value={requested}>{opened?.calendar.name || 'Calendário solicitado'}</option>
            ) : null}
            {pagination.results.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {calendar.name} · {calendar.year} ·{' '}
                {(calendar.modalities || [calendar.offer])
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
        {requested ? <Link to="/revisoes">Voltar à lista de revisões</Link> : null}
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
