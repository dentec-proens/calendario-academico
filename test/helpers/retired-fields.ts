/**
 * Fields of format 4 that format 5 no longer has, as the v4 storage validators had them before the
 * contraction removed them. Tests that prove the current contracts refuse them use these lists, so
 * the old names stay out of the code of format 5.
 */

/** Of a local date: the effect, the link, the record type and the notice fields. */
export const retiredDateFields: readonly string[] = [
  'kind',
  'requirementId',
  'recordType',
  'publicationStatus',
  'admission',
];

/** Of an offer: the reported stage count of format 4. */
export const retiredOfferFields: readonly string[] = ['legacyStageCount'];
