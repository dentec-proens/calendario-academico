/** The situations of the index, in the order a review moves through them. */
export const reviewFilterLabels = {
  PENDENTE: 'A avaliar',
  ATENDIDO: 'Atendido',
  NAO_ATENDIDO: 'Não atendido',
  NAO_APLICAVEL: 'Não aplicável',
} as const;
export type ReviewFilter = 'all' | keyof typeof reviewFilterLabels;

const filters = Object.keys(reviewFilterLabels) as (keyof typeof reviewFilterLabels)[];

/**
 * How the assessments stand, as the way through a long list: choosing a situation leaves only its
 * criteria, right below. Buttons rather than radios, because arrows would refilter at every step.
 */
export default function ReviewIndex({
  total,
  counts,
  filter,
  onChange,
}: {
  total: number;
  counts: Record<string, number>;
  filter: ReviewFilter;
  onChange: (filter: ReviewFilter) => void;
}) {
  const item = (value: ReviewFilter, label: string, count: number) => (
    <button
      key={value}
      type="button"
      className="review-index__item"
      data-review-filter={value}
      aria-pressed={filter === value}
      onClick={() => onChange(value)}
    >
      <span>{label}</span> <strong>{count}</strong>
    </button>
  );
  return (
    <div
      id="review-index"
      className="review-index"
      role="group"
      aria-label="Critérios por situação"
    >
      {item('all', 'Todos', total)}
      {filters.map((value) => item(value, reviewFilterLabels[value], counts[value] ?? 0))}
    </div>
  );
}
