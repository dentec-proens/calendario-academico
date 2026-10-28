import type { ActivityState, CalendarActivity } from './model.ts';
import { equalValues } from '../../equal.ts';
import { inheritedEvents } from '../institution/catalogue.ts';
import { recalculateCalendar } from './commands.ts';
import { normalizeCalendar } from './normalization/normalize.ts';
import { calendarContent } from './normalization/content.ts';
import { invalidCalendar } from './normalization/input.ts';
import { validateAddedOffers } from './organization/offers.ts';

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
