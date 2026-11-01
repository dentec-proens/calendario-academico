import { useState } from 'react';
import { usePaginatedQuery } from 'convex/react';
import { statusLabels, type CalendarStatus } from '#src/domain/calendar/lifecycle.ts';
import { functions } from '../../shared/convex/client.ts';
import Pagination from '../../shared/forms/Pagination.tsx';
import { Notice } from '../../components/ui/Notice.tsx';
import ReviewQueue from './ReviewQueue.tsx';

/** The reviewer works by status; drafts never reach the queue. */
const tabs = [
  ['enviado', 'Aguardando análise'],
  ['em_revisao', 'Em análise'],
  ['revisado', 'Concluídos'],
  ['devolvido', 'Devolvidos'],
  ['vigente', 'Vigentes'],
  ['arquivado', 'Arquivados'],
] as const satisfies readonly (readonly [Exclude<CalendarStatus, 'rascunho'>, string])[];
type QueueStatus = (typeof tabs)[number][0];

export default function ReviewsPage() {
  const [status, setStatus] = useState<QueueStatus>('enviado');
  const pagination = usePaginatedQuery(
    functions.reviews.reviewQueue,
    { status },
    { initialNumItems: 50 },
  );
  return (
    <section id="review-panel" className="page">
      <div className="panel">
        <h2>Revisão técnico-pedagógica · DENTEC/PROENS</h2>
        <p>
          A revisão apoia o parecer; assinatura e tramitação ocorrem no SEI. A publicação registra o
          processo SEI do calendário vigente.
        </p>
        <div
          className="review-tabs"
          role="tablist"
          aria-label="Situação dos calendários"
          onKeyDown={(event) => {
            // Only the selected tab is in the tab order; the arrows move between tabs.
            const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
            if (!step) return;
            event.preventDefault();
            const index = tabs.findIndex(([value]) => value === status);
            const next = tabs[(index + step + tabs.length) % tabs.length][0];
            setStatus(next);
            document.getElementById(`review-tab-${next}`)?.focus();
          }}
        >
          {tabs.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              id={`review-tab-${value}`}
              tabIndex={status === value ? 0 : -1}
              aria-selected={status === value}
              className={status === value ? 'secondary active' : 'secondary'}
              onClick={() => setStatus(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div role="tabpanel" aria-labelledby={`review-tab-${status}`}>
          <ReviewQueue items={pagination.results} />
          <Pagination
            pagination={pagination}
            label="Carregar mais calendários"
            loadingLabel="Carregando calendários para revisão…"
          />
          <div id="review-message" role="status" aria-live="polite">
            {!pagination.results.length && pagination.status === 'Exhausted' ? (
              <Notice tone="info">
                Nenhum calendário {statusLabels[status].toLowerCase()} no momento.
              </Notice>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
