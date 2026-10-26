/** Shared fragment for the optional PDF reference inside campus activities. */
export const calendarReferenceAnchor = 'calendario-anterior';

export function isCalendarReferenceHash(hash: string) {
  return hash.replace(/^#/, '') === calendarReferenceAnchor;
}
