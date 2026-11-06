/**
 * Why a review cannot be concluded yet, or null when it can. The mutation enforces this rule and
 * the review page uses it to state the reason before the click, so both read the same answer.
 */
export function conclusionBlock({
  baseCompatible,
  reviewCurrent,
  criteria,
  entries,
}: {
  /** Whether the institutional base still matches the one the calendar was submitted with. */
  baseCompatible: boolean;
  /** Whether a review was saved for this submission and still applies to its content. */
  reviewCurrent: boolean;
  criteria: readonly { id: string }[];
  entries: readonly { id: string; reviewed?: boolean; status: string }[];
}) {
  if (!baseCompatible)
    return 'A base institucional mudou depois do envio. Devolva o calendário ao campus.';
  if (!reviewCurrent) return 'Salve o parecer deste envio antes de concluir a revisão.';
  const missing = criteria.filter((criterion) => {
    const entry = entries.find((item) => item.id === criterion.id);
    return !entry?.reviewed || entry.status === 'PENDENTE';
  }).length;
  if (missing)
    return `${missing === 1 ? 'Falta 1 critério' : `Faltam ${missing} critérios`}: avalie todos antes de concluir.`;
  if (entries.some((entry) => entry.status === 'NAO_ATENDIDO'))
    return 'Há critério não atendido. Devolva o calendário ao campus para ajuste.';
  return null;
}
