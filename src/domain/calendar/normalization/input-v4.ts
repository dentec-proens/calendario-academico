import { civilDate, optionalCivilDate } from '../../civil-date.ts';
import { academicTerms, modalityIds, organizations } from '../config.ts';
import {
  calendarSchemaVersion,
  eventEffects,
  type CalendarEvent,
  type CalendarContent,
  type CalendarOffer,
  type CalendarPeriod,
  type IntakeConfiguration,
  type VacationPeriods,
} from '../model.ts';
import { invalidCalendar as fail } from './input.ts';

export const calendarObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail('Estrutura do calendário inválida.');
  return value as Record<string, unknown>;
};
const text = (value: unknown): string =>
  typeof value === 'string' ? value : fail('Texto do calendário inválido.');
const date = (value: unknown) => {
  try {
    return civilDate(value);
  } catch {
    return fail('Data civil do calendário inválida.');
  }
};
const optionalDate = (value: unknown) => {
  try {
    return optionalCivilDate(value);
  } catch {
    return fail('Data civil do calendário inválida.');
  }
};
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
const period = (value: unknown): CalendarPeriod => {
  const row = calendarObject(value),
    association = calendarObject(row.association);
  return {
    id: text(row.id),
    name: text(row.name),
    start: date(row.start),
    end: date(row.end),
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
const eventScope = (value: unknown): CalendarEvent['scope'] => {
  const scope = calendarObject(value);
  return { offers: array(scope.offers, text), confirmed: boolean(scope.confirmed) };
};
const activity = (value: unknown): CalendarEvent => {
  const row = calendarObject(value);
  if ('modalities' in row) return fail('Formato de atividade incompatível.');
  const notice = row.notice === undefined ? undefined : calendarObject(row.notice);
  const admission = notice?.admission === undefined ? undefined : calendarObject(notice.admission);
  const adjustment =
    row.deadlineAdjustment === undefined ? undefined : calendarObject(row.deadlineAdjustment);
  return {
    id: text(row.id),
    name: text(row.name),
    start: date(row.start),
    end: date(row.end),
    effect: choice(row.effect, eventEffects, 'Efeito inválido.'),
    category: optional(row.category, text),
    requirementId: optional(row.requirementId, text),
    scope: eventScope(row.scope),
    hours: optional(row.hours, number),
    assessmentAutoStart: optional(row.assessmentAutoStart, date),
    deadlineExtensionCause: optional(row.deadlineExtensionCause, (value) =>
      choice(value, ['municipal-holiday', 'municipal-recess'], 'Causa de prorrogação inválida.'),
    ),
    ...(notice
      ? {
          notice: {
            ...(notice.publication === undefined
              ? {}
              : {
                  publication: choice(
                    notice.publication,
                    ['planned', 'published'],
                    'Situação de publicação inválida.',
                  ),
                }),
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
                    destinations: array(admission.destinations, (item) => {
                      const destination = calendarObject(item);
                      return {
                        offerId: text(destination.offerId),
                        periodId: text(destination.periodId),
                      };
                    }),
                  },
                }
              : {}),
          },
        }
      : {}),
    ...(adjustment
      ? {
          deadlineAdjustment: {
            date: date(adjustment.date),
            reviewed: boolean(adjustment.reviewed),
          },
        }
      : {}),
  };
};
function vacations(value: unknown): VacationPeriods {
  const row = calendarObject(value);
  return {
    firstStart: date(row.firstStart),
    firstEnd: date(row.firstEnd),
    secondStart: optionalDate(row.secondStart),
    secondEnd: optionalDate(row.secondEnd),
    thirdStart: optionalDate(row.thirdStart),
    thirdEnd: optionalDate(row.thirdEnd),
  };
}

/**
 * Message for a copy exported before format 5. It is refused, never converted: the conversion
 * belongs only to the migration (plan `docs/plans/2026-11-02-atividades-e-datas.md`, decision 1).
 */
export const formatFourCopyMessage =
  'Esta cópia está no formato 4, anterior à atualização de atividades e datas. Exporte uma nova cópia do calendário.';

/** The v5 boundary never infers offer identity or organization from a legacy summary. */
export function readCalendarOfferInput(
  value: unknown,
): CalendarContent & { year: number; campus: string } {
  const row = calendarObject(value);
  if (row.schemaVersion === 4) return fail(formatFourCopyMessage);
  if (row.schemaVersion !== calendarSchemaVersion)
    return fail(
      `Formato de calendário incompatível. Use uma cópia de formato ${calendarSchemaVersion}.`,
    );
  if ('teacherDayDate' in row)
    return fail('Esta cópia usa o campo antigo do Dia do Professor e não pode mais ser importada.');
  return {
    schemaVersion: calendarSchemaVersion,
    year: number(row.year),
    campus: row.campus === undefined ? '' : text(row.campus),
    rulesetVersion: optional(row.rulesetVersion, text),
    offers: array(row.offers, offer),
    weekdays: array(row.weekdays, number),
    weekConfirmed: boolean(row.weekConfirmed),
    periods: array(row.periods, period),
    events: array(row.events, activity),
    observanceDates: optional(row.observanceDates, (value) =>
      Object.fromEntries(
        Object.entries(calendarObject(value)).map(([key, value]) => [key, date(value)]),
      ),
    ),
    teacherVacations: optional(row.teacherVacations, vacations),
  };
}
