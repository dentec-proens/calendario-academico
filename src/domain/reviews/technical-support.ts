import {
  isLocalDate,
  type DateFields,
  type InstitutionalEventSnapshot,
  type ProjectedDate,
  type TeachingState,
} from '../calendar/model.ts';
import {
  calendarOffers,
  labelFor,
  organizationSummary,
  kinds,
  offerFor,
  associationOffers,
  scopeStatus,
} from '../calendar/offers.ts';
import type { ActivityRef } from '../calendar/activities/activity-ref.ts';
import { evaluateCalendar as calendarResult } from '../calendar/counting/evaluation.ts';
import { policyFor } from '../policies/registry.ts';
import { coverageRows, criterionSupport, type EvidenceContext } from './evidence.ts';

export function reviewSupport<
  T extends {
    id: string;
    name: string;
    version: number;
    state: TeachingState & { campus?: string };
  },
>(
  record: T,
  events: (Pick<DateFields, 'id' | 'name' | 'start' | 'end' | 'category'> &
    Partial<Pick<DateFields, 'effect' | 'notice' | 'deadlineAdjustment' | 'hours'>> & {
      activity?: ActivityRef;
      internal?: true;
    } & Pick<InstitutionalEventSnapshot, 'evidence' | 'institutional' | 'offers'>)[],
) {
  // Every date lists the offers it reaches.
  const projected = events.map((event) => ({
    ...event,
    effect: event.effect ?? 'note',
  })) as ProjectedDate[];
  let result: ReturnType<typeof calendarResult> | null = null,
    error: string | null = null,
    unavailableReason = '',
    provisional = false;
  try {
    result = calendarResult(record.state, projected);
  } catch (cause) {
    unavailableReason = cause instanceof Error ? cause.message : String(cause);
    error = 'Contagem indisponível: ' + unavailableReason;
    // A numerical preview uses only registered weekdays and events, never an assumed week.
    if (record.state.weekdays?.length) {
      try {
        result = calendarResult(
          {
            ...record.state,
            weekConfirmed: true,
          },
          projected,
        );
        provisional = true;
        error = 'Contagem provisória: confirme a semana letiva no editor.';
      } catch {
        /* Invalid periods or dates must not produce a misleading total. */
      }
    }
  }
  const regime = organizationSummary(record.state.offers);
  const counts = result ? Object.entries(result.byOffer) : [];
  const policy = policyFor(record.state.year);
  const source = policy.review.source;
  const sameYear = record.state.year === source.year;
  const normativeScopeConfirmed =
    !policy.scope ||
    (calendarOffers(record.state).filter(
      (offer) => !policy.excludes(offer) && scopeStatus(offer) !== 'own-regulation',
    ).length > 0 &&
      calendarOffers(record.state)
        .filter((offer) => !policy.excludes(offer) && scopeStatus(offer) !== 'own-regulation')
        .every((offer) => scopeStatus(offer) === 'covered'));
  const normativeOffers = calendarOffers(record.state).filter(
    (offer) => !policy.excludes(offer) && (!policy.scope || scopeStatus(offer) === 'covered'),
  );
  const normativeRegime = organizationSummary(normativeOffers);
  const windowPeriods = record.state.periods.filter((period) =>
    associationOffers(period.association).some((id) => {
      const offer = offerFor(record.state, id);
      return offer && !policy.excludes(offer) && scopeStatus(offer) !== 'own-regulation';
    }),
  );
  const context: EvidenceContext = {
    state: record.state,
    localEvents: projected.filter(isLocalDate),
    policy,
    result,
    provisional,
    unavailableReason,
    sameYear,
    scopeConfirmed: normativeScopeConfirmed,
    normativeOfferIds: normativeOffers.map((offer) => offer.id),
    normativeRegime,
    windowPeriods,
  };
  const coverage = coverageRows(record.state, policy, projected);
  return {
    source,
    rulesetVersion: policy.rulesetVersion(record.state),
    sameYear,
    scopeConfirmed: normativeScopeConfirmed,
    notEvaluated: [...(policy.review.notEvaluated ?? [])],
    officialApproval: false,
    calendar: {
      id: record.id,
      name: record.name,
      campus: record.state.campus,
      year: record.state.year,
      offerKinds: kinds({ offers: record.state.offers }),
      offers: record.state.offers,
      regime: regime,
      version: record.version,
    },
    criteria: policy.review.criteria.map((criterion) => {
      const { finding, ...support } = criterionSupport(criterion, context, events, coverage);
      return {
        id: criterion.id,
        title: criterion.title,
        item: criterion.item,
        pattern: criterion.pattern,
        requirement: criterion.requirement ?? null,
        source: criterion.source ?? criterion.item,
        ...support,
        initial: {
          id: criterion.id,
          status: 'PENDENTE' as const,
          notes: '',
          reviewed: false,
          finding,
        },
      };
    }),
    teachingDays: counts.map(([modality, r]) => ({
      offerId: modality,
      label: labelFor(record.state, modality),
      total: r.total,
      byPeriod: r.byPeriod,
      provisional,
    })),
    conflicts: result?.conflicts || [],
    countError: error,
  };
}
