import { useNavigate } from '@tanstack/react-router';
import { offerIds, labelFor } from '#src/domain/calendar/offers.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { activityGroups, useActivitySearch } from './activity-query.ts';
import { useActivityList } from './activity-list.ts';
import {
  activityViews,
  originFilters,
  pendencyFilters,
  visibilityFilters,
} from './activity-step.ts';

type FilterKey =
  | 'atividadeBusca'
  | 'atividadeVisao'
  | 'atividadePendencia'
  | 'atividadeOferta'
  | 'atividadeSituacao'
  | 'atividadeOrigem'
  | 'atividadeVisibilidade'
  | 'atividadeAssunto';

export default function ActivityFilters() {
  const { state, record } = useCalendarEditor();
  const search = useActivitySearch();
  const navigate = useNavigate();
  function update(key: FilterKey, value: string) {
    void navigate({
      to: '/calendarios/$calendarId/atividades',
      params: { calendarId: record.id },
      search: (previous) => ({ ...previous, [key]: value || undefined }),
      replace: key === 'atividadeBusca',
      hashScrollIntoView: false,
    });
  }
  const { counts, view } = useActivityList();
  const extra = [
    search.atividadeSituacao,
    search.atividadeOrigem,
    search.atividadeVisibilidade,
    search.atividadeOferta,
    search.atividadeAssunto,
  ].filter(Boolean).length;
  return (
    <section className="activity-filters" aria-label="Consultar atividades e datas">
      <fieldset id="activity-mode" className="activity-view activity-mode">
        <legend className="visually-hidden">Visão</legend>
        <div className="activity-view-options">
          {activityViews.map(([id, label]) => (
            <label key={id}>
              <input
                type="radio"
                name="activity-mode"
                id={`activity-mode-${id}`}
                value={id}
                checked={view === id}
                onChange={() => update('atividadeVisao', id === 'data' ? id : '')}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="activity-search">
        <span className="visually-hidden">Buscar</span>
        <input
          id="activity-search"
          type="search"
          placeholder="Buscar atividade ou data"
          maxLength={200}
          value={search.atividadeBusca ?? ''}
          onChange={(event) => update('atividadeBusca', event.target.value)}
        />
      </label>
      <fieldset id="activity-pendency" className="activity-view">
        <legend className="visually-hidden">Pendência</legend>
        <div className="activity-view-options">
          {pendencyFilters.map(([id, label]) => (
            <label key={id || 'todas'}>
              <input
                type="radio"
                name="activity-pendency"
                id={`activity-pendency-${id || 'todas'}`}
                value={id}
                checked={(search.atividadePendencia ?? '') === id}
                onChange={() => update('atividadePendencia', id)}
              />
              {label}{' '}
              <span className="activity-view-count">
                {/* The by-date view counts dates: an activity with no date has no line in it. */}(
                {counts[id]}
                {view === 'data' ? (counts[id] === 1 ? ' data' : ' datas') : ''})
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <details className="activity-more-filters" open={extra > 0 || undefined}>
        <summary>Mais filtros{extra ? ` (${extra})` : ''}</summary>
        <div>
          <label>
            Situação da atividade
            <select
              id="activity-status"
              value={search.atividadeSituacao ?? ''}
              onChange={(event) => update('atividadeSituacao', event.target.value)}
            >
              <option value="">Todas as situações</option>
              <option value="pending">Pendente</option>
              <option value="partial">Parcial</option>
              <option value="complete">Completo</option>
              <option value="optional">Opcional</option>
              <option value="unconfigured">Aplicação a confirmar</option>
            </select>
          </label>
          <label>
            Origem
            <select
              id="activity-origin"
              value={search.atividadeOrigem ?? ''}
              onChange={(event) => update('atividadeOrigem', event.target.value)}
            >
              {originFilters.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Visibilidade
            <select
              id="activity-visibility"
              value={search.atividadeVisibilidade ?? ''}
              onChange={(event) => update('atividadeVisibilidade', event.target.value)}
            >
              {visibilityFilters.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Oferta
            <select
              id="activity-modality"
              value={search.atividadeOferta ?? ''}
              onChange={(event) => update('atividadeOferta', event.target.value)}
            >
              <option value="">Todas as ofertas</option>
              {offerIds(state).map((modality) => (
                <option key={modality} value={modality}>
                  {labelFor(state, modality)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Assunto
            <select
              id="activity-subject"
              value={search.atividadeAssunto ?? ''}
              onChange={(event) => update('atividadeAssunto', event.target.value)}
            >
              <option value="">Todos os assuntos</option>
              {activityGroups.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>
    </section>
  );
}
