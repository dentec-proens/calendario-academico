import type { Id } from '../../../convex/_generated/dataModel.js';
import { confirmAction } from '../../components/confirmation.ts';
import { reviews } from '../../shared/convex/reviews.ts';
import { updatedLabel } from '../../shared/dates.ts';

/** Taking a parecer from a colleague is always a stated decision; the server checks the holder. */
export function assumeReview(
  calendarId: string,
  holder: { id: Id<'users'>; name: string; at: string },
) {
  return confirmAction({
    title: 'Assumir este parecer?',
    description: `${holder.name} assumiu este parecer em ${updatedLabel(holder.at)}.`,
    consequence: `${holder.name} só poderá salvá-lo se assumi-lo de volta.`,
    intent: 'warning',
    confirmLabel: 'Assumir parecer',
    pendingLabel: 'Assumindo…',
    onConfirm: () => reviews.assume(calendarId, holder.id).then(() => undefined),
  });
}
