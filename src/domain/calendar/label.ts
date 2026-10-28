export const calendarName = (year: number | string, campus: string | undefined) =>
  `Calendário ${year} - Campus ${campus}`;
export const regimeLabels: Record<string, string> = {
  anual: 'Anual',
  semestral: 'Semestral',
  misto: 'Anual e semestral',
};
