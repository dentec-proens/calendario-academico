import { readDateRange } from '../civil-dates.ts';
import { civilDate } from '../../civil-date.ts';
import {
  assessmentStageCounts,
  assessmentStageNumbers,
  modalityIds,
  termsByOrganization,
  periodCountByOrganization,
} from '../config.ts';
import type {
  AcademicTerm,
  ActivityState,
  CalendarEvent,
  CalendarOffer,
  CalendarPeriod,
  PeriodAssociation,
} from '../model.ts';
import { datesBetween } from '../counting/core.ts';
import { assessmentIntervalIssue } from '../activities/assessment-intervals.ts';
import { appliesTo } from '../modalities.ts';
import { associationOffers, offerFor, offerIds, labelFor } from '../offers.ts';
import { organizationForOffer, periodsForOffer } from './periods.ts';
import { rulesetVersion } from '../../policies/registry.ts';
import { activityPlan } from '../activities/plan.ts';
import { stageRequirement } from '../activities/assessment.ts';
import { linksToReview, linkIssueLabels } from '../activities/links.ts';
import { normalizeOfferCalendar } from '../normalization/normalize-v4.ts';
import { DomainError } from '../../errors.ts';

export interface OrganizationPeriodDraft {
  sourceId: string;
  name: string;
  start: string;
  end: string;
}
export interface OrganizationStageDraft {
  id: string;
  start: string;
  end: string;
}
export interface OfferOrganizationDraft {
  organization: string;
  count: string;
  periods: OrganizationPeriodDraft[];
  stages: OrganizationStageDraft[];
}
export interface OrganizationIssue {
  path: string;
  message: string;
}

export function offerOrganizationDraft(
  state: ActivityState,
  modality: string,
): OfferOrganizationDraft {
  const periods = periodsForOffer(state, modality);
  const organization = organizationForOffer(state, modality);
  return {
    organization: organization === 'a-classificar' ? '' : organization,
    count: String(offerFor(state, modality)?.stages?.perTerm ?? ''),
    periods: termsByOrganization.semestral.map((_, index) => {
      const term = organization === 'semestral' ? (index ? 'second' : 'first') : 'annual';
      const period =
        index === 0 || organization === 'semestral'
          ? periods.find(
              (item) => item.association?.status === 'defined' && item.association.term === term,
            )
          : undefined;
      return {
        sourceId: period?.id ?? '',
        name: period?.name ?? '',
        start: period?.start ?? '',
        end: period?.end ?? '',
      };
    }),
    stages: assessmentStageNumbers.map((number) => {
      const event = state.events.find(
        (item) => item.requirementId === `stage-${number}:${modality}`,
      );
      return {
        id: event?.id ?? '',
        start: event?.start ?? '',
        end: event?.end ?? '',
      };
    }),
  };
}

/** Freeze formerly implicit event scope before the calendar gains another offer. */
function withOffer<S extends ActivityState>(
  state: S,
  modality: string,
  newOffer?: CalendarOffer,
): S {
  if (offerIds(state).includes(modality)) return state;
  if (!newOffer || newOffer.id !== modality) throw new DomainError('Oferta inválida.');
  return {
    ...state,
    offers: [...state.offers, newOffer],
    events: state.events.map((event) =>
      event.offers?.length ? event : { ...event, offers: offerIds(state) },
    ),
  };
}

/** New offers must arrive with their complete independent periods and stages. */
export function validateAddedOffers(previous: readonly string[], next: ActivityState) {
  if (previous.some((modality) => !offerIds(next).includes(modality)))
    throw new DomainError('Ofertas existentes não podem ser removidas por esta operação.');
  for (const modality of offerIds(next).filter((modality) => !previous.includes(modality))) {
    if (!offerFor(next, modality)) throw new DomainError('Oferta inválida.');
    const draft = offerOrganizationDraft(next, modality);
    const issues = offerOrganizationIssues(next, modality, draft);
    if (issues.length)
      throw new DomainError(
        `Configure a nova oferta ${labelFor(next, modality)}: ${issues[0].message}`,
      );
    const organization = organizationForOffer(next, modality);
    const expected =
      organization === 'semestral' ? termsByOrganization.semestral : termsByOrganization.anual;
    const periods = periodsForOffer(next, modality);
    const stages = next.events.filter(
      (event) =>
        stageRequirement(event.requirementId) && event.requirementId?.endsWith(`:${modality}`),
    );
    if (
      periods.length !== expected.length ||
      periods.some(
        (period) =>
          period.association?.status !== 'defined' ||
          associationOffers(period.association).length !== 1,
      ) ||
      stages.length !== Number(draft.count) * (organization === 'semestral' ? 2 : 1)
    )
      throw new DomainError(
        `Defina os períodos e todas as etapas da nova oferta ${labelFor(next, modality)} antes de aplicar.`,
      );
  }
}

/** Draft checks share the stage-bounds rule enforced by backend normalization. */
export function offerOrganizationIssues(
  state: ActivityState,
  modality: string,
  draft: OfferOrganizationDraft,
  newOffer?: CalendarOffer,
): OrganizationIssue[] {
  const issues: OrganizationIssue[] = [];
  const issue = (path: string, message: string) => issues.push({ path, message });
  const original = state;
  if (!(
    offerFor(state, modality) ||
    (newOffer?.id === modality && modalityIds.some((kind) => kind === newOffer.kind))
  )) {
    issue('organization', 'Oferta inválida.');
    return issues;
  }
  state = withOffer(state, modality, newOffer);
  if (!['anual', 'semestral'].includes(draft.organization))
    issue('organization', 'Selecione a organização da oferta.');
  const count = Number(draft.count);
  if (
    draft.periods[0]?.sourceId &&
    draft.organization === 'semestral' &&
    draft.periods[0].sourceId === draft.periods[1]?.sourceId
  )
    issue('periods[1]', 'Escolha períodos existentes diferentes para cada semestre.');
  if (draft.organization && draft.organization !== organizationForOffer(state, modality)) {
    if (
      Object.entries(offerFor(state, modality)?.intake ?? {}).some(
        ([term, entry]) =>
          entry.required && (term === 'annual') !== (draft.organization === 'anual'),
      )
    )
      issue(
        'organization',
        'Revise a exigência local de matrícula nas atividades antes de alterar a organização da oferta.',
      );
    if (state.events.some((event) => event.admission?.periodId && appliesTo(event, modality)))
      issue(
        'organization',
        'Revise os editais vinculados aos períodos antes de alterar a organização da oferta.',
      );
  }
  const allowedCounts = draft.organization === 'semestral' ? [1, 2] : assessmentStageCounts;
  if (!allowedCounts.includes(count))
    issue('count', 'Selecione a quantidade de etapas por ciclo da oferta.');
  const stageCount = count * (draft.organization === 'semestral' ? 2 : 1);
  const periods = draft.periods.slice(
    0,
    periodCountByOrganization[draft.organization === 'semestral' ? 'semestral' : 'anual'],
  );
  const expectedPeriods = draft.organization === 'semestral' ? 2 : 1;
  if (periods.length !== expectedPeriods)
    issue('periods', 'Informe os períodos de todos os ciclos da oferta.');
  if (Number.isInteger(stageCount) && stageCount > 0 && draft.stages.length < stageCount)
    issue('stages', 'Informe as datas de todas as etapas da oferta.');
  function interval(start: string, end: string, path: string) {
    if (!start || !end) {
      issue(path, 'Informe início e término.');
      return false;
    }
    try {
      datesBetween(start, end);
    } catch {
      issue(path, 'Informe um intervalo válido, com término igual ou posterior ao início.');
      return false;
    }
    if (Number(start.slice(0, 4)) !== state.year || Number(end.slice(0, 4)) !== state.year) {
      issue(path, 'As datas devem pertencer ao ano do calendário.');
      return false;
    }
    return true;
  }
  const periodsValid = periods
    .map((period, index) => interval(period.start, period.end, `periods[${index}]`))
    .every(Boolean);
  if (periods.length === 2 && periodsValid && periods[0].end >= periods[1].start)
    issue('periods[1]', 'O segundo semestre deve começar depois do término do primeiro.');
  const unchanged = (index: number) => {
    const stage = draft.stages[index];
    const recorded = state.events.find(
      (event) => event.id === stage.id && event.requirementId === `stage-${index + 1}:${modality}`,
    );
    return Boolean(recorded && recorded.start === stage.start && recorded.end === stage.end);
  };
  for (const [index, stage] of draft.stages.slice(0, stageCount).entries()) {
    const path = `stages[${index}]`;
    // A recorded stage kept with its dates is never refused: a configuration change is never
    // refused by existing dates; the preview lists it under “Vínculo a conferir” (`links.ts`).
    if (unchanged(index)) continue;
    const valid = interval(stage.start, stage.end, path);
    if (valid && periodsValid) {
      const cyclePeriods =
        draft.organization === 'semestral'
          ? periods.slice(Math.floor(index / count), Math.floor(index / count) + 1)
          : periods;
      const message = assessmentIntervalIssue(
        cyclePeriods.map(readDateRange),
        stage.start,
        stage.end,
      );
      if (message) issue(path, message);
    }
    if (
      valid &&
      index &&
      !(draft.organization === 'semestral' && index % count === 0) &&
      draft.stages[index - 1].end &&
      stage.start <= draft.stages[index - 1].end
    )
      issue(path, 'Esta etapa deve começar depois do término da anterior.');
  }
  if (periodsValid)
    for (const event of state.events.filter(
      (event) => event.effect === 'include' && appliesTo(event, modality),
    )) {
      if (
        datesBetween(event.start, event.end).some(
          (date) => !periods.some((period) => period.start <= date && date <= period.end),
        )
      )
        issue(
          'periods',
          `A inclusão letiva “${event.name}” (${event.start.split('-').reverse().join('/')}) ficaria fora dos períodos desta oferta. Ajuste as datas ou revise a inclusão antes de aplicar.`,
        );
    }
  // Edited stages are also checked against every other recorded date, as saving does.
  let sequence = 0;
  let candidate: ActivityState | undefined;
  try {
    candidate = issues.length
      ? undefined
      : organize(original, modality, draft, () => `draft-${++sequence}`, newOffer);
  } catch {
    // A draft that cannot be built (a period that changed) is reported by applying it.
  }
  if (candidate)
    try {
      normalizeOfferCalendar(candidate, original);
    } catch (error) {
      const edited = draft.stages.slice(0, stageCount).findIndex((_, index) => !unchanged(index));
      issue(
        edited < 0 ? 'stages' : `stages[${edited}]`,
        error instanceof Error ? error.message : String(error),
      );
    }
  return issues;
}

/**
 * Dates of the offer that will be under “Vínculo a conferir” once the draft is applied. They are
 * shown in the preview and never block the organization: links are kept as recorded.
 */
export function offerOrganizationWarnings(
  state: ActivityState,
  modality: string,
  draft: OfferOrganizationDraft,
  newOffer?: CalendarOffer,
): OrganizationIssue[] {
  if (offerOrganizationIssues(state, modality, draft, newOffer).length) return [];
  let sequence = 0;
  let next: ActivityState;
  try {
    next = applyOfferOrganization(state, modality, draft, () => `preview-${++sequence}`, newOffer);
  } catch {
    return [];
  }
  const review = linksToReview(next);
  return next.events
    .filter(
      (event) =>
        review.has(event.id) &&
        (appliesTo(event, modality) || event.requirementId?.endsWith(`:${modality}`)),
    )
    .map((event) => ({
      path: 'organization',
      message: `“${event.name}” ficará em Vínculo a conferir (${linkIssueLabels[review.get(event.id)!]}).`,
    }));
}

/** Change one offer's periods and stages together; never recalculate another offer's dates. */
export function applyOfferOrganization<S extends ActivityState>(
  state: S,
  modality: string,
  draft: OfferOrganizationDraft,
  id: () => string,
  newOffer?: CalendarOffer,
): S {
  const issues = offerOrganizationIssues(state, modality, draft, newOffer);
  if (issues.length) throw new DomainError(issues[0].message);
  const candidate = organize(state, modality, draft, id, newOffer);
  // Same normalization called by calendars:saveCalendar. No invalid intermediate state is emitted.
  normalizeOfferCalendar(candidate, state);
  return candidate;
}

/** The organized state, without validation; callers check it as saving does. */
function organize<S extends ActivityState>(
  state: S,
  modality: string,
  draft: OfferOrganizationDraft,
  id: () => string,
  newOffer?: CalendarOffer,
): S {
  state = withOffer(state, modality, newOffer);
  const count = Number(draft.count);
  const stageCount = count * (draft.organization === 'semestral' ? 2 : 1);
  const organization: 'anual' | 'semestral' =
    draft.organization === 'semestral' ? 'semestral' : 'anual';
  const terms: readonly AcademicTerm[] = termsByOrganization[organization];
  const remapped = new Map<string, string>();
  const selected = draft.periods.slice(0, terms.length);
  const sourceIds = new Set(selected.map((period) => period.sourceId).filter(Boolean));
  for (const source of sourceIds) {
    const existing = state.periods.find((period) => period.id === source);
    if (!existing) throw new DomainError('O período mudou. Reabra a organização desta oferta.');
    if (
      existing.association?.status === 'defined' &&
      !associationOffers(existing.association).includes(modality)
    )
      throw new DomainError('O período selecionado pertence a outra oferta.');
  }
  const retained = state.periods.flatMap((period) => {
    if (period.association?.status !== 'defined') return sourceIds.has(period.id) ? [] : [period];
    if (!associationOffers(period.association).includes(modality)) return [period];
    const modalities = associationOffers(period.association).filter((m) => m !== modality);
    return modalities.length
      ? [{ ...period, association: association(modalities, period.association.term) }]
      : [];
  });
  const periods: CalendarPeriod[] = selected.map((value, index) => {
    const source = state.periods.find((period) => period.id === value.sourceId);
    const shared =
      source?.association?.status === 'defined' && associationOffers(source.association).length > 1;
    const periodId = source && !shared ? source.id : id();
    if (source) remapped.set(source.id, periodId);
    return {
      id: periodId,
      name:
        value.name.trim() ||
        `${terms[index] === 'annual' ? 'Ano letivo' : index ? '2º semestre' : '1º semestre'} — ${labelFor(state, modality)}`,
      start: civilDate(value.start),
      end: civilDate(value.end),
      association: association([modality], terms[index]),
    };
  });
  const next = {
    ...state,
    offers: state.offers.map((offer) => {
      if (offer.id !== modality) return offer;
      const { legacyStageCount: _legacy, ...configured } = offer;
      return { ...configured, organization, stages: { perTerm: count } };
    }),
    periods: [...retained, ...periods],
  };
  const valid = new Set(activityPlan(next).map((requirement) => requirement.id));
  // Each draft stage updates the date already recorded for it, never a second one.
  const stageDates = new Map<string, OrganizationStageDraft>();
  const added: CalendarEvent[] = [];
  for (const [index, value] of draft.stages.slice(0, stageCount).entries()) {
    const requirementId = `stage-${index + 1}:${modality}`;
    const existing =
      state.events.find(
        (event) => event.id === value.id && event.requirementId === requirementId,
      ) ?? state.events.find((event) => event.requirementId === requirementId);
    if (existing) stageDates.set(existing.id, value);
    else
      added.push({
        id: id(),
        name: `${organization === 'semestral' ? `${(index % count) + 1}ª etapa — ${Math.floor(index / count) + 1}º semestre` : `${index + 1}ª etapa de avaliação`} — ${labelFor(state, modality)}`,
        requirementId,
        start: civilDate(value.start),
        end: civilDate(value.end),
        effect: 'note',
        category: 'limite',
        offers: [modality],
      });
  }
  // Links are never removed here: retired, duplicate or incompatible dates keep their link and
  // appear under “Vínculo a conferir” (`linksToReview`).
  const events: CalendarEvent[] = state.events.flatMap((event) => {
    const stage = stageDates.get(event.id);
    if (stage) {
      const { assessmentAutoStart: _auto, ...previous } = event;
      return [
        {
          ...previous,
          start: civilDate(stage.start),
          end: civilDate(stage.end),
          effect: 'note' as const,
          category: event.category ?? 'limite',
          offers: [modality],
        },
      ];
    }
    const mapped = event.admission?.periodId && remapped.get(event.admission.periodId);
    if (!mapped || mapped === event.admission?.periodId || !appliesTo(event, modality))
      return [event];
    // A date whose link has no generated activity stays whole, with its previous destination.
    if (event.requirementId && !valid.has(event.requirementId)) return [event];
    const explicit = event.offers;
    const scope = explicit?.length ? explicit : offerIds(state);
    const others = scope.filter((m) => m !== modality);
    const moved = {
      ...eventScope(event, [modality]),
      id: others.length ? id() : event.id,
      admission: { ...event.admission!, periodId: mapped },
    };
    return others.length ? [eventScope(event, others), moved] : [moved];
  });
  events.push(...added);
  const candidate = {
    ...next,
    rulesetVersion: rulesetVersion(next),
    events,
  };
  return candidate;
}

function association(ids: string[], term: AcademicTerm): PeriodAssociation {
  return { status: 'defined', offers: ids, term };
}
function eventScope(event: CalendarEvent, ids: string[]): CalendarEvent {
  return { ...event, offers: ids };
}
