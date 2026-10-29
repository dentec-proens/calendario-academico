import { normalizeOfferCalendar, offerCalendarContent } from './normalize-v4.ts';
export const calendarContent = (input: unknown) =>
  offerCalendarContent(normalizeOfferCalendar(input));
