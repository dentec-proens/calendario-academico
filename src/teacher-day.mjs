import { datesBetween } from './calendar.mjs';

// Explicit institutional event identity: no other holiday can be moved by a campus.
export const teacherDayId = 'inst:ifpr2027-16';

export function teacherDayWeek(year) {
  if (!Number.isInteger(year) || year < 1900 || year > 9999) throw Error('Ano inválido.');
  const date = new Date(`${year}-10-15T00:00:00Z`);
  const start = new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * 86400000);
  return {
    start: start.toISOString().slice(0, 10),
    end: new Date(start.getTime() + 6 * 86400000).toISOString().slice(0, 10),
  };
}

export function validateTeacherDay(date, year) {
  if (date === undefined || date === null || date === '') return undefined;
  if (typeof date !== 'string') throw Error('Data do Dia do Professor inválida.');
  datesBetween(date, date);
  if (Number(date.slice(0, 4)) !== year)
    throw Error('O Dia do Professor deve permanecer no ano do calendário.');
  const week = teacherDayWeek(year);
  if (date < week.start || date > week.end)
    throw Error(
      'Escolha uma data na semana de 15 de outubro: ' +
        week.start.split('-').reverse().join('/') +
        ' a ' +
        week.end.split('-').reverse().join('/') +
        '.',
    );
  return date;
}

export function campusInstitutionalEvents(events, state) {
  const date = validateTeacherDay(state.teacherDayDate, state.year);
  if (date && !events.some((e) => e.id === teacherDayId))
    throw Error('Dia do Professor não disponível na base deste calendário.');
  return events.map((e) => {
    if (e.id !== teacherDayId) return e;
    const originalStart = e.originalStart || e.start,
      originalEnd = e.originalEnd || e.end;
    return {
      ...e,
      originalStart,
      originalEnd,
      start: date || originalStart,
      end: date || originalEnd,
    };
  });
}
