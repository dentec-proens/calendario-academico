import { useNavigate } from '@tanstack/react-router';
import { usePaginatedQuery } from 'convex/react';
import { statusLabels, type CalendarStatus } from '#src/domain/calendar/lifecycle.ts';
import { useFeatureRoute } from '../../app/navigation.ts';
import { functions } from '../../shared/convex/client.ts';
import Pagination from '../../shared/forms/Pagination.tsx';
import { Notice } from '../../components/ui/Notice.tsx';
import ReviewQueue from './ReviewQueue.tsx';
import './reviews.css';

/** The reviewer works by status; drafts never reach the queue. */
const tabs = [
  ['enviado', 'Aguardando análise'],
  ['em_revisao', 'Em análise'],
  ['revisado', 'Concluídos'],
  ['devolvido', 'Devolvidos'],
  ['vigente', 'Vigentes'],
  ['arquivado', 'Arquivados'],
] as const satisfies readonly (readonly [Exclude<CalendarStatus, 'rascunho'>, string])[];

export default function ReviewsPage() {
  const route = useFeatureRoute();
  const navigate = useNavigate();
  // A situation the queue does not list, such as a draft, falls back to the default tab.
  const status = tabs.find(([value]) => value === route.situacao)?.[0] ?? 'enviado';
  const urlStatus = status === 'enviado' ? undefined : status;
  const pagination = usePaginatedQuery(
    functions.reviews.reviewQueue,
    { status },
    { initialNumItems: 50 },
  );
  function select(next: (typeof tabs)[number][0]) {
    void navigate({
      to: '/revisoes',
      search: {
        campus: route.campus || undefined,
        situacao: next === 'enviado' ? undefined : next,
      },
      replace: true,
    });
  }
  return (
    <section id="review-panel" className="page">
      <div className="panel">
        <p className="review-queue-note">
          A revisão apoia o parecer; assinatura e tramitação ocorrem no SEI.
        </p>
        <div
          className="review-tabs"
          role="tablist"
          aria-label="Situação dos calendários"
          onKeyDown={(event) => {
            // Only the selected tab is in the tab order; the arrows move between tabs. The URL
            // updates asynchronously, so a quick second press starts from the focused tab.
            const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
            if (!step) return;
            event.preventDefault();
            const focused = (event.target as HTMLElement).id;
            const index = tabs.findIndex(([value]) => `review-tab-${value}` === focused);
            const next = tabs[(index + step + tabs.length) % tabs.length][0];
            select(next);
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
              aria-controls="review-queue-panel"
              onClick={() => select(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {/* With no link to reach in the list, the panel itself takes the keyboard focus. */}
        <div
          id="review-queue-panel"
          role="tabpanel"
          aria-labelledby={`review-tab-${status}`}
          tabIndex={pagination.results.length ? undefined : 0}
        >
          <ReviewQueue items={pagination.results} status={urlStatus} />
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
