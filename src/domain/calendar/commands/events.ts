import type { ActivityState, CalendarActivity, VacationPeriods } from '../model.ts';
import { equalValues } from '../../../shared/equal.ts';
import { datesBetween } from '../counting/core.ts';
import { periodsForOffer } from '../organization/periods.ts';
import { validateActivityRecord } from '../activities/validation.ts';
import { activityChecklist } from '../activities/checklist.ts';
import { stageRequirement } from '../activities/assessment.ts';
import { assessmentCycleIssue } from '../activities/assessment-intervals.ts';
import { offerIds } from '../offers.ts';
import { recalculateCalendar } from './recalculate.ts';
import { vacationIds } from './vacations.ts';
import { DomainError } from '../../errors.ts';

export function removeEvent<S extends ActivityState & { teacherVacations?: VacationPeriods }>(
  state: S,
  id: string,
  institutional: CalendarActivity[],
): S {
  if (!state.events.some((event) => event.id === id))
    throw new DomainError('O evento não existe mais.');
  const next = {
    ...state,
    events: state.events.filter((event) =>
      vacationIds.has(id) ? !vacationIds.has(event.id) : event.id !== id,
    ),
  };
  if (vacationIds.has(id)) delete next.teacherVacations;
  return recalculateCalendar(next, institutional);
}

/** Occurrence identity is independent of source documents and descriptive metadata. */
function sameOccurrence(a: CalendarActivity, b: CalendarActivity) {
  return (
    a.name.toLocaleLowerCase() === b.name.trim().toLocaleLowerCase() &&
    a.start === b.start &&
    a.end === b.end &&
    (a.recordType ?? 'event') === (b.recordType ?? 'event') &&
    equalValues(a.admission, b.admission) &&
    equalValues([...(a.offers ?? [])].sort(), [...(b.offers ?? [])].sort())
  );
}

export function applyEvent<S extends ActivityState>(
  state: S,
  event: S['events'][number],
  institutional: CalendarActivity[],
  editing = false,
): S {
  validateActivityRecord(state, event);
  if (!event.name.trim()) throw new DomainError('Informe a descrição.');
  if (!['include', 'exclude', 'note'].includes(event.kind))
    throw new DomainError('Tipo de evento inválido.');
  const modalities = event.offers;
  if (
    !modalities?.length ||
    new Set(modalities).size !== modalities.length ||
    modalities.some((item) => !offerIds(state).includes(item))
  )
    throw new DomainError('Selecione ao menos uma forma de oferta/nível válida para o evento.');
  const activity = activityChecklist(state).find((item) => item.id === event.requirementId);
  if (event.requirementId && !activity)
    throw new DomainError('Atividade inválida para este calendário.');
  const activityOfferId = activity?.offerId;
  if (activityOfferId && (modalities.length !== 1 || modalities[0] !== activityOfferId))
    throw new DomainError('Selecione somente a oferta da atividade.');
  const cycleIssue = assessmentCycleIssue(state, event);
  if (cycleIssue) throw new DomainError(cycleIssue);
  if (
    event.hours !== undefined &&
    (!Number.isFinite(event.hours) || event.hours <= 0 || event.hours > 8784)
  )
    throw new DomainError('Carga horária inválida.');
  if (editing && !state.events.some((item) => item.id === event.id))
    throw new DomainError('O evento não existe mais. Reabra o calendário.');
  if (
    event.kind === 'include' &&
    datesBetween(event.start, event.end).some((date) =>
      modalities.some(
        (modality) =>
          !periodsForOffer(state, modality).some(
            (period) => period.start <= date && period.end >= date,
          ),
      ),
    )
  )
    throw new DomainError('Inclusões letivas devem estar dentro dos períodos cadastrados.');
  const updated = { ...event, name: event.name.trim() };
  const existing = state.events.find((item) => item.id === event.id);
  if (!editing && existing) {
    if (equalValues(existing, updated)) return state;
    throw new DomainError(
      'O identificador do evento já existe. Reabra o registro antes de editar.',
    );
  }
  if (
    state.events.some(
      (item) =>
        item.id !== event.id &&
        sameOccurrence(item, updated) &&
        (!editing || !existing || !sameOccurrence(item, existing)),
    )
  )
    throw new DomainError('Este evento já foi incluído com as mesmas datas.');
  let events = editing
    ? state.events.map((item) => (item.id === event.id ? updated : item))
    : [...state.events, updated];
  if (editing && stageRequirement(event.requirementId))
    events = events.map((item) => {
      if (
        !stageRequirement(item.requirementId) ||
        (item.offers?.length && !item.offers?.some((modality) => modalities.includes(modality)))
      )
        return item;
      const { assessmentAutoStart: _auto, ...rest } = item;
      return rest;
    });
  return recalculateCalendar({ ...state, events }, institutional);
}
