/** A validated Gregorian calendar date, without time or timezone, serialized as YYYY-MM-DD. */
declare const civilDateBrand: unique symbol;
export type CivilDate = string & { readonly [civilDateBrand]: true };

/** The only constructor: reject noncanonical strings and nonexistent days, including leap days. */
export function civilDate(value: unknown): CivilDate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new TypeError('Data deve usar YYYY-MM-DD');
  const time = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value)
    throw new RangeError('Data civil inválida');
  return value as CivilDate;
}

/** Empty optional date inputs mean absence; required dates always use civilDate. */
export function optionalCivilDate(value: unknown): CivilDate | undefined {
  return value === undefined || value === '' ? undefined : civilDate(value);
}

/** UTC is used only for arithmetic; the domain value remains a date without timezone. */
export function parseDate(value: string): number {
  return Date.parse(`${civilDate(value)}T00:00:00.000Z`);
}
