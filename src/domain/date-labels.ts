/**
 * How the system writes civil dates for people. Fixed names instead of Intl: its short month varies
 * between runtimes ("4 de jan."), and the same text must come out in the browser and on the server.
 */
const monthNames = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

type DateRange = { readonly start: string; readonly end: string };

const yearOf = (date: string) => Number(date.slice(0, 4));
const monthOf = (date: string) => monthNames[Number(date.slice(5, 7)) - 1]!;
const dayOf = (date: string) => Number(date.slice(8));
const dayAndShortMonth = (date: string) => `${dayOf(date)} ${monthOf(date).slice(0, 3)}`;
const dayAndMonth = (date: string) => `${dayOf(date)} de ${monthOf(date)}`;

/**
 * For lists and tables: "4 jan". The year appears only when it says something, so a screen about
 * the 2027 calendar omits 2027; without a calendar in context it always appears.
 */
export function compactDate(date: string, calendarYear?: number) {
  const label = dayAndShortMonth(date);
  return yearOf(date) === calendarYear ? label : `${label} ${yearOf(date)}`;
}

/** For lists and tables: "4 jan", "1 a 5 fev", "11 fev a 19 mar", "22 dez 2027 a 3 jan 2028". */
export function compactRange({ start, end }: DateRange, calendarYear?: number) {
  if (start === end) return compactDate(start, calendarYear);
  if (yearOf(start) !== yearOf(end)) return `${compactDate(start)} a ${compactDate(end)}`;
  const first = start.slice(0, 7) === end.slice(0, 7) ? dayOf(start) : dayAndShortMonth(start);
  return `${first} a ${compactDate(end, calendarYear)}`;
}

/** For details and sentences: "4 de janeiro de 2027". */
export function longDate(date: string) {
  return `${dayAndMonth(date)} de ${yearOf(date)}`;
}

/** For details and sentences: "1 a 5 de fevereiro de 2027". */
export function longRange({ start, end }: DateRange) {
  if (start === end) return longDate(start);
  if (yearOf(start) !== yearOf(end)) return `${longDate(start)} a ${longDate(end)}`;
  const first = start.slice(0, 7) === end.slice(0, 7) ? dayOf(start) : dayAndMonth(start);
  return `${first} a ${longDate(end)}`;
}
