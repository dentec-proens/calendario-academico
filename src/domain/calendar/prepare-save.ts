import type { ActivityState, CalendarActivity, CalendarContentV4 } from './model.ts';
import { equalValues } from '../../shared/equal.ts';
import { inheritedEvents } from '../institution/catalogue.ts';
import { recalculateCalendar } from './commands/recalculate.ts';
import { normalizeCalendar } from './normalization/normalize.ts';
import { calendarContent } from './normalization/content.ts';
import { invalidCalendar } from './normalization/input.ts';
import {
  validateAddedOffers,
  offerOrganizationDraft,
  offerOrganizationIssues,
} from './organization/offers.ts';
import { normalizeOfferCalendar, offerCalendarContent } from './normalization/normalize-v4.ts';
import { kinds } from './offers.ts';

type OfferState = CalendarContentV4 & { year: number; campus?: string };

/** V4 save boundary; the backend retains concurrency, authorization and final confirmation. */
export function prepareOfferCalendarSave<E extends CalendarActivity & { active: boolean }>(
  previous: OfferState,
  proposed: OfferState,
  context: { storedContent: unknown; catalogue: { events: E[] }; recalculate: boolean },
) {
  if (proposed.year !== previous.year) invalidCalendar('O ano não pode mudar neste registro.');
  for (const old of previous.offers) {
    const next = proposed.offers.find((offer) => offer.id === old.id);
    if (!next)
      return invalidCalendar('Ofertas existentes não podem ser removidas por esta operação.');
    if (next.kind !== old.kind) invalidCalendar('O tipo de uma oferta existente não pode mudar.');
  }
  const previousIds = previous.offers.map((offer) => offer.id);
  const added = proposed.offers.some((offer) => !previousIds.includes(offer.id));
  let state = normalizeOfferCalendar({
    ...proposed,
    campus: previous.campus ?? '',
    events: added
      ? proposed.events.map((event) =>
          !event.offers?.length &&
          previous.events.some((old) => old.id === event.id && !old.offers?.length)
            ? { ...event, offers: previousIds }
            : event,
        )
      : proposed.events,
  });
  for (const offer of state.offers) {
    const old = previous.offers.find((item) => item.id === offer.id);
    if (offer.legacyStageCount !== undefined && offer.legacyStageCount !== old?.legacyStageCount)
      invalidCalendar('A quantidade anterior de etapas não pode ser criada nem alterada.');
    if (old?.legacyStageCount !== undefined && offer.legacyStageCount === undefined) {
      if (offer.organization === 'a-classificar' || !offer.stages)
        invalidCalendar(
          'Configure a organização e todas as etapas antes de retirar a quantidade anterior.',
        );
      const issues = offerOrganizationIssues(
        previous,
        offer.id,
        offerOrganizationDraft(state, offer.id),
      );
      if (issues.length)
        invalidCalendar(`Configure os períodos e todas as etapas da oferta: ${issues[0].message}`);
    }
  }
  validateAddedOffers(previousIds, state);
  if (context.recalculate || !equalValues(context.storedContent, offerCalendarContent(state)))
    state = normalizeOfferCalendar(
      recalculateCalendar(
        state,
        inheritedEvents(context.catalogue, previous.year, state.offers, state),
      ),
    );
  const content = offerCalendarContent(state);
  return {
    state,
    content,
    offerKinds: kinds(state),
    institutionalSnapshot: inheritedEvents(context.catalogue, previous.year, state.offers, state),
    unchanged: equalValues(context.storedContent, content),
  };
}

/**
 * Prepares one candidate from explicit snapshots, without authorizing or persisting it.
 * The caller checks versions and base acceptance in the same transaction as the eventual write.
 */
export function prepareCalendarSave<E extends CalendarActivity & { active: boolean }>(
  previous: Pick<ActivityState, 'year' | 'modalities' | 'events' | 'campus'>,
  proposed: ActivityState,
  context: { storedContent: unknown; catalogue: { events: E[] }; recalculate: boolean },
) {
  if (proposed.year !== previous.year) invalidCalendar('O ano não pode mudar neste registro.');
  const previousOffers = previous.modalities ?? [];
  const nextOffers = proposed.modalities ?? [];
  if (previousOffers.some((modality) => !nextOffers.includes(modality)))
    invalidCalendar('Ofertas existentes não podem ser removidas por esta operação.');
  const added = nextOffers.some((modality) => !previousOffers.includes(modality));
  let state = normalizeCalendar({
    ...proposed,
    events: added
      ? proposed.events.map((event) =>
          !event.modalities?.length &&
          previous.events.some((item) => item.id === event.id && !item.modalities?.length)
            ? { ...event, modalities: [...previousOffers] }
            : event,
        )
      : proposed.events,
    campus: previous.campus,
  });
  try {
    validateAddedOffers(previousOffers, state);
    if (context.recalculate || !equalValues(context.storedContent, calendarContent(state)))
      state = normalizeCalendar(
        recalculateCalendar(
          state,
          inheritedEvents(context.catalogue, previous.year, state.modalities, state),
        ),
      );
  } catch (error) {
    invalidCalendar(
      error instanceof Error ? error.message : 'Não foi possível recalcular o calendário.',
    );
  }
  const content = calendarContent(state);
  return {
    state,
    content,
    institutionalSnapshot: inheritedEvents(
      context.catalogue,
      previous.year,
      state.modalities,
      state,
    ),
    unchanged: equalValues(context.storedContent, content),
  };
}
