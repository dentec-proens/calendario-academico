/** The optional label tells drafts of the same campus and year apart. */
export const calendarName = (year: number | string, campus: string | undefined, label?: string) =>
  `Calendário ${year} - Campus ${campus}${label?.trim() ? ` — ${label.trim()}` : ''}`;
export const regimeLabels: Record<string, string> = {
  anual: 'Anual',
  semestral: 'Semestral',
  misto: 'Anual e semestral',
};
