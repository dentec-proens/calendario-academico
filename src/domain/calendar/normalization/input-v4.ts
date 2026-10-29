import { academicTerms, modalityIds, organizations } from '../config.ts';
import type {
  CalendarActivityV4,
  CalendarContentV4,
  CalendarOffer,
  CalendarPeriodV4,
  IntakeConfiguration,
  VacationPeriods,
} from '../model.ts';
import { invalidCalendar as fail } from './input.ts';

export const calendarObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail('Estrutura do calendário inválida.');
  return value as Record<string, unknown>;
};
const text = (value: unknown): string =>
  typeof value === 'string' ? value : fail('Texto do calendário inválido.');
const number = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? value
    : fail('Número do calendário inválido.');
const boolean = (value: unknown): boolean =>
  typeof value === 'boolean' ? value : fail('Estrutura do calendário inválida.');
const optional = <T>(value: unknown, read: (value: unknown) => T): T | undefined =>
  value === undefined ? undefined : read(value);
const array = <T>(value: unknown, read: (item: unknown) => T): T[] =>
  Array.isArray(value) ? value.map(read) : fail('Estrutura do calendário inválida.');
function choice<const T extends string>(value: unknown, choices: readonly T[], message: string): T {
  return choices.find((candidate) => candidate === value) ?? fail(message);
}
const term = (value: unknown) => choice(value, academicTerms, 'Ciclo letivo inválido.');
function offer(value: unknown): CalendarOffer {
  const row = calendarObject(value);
  const organization = choice(row.organization, organizations, 'Organização da oferta inválida.');
  const legacyStageCount =
    row.legacyStageCount === undefined
      ? undefined
      : (([2, 3, 4] as const).find((count) => count === row.legacyStageCount) ??
        fail('Quantidade anterior de etapas inválida.'));
  const intake: CalendarOffer['intake'] = row.intake === undefined ? undefined : {};
  if (intake)
    for (const [key, raw] of Object.entries(calendarObject(row.intake))) {
      const entry = calendarObject(raw);
      intake[term(key)] = {
        status: choice(
          entry.status,
          ['unknown', 'yes', 'no'],
          'Configuração de ingresso inválida.',
        ),
        ...(entry.required === undefined ? {} : { required: boolean(entry.required) }),
      } satisfies IntakeConfiguration;
    }
  return {
    id: text(row.id),
    kind: choice(row.kind, modalityIds, 'Tipo de oferta inválido.'),
    delivery: choice(row.delivery, ['presencial', 'ead', 'a-conferir'], 'Modo da oferta inválido.'),
    organization,
    ...(legacyStageCount === undefined ? {} : { legacyStageCount }),
    ...(row.label === undefined ? {} : { label: text(row.label) }),
    ...(row.organizationBasis === undefined
      ? {}
      : { organizationBasis: text(row.organizationBasis) }),
    ...(row.stages === undefined
      ? {}
      : { stages: { perTerm: number(calendarObject(row.stages).perTerm) } }),
    ...(row.scope === undefined
      ? {}
      : {
          scope: {
            status: choice(
              calendarObject(row.scope).status,
              ['covered', 'own-regulation'],
              'Escopo da oferta inválido.',
            ),
          },
        }),
    ...(intake === undefined ? {} : { intake }),
  };
}
const period = (value: unknown): CalendarPeriodV4 => {
  const row = calendarObject(value),
    association = calendarObject(row.association);
  return {
    id: text(row.id),
    name: text(row.name),
    start: text(row.start),
    end: text(row.end),
    ...(row.targetDays === undefined ? {} : { targetDays: number(row.targetDays) }),
    association:
      association.status === 'a-classificar'
        ? { status: 'a-classificar' }
        : association.status === 'defined'
          ? {
              status: 'defined',
              offers: array(association.offers, text),
              term: term(association.term),
            }
          : fail('Associação do período inválida.'),
  };
};
const activity = (value: unknown): CalendarActivityV4 => {
  const row = calendarObject(value);
  if ('modalities' in row) return fail('Formato de atividade incompatível.');
  const admission = row.admission === undefined ? undefined : calendarObject(row.admission);
  const adjustment =
    row.deadlineAdjustment === undefined ? undefined : calendarObject(row.deadlineAdjustment);
  return {
    id: text(row.id),
    name: text(row.name),
    start: text(row.start),
    end: text(row.end),
    kind: choice(row.kind, ['include', 'exclude', 'note'], 'Efeito inválido.'),
    category: optional(row.category, text),
    requirementId: optional(row.requirementId, text),
    offers: optional(row.offers, (value) => array(value, text)),
    hours: optional(row.hours, number),
    assessmentAutoStart: optional(row.assessmentAutoStart, text),
    recordType: optional(row.recordType, (value) =>
      choice(
        value,
        ['event', 'prior-reference', 'retired-stage'],
        'Natureza do registro inválida.',
      ),
    ),
    publicationStatus: optional(row.publicationStatus, (value) =>
      choice(value, ['planned', 'published'], 'Situação de publicação inválida.'),
    ),
    deadlineExtensionCause: optional(row.deadlineExtensionCause, (value) =>
      choice(value, ['municipal-holiday', 'municipal-recess'], 'Causa de prorrogação inválida.'),
    ),
    ...(admission
      ? {
          admission: {
            type: choice(
              admission.type,
              ['regular', 'transfer'],
              'Finalidade de ingresso inválida.',
            ),
            year: number(admission.year),
            term: term(admission.term),
            periodId: optional(admission.periodId, text),
          },
        }
      : {}),
    ...(adjustment
      ? {
          deadlineAdjustment: {
            date: text(adjustment.date),
            reviewed: boolean(adjustment.reviewed),
          },
        }
      : {}),
  };
};
function vacations(value: unknown): VacationPeriods {
  const row = calendarObject(value);
  return {
    firstStart: text(row.firstStart),
    firstEnd: text(row.firstEnd),
    secondStart: optional(row.secondStart, text),
    secondEnd: optional(row.secondEnd, text),
    thirdStart: optional(row.thirdStart, text),
    thirdEnd: optional(row.thirdEnd, text),
  };
}

/** The v4 boundary never infers offer identity or organization from a legacy summary. */
export function readCalendarOfferInput(
  value: unknown,
): CalendarContentV4 & { year: number; campus: string } {
  const row = calendarObject(value);
  if (row.schemaVersion !== 4)
    return fail('Formato de calendário incompatível. Use uma cópia de formato 4.');
  return {
    schemaVersion: 4,
    year: number(row.year),
    campus: row.campus === undefined ? '' : text(row.campus),
    rulesetVersion: optional(row.rulesetVersion, text),
    offers: array(row.offers, offer),
    weekdays: array(row.weekdays, number),
    weekConfirmed: boolean(row.weekConfirmed),
    periods: array(row.periods, period),
    events: array(row.events, activity),
    teacherDayDate: optional(row.teacherDayDate, text),
    teacherVacations: optional(row.teacherVacations, vacations),
    ...(row.legacySecondSemesterIntake === undefined
      ? {}
      : { legacySecondSemesterIntake: boolean(row.legacySecondSemesterIntake) }),
  };
}
