import { calendarLimits, academicTerms } from '../config.ts';
import {
  calendarSchemaVersion,
  type CalendarEvent,
  type CalendarOffer,
  type CalendarPeriod,
  type CalendarContent,
} from '../model.ts';
import { readCalendarOfferInput } from './input.ts';
import { invalidCalendar as fail } from './input.ts';
import { datesBetween } from '../counting/core.ts';
import { validateActivityRecord } from '../activities/validation.ts';
import {
  activityExtensionIssue,
  schoolDayEdited,
  schoolDayIssue,
} from '../activities/school-day.ts';
import {
  generatedActivities,
  generatedActivity,
  linkKept,
  validateLinks,
} from '../activities/links.ts';
import { validCategory, eventCategory } from '../activities/categories.ts';
import { validateInternalDate } from '../internal-dates.ts';
import { normalizeObservanceDates } from '../observances.ts';
import { regeneratedVacations, teacherVacations } from '../activities/teacher-vacations.ts';
import { rulesetVersion } from '../../policies/registry.ts';
import { associationOffers, offerFor } from '../offers.ts';
import { isAssessmentStage } from '../activities/activity-ref.ts';

function text(value: string, maximum = calendarLimits.maximumTextLength): string {
  if (!value.trim() || value.length > maximum)
    return fail('Campo obrigatório ou texto muito longo.');
  return value.trim();
}

export function validateOffers(offers: CalendarOffer[]): CalendarOffer[] {
  if (!offers.length || offers.length > calendarLimits.maximumOffers)
    fail(`Selecione de uma a ${calendarLimits.maximumOffers} ofertas para o calendário.`);
  const ids = new Set<string>(),
    labels = new Set<string>();
  return offers.map((offer) => {
    if (!/^[a-z][a-z0-9-]*$/.test(offer.id) || offer.id.length > 100 || ids.has(offer.id))
      fail('Identificador da oferta inválido ou duplicado.');
    ids.add(offer.id);
    const label = offer.label?.trim();
    if (offers.filter((other) => other.kind === offer.kind).length > 1 && !label)
      fail('Dê um nome a cada oferta do mesmo tipo para distingui-las.');
    if (label) {
      text(label);
      const key = label.toLocaleLowerCase('pt-BR');
      if (labels.has(key)) fail('Os nomes das ofertas devem ser únicos no calendário.');
      labels.add(key);
    }
    if (offer.stages) {
      const allowed = offer.organization === 'anual' ? [2, 3, 4] : [1, 2];
      if (!allowed.includes(offer.stages.perTerm))
        fail(
          offer.organization === 'semestral'
            ? 'Selecione uma ou duas etapas por semestre.'
            : 'Selecione de duas a quatro etapas no ano letivo.',
        );
    }
    for (const [term, value] of Object.entries(offer.intake ?? {}))
      if (!academicTerms.some((allowed) => allowed === term) || value !== true)
        fail('Configuração de ingresso por oferta inválida.');
    return {
      ...offer,
      ...(label ? { label } : {}),
    };
  });
}

/**
 * Save boundary of format 5. `previous` is the persisted state of the same calendar: links are
 * validated against it by date ID (`validateLinks`), so recorded links are never refused or
 * dropped for lacking a generated activity. Without it every link must be generated.
 */
export function normalizeOfferCalendar(
  input: unknown,
  previous?: {
    year: number;
    offers: readonly CalendarOffer[];
    periods: readonly CalendarPeriod[];
    events: readonly CalendarEvent[];
  },
): CalendarContent & { year: number; campus: string } {
  const s = readCalendarOfferInput(input);
  if (
    !Number.isInteger(s.year) ||
    s.year < calendarLimits.minimumYear ||
    s.year > calendarLimits.maximumYear
  )
    fail('Ano inválido.');
  s.offers = validateOffers(s.offers);
  if (
    s.periods.length > calendarLimits.maximumPeriods ||
    s.events.length > calendarLimits.maximumEvents ||
    s.weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 5) ||
    new Set(s.weekdays).size !== s.weekdays.length
  )
    fail('Estrutura do calendário inválida.');
  if (s.weekConfirmed && !s.weekdays.length) fail('Semana letiva vazia.');
  if (s.teacherVacations) {
    const vacation = teacherVacations(s.year, s.teacherVacations);
    // The proposed date of the same ID wins over the previous one, as for any other field.
    const recorded = [...(previous?.events ?? []), ...s.events];
    s.events = s.events
      .filter(
        (e) =>
          !['teacher-vacation-january', 'teacher-vacation-july', 'teacher-vacation-third'].includes(
            e.id,
          ),
      )
      .concat(
        regeneratedVacations(
          vacation.events,
          s.offers.map((offer) => offer.id),
          recorded,
        ),
      );
  }
  const ids = new Set<string>();
  const listedOffers = (values: string[]) => {
    if (
      !values.length ||
      values.length > calendarLimits.maximumOffers ||
      new Set(values).size !== values.length ||
      values.some((id) => !offerFor(s, id))
    )
      fail('Oferta do registro fora do calendário.');
  };
  for (const period of s.periods) {
    text(period.id, 100);
    text(period.name ?? '', 160);
    if (ids.has(period.id) || period.id.startsWith('inst:')) fail('Identificador inválido.');
    ids.add(period.id);
    datesBetween(period.start, period.end);
    if (Number(period.start.slice(0, 4)) !== s.year || Number(period.end.slice(0, 4)) !== s.year)
      fail('Data fora do ano.');
    if (
      period.targetDays !== undefined &&
      (!Number.isInteger(period.targetDays) ||
        period.targetDays < calendarLimits.minimumTargetDays ||
        period.targetDays > calendarLimits.maximumTargetDays)
    )
      fail('Meta de dias letivos inválida.');
    listedOffers(period.association.offers);
    const organization = period.association.term === 'annual' ? 'anual' : 'semestral';
    if (period.association.offers.some((id) => offerFor(s, id)?.organization !== organization))
      fail('Associação do período incompatível com a oferta e seu ciclo.');
  }
  for (let i = 0; i < s.periods.length; i++)
    for (let j = i + 1; j < s.periods.length; j++) {
      const a = s.periods[i],
        b = s.periods[j];
      if (
        !associationOffers(a.association).some((id) =>
          associationOffers(b.association).includes(id),
        )
      )
        continue;
      if (a.association.term === b.association.term)
        fail('Há mais de um período para o mesmo ciclo da oferta.');
      if (a.start <= b.end && a.end >= b.start) fail('Períodos sobrepostos.');
    }
  const generated = generatedActivities(s);
  const before = new Map(previous?.events.map((event) => [event.id, event]));
  for (const event of s.events) {
    text(event.id, 100);
    text(event.name, 160);
    if (ids.has(event.id) || event.id.startsWith('inst:')) fail('Identificador inválido.');
    ids.add(event.id);
    listedOffers(event.offers);
    const old = before.get(event.id);
    validateActivityRecord(s, event, {
      // Edited stage intervals are checked against their cycle by `validateLinks`.
      stageInterval: false,
      keptWithoutActivity: linkKept(old, event) && !generatedActivity(generated, event.activity),
    });
    // Art. 5º and the municipal cause bind a new or edited date; an unchanged one stays a
    // readiness issue, so it never blocks saving other changes.
    if (schoolDayEdited(old, event)) {
      const issue = schoolDayIssue(s, event) ?? activityExtensionIssue(event);
      if (issue) fail(issue);
    }
    if (
      event.hours !== undefined &&
      (!Number.isFinite(event.hours) || event.hours <= 0 || event.hours > 8784)
    )
      fail('Carga horária inválida.');
    if (event.assessmentAutoStart !== undefined) {
      datesBetween(event.assessmentAutoStart, event.assessmentAutoStart);
      if (
        Number(event.assessmentAutoStart.slice(0, 4)) !== s.year ||
        !isAssessmentStage(event.activity)
      )
        fail('Distribuição automática de etapas inválida.');
    }
    if (event.category !== undefined && !validCategory(event.category))
      fail('Categoria PROENS inválida.');
    // Same rule as the date commands, on the effective category.
    validateInternalDate(event);
    event.category = eventCategory(event);
  }
  validateLinks(
    previous && {
      year: previous.year,
      offers: [...previous.offers],
      periods: [...previous.periods],
      events: previous.events,
    },
    s,
  );
  return {
    ...s,
    schemaVersion: calendarSchemaVersion,
    rulesetVersion: rulesetVersion(s),
    observanceDates: normalizeObservanceDates(s.observanceDates),
  };
}

export function offerCalendarContent(state: CalendarContent): CalendarContent {
  const {
    schemaVersion,
    rulesetVersion,
    offers,
    weekdays,
    weekConfirmed,
    periods,
    events,
    observanceDates,
    teacherVacations,
  } = state;
  return JSON.parse(
    JSON.stringify({
      schemaVersion,
      rulesetVersion,
      offers,
      weekdays,
      weekConfirmed,
      periods,
      events,
      observanceDates,
      teacherVacations,
    }),
  ) as CalendarContent;
}
