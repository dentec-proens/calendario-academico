import type {
  ActivityState,
  CalendarEvent,
  InstitutionalEventSnapshot,
  VacationPeriods,
} from '../model.ts';
import { equalValues } from '../../../shared/equal.ts';
import { datesBetween } from '../counting/core.ts';
import { periodsForOffer } from '../organization/periods.ts';
import { validateActivityRecord } from '../activities/validation.ts';
import { isAssessmentStage, sameActivity } from '../activities/activity-ref.ts';
import { assessmentCycleIssue } from '../activities/assessment-intervals.ts';
import {
  coversDate,
  dateEdited,
  generatedActivities,
  generatedActivity,
  linkKept,
} from '../activities/links.ts';
import { offerIds } from '../offers.ts';
import { recalculateCalendar } from './recalculate.ts';
import { vacationIds } from './vacations.ts';
import { DomainError } from '../../errors.ts';

export function removeEvent<S extends ActivityState & { teacherVacations?: VacationPeriods }>(
  state: S,
  id: string,
  institutional: InstitutionalEventSnapshot[],
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
function sameOccurrence(a: CalendarEvent, b: CalendarEvent) {
  return (
    a.name.toLocaleLowerCase() === b.name.trim().toLocaleLowerCase() &&
    a.start === b.start &&
    a.end === b.end &&
    equalValues(a.notice?.admission, b.notice?.admission) &&
    equalValues([...a.scope.offers].sort(), [...b.scope.offers].sort())
  );
}

export function applyEvent<S extends ActivityState>(
  state: S,
  event: S['events'][number],
  institutional: InstitutionalEventSnapshot[],
  editing = false,
): S {
  const existing = state.events.find((item) => item.id === event.id);
  // Link rule (`links.ts`): an edit keeps the date's own link, even without a generated activity;
  // interval and association checks apply only when start, end, offers or link change.
  const previous = editing ? existing : undefined;
  if (previous && !sameActivity(previous.activity, event.activity))
    throw new DomainError('Uma data salva não perde nem troca a atividade vinculada.');
  const edited = dateEdited(previous, event);
  const activity = generatedActivity(generatedActivities(state), event.activity);
  const kept = linkKept(previous, event);
  validateActivityRecord(state, event, {
    stageInterval: edited && !(kept && !activity),
    keptWithoutActivity: kept && !activity,
  });
  if (!event.name.trim()) throw new DomainError('Informe a descrição.');
  if (!['include', 'exclude', 'note'].includes(event.effect))
    throw new DomainError('Tipo de evento inválido.');
  const modalities = event.scope.offers;
  if (
    !modalities.length ||
    new Set(modalities).size !== modalities.length ||
    modalities.some((item) => !offerIds(state).includes(item))
  )
    throw new DomainError('Selecione ao menos uma forma de oferta/nível válida para o evento.');
  if (event.activity && !activity && !kept)
    throw new DomainError('Atividade inválida para este calendário.');
  const activityOfferId = activity?.offerId;
  if (edited && activityOfferId && (modalities.length !== 1 || modalities[0] !== activityOfferId))
    throw new DomainError('Selecione somente a oferta da atividade.');
  if (edited && activity && !coversDate(state, activity, event))
    throw new DomainError('A atividade vinculada não abrange as ofertas selecionadas.');
  // A kept link without generated activity has no cycle to check its dates against.
  const cycleIssue = edited && activity ? assessmentCycleIssue(state, event) : undefined;
  if (cycleIssue) throw new DomainError(cycleIssue);
  if (
    event.hours !== undefined &&
    (!Number.isFinite(event.hours) || event.hours <= 0 || event.hours > 8784)
  )
    throw new DomainError('Carga horária inválida.');
  if (editing && !state.events.some((item) => item.id === event.id))
    throw new DomainError('O evento não existe mais. Reabra o calendário.');
  if (
    event.effect === 'include' &&
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
  if (editing && isAssessmentStage(event.activity))
    events = events.map((item) => {
      if (
        !isAssessmentStage(item.activity) ||
        !item.scope.offers.some((modality) => modalities.includes(modality))
      )
        return item;
      const { assessmentAutoStart: _auto, ...rest } = item;
      return rest;
    });
  return recalculateCalendar({ ...state, events }, institutional);
}
