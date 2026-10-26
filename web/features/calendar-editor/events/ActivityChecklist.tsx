import { useEffect, useMemo } from 'react';
import { useSearch } from '@tanstack/react-router';
import { activityChecklist, stageRequirement } from '../../../../src/obligations.ts';
import { activityCoverage } from '../../../../src/calendar-rules/index.ts';
import { assessmentDayCounts } from '../../../../src/stage-suggestions.ts';
import { modalityLabels } from '../../../../src/modalities.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useEventEditor } from './EventEditorProvider.tsx';
import EventEditor from './EventEditor.tsx';
import { removeEvent } from '../../../../src/calendar-edits/commands.ts';
import { activityGroup, activityGroups, civilDate } from './activity-query.ts';
import { scrollIntoView } from '../../../scroll.ts';

export default function ActivityChecklist({ stages = false }: { stages?: boolean }) {
  const { state, events, institutional, applyCommand, readOnly, record, dirty } =
    useCalendarEditor();
  const editor = useEventEditor();
  const search = useSearch({ strict: false });
  const coverage = useMemo(
    () => activityCoverage(state, state.events, dirty ? undefined : record.readiness.humanReview),
    [state, dirty, record.readiness.humanReview],
  );
  const counts = useMemo(() => {
    try {
      return assessmentDayCounts(state, events);
    } catch {
      return {};
    }
  }, [state, events]);
  const selected =
    editor.context?.kind === 'activity'
      ? editor.context.requirementId
      : editor.context?.kind === 'new'
        ? editor.values.requirementId
        : '';
  useEffect(() => {
    if (!search.atividade) return;
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(`activity-${search.atividade}`);
      target?.closest('details')?.setAttribute('open', '');
      target?.focus({ preventScroll: true });
      scrollIntoView(target, { block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [search.atividade]);
  const mandatory = coverage.filter(
    (row) => row.applicability === 'required' && !stageRequirement(row.requirement.id),
  );
  const complete = mandatory.filter((row) => row.coverage === 'complete').length;
  const rows = activityChecklist(state).filter((item) => {
    if (Boolean(stageRequirement(item.id)) !== stages) return false;
    if (stages || selected === item.id || search.atividade === item.id) return true;
    const matches = coverage.filter(
      (row) =>
        row.requirement.id === item.id &&
        (!search.atividadeOferta || row.modality === search.atividadeOferta),
    );
    if (!matches.length) return false;
    if (
      search.atividadeBusca &&
      !`${item.name} ${item.basis ?? ''}`
        .toLocaleLowerCase()
        .includes(search.atividadeBusca.toLocaleLowerCase())
    )
      return false;
    if (search.atividadeAssunto && activityGroup(item.id) !== search.atividadeAssunto) return false;
    if (
      search.atividadeSituacao &&
      !matches.some(
        (row) =>
          search.atividadeSituacao === row.coverage ||
          search.atividadeSituacao === row.applicability,
      )
    )
      return false;
    return true;
  });
  const renderRow = (item: ReturnType<typeof activityChecklist>[number]) => {
    const registered = state.events.filter((event) => event.requirementId === item.id);
    const evidence = coverage.filter((row) => row.requirement.id === item.id);
    return (
      <li key={item.id} data-activity-row={item.id} className="activity-card">
        <div>
          <h4 id={`activity-${item.id}`} tabIndex={-1}>
            {item.name}
          </h4>
          {item.basis && (
            <small>
              {item.basis}
              {item.reason ? ` · ${item.reason}` : ''}
            </small>
          )}
          <ul className="activity-coverage" aria-label="Cobertura por oferta">
            {evidence.map((row) => (
              <li key={row.modality}>
                <strong>{modalityLabels[row.modality]}: </strong>
                {row.applicability === 'optional'
                  ? 'Opcional'
                  : row.applicability === 'unconfigured'
                    ? 'Escopo a conferir'
                    : 'Obrigatório'}
                {' · Planejamento '}
                {row.coverage === 'complete'
                  ? 'completo'
                  : row.coverage === 'partial'
                    ? 'parcial'
                    : 'pendente'}
                {row.events.length
                  ? ` · ${row.execution === 'planned' ? 'Publicação prevista' : row.execution === 'published' ? 'Publicação realizada com fonte' : 'Execução a conferir'}`
                  : ''}
                <small>
                  Conferência humana:{' '}
                  {row.humanReview === 'reviewed'
                    ? 'revisado no conjunto vigente'
                    : row.humanReview === 'unmapped'
                      ? 'sem critério normativo vinculado'
                      : 'aguardando revisão atualizada'}
                </small>
                {row.modality === 'posgraduacao' && (
                  <small>
                    Depende de norma própria; não há afirmação automática de conformidade.
                  </small>
                )}
                {state.year === 2027 &&
                  row.modality === 'integrado' &&
                  /^(enrolment|adjustment|withdrawal)-/.test(item.id) && (
                    <small>Não exigido por este inciso para o integrado; cadastro permitido.</small>
                  )}
                {row.issues.map((issue) => (
                  <small key={issue}>{issue}</small>
                ))}
                {row.warnings.map((warning) => (
                  <small key={warning}>{warning}</small>
                ))}
              </li>
            ))}
          </ul>
          {item.reviewInstruction && <p className="help">{item.reviewInstruction}</p>}
        </div>
        {registered.map((event) => (
          <div key={event.id} className="activity-record">
            <p>
              <strong>{event.name}</strong>
              <small>
                {civilDate(event.start)} a {civilDate(event.end)} ·{' '}
                {(event.modalities ?? state.modalities)
                  .map((modality) => modalityLabels[modality])
                  .join(', ')}
                {event.recordType === 'prior-reference' ? ' · Referência anterior' : ''}
                {event.publicationStatus === 'planned'
                  ? ' · Publicação prevista'
                  : event.publicationStatus === 'published'
                    ? ' · Publicação realizada'
                    : ''}
                {counts[event.id]
                  ? ' · ' +
                    counts[event.id]
                      .map(
                        (count) =>
                          `${modalityLabels[count.modality]}: ${count.days} dias letivos (${count.saturdays} sábados; ${count.excluded} dias excluídos)`,
                      )
                      .join(' / ')
                  : ''}
                {event.assessmentAutoStart ? ' · ajuste automático' : ''}
              </small>
              <small>Fonte: {event.evidence}</small>
            </p>
            <div className="actions">
              <button
                type="button"
                data-edit-activity-event={event.id}
                disabled={readOnly}
                onClick={() => editor.edit(event.id)}
              >
                Editar este registro
              </button>
              <button
                type="button"
                data-remove-event={event.id}
                disabled={readOnly}
                aria-label={`Remover ${event.name}`}
                onClick={() => {
                  if (
                    applyCommand((current) => removeEvent(current, event.id, institutional)) &&
                    editor.eventId === event.id
                  )
                    editor.discard();
                }}
              >
                {stages ? 'Excluir datas' : 'Remover este registro'}
              </button>
            </div>
          </div>
        ))}
        <div className="actions">
          <button
            type="button"
            data-prepare-activity={item.id}
            disabled={readOnly}
            onClick={() => editor.prepare(item.id)}
          >
            {registered.length ? 'Adicionar outro período/evento' : 'Preencher atividade'}
          </button>
        </div>
        {selected === item.id && <EventEditor />}
      </li>
    );
  };
  return (
    <>
      {!stages && (
        <p id="activity-summary" role="status">
          Planejamento: {complete} de {mandatory.length} pares obrigatórios de atividade, oferta e
          período completos. Publicações previstas continuam previstas; fontes e pertinência
          dependem de revisão humana.
        </p>
      )}
      {!stages && (
        <ul
          id="activity-summary-by-modality"
          className="activity-coverage"
          aria-label="Resumo do planejamento por oferta"
        >
          {state.modalities.map((modality) => {
            const required = mandatory.filter((row) => row.modality === modality);
            const fulfilled = required.filter((row) => row.coverage === 'complete').length;
            const unconfigured = coverage.filter(
              (row) =>
                row.modality === modality &&
                row.applicability === 'unconfigured' &&
                !stageRequirement(row.requirement.id),
            ).length;
            return (
              <li key={modality}>
                <strong>{modalityLabels[modality]}:</strong> {fulfilled} de {required.length} pares
                obrigatórios completos{unconfigured ? ` · ${unconfigured} escopos a conferir` : ''}.
                Opcionais fora do total obrigatório.
              </li>
            );
          })}
        </ul>
      )}
      {!rows.length && (
        <p id="activity-empty" className="notice">
          Nenhuma atividade corresponde aos filtros. O preenchimento em andamento foi preservado.
        </p>
      )}
      {stages ? (
        <ul id="assessment-checklist" className="records">
          {rows.map(renderRow)}
        </ul>
      ) : (
        <div id="activity-checklist">
          {activityGroups.map(([group, label]) => {
            const items = rows.filter((item) => activityGroup(item.id) === group);
            return items.length ? (
              <details key={group} className="activity-group" open>
                <summary>
                  {label} ({items.length})
                </summary>
                <ul className="records">{items.map(renderRow)}</ul>
              </details>
            ) : null;
          })}
        </div>
      )}
    </>
  );
}
