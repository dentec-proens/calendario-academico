import { DomainError } from '../errors.ts';

/** Descriptive fields of a calendar, kept apart from its content and its version. */
export interface CalendarIdentity {
  courses: string;
  classes: string;
  shifts: string;
}

export const identityLimits = {
  courses: 1000,
  classes: 500,
  shifts: 200,
} as const satisfies Record<keyof CalendarIdentity, number>;

const fieldNames: Record<keyof CalendarIdentity, string> = {
  courses: 'Os cursos podem',
  classes: 'As turmas podem',
  shifts: 'Os turnos podem',
};

export const missingCoursesIssue = 'Informe os cursos do calendário na identificação.';

/** Trims every field; all of them may be empty until the calendar is submitted. */
export function normalizeIdentity(input: CalendarIdentity): CalendarIdentity {
  const identity = {
    courses: input.courses.trim(),
    classes: input.classes.trim(),
    shifts: input.shifts.trim(),
  };
  for (const key of Object.keys(identityLimits) as (keyof CalendarIdentity)[])
    if (identity[key].length > identityLimits[key])
      throw new DomainError(`${fieldNames[key]} ter até ${identityLimits[key]} caracteres.`);
  return identity;
}
