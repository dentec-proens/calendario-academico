/** Text folded for comparison: a search ignores case and accents in both the query and the data. */
export function searchText(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
}

/**
 * Every word of the query must appear somewhere in the fields, in any order, so "umuarama 2027"
 * finds a calendar whose name has them apart. A blank query matches everything.
 */
export function matchesSearch(query: string, ...fields: readonly string[]) {
  const terms = searchText(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const text = searchText(fields.join(' '));
  return terms.every((term) => text.includes(term));
}
