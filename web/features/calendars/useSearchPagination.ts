import { useEffect, useState } from 'react';
import type { PaginationState } from '../../shared/forms/Pagination.tsx';

const visibleStep = 50;
const scannedPerPage = 100;

/**
 * The server filters a search page by page, so a page may hold few matches or none. While a search
 * is active this keeps reading until the list grows by a full step or the calendars end, and
 * reports it as loading: "no results" only ever appears after every calendar in scope was read.
 */
export function useSearchPagination(
  pagination: PaginationState & { results: readonly unknown[] },
  /** The active search; a new one starts again from the first step. */
  search: string,
): PaginationState {
  const { results, status, loadMore } = pagination;
  const [request, setRequest] = useState({ search, wanted: visibleStep });
  const wanted = request.search === search ? request.wanted : visibleStep;
  const scanning = Boolean(search) && status === 'CanLoadMore' && results.length < wanted;
  useEffect(() => {
    if (scanning) loadMore(scannedPerPage);
  }, [loadMore, scanning, results.length]);
  if (!search) return { status, loadMore };
  return {
    status: scanning ? 'LoadingMore' : status,
    loadMore: () => setRequest({ search, wanted: results.length + visibleStep }),
  };
}
