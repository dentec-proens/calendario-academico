import type { ActivityState, CalendarActivity, Organization, AcademicTerm } from '../model.ts';
import { organizationSummary, organizationForModality } from '../organization/periods.ts';
import { activityChecklist } from '../activities/checklist.ts';
import { calendarModalities } from '../modalities.ts';
import { recalculateCalendar } from './recalculate.ts';
import { DomainError } from '../../errors.ts';

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
    throw new DomainError('O ciclo da oferta mudou. Reabra a atividade de matrícula.');
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
      throw new DomainError('Selecione o número de etapas por oferta.');
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
    throw new DomainError('Informe a organização de cada oferta.');
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
