import type {
  CalendarActivity,
  CalendarPeriod,
  VacationPeriods,
  Admission,
  AcademicTerm,
  PeriodAssociation,
  Organization,
  IntakeConfiguration,
  CalendarConversion,
} from './domain-types.ts';

/** JSON boundary shared by file imports and the domain normalizer. */
export const invalidCalendar = (message: string, status = 400): never => {
  throw Object.assign(Error(message), { status });
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return invalidCalendar('Estrutura do calendário inválida.');
  return value as Record<string, unknown>;
};
const string = (value: unknown): string => {
  if (typeof value !== 'string') return invalidCalendar('Texto do calendário inválido.');
  return value;
};
const number = (value: unknown): number => {
  if (typeof value !== 'number') return invalidCalendar('Número do calendário inválido.');
  return value;
};
const boolean = (value: unknown): boolean => {
  if (typeof value !== 'boolean') return invalidCalendar('Estrutura do calendário inválida.');
  return value;
};
const optional = <T>(value: unknown, read: (value: unknown) => T): T | undefined =>
  value === undefined ? undefined : read(value);
const array = <T>(value: unknown, read: (item: unknown) => T): T[] => {
  if (!Array.isArray(value)) return invalidCalendar('Estrutura do calendário inválida.');
  return value.map(read);
};
const association = (value: unknown): PeriodAssociation => {
  const row = object(value);
  if (row.status === 'a-classificar') return { status: 'a-classificar' };
  if (row.status !== 'defined') return invalidCalendar('Associação de período inválida.');
  return {
    status: 'defined',
    modalities: array(row.modalities, string),
    term: string(row.term) as AcademicTerm,
  };
};
const admission = (value: unknown): Admission => {
  const row = object(value);
  return {
    type: string(row.type) as Admission['type'],
    year: number(row.year),
    term: string(row.term) as AcademicTerm,
    periodId: optional(row.periodId, string),
  };
};
const range = (value: unknown): CalendarPeriod & { name: string } => {
  const row = object(value);
  return {
    id: string(row.id),
    name: string(row.name),
    start: string(row.start),
    end: string(row.end),
    targetDays: optional(row.targetDays, number),
    association: optional(row.association, association),
  };
};
const activity = (value: unknown): CalendarActivity => {
  const row = object(value);
  const requirement = optional(row.requirementId, string) ?? '';
  if (
    'offers' in row ||
    /^stage-(start|end)-[1-4]$/.test(requirement) ||
    /^(stage|results|council|pedagogical-meeting)-[1-4]$/.test(requirement)
  )
    return invalidCalendar('Formato de atividade incompatível.');
  return {
    ...range(row),
    kind: string(row.kind),
    category: optional(row.category, string),
    requirementId: optional(row.requirementId, string),
    modalities: optional(row.modalities, (value) => array(value, string)),
    hours: optional(row.hours, number),
    assessmentAutoStart: optional(row.assessmentAutoStart, string),
    deadlineExtensionCause: optional(
      row.deadlineExtensionCause,
      string,
    ) as CalendarActivity['deadlineExtensionCause'],
    recordType: optional(row.recordType, string) as CalendarActivity['recordType'],
    publicationStatus: optional(
      row.publicationStatus,
      string,
    ) as CalendarActivity['publicationStatus'],
    admission: optional(row.admission, admission),
    deadlineAdjustment: optional(row.deadlineAdjustment, (value) => {
      const adjustment = object(value);
      return {
        date: string(adjustment.date),
        reviewed: boolean(adjustment.reviewed),
      };
    }),
  };
};
export type VacationInput = VacationPeriods;
export function readCalendarInput(value: unknown) {
  const row = object(value);
  if (![2, 3].includes(number(row.schemaVersion)) || 'assessmentStages' in row)
    return invalidCalendar(
      'Formato de calendário incompatível. Use uma cópia schemaVersion 2 ou 3.',
    );
  const vacations = optional(row.teacherVacations, object);
  if (vacations && 'julyStart' in vacations)
    return invalidCalendar('Formato de férias incompatível.');
  return {
    schemaVersion: number(row.schemaVersion),
    rulesetVersion: optional(row.rulesetVersion, string),
    organizationByModality: optional(row.organizationByModality, (value) =>
      Object.fromEntries(
        Object.entries(object(value)).map(([key, value]) => [key, string(value) as Organization]),
      ),
    ),
    intakeByModality: optional(row.intakeByModality, (value) =>
      Object.fromEntries(
        Object.entries(object(value)).map(([key, value]) => [
          key,
          Object.fromEntries(
            Object.entries(object(value)).map(([term, value]) => {
              const item = object(value);
              return [
                term,
                {
                  status: string(item.status) as IntakeConfiguration['status'],
                  required: optional(item.required, boolean),
                },
              ];
            }),
          ),
        ]),
      ),
    ),
    scopeConfirmation: optional(row.scopeConfirmation, (value) => {
      const item = object(value);
      return {
        status: string(item.status) as 'covered' | 'own-regulation',
      };
    }),
    conversion: optional(row.conversion, (value) => {
      const item = object(value);
      if (item.from !== 2 || !['classified', 'pending'].includes(string(item.organization)))
        return invalidCalendar('Conversão inválida.');
      return {
        from: 2,
        organization: string(item.organization),
        legacySecondSemesterIntake: optional(item.legacySecondSemesterIntake, boolean),
      } as CalendarConversion;
    }),
    year: number(row.year),
    offer: string(row.offer),
    regime: (() => {
      const value = string(row.regime);
      if (
        value !== 'anual' &&
        value !== 'semestral' &&
        value !== 'misto' &&
        value !== 'a-classificar'
      )
        return invalidCalendar('Organização inválida.');
      return value;
    })(),
    campus: row.campus === undefined ? '' : string(row.campus),
    modalities: array(row.modalities, string),
    periods: array(row.periods, range),
    events: array(row.events, activity),
    weekdays: array(row.weekdays, number),
    weekConfirmed: boolean(row.weekConfirmed),
    secondSemesterIntake: optional(row.secondSemesterIntake, boolean),
    assessmentStagesByModality: Object.fromEntries(
      Object.entries(object(row.assessmentStagesByModality)).map(([key, value]) => [
        key,
        number(value),
      ]),
    ),
    teacherDayDate: row.teacherDayDate,
    teacherVacations: vacations
      ? ({
          firstStart: string(vacations.firstStart),
          firstEnd: string(vacations.firstEnd),
          secondStart: optional(vacations.secondStart, string),
          secondEnd: optional(vacations.secondEnd, string),
          thirdStart: optional(vacations.thirdStart, string),
          thirdEnd: optional(vacations.thirdEnd, string),
        } satisfies VacationInput)
      : undefined,
  };
}
