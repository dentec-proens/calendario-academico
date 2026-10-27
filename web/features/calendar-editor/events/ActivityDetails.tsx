import { Pencil, Trash2 } from 'lucide-react';
import { modalityLabels } from '../../../../src/modalities.ts';
import { removeEvent } from '../../../../src/calendar-edits/commands.ts';
import { activityStatusLabels } from '../../../../src/activity-status.ts';
import type { ActivityRequirement } from '../../../../src/domain-types.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useEventEditor } from './EventEditorProvider.tsx';
import { useActivityCoverage } from './useActivityCoverage.ts';
import { civilDate } from './activity-query.ts';
import { Button } from '../../../components/ui/Button.tsx';
import IntakeRequirementForm from '../forms/IntakeRequirementForm.tsx';

/** What the side panel shows about one activity: its status, offers and registered records. */
export default function ActivityDetails({
  item,
  detailOpen,
}: {
  item: ActivityRequirement;
  detailOpen: boolean;
}) {
  const { state, institutional, applyCommand, readOnly } = useCalendarEditor();
  const editor = useEventEditor();
  const { rowsFor, statusFor, counts } = useActivityCoverage();
  const evidence = rowsFor(item.id);
  const summary = statusFor(item.id);
  const registered = state.events.filter((event) => event.requirementId === item.id);
  const stage = item.variant === 'stage';
  const preparing = editor.open && editor.context?.kind === 'activity' && !editor.eventId;
  return (
    <div className="activity-details" data-activity-details={item.id}>
      <p className="activity-meta">
        <span className="activity-status" data-status={summary.status}>
          {activityStatusLabels[summary.status]}
        </span>
        {summary.toConfirm > 0 && (
          <span className="activity-status" data-status="unconfigured">
            {summary.toConfirm === 1
              ? '1 oferta com aplicação a confirmar'
              : `${summary.toConfirm} ofertas com aplicação a confirmar`}
          </span>
        )}
        {item.basis && (
          <small>
            {item.basis}
            {item.reason ? ` · ${item.reason}` : ''}
          </small>
        )}
      </p>
      <details
        className="activity-detail"
        data-activity-detail={item.id}
        open={detailOpen || summary.diverges || summary.problems}
      >
        <summary>Situação por oferta e conferência</summary>
        <ul className="activity-coverage" aria-label="Cobertura por oferta">
          {evidence.map((row) => (
            <li key={row.modality}>
              <strong>{modalityLabels[row.modality]}: </strong>
              {row.applicability === 'optional'
                ? 'Opcional'
                : row.applicability === 'unconfigured'
                  ? 'Aplicação a confirmar'
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
      </details>
      <IntakeRequirementForm item={item} />
      {registered.length > 0 && (
        <ul className="activity-records" aria-label="Registros desta atividade">
          {registered.map((event) => (
            <li key={event.id} className="activity-record">
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
                <Button
                  type="button"
                  variant="secondary"
                  data-edit-activity-event={event.id}
                  disabled={readOnly || (editor.open && editor.eventId === event.id)}
                  aria-label={`Editar ${event.name}`}
                  onClick={() => editor.edit(event.id)}
                >
                  <Pencil size={18} aria-hidden="true" /> Editar
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  data-remove-event={event.id}
                  disabled={readOnly}
                  aria-label={`Remover ${event.name}`}
                  onClick={() => {
                    if (
                      applyCommand((current) => removeEvent(current, event.id, institutional)) &&
                      editor.eventId === event.id
                    ) {
                      // The panel stays on the activity whose record was removed.
                      editor.discard();
                      editor.view(item.id);
                    }
                  }}
                >
                  <Trash2 size={18} aria-hidden="true" />
                  {stage ? 'Excluir datas' : 'Remover'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!preparing && (
        <Button
          type="button"
          data-prepare-activity={item.id}
          disabled={readOnly}
          onClick={() => editor.prepare(item.id)}
        >
          {registered.length ? 'Adicionar outro período' : 'Preencher atividade'}
        </Button>
      )}
    </div>
  );
}
