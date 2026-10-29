import { academicTerms, calendarLimits, modalityIds } from '../config.ts';
import type {
  AssessmentSettings,
  CalendarActivity,
  CalendarContentV4,
  CalendarOffer,
  CalendarPeriod,
  IntakeConfiguration,
  VacationPeriods,
} from '../model.ts';
import { organizationForModality } from '../organization/periods.ts';
import { DomainError } from '../../errors.ts';
import { policyFor } from '../../policies/registry.ts';
import { convertCalendarV2 } from './conversion.ts';
import { associationOffers, organizationSummary, secondSemesterIntake } from '../offers.ts';

export interface LegacyCalendarInput extends AssessmentSettings {
  weekdays: number[];
  weekConfirmed: boolean;
  periods: CalendarPeriod[];
  events: CalendarActivity[];
  teacherDayDate?: string;
  teacherVacations?: VacationPeriods;
}

export interface CalendarConversionContext {
  year: number;
  /** The calendar record owns this list; content maps cannot create additional offers. */
  modalities: readonly string[];
}

/** Keys with no destination in v4, reported separately before applying a migration. */
export function calendarV3OrphanKeys(
  input: AssessmentSettings,
  context: CalendarConversionContext,
) {
  const outside = (map: object | undefined) =>
    Object.keys(map ?? {}).filter((key) => !context.modalities.includes(key));
  return {
    organizationByModality: outside(input.organizationByModality),
    intakeByModality: outside(input.intakeByModality),
    assessmentStagesByModality: outside(input.assessmentStagesByModality),
  };
}

function intakeFor(
  values: Record<string, IntakeConfiguration> | undefined,
): CalendarOffer['intake'] {
  if (!values) return undefined;
  const result: NonNullable<CalendarOffer['intake']> = {};
  for (const [key, value] of Object.entries(values)) {
    const term = academicTerms.find((candidate) => candidate === key);
    if (!term) throw new DomainError('Ciclo de ingresso inválido na conversão do calendário.');
    result[term] = { ...value };
  }
  return result;
}

/**
 * Migration-only adaptation: preserve dates and bindings, without adopting a new ruleset,
 * normalizing events or changing the calendar record's version and timestamps.
 */
export function convertCalendarV3(
  input: LegacyCalendarInput,
  context: CalendarConversionContext,
): CalendarContentV4 {
  if (input.schemaVersion !== undefined && ![2, 3].includes(input.schemaVersion))
    throw new DomainError('Formato de calendário incompatível com a conversão para v4.');
  if (
    !context.modalities.length ||
    context.modalities.length > calendarLimits.maximumOffers ||
    new Set(context.modalities).size !== context.modalities.length
  )
    throw new DomainError('Ofertas do calendário inválidas para a conversão.');

  const state = convertCalendarV2({
    ...structuredClone(input),
    year: context.year,
    modalities: [...context.modalities],
  });
  const policy = policyFor(context.year);
  const unresolvedSecondIntake =
    context.modalities.length > 1 && state.conversion?.legacySecondSemesterIntake !== undefined;

  const offers: CalendarOffer[] = context.modalities.map((modality) => {
    const kind = modalityIds.find((candidate) => candidate === modality);
    if (!kind) throw new DomainError('Tipo de oferta desconhecido na conversão do calendário.');
    const organization = organizationForModality(state, modality);
    const count = state.assessmentStagesByModality?.[modality];
    const perTerm =
      organization === 'anual' && count !== undefined && [2, 3, 4].includes(count)
        ? count
        : organization === 'semestral' && (count === 2 || count === 4)
          ? count / 2
          : undefined;
    let intake = intakeFor(state.intakeByModality?.[modality]);
    if (unresolvedSecondIntake && (!intake?.second || intake.second.status === 'unknown'))
      intake = { ...intake, second: { status: 'unknown' } };
    const offer: CalendarOffer = {
      id: modality,
      kind,
      delivery: 'a-conferir',
      organization,
    };
    return {
      ...offer,
      ...(perTerm === undefined ? {} : { stages: { perTerm } }),
      ...(state.scopeConfirmation && !policy.excludes(offer)
        ? { scope: { ...state.scopeConfirmation } }
        : {}),
      ...(intake === undefined ? {} : { intake }),
    };
  });

  const summary = organizationSummary(offers);
  const oldSuppressed = state.secondSemesterIntake === false;
  const derivedSuppressed = secondSemesterIntake(offers) === false;
  const needsLegacyDecision =
    policy.usesLegacySecondSemesterIntake &&
    (summary === 'semestral' || summary === 'misto') &&
    oldSuppressed !== derivedSuppressed;

  return {
    schemaVersion: 4,
    ...(state.rulesetVersion === undefined ? {} : { rulesetVersion: state.rulesetVersion }),
    offers,
    ...(needsLegacyDecision ? { legacySecondSemesterIntake: !oldSuppressed } : {}),
    weekdays: [...state.weekdays],
    weekConfirmed: state.weekConfirmed,
    periods: state.periods.map(({ association, ...period }) => ({
      ...period,
      association:
        association?.status === 'defined'
          ? {
              status: 'defined',
              offers: [...associationOffers(association)],
              term: association.term,
            }
          : { status: 'a-classificar' },
    })),
    events: state.events.map(({ modalities, ...event }) => ({
      ...event,
      ...(modalities === undefined ? {} : { offers: [...modalities] }),
    })),
    ...(state.teacherDayDate === undefined ? {} : { teacherDayDate: state.teacherDayDate }),
    ...(state.teacherVacations === undefined
      ? {}
      : { teacherVacations: { ...state.teacherVacations } }),
  };
}
