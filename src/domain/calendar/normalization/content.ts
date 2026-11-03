import { normalizeOfferCalendar, offerCalendarContent } from './normalize.ts';
export const calendarContent = (input: unknown) =>
  offerCalendarContent(normalizeOfferCalendar(input));
