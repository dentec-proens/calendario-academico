import { useNavigate } from '@tanstack/react-router';
import { modalityLabels } from '../../../../src/domain/calendar/modalities.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { activityGroups, useActivitySearch } from './activity-query.ts';

export default function ActivityFilters() {
  const { state, record } = useCalendarEditor();
  const search = useActivitySearch();
  const navigate = useNavigate();
  function update(
    key: 'atividadeBusca' | 'atividadeOferta' | 'atividadeSituacao' | 'atividadeAssunto',
    value: string,
  ) {
    void navigate({
      to: '/calendarios/$calendarId/eventos',
      params: { calendarId: record.id },
      search: (previous) => ({ ...previous, [key]: value || undefined }),
      replace: key === 'atividadeBusca',
      hashScrollIntoView: false,
    });
  }
  const extra = [search.atividadeOferta, search.atividadeAssunto].filter(Boolean).length;
  return (
    <section className="activity-filters" aria-label="Consultar atividades">
      <label>
        Buscar atividade
        <input
          id="activity-search"
          type="search"
          maxLength={200}
          value={search.atividadeBusca ?? ''}
          onChange={(event) => update('atividadeBusca', event.target.value)}
        />
      </label>
      <label>
        Situação
        <select
          id="activity-status"
          value={search.atividadeSituacao ?? ''}
          onChange={(event) => update('atividadeSituacao', event.target.value)}
        >
          <option value="">A preencher</option>
          <option value="all">Todas</option>
          <option value="pending">Pendente</option>
          <option value="partial">Parcial</option>
          <option value="complete">Completo</option>
          <option value="optional">Opcional</option>
          <option value="unconfigured">Aplicação a confirmar</option>
        </select>
      </label>
      <details className="activity-more-filters" open={extra > 0 || undefined}>
        <summary>Mais filtros{extra ? ` (${extra})` : ''}</summary>
        <div>
          <label>
            Oferta
            <select
              id="activity-modality"
              value={search.atividadeOferta ?? ''}
              onChange={(event) => update('atividadeOferta', event.target.value)}
            >
              <option value="">Todas as ofertas</option>
              {state.modalities.map((modality) => (
                <option key={modality} value={modality}>
                  {modalityLabels[modality]}
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
