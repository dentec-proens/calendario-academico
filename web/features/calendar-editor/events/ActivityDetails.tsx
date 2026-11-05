import { Pencil, Plus, Trash2 } from 'lucide-react';
import { offerIds, labelFor } from '#src/domain/calendar/offers.ts';
import { removeEvent } from '#src/domain/calendar/commands/events.ts';
import { situationLabels } from '#src/domain/calendar/activities/plan-evaluation.ts';
import { linkedTo } from '#src/domain/calendar/activities/links.ts';
import { activityKey } from '#src/domain/calendar/activities/activity-ref.ts';
import type { ActivityPlanItem } from '#src/domain/calendar/model.ts';
import { policyFor } from '#src/domain/policies/registry.ts';
import { offerFor } from '#src/domain/calendar/offers.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useEventEditor } from './EventEditorProvider.tsx';
import { useActivityCoverage } from './useActivityCoverage.ts';
import { longRange } from '#src/domain/date-labels.ts';
import { Button } from '../../../components/ui/Button.tsx';
import IntakeRequirementForm from '../forms/IntakeRequirementForm.tsx';
import { destinationIssueLines, destinationText, publicationLabels } from './notice-details.ts';

const formatHours = (hours: number) => `${hours.toLocaleString('pt-BR')} h`;

/** What the side panel shows about one activity: its status, offers and registered records. */
export default function ActivityDetails({
  item,
  detailOpen,
}: {
  item: ActivityPlanItem;
  detailOpen: boolean;
}) {
  const { state, applyCommand, readOnly } = useCalendarEditor();
  const editor = useEventEditor();
  const { rowsFor, statusFor, counts } = useActivityCoverage();
  // The activity is addressed by the key of its link, as in the list and the URL.
  const key = activityKey(item.activity);
  const evidence = rowsFor(key);
  const summary = statusFor(key);
  const policy = policyFor(state.year);
  const noteFor = (id: string) => {
    const offer = offerFor(state, id);
    return offer ? policy.applicabilityNote?.(item, offer) : undefined;
  };
  const registered = state.events.filter((event) => linkedTo(event, item));
  const stage = item.variant === 'stage';
  // Hours are summed per offer, since each period may cover a different set of offers.
  const showHours = Boolean(item.minHours) || registered.some((event) => event.hours);
  const hourTotals = offerIds(state)
    .map((offerId) => ({
      offerId,
      hours: registered
        .filter((event) => event.offers.includes(offerId))
        .reduce((sum, event) => sum + (event.hours ?? 0), 0),
    }))
    .filter((total) => registered.some((event) => event.offers.includes(total.offerId)));
  const sameTotal = new Set(hourTotals.map((total) => total.hours)).size === 1;
  // The form replaces the activity view; Voltar à atividade brings it back.
  if (editor.open && editor.context?.kind === 'activity') return null;
  return (
    <div className="activity-details" data-activity-details={key}>
      <p className="activity-meta">
        <span className="activity-status" data-status={summary.status}>
          {situationLabels[summary.status]}
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
            {item.decision ? ` · Decisão: ${item.decision}` : ''}
            {item.reason ? ` · ${item.reason}` : ''}
          </small>
        )}
      </p>
      <details
        className="activity-detail"
        data-activity-detail={key}
        open={
          detailOpen ||
          summary.diverges ||
          summary.problems ||
          evidence.some((row) => row.reviewNotes.length > 0)
        }
      >
        <summary>Situação por oferta e conferência</summary>
        <ul className="activity-coverage" aria-label="Cobertura por oferta">
          {evidence.map((row) => (
            <li key={row.offerId}>
              <strong>{labelFor(state, row.offerId)}: </strong>
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
                ? ` · ${row.execution === 'planned' ? 'Publicação programada' : row.execution === 'published' ? 'Publicação realizada' : 'Execução a conferir'}`
                : ''}
              <small>
                Conferência humana:{' '}
                {row.humanReview === 'reviewed'
                  ? 'revisado no conjunto vigente'
                  : row.humanReview === 'unmapped'
                    ? 'sem critério normativo vinculado'
                    : 'aguardando revisão atualizada'}
              </small>
              {offerFor(state, row.offerId)?.kind === 'posgraduacao' && (
                <small>
                  Depende de norma própria; não há afirmação automática de conformidade.
                </small>
              )}
              {noteFor(row.offerId) && <small>{noteFor(row.offerId)}</small>}
              {row.issues.map((issue) => (
                <small key={issue}>{issue}</small>
              ))}
              {row.warnings.map((warning) => (
                <small key={warning}>{warning}</small>
              ))}
              {row.reviewNotes.map((note) => (
                <small key={note}>{note}</small>
              ))}
            </li>
          ))}
        </ul>
        {item.reviewInstruction && <p className="help">{item.reviewInstruction}</p>}
      </details>
      <IntakeRequirementForm item={item} />
      {registered.length > 0 && (
        <ul className="activity-records" aria-label="Datas desta atividade">
          {registered.map((event) => (
            <li key={event.id} className="activity-record">
              <p>
                <strong>{event.name}</strong>
                <small>
                  {longRange(event)} ·{' '}
                  {event.offers.map((modality) => labelFor(state, modality)).join(', ')}
                  {showHours ? ` · ${formatHours(event.hours ?? 0)}` : ''}
                  {event.notice?.publication
                    ? ` · ${publicationLabels[event.notice.publication]}`
                    : ''}
                  {counts[event.id]
                    ? ' · ' +
                      counts[event.id]
                        .map(
                          (count) =>
                            `${labelFor(state, count.offerId)}: ${count.days} dias letivos (${count.saturdays} sábados; ${count.excluded} dias excluídos)`,
                        )
                        .join(' / ')
                    : ''}
                </small>
                {event.notice?.admission?.destinations.length ? (
                  <small>{destinationText(state, event.notice.admission.destinations)}</small>
                ) : null}
                {editor.pendingDates.has(event.id) && (
                  <small data-pending-draft={event.id}>Alterações não aplicadas</small>
                )}
                {destinationIssueLines(state, event).map((issue) => (
                  <small key={issue.offerId} className="notice-destination-issue">
                    {issue.text}
                  </small>
                ))}
              </p>
              <div className="actions">
                <Button
                  type="button"
                  variant="secondary"
                  data-edit-activity-event={event.id}
                  disabled={readOnly}
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
                      applyCommand((current) => removeEvent(current, event.id)) &&
                      editor.eventId === event.id
                    ) {
                      // The panel stays on the activity whose record was removed.
                      editor.discard();
                      editor.view(key);
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
      {showHours && registered.length > 0 && (
        <p className="activity-hours-total" data-activity-hours={key}>
          <strong>Carga horária registrada: </strong>
          {sameTotal
            ? formatHours(hourTotals[0].hours)
            : hourTotals
                .map((total) => `${labelFor(state, total.offerId)} ${formatHours(total.hours)}`)
                .join(' · ')}
          {item.minHours ? ` (mínimo de ${formatHours(item.minHours)})` : ''}
        </p>
      )}
      <Button
        type="button"
        data-prepare-activity={key}
        disabled={readOnly}
        onClick={() => editor.prepare(key)}
      >
        <Plus size={18} aria-hidden="true" />{' '}
        {registered.length ? 'Adicionar data' : 'Preencher atividade'}
      </Button>
    </div>
  );
}
