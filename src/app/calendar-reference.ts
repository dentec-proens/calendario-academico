/** Legacy fragment accepted in saved login-return URLs; the editor now opens its default tab. */
export const calendarReferenceAnchor = 'calendario-anterior';

export function isCalendarReferenceHash(hash: string) {
  return hash.replace(/^#/, '') === calendarReferenceAnchor;
}
