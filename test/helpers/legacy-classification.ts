/**
 * The 2027 policy no longer generates the rows format 4 kept from the operational catalogue as
 * “Classificação legada”. The frozen oracles were captured with them; these helpers derive what the
 * oracles expect without them, so every other value is still compared in full. A date that was
 * linked to one of those rows is now a link without generated activity, under “Vínculo a conferir”
 * (`not-generated`), never dropped.
 */
export const legacyBasis = 'Classificação legada';

/** IDs of the rows an oracle recorded as “Classificação legada”. */
export const legacyIds = (rows: readonly { id: string; basis?: string }[]) =>
  new Set(rows.filter((row) => row.basis === legacyBasis).map((row) => row.id));

/** The oracle readiness or diagnostic message names one of the retired rows as `[id]`. */
export const namesLegacyRow = (message: string, ids: ReadonlySet<string>) =>
  [...ids].some((id) => message.includes(`[${id}]`));
