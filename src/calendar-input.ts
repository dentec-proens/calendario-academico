import type { CalendarActivity, CalendarPeriod, VacationPeriods } from './domain-types.ts';

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
const range = (value: unknown): CalendarPeriod & { name: string } => {
  const row = object(value);
  return {
    id: string(row.id),
    name: string(row.name),
    start: string(row.start),
    end: string(row.end),
    targetDays: optional(row.targetDays, number),
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
  const source = optional(row.historicalSource, object);
  return {
    ...range(row),
    kind: string(row.kind),
    evidence: string(row.evidence),
    category: optional(row.category, string),
    requirementId: optional(row.requirementId, string),
    modalities: optional(row.modalities, (value) => array(value, string)),
    hours: optional(row.hours, number),
    assessmentAutoStart: optional(row.assessmentAutoStart, string),
    historicalSource: source
      ? {
          historyId: string(source.historyId),
          page: number(source.page),
          candidateKey: string(source.candidateKey),
        }
      : undefined,
  };
};
export type VacationInput = VacationPeriods & { evidence: string };
export function readCalendarInput(value: unknown) {
  const row = object(value);
  if (row.schemaVersion !== 2 || 'assessmentStages' in row)
    return invalidCalendar(
      'Formato de calendário incompatível. Converta o arquivo para schemaVersion 2.',
    );
  const vacations = optional(row.teacherVacations, object);
  if (vacations && 'julyStart' in vacations)
    return invalidCalendar('Formato de férias incompatível.');
  return {
    year: number(row.year),
    offer: string(row.offer),
    regime: string(row.regime),
    campus: row.campus === undefined ? '' : string(row.campus),
    modalities: array(row.modalities, string),
    periods: array(row.periods, range),
    events: array(row.events, activity),
    weekdays: array(row.weekdays, number),
    weekConfirmed: boolean(row.weekConfirmed),
    weekEvidence: row.weekEvidence === undefined ? '' : string(row.weekEvidence),
    secondSemesterIntake: optional(row.secondSemesterIntake, boolean),
    assessmentStagesByModality: Object.fromEntries(
      Object.entries(object(row.assessmentStagesByModality)).map(([key, value]) => [
        key,
        number(value),
      ]),
    ),
    teacherDayDate: row.teacherDayDate,
    ignoredHistory: array(row.ignoredHistory, string),
    teacherVacations: vacations
      ? ({
          firstStart: string(vacations.firstStart),
          firstEnd: string(vacations.firstEnd),
          secondStart: optional(vacations.secondStart, string),
          secondEnd: optional(vacations.secondEnd, string),
          thirdStart: optional(vacations.thirdStart, string),
          thirdEnd: optional(vacations.thirdEnd, string),
          evidence: string(vacations.evidence),
        } satisfies VacationInput)
      : undefined,
  };
}
