import { calendarLimits, academicTerms } from '../config.ts';
import {
  calendarSchemaVersion,
  type CalendarEvent,
  type CalendarOffer,
  type CalendarContent,
} from '../model.ts';
import { readCalendarOfferInput } from './input-v4.ts';
import { invalidCalendar as fail } from './input.ts';
import { datesBetween } from '../counting/core.ts';
import { validateActivityRecord } from '../activities/validation.ts';
import { activityPlan } from '../activities/plan.ts';
import { linkKept, validateLinks } from '../activities/links.ts';
import { validCategory, eventCategory } from '../activities/categories.ts';
import { normalizeObservanceDates } from '../observances.ts';
import { regeneratedVacations, teacherVacations } from '../activities/teacher-vacations.ts';
import { rulesetVersion } from '../../policies/registry.ts';
import { associationOffers, offerFor } from '../offers.ts';
import { isStageRequirementId } from '../activities/metadata.ts';

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
    if (
      offer.legacyStageCount !== undefined &&
      (![2, 3, 4].includes(offer.legacyStageCount) ||
        offer.organization !== 'a-classificar' ||
        offer.stages !== undefined)
    )
      fail('A quantidade anterior de etapas exige organização a conferir, sem etapas por ciclo.');
    if (offer.stages) {
      const allowed =
        offer.organization === 'anual'
          ? [2, 3, 4]
          : offer.organization === 'semestral'
            ? [1, 2]
            : [];
      if (!allowed.includes(offer.stages.perTerm))
        fail(
          offer.organization === 'semestral'
            ? 'Selecione uma ou duas etapas por semestre.'
            : 'Selecione a organização e de duas a quatro etapas no ano letivo.',
        );
    }
    for (const [term, value] of Object.entries(offer.intake ?? {}))
      if (
        !academicTerms.some((allowed) => allowed === term) ||
        (value.required === true && value.status !== 'yes')
      )
        fail('Configuração de ingresso por oferta inválida.');
    return {
      ...offer,
      ...(label ? { label } : {}),
      ...(offer.organizationBasis ? { organizationBasis: text(offer.organizationBasis) } : {}),
    };
  });
}

/**
 * Save boundary of format 4. `previous` is the persisted state of the same calendar: links are
 * validated against it by date ID (`validateLinks`), so recorded links are never refused or
 * dropped for lacking a generated activity. Without it every link must be generated.
 */
export function normalizeOfferCalendar(
  input: unknown,
  previous?: { events: readonly CalendarEvent[] },
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
  const scope = (values: string[]) => {
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
    if (period.association.status === 'defined') {
      scope(period.association.offers);
      const organization = period.association.term === 'annual' ? 'anual' : 'semestral';
      if (period.association.offers.some((id) => offerFor(s, id)?.organization !== organization))
        fail('Associação do período incompatível com a oferta e seu ciclo.');
    }
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
      if (
        a.association.status === 'defined' &&
        b.association.status === 'defined' &&
        a.association.term === b.association.term
      )
        fail('Há mais de um período para o mesmo ciclo da oferta.');
      if (a.start <= b.end && a.end >= b.start) fail('Períodos sobrepostos.');
    }
  const generated = new Set(activityPlan(s).map((row) => row.id));
  const before = new Map(previous?.events.map((event) => [event.id, event]));
  for (const event of s.events) {
    text(event.id, 100);
    text(event.name, 160);
    if (ids.has(event.id) || event.id.startsWith('inst:')) fail('Identificador inválido.');
    ids.add(event.id);
    scope(event.scope.offers);
    if (typeof event.scope.confirmed !== 'boolean') fail('Abrangência da data inválida.');
    const old = before.get(event.id);
    validateActivityRecord(s, event, {
      // Edited stage intervals are checked against their cycle by `validateLinks`.
      stageInterval: false,
      keptWithoutActivity: linkKept(old, event) && !generated.has(event.requirementId!),
    });
    if (
      event.hours !== undefined &&
      (!Number.isFinite(event.hours) || event.hours <= 0 || event.hours > 8784)
    )
      fail('Carga horária inválida.');
    if (event.assessmentAutoStart !== undefined) {
      datesBetween(event.assessmentAutoStart, event.assessmentAutoStart);
      if (
        Number(event.assessmentAutoStart.slice(0, 4)) !== s.year ||
        !isStageRequirementId(event.requirementId)
      )
        fail('Distribuição automática de etapas inválida.');
    }
    if (event.category !== undefined && !validCategory(event.category))
      fail('Categoria PROENS inválida.');
    event.category = eventCategory(event);
  }
  validateLinks(previous, s);
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
