import { contentStateV4, eventV4 } from '../../convex/legacyValidators.ts';
import { calendarOffer, event } from '../../convex/validators.ts';

/**
 * Fields of format 4 that format 5 no longer has, read from the frozen storage validators
 * (`convex/legacyValidators.ts`) against the current ones. Tests that prove the current contracts
 * refuse them use these lists, so the old names stay only in the converter, the classifier, the
 * frozen validators and the oracles (plan `docs/plans/2026-11-02-atividades-e-datas.md`, step 20).
 */
const retired = (before: object, after: object) =>
  Object.keys(before).filter((field) => !(field in after));

/** Of a local date: the effect, the link, the offers, the record type and the notice fields. */
export const retiredDateFields = retired(eventV4.fields, event.fields);

/** Of an offer: the reported stage count of format 4. */
export const retiredOfferFields = retired(
  contentStateV4.fields.offers.element.fields,
  calendarOffer.fields,
);
