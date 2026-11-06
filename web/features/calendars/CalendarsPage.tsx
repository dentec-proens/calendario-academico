import { useNavigate } from '@tanstack/react-router';
import { usePaginatedQuery } from 'convex/react';
import { useFeatureRoute } from '../../app/navigation.ts';
import { useAppSession } from '../../app/session.tsx';
import { functions } from '../../shared/convex/client.ts';
import { useUrlSearchText } from '../../shared/forms/useUrlSearchText.ts';
import { useSelectedCampus } from '../calendar-list/selected-campus.ts';
import CalendarsPanel from './CalendarsPanel.tsx';
import { useSearchPagination } from './useSearchPagination.ts';

export default function CalendarsPage() {
  const { info, notify, permissions } = useAppSession();
  const campus = useSelectedCampus();
  const route = useFeatureRoute();
  const navigate = useNavigate();
  const searchText = useUrlSearchText();
  const search = route.busca.trim();
  const situation = route.situacao || undefined;
  const pagination = usePaginatedQuery(
    functions.calendars.calendarPage,
    {
      deleted: false,
      ...(campus ? { campusId: campus.id } : {}),
      ...(situation ? { status: situation } : {}),
      ...(search ? { search } : {}),
    },
    { initialNumItems: 50 },
  );
  const listPagination = useSearchPagination(pagination, search);
  return (
    <CalendarsPanel
      info={info}
      calendars={pagination.results}
      notify={notify}
      canSelectCampus={permissions.selectCampus}
      canReview={permissions.reviewCalendars}
      filter={campus?.id || ''}
      onFilter={(id) => {
        void navigate({
          to: '/calendarios',
          search: (previous) => ({ ...previous, campus: id || undefined }),
          replace: true,
        });
      }}
      situation={route.situacao}
      onSituation={(value) => {
        void navigate({
          to: '/calendarios',
          search: (previous) => ({ ...previous, situacao: value || undefined }),
          replace: true,
        });
      }}
      searchText={searchText.text}
      activeSearch={search}
      onSearchText={searchText.setText}
      onClearFilters={() => {
        searchText.reset();
        void navigate({
          to: '/calendarios',
          search: (previous) => ({
            ...previous,
            campus: undefined,
            situacao: undefined,
            busca: undefined,
          }),
          replace: true,
        });
      }}
      pagination={listPagination}
    />
  );
}
