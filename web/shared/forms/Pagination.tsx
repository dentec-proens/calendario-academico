import { LoadingIndicator } from '../../components/ui/LoadingIndicator.tsx';
import { Button } from '../../components/ui/Button.tsx';
export interface PaginationState {
  status: 'LoadingFirstPage' | 'CanLoadMore' | 'LoadingMore' | 'Exhausted';
  loadMore: (numItems: number) => void;
}

export default function Pagination({
  pagination,
  label,
  loadingLabel = 'Carregando…',
}: {
  pagination: PaginationState;
  label: string;
  loadingLabel?: string;
}) {
  if (pagination.status === 'Exhausted') return null;
  if (pagination.status === 'LoadingFirstPage') return <LoadingIndicator label={loadingLabel} />;
  return (
    <Button
      type="button"
      variant="secondary"
      pending={pagination.status === 'LoadingMore'}
      loadingLabel={loadingLabel}
      onClick={() => pagination.loadMore(50)}
    >
      {label}
    </Button>
  );
}
