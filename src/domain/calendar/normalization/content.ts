import { normalizeCalendar } from './normalize.ts';

/** Editable content excludes the identity and scope owned by the calendar record. */
export function calendarContent(input: unknown) {
  const {
    year: _year,
    campus: _campus,
    offer: _offer,
    modalities: _modalities,
    ...content
  } = normalizeCalendar(input);
  return JSON.parse(JSON.stringify(content)) as typeof content;
}
