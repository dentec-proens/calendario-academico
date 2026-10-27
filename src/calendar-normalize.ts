import { readCalendarInput, invalidCalendar as fail } from './calendar-input.ts';
import { validateTeacherDay } from './teacher-day.ts';
import { teacherVacations } from './teacher-vacations.ts';
import { calendarModalities, modalityLabels } from './modalities.ts';
import { activityChecklist } from './obligations.ts';
import { eventCategory, validCategory } from './categories.ts';
import { datesBetween } from './calendar.ts';
import { convertCalendarV2 } from './calendar-rules/conversion.ts';
import {
  rulesetVersion,
  organizationSummary,
  samePeriodScope,
  validateActivityRecord,
} from './calendar-rules/index.ts';

const text = (value: unknown, maximum = 240) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    return fail('Campo obrigatório ou texto muito longo.');
  return value.trim();
};

export function normalizeCalendar(input: unknown) {
  let s = convertCalendarV2(readCalendarInput(input));
  if (s?.secondSemesterIntake !== undefined && typeof s.secondSemesterIntake !== 'boolean')
    fail('Informe se há ingresso de novos estudantes no segundo semestre.');
  if (
    !s ||
    !Number.isInteger(s.year) ||
    s.year < 1900 ||
    s.year > 9999 ||
    !Object.keys(modalityLabels).includes(s.offer) ||
    !['anual', 'semestral', 'misto', 'a-classificar'].includes(s.regime ?? '')
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
  if (
    s.scopeConfirmation &&
    (!['covered', 'own-regulation'].includes(s.scopeConfirmation.status) ||
      !s.scopeConfirmation.source.trim() ||
      s.scopeConfirmation.source.length > 240)
  )
    fail('Identifique o escopo e a fonte da conferência normativa.');
  if (
    s.organizationByModality &&
    Object.entries(s.organizationByModality).some(
      ([m, value]) =>
        !calendarModalities(s).includes(m) ||
        !['anual', 'semestral', 'a-classificar'].includes(value),
    )
  )
    fail('Organização por oferta inválida.');
  if (
    s.intakeByModality &&
    Object.entries(s.intakeByModality).some(
      ([m, terms]) =>
        !calendarModalities(s).includes(m) ||
        Object.entries(terms).some(
          ([term, value]) =>
            !['annual', 'first', 'second'].includes(term) ||
            !['unknown', 'yes', 'no'].includes(value.status) ||
            (value.source !== undefined && value.source.length > 240) ||
            (value.required === true && (!value.source?.trim() || value.status !== 'yes')),
        ),
    )
  )
    fail('Configuração de ingresso por oferta inválida ou sem fonte.');
  for (const period of s.periods) {
    const association = period.association;
    if (!association) continue;
    if (
      association.status === 'defined' &&
      (!association.modalities.length ||
        new Set(association.modalities).size !== association.modalities.length ||
        !['annual', 'first', 'second'].includes(association.term) ||
        association.modalities.some(
          (m) =>
            !calendarModalities(s).includes(m) ||
            s.organizationByModality?.[m] !==
              (association.term === 'annual' ? 'anual' : 'semestral'),
        ))
    )
      fail('Associação do período incompatível com a oferta e seu ciclo.');
  }
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
  for (let i = 0; i < s.periods.length; i++)
    for (let j = i + 1; j < s.periods.length; j++) {
      const a = s.periods[i],
        b = s.periods[j];
      if (
        a.association?.status === 'defined' &&
        b.association?.status === 'defined' &&
        a.association.term === b.association.term &&
        samePeriodScope(a, b)
      )
        fail('Há mais de um período para o mesmo ciclo da oferta.');
    }
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
      if (event && 'kind' in e) {
        validateActivityRecord(s, e);
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
            e.modalities.length > 4 ||
            new Set(e.modalities).size !== e.modalities.length ||
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
      } else {
        datesBetween(e.start, e.end);
        if (Number(e.start.slice(0, 4)) !== s.year || Number(e.end.slice(0, 4)) !== s.year)
          fail('Data fora do ano.');
      }
    }
  for (let i = 0; i < s.periods.length; i++)
    for (let j = i + 1; j < s.periods.length; j++)
      if (
        samePeriodScope(s.periods[i], s.periods[j]) &&
        s.periods[i].start <= s.periods[j].end &&
        s.periods[i].end >= s.periods[j].start
      )
        fail('Períodos sobrepostos.');
  return {
    schemaVersion: 3 as const,
    rulesetVersion: rulesetVersion(s),
    organizationByModality: s.organizationByModality,
    intakeByModality: s.intakeByModality,
    conversion: s.conversion,
    scopeConfirmation: s.scopeConfirmation,
    secondSemesterIntake: s.secondSemesterIntake,
    teacherDayDate: validateTeacherDay(s.teacherDayDate, s.year),
    teacherVacations: s.teacherVacations,
    modalities: calendarModalities(s),
    assessmentStagesByModality: s.assessmentStagesByModality,
    campus: String(s.campus || ''),
    year: s.year,
    offer: s.offer,
    regime: s.organizationByModality
      ? organizationSummary(s.organizationByModality, calendarModalities(s))
      : ('a-classificar' as const),
    weekdays: s.weekdays,
    weekEvidence: String(s.weekEvidence || '').slice(0, 240),
    weekConfirmed: s.weekConfirmed,
    periods: s.periods.map(({ id, name, start, end, targetDays, association }) => ({
      id,
      name,
      start,
      end,
      ...(targetDays === undefined ? {} : { targetDays }),
      ...(association ? { association } : {}),
    })),
    events: s.events.map((e) => ({
      assessmentAutoStart: e.assessmentAutoStart,
      recordType: e.recordType,
      deadlineExtensionCause: e.deadlineExtensionCause,
      publicationStatus: e.publicationStatus,
      admission: e.admission,
      deadlineAdjustment: e.deadlineAdjustment,
      hours: e.hours,
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
