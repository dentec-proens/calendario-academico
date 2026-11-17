import { kindNoteFor, kindSeparator, labelFor } from '#src/domain/calendar/offers.ts';
import type { AssessmentSettings } from '#src/domain/calendar/model.ts';

/** The kind beside an offer's name, when the name alone does not say it. */
export function KindNote({ kind }: { kind: string | undefined }) {
  return kind ? (
    <span className="offer-kind">
      {kindSeparator}
      {kind}
    </span>
  ) : null;
}

/** An offer by name, followed by its kind when the name alone does not say it. */
export default function OfferName({ state, id }: { state: AssessmentSettings; id: string }) {
  return (
    <>
      {labelFor(state, id)}
      <KindNote kind={kindNoteFor(state, id)} />
    </>
  );
}
