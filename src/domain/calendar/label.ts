import { DomainError } from '../errors.ts';

export const maximumLabelLength = 120;

/**
 * Year and campus are fixed parts of the name; the optional label tells calendars of the same
 * campus and year apart and travels with the calendar through review, publication and versions.
 */
export const calendarName = (year: number | string, campus: string | undefined, label?: string) =>
  `Calendário ${year} - Campus ${campus}${label?.trim() ? ` — ${label.trim()}` : ''}`;

/** Trims the label; an empty one leaves only campus and year in the name. */
export function normalizeLabel(label: string) {
  const value = label.trim();
  if (value.length > maximumLabelLength)
    throw new DomainError(`O complemento do nome pode ter até ${maximumLabelLength} caracteres.`);
  return value;
}
