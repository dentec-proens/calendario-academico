import { readCalendarInput, invalidCalendar as fail } from './calendar-input.ts';
import { validateTeacherDay } from './teacher-day.ts';
import { teacherVacations } from './teacher-vacations.ts';
import { calendarModalities, modalityLabels } from './modalities.ts';
import { activityChecklist } from './obligations.ts';
import { eventCategory, validCategory } from './categories.ts';
import { datesBetween } from './calendar.ts';

const text = (value: unknown, maximum = 240) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    return fail('Campo obrigatório ou texto muito longo.');
  return value.trim();
};

export function normalizeCalendar(input: unknown) {
  let s = readCalendarInput(input);
  if (s?.secondSemesterIntake !== undefined && typeof s.secondSemesterIntake !== 'boolean')
    fail('Informe se há ingresso de novos estudantes no segundo semestre.');
  if (
    !s ||
    !Number.isInteger(s.year) ||
    s.year < 1900 ||
    s.year > 9999 ||
    !Object.keys(modalityLabels).includes(s.offer) ||
    !['anual', 'semestral', 'misto'].includes(s.regime)
  )
    fail('Ano ou oferta inválidos.');
  if (
    !Array.isArray(s.periods) ||
    s.periods.length > 50 ||
    !Array.isArray(s.events) ||
    s.events.length > 1000 ||
    !Array.isArray(s.weekdays) ||
    s.weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 5) ||
    new Set(s.weekdays).size !== s.weekdays.length ||
    typeof s.weekConfirmed !== 'boolean'
  )
    fail('Estrutura do calendário inválida.');
  if (s.weekConfirmed) {
    text(s.weekEvidence);
    if (!s.weekdays.length) fail('Semana letiva vazia.');
  }
  if (
    s.modalities !== undefined &&
    (!Array.isArray(s.modalities) ||
      !s.modalities.length ||
      s.modalities.length > 4 ||
      new Set(s.modalities).size !== s.modalities.length ||
      s.modalities.some((m) => !Object.hasOwn(modalityLabels, m)))
  )
    fail('Selecione as formas de oferta/níveis do calendário.');
  if (
    s.assessmentStagesByModality !== undefined &&
    (s.assessmentStagesByModality === null ||
      typeof s.assessmentStagesByModality !== 'object' ||
      Array.isArray(s.assessmentStagesByModality) ||
      Object.entries(s.assessmentStagesByModality).some(
        ([m, n]) => !calendarModalities(s).includes(m) || ![2, 3, 4].includes(n),
      ))
  )
    fail('Etapas por oferta inválidas.');
  if (s.teacherVacations) {
    let vacation;
    try {
      vacation = teacherVacations(s.year, s.teacherVacations, s.teacherVacations.evidence);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
    s.events = s.events
      .filter(
        (e) =>
          !['teacher-vacation-january', 'teacher-vacation-july', 'teacher-vacation-third'].includes(
            e.id,
          ),
      )
      .concat(vacation.events);
  }
  for (const p of s.periods)
    if (
      p.targetDays !== undefined &&
      (!Number.isInteger(p.targetDays) || p.targetDays < 1 || p.targetDays > 366)
    )
      fail('Meta de dias letivos inválida.');
  const ids = new Set();
  for (const [rows, event] of [
    [s.periods, false],
    [s.events, true],
  ] as const)
    for (const e of rows) {
      text(e.id, 100);
      text(e.name, 160);
      if (ids.has(e.id) || e.id.startsWith('inst:')) fail('Identificador inválido.');
      ids.add(e.id);
      datesBetween(e.start, e.end);
      if (Number(e.start.slice(0, 4)) !== s.year || Number(e.end.slice(0, 4)) !== s.year)
        fail('Data fora do ano.');
      if (event && 'kind' in e) {
        if (e.assessmentAutoStart !== undefined) {
          datesBetween(e.assessmentAutoStart, e.assessmentAutoStart);
          if (
            Number(e.assessmentAutoStart.slice(0, 4)) !== s.year ||
            !/^stage-[1-4](?::[a-z]+)?$/.test(e.requirementId || '')
          )
            fail('Distribuição automática de etapas inválida.');
        }
        if (e.hours !== undefined && (!Number.isFinite(e.hours) || e.hours <= 0 || e.hours > 8784))
          fail('Carga horária inválida.');
        if (
          e.modalities !== undefined &&
          (!Array.isArray(e.modalities) ||
            !e.modalities.length ||
            e.modalities.some((m) => !calendarModalities(s).includes(m)))
        )
          fail('Forma de oferta/nível do evento fora do calendário.');
        if (e.requirementId && !activityChecklist(s).some((r) => r.id === e.requirementId))
          fail('Vínculo de atividade inválido para esta organização.');
        const activity = activityChecklist(s).find((r) => r.id === e.requirementId);
        if (
          activity?.modality &&
          (!e.modalities || e.modalities.length !== 1 || e.modalities[0] !== activity.modality)
        )
          fail('A etapa deve estar vinculada à sua oferta.');
        if (e.category !== undefined && !validCategory(e.category))
          fail('Categoria PROENS inválida.');
        if (!['include', 'exclude', 'note'].includes(e.kind)) fail('Efeito inválido.');
        text(e.evidence);
      }
    }
  for (let i = 0; i < s.periods.length; i++)
    for (let j = i + 1; j < s.periods.length; j++)
      if (s.periods[i].start <= s.periods[j].end && s.periods[i].end >= s.periods[j].start)
        fail('Períodos sobrepostos.');
  return {
    schemaVersion: 2,
    secondSemesterIntake: s.secondSemesterIntake,
    teacherDayDate: validateTeacherDay(s.teacherDayDate, s.year),
    ignoredHistory: Array.isArray(s.ignoredHistory)
      ? s.ignoredHistory.filter((k) => typeof k === 'string' && k.length <= 3000).slice(0, 2000)
      : [],
    teacherVacations: s.teacherVacations,
    modalities: calendarModalities(s),
    assessmentStagesByModality: s.assessmentStagesByModality,
    campus: String(s.campus || ''),
    year: s.year,
    offer: s.offer,
    regime: s.regime,
    weekdays: s.weekdays,
    weekEvidence: String(s.weekEvidence || '').slice(0, 240),
    weekConfirmed: s.weekConfirmed,
    periods: s.periods.map(({ id, name, start, end, targetDays }) => ({
      id,
      name,
      start,
      end,
      ...(targetDays === undefined ? {} : { targetDays }),
    })),
    events: s.events.map((e) => ({
      assessmentAutoStart: e.assessmentAutoStart,
      hours: e.hours,
      historicalSource: e.historicalSource
        ? {
            historyId: e.historicalSource.historyId,
            page: e.historicalSource.page,
            candidateKey: e.historicalSource.candidateKey,
          }
        : undefined,
      modalities: e.modalities,
      requirementId: e.requirementId || undefined,
      id: e.id,
      name: e.name,
      start: e.start,
      end: e.end,
      kind: e.kind,
      evidence: e.evidence,
      category: eventCategory(e),
    })),
  };
}
