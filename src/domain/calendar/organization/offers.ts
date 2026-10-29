import {
  assessmentStageCounts,
  assessmentStageNumbers,
  modalityIds,
  termsByOrganization,
  periodCountByOrganization,
} from '../config.ts';
import type { AcademicTerm, ActivityState, CalendarActivity, CalendarPeriod } from '../model.ts';
import { datesBetween } from '../counting/core.ts';
import { assessmentIntervalIssue } from '../activities/assessment-intervals.ts';
import { calendarModalities, appliesTo, modalityLabels } from '../modalities.ts';
import { organizationForModality, organizationSummary, periodsForModality } from './periods.ts';
import { rulesetVersion } from '../../policies/registry.ts';
import { activityChecklist } from '../activities/checklist.ts';
import { stageRequirement } from '../activities/assessment.ts';
import { normalizeCalendar } from '../normalization/normalize.ts';
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
  const periods = periodsForModality(state, modality);
  const organization = organizationForModality(state, modality);
  return {
    organization: organization === 'a-classificar' ? '' : organization,
    count: String(state.assessmentStagesByModality?.[modality] ?? ''),
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
function withOffer<S extends ActivityState>(state: S, modality: string): S {
  if (calendarModalities(state).includes(modality)) return state;
  return {
    ...state,
    modalities: [...calendarModalities(state), modality],
    events: state.events.map((event) =>
      event.modalities?.length ? event : { ...event, modalities: [...calendarModalities(state)] },
    ),
  };
}

/** New offers must arrive with their complete independent periods and stages. */
export function validateAddedOffers(previous: readonly string[], next: ActivityState) {
  if (previous.some((modality) => !calendarModalities(next).includes(modality)))
    throw new DomainError('Ofertas existentes não podem ser removidas por esta operação.');
  for (const modality of calendarModalities(next).filter(
    (modality) => !previous.includes(modality),
  )) {
    if (!modalityIds.some((allowed) => allowed === modality))
      throw new DomainError('Oferta inválida.');
    const draft = offerOrganizationDraft(next, modality);
    const issues = offerOrganizationIssues(next, modality, draft);
    if (issues.length)
      throw new DomainError(
        `Configure a nova oferta ${modalityLabels[modality]}: ${issues[0].message}`,
      );
    const organization = organizationForModality(next, modality);
    const expected =
      organization === 'semestral' ? termsByOrganization.semestral : termsByOrganization.anual;
    const periods = periodsForModality(next, modality);
    const stages = next.events.filter(
      (event) =>
        stageRequirement(event.requirementId) && event.requirementId?.endsWith(`:${modality}`),
    );
    if (
      periods.length !== expected.length ||
      periods.some(
        (period) =>
          period.association?.status !== 'defined' || period.association.modalities.length !== 1,
      ) ||
      stages.length !== Number(draft.count)
    )
      throw new DomainError(
        `Defina os períodos e todas as etapas da nova oferta ${modalityLabels[modality]} antes de aplicar.`,
      );
  }
}

/** Draft checks share the stage-bounds rule enforced by backend normalization. */
export function offerOrganizationIssues(
  state: ActivityState,
  modality: string,
  draft: OfferOrganizationDraft,
): OrganizationIssue[] {
  const issues: OrganizationIssue[] = [];
  const issue = (path: string, message: string) => issues.push({ path, message });
  if (!modalityIds.some((allowed) => allowed === modality)) {
    issue('organization', 'Oferta inválida.');
    return issues;
  }
  state = withOffer(state, modality);
  if (!['anual', 'semestral'].includes(draft.organization))
    issue('organization', 'Selecione a organização da oferta.');
  const count = Number(draft.count);
  if (
    draft.periods[0]?.sourceId &&
    draft.organization === 'semestral' &&
    draft.periods[0].sourceId === draft.periods[1]?.sourceId
  )
    issue('periods[1]', 'Escolha períodos existentes diferentes para cada semestre.');
  if (draft.organization && draft.organization !== organizationForModality(state, modality)) {
    if (
      Object.entries(state.intakeByModality?.[modality] ?? {}).some(
        ([term, entry]) =>
          entry.required && (term === 'annual') !== (draft.organization === 'anual'),
      )
    )
      issue(
        'organization',
        'Revise a exigência local de matrícula nas atividades antes de alterar a organização da oferta.',
      );
    const changed = {
      ...state,
      organizationByModality: {
        ...state.organizationByModality,
        [modality]:
          draft.organization === 'semestral' ? ('semestral' as const) : ('anual' as const),
      },
    };
    const requirements = new Map(activityChecklist(changed).map((row) => [row.id, row]));
    for (const event of state.events.filter(
      (event) =>
        appliesTo(event, modality) && event.requirementId && !stageRequirement(event.requirementId),
    )) {
      const requirement = requirements.get(event.requirementId!);
      if (
        !requirement ||
        (requirement.modality && requirement.modality !== modality) ||
        (requirement.modalities && !requirement.modalities.includes(modality))
      )
        issue(
          'organization',
          `Revise a atividade “${event.name}” antes de alterar a organização da oferta.`,
        );
    }
    if (state.events.some((event) => event.admission?.periodId && appliesTo(event, modality)))
      issue(
        'organization',
        'Revise os editais vinculados aos períodos antes de alterar a organização da oferta.',
      );
  }
  if (!assessmentStageCounts.includes(count))
    issue('count', 'Selecione a quantidade de etapas no ano.');
  const periods = draft.periods.slice(
    0,
    periodCountByOrganization[draft.organization === 'semestral' ? 'semestral' : 'anual'],
  );
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
  for (const [index, stage] of draft.stages.slice(0, count).entries()) {
    const path = `stages[${index}]`;
    const valid = interval(stage.start, stage.end, path);
    if (valid && periodsValid) {
      const message = assessmentIntervalIssue(periods, stage.start, stage.end);
      if (message) issue(path, message);
    }
    if (valid && index && draft.stages[index - 1].end && stage.start <= draft.stages[index - 1].end)
      issue(path, 'Esta etapa deve começar depois do término da anterior.');
  }
  if (periodsValid)
    for (const event of state.events.filter(
      (event) => event.kind === 'include' && appliesTo(event, modality),
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
  return issues;
}

/** Change one offer's periods and stages together; never recalculate another offer's dates. */
export function applyOfferOrganization<S extends ActivityState>(
  state: S,
  modality: string,
  draft: OfferOrganizationDraft,
  id: () => string,
): S {
  const issues = offerOrganizationIssues(state, modality, draft);
  if (issues.length) throw new DomainError(issues[0].message);
  state = withOffer(state, modality);
  const count = Number(draft.count);
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
      !existing.association.modalities.includes(modality)
    )
      throw new DomainError('O período selecionado pertence a outra oferta.');
  }
  const retained = state.periods.flatMap((period) => {
    if (period.association?.status !== 'defined') return sourceIds.has(period.id) ? [] : [period];
    if (!period.association.modalities.includes(modality)) return [period];
    const modalities = period.association.modalities.filter((m) => m !== modality);
    return modalities.length
      ? [{ ...period, association: { ...period.association, modalities } }]
      : [];
  });
  const periods: CalendarPeriod[] = selected.map((value, index) => {
    const source = state.periods.find((period) => period.id === value.sourceId);
    const shared =
      source?.association?.status === 'defined' && source.association.modalities.length > 1;
    const periodId = source && !shared ? source.id : id();
    if (source) remapped.set(source.id, periodId);
    return {
      id: periodId,
      name:
        value.name.trim() ||
        `${terms[index] === 'annual' ? 'Ano letivo' : index ? '2º semestre' : '1º semestre'} — ${modalityLabels[modality]}`,
      start: value.start,
      end: value.end,
      association: { status: 'defined', modalities: [modality], term: terms[index] },
    };
  });
  const organizationByModality = { ...state.organizationByModality, [modality]: organization };
  const next = {
    ...state,
    schemaVersion: 3,
    organizationByModality,
    regime: organizationSummary(organizationByModality, calendarModalities(state)),
    assessmentStagesByModality: { ...state.assessmentStagesByModality, [modality]: count },
    periods: [...retained, ...periods],
  };
  const valid = new Set(activityChecklist(next).map((requirement) => requirement.id));
  const events: CalendarActivity[] = state.events.flatMap((event) => {
    if (stageRequirement(event.requirementId) && event.requirementId?.endsWith(`:${modality}`))
      return [];
    let kept = event;
    if (appliesTo(event, modality) && event.requirementId && !valid.has(event.requirementId)) {
      const { requirementId: _link, assessmentAutoStart: _auto, ...rest } = event;
      kept = rest;
    }
    const mapped = event.admission?.periodId && remapped.get(event.admission.periodId);
    if (!mapped || mapped === event.admission?.periodId || !appliesTo(event, modality))
      return [kept];
    const scope = event.modalities?.length ? event.modalities : calendarModalities(state);
    const others = scope.filter((m) => m !== modality);
    const moved = {
      ...kept,
      id: others.length ? id() : kept.id,
      modalities: [modality],
      admission: { ...event.admission!, periodId: mapped },
    };
    return others.length ? [{ ...kept, modalities: others }, moved] : [moved];
  });
  for (const [index, value] of draft.stages.slice(0, count).entries()) {
    const requirementId = `stage-${index + 1}:${modality}`;
    const existing = state.events.find(
      (event) => event.id === value.id && event.requirementId === requirementId,
    );
    const { assessmentAutoStart: _auto, ...previous } = existing ?? {};
    events.push({
      ...previous,
      id: existing?.id ?? id(),
      name: existing?.name ?? `${index + 1}ª etapa de avaliação — ${modalityLabels[modality]}`,
      requirementId,
      start: value.start,
      end: value.end,
      kind: 'note',
      category: existing?.category ?? 'limite',
      modalities: [modality],
    });
  }
  // Keep retired or duplicate records as notes instead of losing dates.
  const keptStageIds = new Set(
    events.filter((event) => stageRequirement(event.requirementId)).map((event) => event.id),
  );
  for (const event of state.events.filter(
    (event) =>
      stageRequirement(event.requirementId) &&
      event.requirementId?.endsWith(`:${modality}`) &&
      !keptStageIds.has(event.id),
  )) {
    const { requirementId: _link, assessmentAutoStart: _auto, ...kept } = event;
    events.push({ ...kept, kind: 'note', recordType: 'retired-stage' });
  }
  const candidate = {
    ...next,
    rulesetVersion: rulesetVersion(next),
    events,
    conversion: state.conversion
      ? {
          ...state.conversion,
          organization:
            [...retained, ...periods].every((period) => period.association?.status === 'defined') &&
            calendarModalities(state).every(
              (m) => organizationForModality(next, m) !== 'a-classificar',
            )
              ? ('classified' as const)
              : ('pending' as const),
        }
      : undefined,
  };
  // Same normalization called by calendars:saveCalendar. No invalid intermediate state is emitted.
  normalizeCalendar({ ...candidate, ignoredHistory: [] });
  return candidate;
}
