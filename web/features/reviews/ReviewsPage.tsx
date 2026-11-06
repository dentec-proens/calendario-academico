import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { usePaginatedQuery, useQuery } from 'convex/react';
import {
  reviewEditable,
  statusLabels,
  type CalendarStatus,
} from '#src/domain/calendar/lifecycle.ts';
import { useFeatureRoute } from '../../app/navigation.ts';
import { functions } from '../../shared/convex/client.ts';
import Pagination from '../../shared/forms/Pagination.tsx';
import { Notice } from '../../components/ui/Notice.tsx';
import { useAppSession } from '../../app/session.tsx';
import CampusFilter from '../calendar-list/CampusFilter.tsx';
import { useSelectedCampus } from '../calendar-list/selected-campus.ts';
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
  const { info } = useAppSession();
  const route = useFeatureRoute();
  const campus = useSelectedCampus();
  const navigate = useNavigate();
  // A situation the queue does not list, such as a draft, falls back to the default tab.
  const status = tabs.find(([value]) => value === route.situacao)?.[0] ?? 'enviado';
  // Only a parecer still open has a holder, so the other tabs have nothing to filter by.
  const responsavel = reviewEditable(status) ? route.responsavel : undefined;
  const filters = {
    campus: campus?.id,
    situacao: status === 'enviado' ? undefined : status,
    responsavel,
  };
  const [error, setError] = useState('');
  const pagination = usePaginatedQuery(
    functions.reviews.reviewQueue,
    {
      status,
      ...(campus ? { campusId: campus.id } : {}),
      ...(responsavel ? { holder: responsavel === 'meus' ? 'mine' : 'none' } : {}),
    } as const,
    { initialNumItems: 50 },
  );
  const counts = useQuery(functions.reviews.reviewQueueCounts, {
    ...(campus ? { campusId: campus.id } : {}),
    ...(responsavel ? { holder: responsavel === 'meus' ? 'mine' : 'none' } : {}),
  } as const);
  function select(next: (typeof tabs)[number][0]) {
    setError('');
    void navigate({
      to: '/revisoes',
      search: {
        ...filters,
        situacao: next === 'enviado' ? undefined : next,
        responsavel: reviewEditable(next) ? route.responsavel : undefined,
      },
      replace: true,
    });
  }
  return (
    <section id="review-panel" className="page">
      <div className="panel">
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
          {tabs.map(([value, label]) => {
            const waiting = value === 'enviado' || value === 'em_revisao' ? counts?.[value] : null;
            return (
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
                {/* Reserves the bold width, so selecting a tab does not move its neighbors. */}
                <span className="review-tab-label" data-label={label}>
                  {label}
                </span>
                {waiting?.count ? (
                  <span className="review-tab-count" data-queue-count={value}>
                    {waiting.more ? `${waiting.count}+` : waiting.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div id="review-queue-panel" role="tabpanel" aria-labelledby={`review-tab-${status}`}>
          <div className="calendar-list-tools review-queue-tools">
            <CampusFilter
              campuses={info.campuses}
              value={campus?.id ?? ''}
              onChange={(id) => {
                void navigate({
                  to: '/revisoes',
                  search: { ...filters, campus: id || undefined },
                  replace: true,
                });
              }}
            />
            {reviewEditable(status) ? (
              <label>
                Filtrar por responsável
                <select
                  id="review-holder-filter"
                  value={responsavel ?? ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    void navigate({
                      to: '/revisoes',
                      search: {
                        ...filters,
                        responsavel: value === 'meus' || value === 'livres' ? value : undefined,
                      },
                      replace: true,
                    });
                  }}
                >
                  <option value="">Todos</option>
                  <option value="meus">Meus pareceres</option>
                  <option value="livres">Sem responsável</option>
                </select>
              </label>
            ) : null}
          </div>
          <p className="review-queue-note">
            A revisão apoia o parecer; assinatura e tramitação ocorrem no SEI.
          </p>
          <ReviewQueue
            items={pagination.results}
            filters={filters}
            userId={info.user.id}
            onError={setError}
          />
          <Pagination
            pagination={pagination}
            label="Carregar mais calendários"
            loadingLabel="Carregando calendários para revisão…"
          />
          <div id="review-message" role="status" aria-live="polite">
            {error ? <Notice tone="danger">{error}</Notice> : null}
            {!pagination.results.length && pagination.status === 'Exhausted' ? (
              <Notice tone="info">
                Nenhum calendário {statusLabels[status].toLowerCase()}
                {campus ? ' neste campus' : ''}
                {responsavel ? ' com este responsável' : ''} no momento.
              </Notice>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
