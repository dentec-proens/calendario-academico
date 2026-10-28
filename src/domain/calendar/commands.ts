import type {
  ActivityState,
  CalendarActivity,
  CalendarPeriod,
  VacationPeriods,
  PeriodAssociation,
  Organization,
  AcademicTerm,
} from './model.ts';
import { equalValues } from '../../equal.ts';
import { datesBetween } from './counting/core.ts';
import {
  periodsForModality,
  samePeriodScope,
  organizationSummary,
  organizationForModality,
} from './organization/periods.ts';
import { validateActivityRecord } from './activities/validation.ts';
import { durationEnd, recalculatePeriods } from './counting/duration.ts';
import { activityChecklist } from './activities/checklist.ts';
import { stageRequirement } from './activities/assessment.ts';
import { calendarModalities } from './modalities.ts';
import { teacherVacations } from './activities/teacher-vacations.ts';
import { isSaturdayRecord, saturdayEvents } from './activities/saturdays.ts';
import { campusInstitutionalEvents } from '../institution/teacher-day.ts';

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
  return next;
}

export function validateInterval(state: Pick<ActivityState, 'year'>, start: string, end: string) {
  datesBetween(start, end);
  if (Number(start.slice(0, 4)) !== state.year || Number(end.slice(0, 4)) !== state.year)
    throw new Error('As datas devem pertencer ao ano selecionado.');
}

export function applyWeek<S extends ActivityState>(
  state: S,
  values: { weekdays: number[]; weekConfirmed: boolean },
  institutional: CalendarActivity[],
): S {
  if (
    !values.weekdays.length ||
    values.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 5)
  )
    throw new Error('Selecione pelo menos um dia regular.');
  if (!values.weekConfirmed) throw new Error('Confirme a organização da semana letiva.');
  return recalculateCalendar(
    {
      ...state,
      ...values,
      weekdays: [...new Set(values.weekdays)],
    },
    institutional,
  );
}

export function applyPeriod<S extends ActivityState>(
  state: S,
  values: {
    id?: string;
    name: string;
    start: string;
    end: string;
    days: string;
    association?: PeriodAssociation;
  },
  institutional: CalendarActivity[],
  id: () => string,
): S {
  if (!values.name.trim()) throw new Error('Informe o nome do período.');
  if (values.id && !state.periods.some((period) => period.id === values.id))
    throw new Error('O período não existe mais. Reabra o calendário.');
  const associated =
    values.association?.status === 'defined' ? values.association.modalities : undefined;
  if (
    associated &&
    (!associated.length ||
      new Set(associated).size !== associated.length ||
      associated.some((m) => !calendarModalities(state).includes(m)))
  )
    throw new Error('Associação do período incompatível com a organização por oferta.');
  if (values.association?.status === 'defined' && associated) {
    const organization = values.association.term === 'annual' ? 'anual' : 'semestral';
    const conflicts = state.periods.filter(
      (period) =>
        period.id !== values.id &&
        period.association?.status === 'defined' &&
        period.association.modalities.some((m) => associated.includes(m)) &&
        (period.association.term === 'annual' ? 'anual' : 'semestral') !== organization,
    );
    if (conflicts.length)
      throw new Error(
        `O ciclo conflita com ${conflicts.map((p) => p.name || p.id).join(', ')}. Edite os períodos existentes antes de mudar o ciclo da oferta.`,
      );
    if (
      associated.some(
        (m) =>
          organizationForModality(state, m) !== organization &&
          Object.entries(state.intakeByModality?.[m] ?? {}).some(
            ([term, entry]) => entry.required && (term === 'annual') !== (organization === 'anual'),
          ),
      )
    )
      throw new Error(
        'Revise a exigência local de matrícula nas atividades antes de alterar o ciclo da oferta.',
      );
    const previous = state.periods.find((p) => p.id === values.id);
    if (
      previous?.association?.status === 'defined' &&
      previous.association.term !== values.association.term &&
      state.events.some((event) => event.admission?.periodId === previous.id)
    )
      throw new Error('Revise os editais vinculados a este período antes de alterar seu ciclo.');
    const organizationByModality = Object.fromEntries(
      calendarModalities(state).map((m) => [
        m,
        associated.includes(m) ? organization : organizationForModality(state, m),
      ]),
    );
    const candidate = {
      ...state,
      schemaVersion: 3 as const,
      organizationByModality,
      regime: organizationSummary(organizationByModality, calendarModalities(state)),
    };
    const requirements = new Map(activityChecklist(candidate).map((item) => [item.id, item]));
    const incompatible = state.events.filter((event) => {
      if (!event.requirementId) return false;
      const requirement = requirements.get(event.requirementId);
      if (!requirement) return true;
      return (event.modalities?.length ? event.modalities : calendarModalities(state)).some(
        (m) =>
          associated.includes(m) &&
          organizationForModality(state, m) !== organization &&
          ((requirement.modality && requirement.modality !== m) ||
            (requirement.modalities && !requirement.modalities.includes(m))),
      );
    });
    if (incompatible.length)
      throw new Error(
        `Revise as atividades vinculadas antes de alterar o ciclo: ${incompatible.map((event) => event.name).join(', ')}.`,
      );
    state = candidate;
  }
  if (
    values.association?.status === 'defined' &&
    state.periods.some(
      (p) =>
        p.id !== values.id &&
        p.association?.status === 'defined' &&
        p.association.term ===
          (values.association?.status === 'defined' ? values.association.term : undefined) &&
        p.association.modalities.some((m) => associated?.includes(m)),
    )
  )
    throw new Error('Já existe um período para este ciclo da oferta. Edite o período existente.');
  if (state.schemaVersion === 3 && values.days && !associated)
    throw new Error('Classifique a oferta e o ciclo do período antes de calcular o término.');
  const scopedState = associated
    ? { ...state, modalities: associated, offer: associated[0] }
    : state;
  const end = values.days
    ? durationEnd(values.start, values.days, scopedState, [...institutional, ...state.events])
    : values.end;
  validateInterval(state, values.start, end);
  if (
    state.periods.some(
      (period) =>
        period.id !== values.id &&
        samePeriodScope(period, {
          id: values.id ?? 'new',
          start: values.start,
          end,
          association: values.association,
        }) &&
        period.start <= end &&
        period.end >= values.start,
    )
  )
    throw new Error(
      'Este período se sobrepõe a outro. Para bimestres ou etapas de outra oferta, use Etapas de avaliação.',
    );
  const period: CalendarPeriod = {
    id: values.id || id(),
    name: values.name.trim(),
    ...(values.association ? { association: values.association } : {}),
    start: values.start,
    end,
    ...(values.days ? { targetDays: Number(values.days) } : {}),
  };
  const periods = values.id
    ? state.periods.map((item) => (item.id === values.id ? period : item))
    : [...state.periods, period];
  return recalculateCalendar(
    {
      ...state,
      periods,
      conversion: state.conversion
        ? {
            ...state.conversion,
            organization:
              periods.every((p) => p.association?.status === 'defined') &&
              calendarModalities(state).every(
                (m) => organizationForModality(state, m) !== 'a-classificar',
              )
                ? 'classified'
                : 'pending',
          }
        : undefined,
    },
    institutional,
  );
}

/** Change only the selected offer/cycle; existing intake declarations stay intact. */
export function configureIntakeRequirement<S extends ActivityState>(
  state: S,
  modality: string,
  term: AcademicTerm,
  required: boolean,
): S {
  if (
    !calendarModalities(state).includes(modality) ||
    organizationForModality(state, modality) !== (term === 'annual' ? 'anual' : 'semestral')
  )
    throw new Error('O ciclo da oferta mudou. Reabra a atividade de matrícula.');
  const current = state.intakeByModality?.[modality]?.[term];
  return {
    ...state,
    intakeByModality: {
      ...state.intakeByModality,
      [modality]: {
        ...state.intakeByModality?.[modality],
        [term]: {
          ...current,
          status: required ? 'yes' : (current?.status ?? 'unknown'),
          required,
        },
      },
    },
  };
}

/** Occurrence identity is independent of source documents and descriptive metadata. */
function sameOccurrence(a: CalendarActivity, b: CalendarActivity) {
  return (
    a.name.toLocaleLowerCase() === b.name.trim().toLocaleLowerCase() &&
    a.start === b.start &&
    a.end === b.end &&
    (a.recordType ?? 'event') === (b.recordType ?? 'event') &&
    equalValues(a.admission, b.admission) &&
    equalValues([...(a.modalities ?? [])].sort(), [...(b.modalities ?? [])].sort())
  );
}

export function applyEvent<S extends ActivityState>(
  state: S,
  event: S['events'][number],
  institutional: CalendarActivity[],
  editing = false,
): S {
  validateActivityRecord(state, event);
  if (!event.name.trim()) throw new Error('Informe a descrição.');
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
    event.kind === 'include' &&
    datesBetween(event.start, event.end).some((date) =>
      modalities.some(
        (modality) =>
          !periodsForModality(state, modality).some(
            (period) => period.start <= date && period.end >= date,
          ),
      ),
    )
  )
    throw new Error('Inclusões letivas devem estar dentro dos períodos cadastrados.');
  const updated = { ...event, name: event.name.trim() };
  const existing = state.events.find((item) => item.id === event.id);
  if (!editing && existing) {
    if (equalValues(existing, updated)) return state;
    throw new Error('O identificador do evento já existe. Reabra o registro antes de editar.');
  }
  if (
    state.events.some(
      (item) =>
        item.id !== event.id &&
        sameOccurrence(item, updated) &&
        (!editing || !existing || !sameOccurrence(item, existing)),
    )
  )
    throw new Error('Este evento já foi incluído com as mesmas datas.');
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
  values: { dates: string[]; name: string; confirmed: boolean },
  institutional: CalendarActivity[],
  id: () => string,
): S {
  if (!values.confirmed) throw new Error('Confirme as atividades para a oferta deste calendário.');
  const events = saturdayEvents(state, values.dates, values.name, id);
  return recalculateCalendar({ ...state, events: [...state.events, ...events] }, institutional);
}

export function applySaturdayActivities<S extends ActivityState>(
  state: S,
  activities: { date: string; name: string }[],
  institutional: CalendarActivity[],
  id: () => string,
): S {
  if (!activities.length) throw new Error('Selecione pelo menos um sábado.');
  // Build the entire batch before applying it, so an invalid date cannot partially change state.
  const events: CalendarActivity[] = [];
  for (const activity of activities) {
    try {
      events.push(
        ...saturdayEvents(
          { ...state, events: [...state.events, ...events] },
          [activity.date],
          activity.name,
          id,
        ),
      );
    } catch (error) {
      throw new Error(
        `${activity.date.split('-').reverse().join('/')}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return recalculateCalendar({ ...state, events: [...state.events, ...events] }, institutional);
}

export function updateSaturdayActivity<S extends ActivityState>(
  state: S,
  values: { id: string; name: string },
  institutional: CalendarActivity[],
): S {
  const current = state.events.find((event) => event.id === values.id);
  if (!current) throw new Error('O sábado não existe mais. Reabra o calendário.');
  if (!isSaturdayRecord(current))
    throw new Error('Este registro é editado em Atividades e datas do campus.');
  const name = values.name.trim();
  if (!name) throw new Error('Informe a atividade.');
  return recalculateCalendar(
    {
      ...state,
      events: state.events.map((event) => (event.id === values.id ? { ...event, name } : event)),
    },
    institutional,
  );
}

export function applyVacations<S extends ActivityState>(
  state: S,
  values: VacationPeriods,
  institutional: CalendarActivity[],
): S {
  const vacation = teacherVacations(state.year, values);
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

/** Classifying organization never guesses which legacy period belongs to which offer. */
export function configureOrganization<S extends ActivityState>(
  state: S,
  organizationByModality: Record<string, Organization>,
  institutional: CalendarActivity[],
): S {
  const modalities = calendarModalities(state);
  if (
    Object.keys(organizationByModality).some((m) => !modalities.includes(m)) ||
    modalities.some(
      (m) => !['anual', 'semestral', 'a-classificar'].includes(organizationByModality[m]),
    )
  )
    throw new Error('Informe a organização de cada oferta.');
  const periods = state.periods.map((p) =>
    p.association?.status === 'defined' &&
    p.association.modalities.every(
      (m) =>
        organizationByModality[m] ===
        (p.association?.status === 'defined' && p.association.term === 'annual'
          ? 'anual'
          : 'semestral'),
    )
      ? p
      : { ...p, association: { status: 'a-classificar' as const } },
  );
  return recalculateCalendar(
    {
      ...state,
      schemaVersion: 3,
      organizationByModality: { ...organizationByModality },
      regime: organizationSummary(organizationByModality, modalities),
      periods,
      conversion: state.conversion
        ? {
            ...state.conversion,
            organization:
              periods.every((p) => p.association?.status === 'defined') &&
              modalities.every((m) => organizationByModality[m] !== 'a-classificar')
                ? 'classified'
                : 'pending',
          }
        : undefined,
    },
    institutional,
  );
}
