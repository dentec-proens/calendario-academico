export interface PaginationState {
  status: 'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted';
  loadMore: (numItems: number) => void;
}

export default function Pagination({
  pagination,
  label,
}: {
  pagination: PaginationState;
  label: string;
}) {
  if (pagination.status === 'Exhausted') return null;
  if (pagination.status === 'LoadingFirstPage') return <p role="status">Carregando…</p>;
  return (
    <button
      type="button"
      className="secondary"
      disabled={pagination.status === 'LoadingMore'}
      onClick={() => pagination.loadMore(50)}
    >
      {pagination.status === 'LoadingMore' ? 'Carregando…' : label}
    </button>
  );
}
