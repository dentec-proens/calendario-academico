import type {
  ActivityState,
  CalendarActivity,
  CalendarPeriod,
  VacationPeriods,
} from '../domain-types.ts';
import { datesBetween } from '../calendar.ts';
import { durationEnd, recalculatePeriods } from '../duration.ts';
import { activityChecklist, assessmentCount, stageRequirement } from '../obligations.ts';
import { calendarModalities } from '../modalities.ts';
import { recalculateAssessmentStages } from '../stage-suggestions.ts';
import { teacherVacations } from '../teacher-vacations.ts';
import { saturdayEvents } from '../saturdays.ts';
import { campusInstitutionalEvents } from '../teacher-day.ts';

const vacationIds = new Set([
  'teacher-vacation-january',
  'teacher-vacation-july',
  'teacher-vacation-third',
]);

export function removeEvent<S extends ActivityState & { teacherVacations?: VacationPeriods }>(
  state: S,
  id: string,
  institutional: CalendarActivity[],
): S {
  if (!state.events.some((event) => event.id === id)) throw new Error('O evento não existe mais.');
  const next = {
    ...state,
    events: state.events.filter((event) =>
      vacationIds.has(id) ? !vacationIds.has(event.id) : event.id !== id,
    ),
  };
  if (vacationIds.has(id)) delete next.teacherVacations;
  return recalculateCalendar(next, institutional);
}

export function removePeriod<S extends ActivityState>(
  state: S,
  id: string,
  institutional: CalendarActivity[],
): S {
  if (!state.periods.some((period) => period.id === id))
    throw new Error('O período não existe mais.');
  return recalculateCalendar(
    { ...state, periods: state.periods.filter((period) => period.id !== id) },
    institutional,
  );
}

export function recalculateCalendar<S extends ActivityState>(
  state: S,
  institutional: CalendarActivity[],
): S {
  const inherited = campusInstitutionalEvents(institutional, state);
  const periods = recalculatePeriods(state, [...inherited, ...state.events]);
  const next = { ...state, periods };
  if (!periods.length) return next;
  return { ...next, events: recalculateAssessmentStages(next, [...inherited, ...next.events]) };
}

export function validateInterval(state: Pick<ActivityState, 'year'>, start: string, end: string) {
  datesBetween(start, end);
  if (Number(start.slice(0, 4)) !== state.year || Number(end.slice(0, 4)) !== state.year)
    throw new Error('As datas devem pertencer ao ano selecionado.');
}

export function applyWeek<S extends ActivityState>(
  state: S,
  values: { weekdays: number[]; weekEvidence: string; weekConfirmed: boolean },
  institutional: CalendarActivity[],
): S {
  if (
    !values.weekdays.length ||
    values.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 5)
  )
    throw new Error('Selecione pelo menos um dia regular.');
  if (!values.weekEvidence.trim()) throw new Error('Informe a referência da semana letiva.');
  if (!values.weekConfirmed) throw new Error('Confirme a organização da semana letiva.');
  return recalculateCalendar(
    {
      ...state,
      ...values,
      weekdays: [...new Set(values.weekdays)],
      weekEvidence: values.weekEvidence.trim(),
    },
    institutional,
  );
}

export function applyPeriod<S extends ActivityState>(
  state: S,
  values: { id?: string; name: string; start: string; end: string; days: string },
  institutional: CalendarActivity[],
  id: () => string,
): S {
  if (!values.name.trim()) throw new Error('Informe o nome do período.');
  if (values.id && !state.periods.some((period) => period.id === values.id))
    throw new Error('O período não existe mais. Reabra o calendário.');
  const end = values.days
    ? durationEnd(values.start, values.days, state, [...institutional, ...state.events])
    : values.end;
  validateInterval(state, values.start, end);
  if (
    state.periods.some(
      (period) => period.id !== values.id && period.start <= end && period.end >= values.start,
    )
  )
    throw new Error(
      'Este período se sobrepõe a outro. Para bimestres ou etapas de outra oferta, use Etapas de avaliação.',
    );
  const period: CalendarPeriod = {
    id: values.id || id(),
    name: values.name.trim(),
    start: values.start,
    end,
    ...(values.days ? { targetDays: Number(values.days) } : {}),
  };
  return recalculateCalendar(
    {
      ...state,
      periods: values.id
        ? state.periods.map((item) => (item.id === values.id ? period : item))
        : [...state.periods, period],
    },
    institutional,
  );
}

export function applyEvent<S extends ActivityState>(
  state: S,
  event: S['events'][number],
  institutional: CalendarActivity[],
  editing = false,
): S {
  validateInterval(state, event.start, event.end);
  if (!event.name.trim() || !event.evidence.trim()) throw new Error('Informe descrição e fonte.');
  if (!['include', 'exclude', 'note'].includes(event.kind))
    throw new Error('Tipo de evento inválido.');
  const modalities = event.modalities;
  if (!modalities?.length || modalities.some((item) => !calendarModalities(state).includes(item)))
    throw new Error('Selecione ao menos uma forma de oferta/nível válida para o evento.');
  const activity = activityChecklist(state).find((item) => item.id === event.requirementId);
  if (event.requirementId && !activity) throw new Error('Atividade inválida para este calendário.');
  if (activity?.modality && (modalities.length !== 1 || modalities[0] !== activity.modality))
    throw new Error('Selecione somente a oferta da atividade.');
  if (
    event.hours !== undefined &&
    (!Number.isFinite(event.hours) || event.hours <= 0 || event.hours > 8784)
  )
    throw new Error('Carga horária inválida.');
  if (editing && !state.events.some((item) => item.id === event.id))
    throw new Error('O evento não existe mais. Reabra o calendário.');
  if (
    state.events.some(
      (item) =>
        item.id !== event.id &&
        item.name.toLocaleLowerCase() === event.name.trim().toLocaleLowerCase() &&
        item.start === event.start &&
        item.end === event.end,
    )
  )
    throw new Error('Este evento já foi incluído com as mesmas datas.');
  if (
    event.kind === 'include' &&
    datesBetween(event.start, event.end).some(
      (date) => !state.periods.some((period) => period.start <= date && period.end >= date),
    )
  )
    throw new Error('Inclusões letivas devem estar dentro dos períodos cadastrados.');
  const updated = { ...event, name: event.name.trim(), evidence: event.evidence.trim() };
  let events = editing
    ? state.events.map((item) => (item.id === event.id ? updated : item))
    : [...state.events, updated];
  if (editing && stageRequirement(event.requirementId))
    events = events.map((item) => {
      if (
        !stageRequirement(item.requirementId) ||
        (item.modalities?.length &&
          !item.modalities.some((modality) => modalities.includes(modality)))
      )
        return item;
      const { assessmentAutoStart: _auto, ...rest } = item;
      return rest;
    });
  return recalculateCalendar({ ...state, events }, institutional);
}

export function applySaturdays<S extends ActivityState>(
  state: S,
  values: { dates: string[]; name: string; evidence: string; confirmed: boolean },
  institutional: CalendarActivity[],
  id: () => string,
): S {
  if (!values.confirmed) throw new Error('Confirme as atividades para a oferta deste calendário.');
  const events = saturdayEvents(state, values.dates, values.name, values.evidence, id);
  return recalculateCalendar({ ...state, events: [...state.events, ...events] }, institutional);
}

export function applyVacations<S extends ActivityState>(
  state: S,
  values: VacationPeriods & { evidence: string },
  institutional: CalendarActivity[],
): S {
  const vacation = teacherVacations(state.year, values, values.evidence);
  return recalculateCalendar(
    {
      ...state,
      teacherVacations: values,
      events: [...state.events.filter((event) => !vacationIds.has(event.id)), ...vacation.events],
    },
    institutional,
  );
}

export function configureAssessment<S extends ActivityState>(
  state: S,
  values: Record<string, string>,
  institutional: CalendarActivity[],
): S {
  const stages: Record<string, 2 | 3 | 4> = {};
  for (const modality of calendarModalities(state)) {
    const value = values[modality];
    if (!value) continue;
    const count = Number(value);
    if (count !== 2 && count !== 3 && count !== 4)
      throw new Error('Selecione o número de etapas por oferta.');
    stages[modality] = count;
  }
  const next = { ...state, assessmentStagesByModality: stages };
  const valid = new Set(activityChecklist(next).map((item) => item.id));
  return recalculateCalendar(
    {
      ...next,
      events: state.events.map((event) => {
        if (!event.requirementId || valid.has(event.requirementId)) return event;
        const { requirementId: _requirement, assessmentAutoStart: _anchor, ...rest } = event;
        return rest;
      }),
    },
    institutional,
  );
}

export function enableAutomaticAssessment<S extends ActivityState>(
  state: S,
  institutional: CalendarActivity[],
): S {
  const events = state.events.map((event) => ({ ...event }));
  let groups = 0;
  for (const modality of calendarModalities(state)) {
    const rows = events.filter(
      (event) =>
        stageRequirement(event.requirementId) &&
        (!event.modalities?.length || event.modalities.includes(modality)),
    );
    if (!rows.length) continue;
    if (rows.length !== assessmentCount(state, modality))
      throw new Error('Preencha todas as etapas da oferta antes de recalcular.');
    const anchor = rows.map((event) => event.start).sort()[0];
    for (const event of rows) event.assessmentAutoStart = anchor;
    groups++;
  }
  if (!groups) throw new Error('Preencha as etapas antes de recalcular.');
  return recalculateCalendar({ ...state, events }, institutional);
}
