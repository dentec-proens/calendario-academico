import { searchText } from '../../shared/search-text.ts';
import { DomainError } from '../errors.ts';
import type { CalendarStatus } from './lifecycle.ts';

export const maximumLabelLength = 120;

/**
 * Year and campus are fixed parts of the name; the label tells calendars of the same campus and
 * year apart and travels with the calendar through review, publication and versions.
 */
export const calendarName = (year: number | string, campus: string | undefined, label?: string) =>
  `Calendário ${year} - Campus ${campus}${label?.trim() ? ` — ${label.trim()}` : ''}`;

export const missingLabelIssue =
  'Informe o complemento do nome para distinguir este calendário dos demais do campus.';

/** Trims the label; an empty one is stored, but stops a rename, a submission and a publication. */
export function normalizeLabel(label: string) {
  const value = label.trim();
  if (value.length > maximumLabelLength)
    throw new DomainError(`O complemento do nome pode ter até ${maximumLabelLength} caracteres.`);
  return value;
}

/** Labels compare without case and accents, as a search does. */
export const labelKey = (label: string | undefined) => searchText(label?.trim() ?? '');

export interface LabelledCalendar<Id extends string = string> {
  id: Id;
  status: CalendarStatus;
  label?: string;
  derivedFrom?: Id;
}

/**
 * The calendar of the same campus and year whose label repeats `label`. Archived calendars left
 * the campus's current set; a version may keep the label of its origin, which it replaces, but
 * sibling versions must tell themselves apart. `others` already excludes the trash.
 */
export function repeatedLabel<Id extends string, T extends LabelledCalendar<Id>>(
  calendar: LabelledCalendar<Id>,
  label: string | undefined,
  others: readonly T[],
): T | undefined {
  const key = labelKey(label);
  return others.find(
    (other) =>
      other.id !== calendar.id &&
      other.status !== 'arquivado' &&
      other.id !== calendar.derivedFrom &&
      other.derivedFrom !== calendar.id &&
      labelKey(other.label) === key,
  );
}
