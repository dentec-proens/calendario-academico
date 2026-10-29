import { calendarLimits, academicTerms, assessmentStageRequirementPattern } from '../config.ts';
import type { CalendarOffer, CalendarContentV4 } from '../model.ts';
import { readCalendarOfferInput } from './input-v4.ts';
import { invalidCalendar as fail } from './input.ts';
import { datesBetween } from '../counting/core.ts';
import { validateActivityRecord } from '../activities/validation.ts';
import { activityChecklist } from '../activities/checklist.ts';
import { validCategory, eventCategory } from '../activities/categories.ts';
import { validateTeacherDay } from '../../institution/teacher-day.ts';
import { teacherVacations } from '../activities/teacher-vacations.ts';
import { rulesetVersion } from '../../policies/registry.ts';
import { associationOffers, offerFor, stageTerm } from '../offers.ts';
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

/** Structural validation permits pending migrated stages; cycle consistency is checked on editing and readiness. */
export function normalizeOfferCalendar(
  input: unknown,
): CalendarContentV4 & { year: number; campus: string } {
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
    s.events = s.events
      .filter(
        (e) =>
          !['teacher-vacation-january', 'teacher-vacation-july', 'teacher-vacation-third'].includes(
            e.id,
          ),
      )
      .concat(vacation.events);
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
  const requirements = new Map(activityChecklist(s).map((row) => [row.id, row]));
  for (const event of s.events) {
    text(event.id, 100);
    text(event.name, 160);
    if (ids.has(event.id) || event.id.startsWith('inst:')) fail('Identificador inválido.');
    ids.add(event.id);
    if (event.offers !== undefined) scope(event.offers);
    // Preserve migration evidence on save; coverage still reports its original interval finding.
    // The backend separately validates every new/changed stage interval and cycle.
    validateActivityRecord(s, event, { preserveLegacyStageEvidence: true });
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
    const requirement = event.requirementId ? requirements.get(event.requirementId) : undefined;
    const pendingStage = event.requirementId?.match(
      /^(?:stage|results|council|pedagogical-meeting)-[1-4]:([a-z][a-z0-9-]*)$/,
    );
    const stageOffer = pendingStage ? offerFor(s, pendingStage[1]) : undefined;
    if (event.requirementId && !requirement && !(stageOffer && !stageOffer.stages))
      fail('Vínculo de atividade inválido para esta organização.');
    const requiredOffer = requirement?.offerId ?? stageOffer?.id;
    if (requiredOffer && (event.offers?.length !== 1 || event.offers[0] !== requiredOffer))
      fail('A etapa deve estar vinculada à sua oferta.');
    if (event.category !== undefined && !validCategory(event.category))
      fail('Categoria PROENS inválida.');
    event.category = eventCategory(event);
  }
  for (const offer of s.offers) {
    const stages = s.events
      .filter(
        (event) =>
          isStageRequirementId(event.requirementId) &&
          event.requirementId?.endsWith(`:${offer.id}`),
      )
      .sort((a, b) => a.requirementId!.localeCompare(b.requirementId!));
    for (let i = 1; i < stages.length; i++) {
      if (stages[i].requirementId === stages[i - 1].requirementId)
        fail('Há etapas de avaliação duplicadas para a mesma oferta.');
      const ordinal = (value: string) =>
        Number(value.match(assessmentStageRequirementPattern)?.[1]);
      if (
        stageTerm(offer, ordinal(stages[i].requirementId!)) ===
          stageTerm(offer, ordinal(stages[i - 1].requirementId!)) &&
        stages[i].start <= stages[i - 1].end
      )
        fail('As etapas de avaliação da oferta devem ocorrer em sequência, sem sobreposição.');
    }
  }
  return {
    ...s,
    schemaVersion: 4,
    rulesetVersion: rulesetVersion(s),
    teacherDayDate: validateTeacherDay(s.teacherDayDate, s.year),
  };
}

export function offerCalendarContent(state: CalendarContentV4): CalendarContentV4 {
  const {
    schemaVersion,
    rulesetVersion,
    offers,
    weekdays,
    weekConfirmed,
    periods,
    events,
    teacherDayDate,
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
      teacherDayDate,
      teacherVacations,
    }),
  ) as CalendarContentV4;
}
