import { useNavigate } from '@tanstack/react-router';
import { usePaginatedQuery } from 'convex/react';
import { useAppSession } from '../../app/session.tsx';
import { useFeatureRoute } from '../../app/navigation.ts';
import { functions } from '../../shared/convex/client.ts';
import CalendarsPanel from './CalendarsPanel.tsx';

export default function CalendarsPage() {
  const { info, notify, permissions } = useAppSession();
  const route = useFeatureRoute();
  const navigate = useNavigate();
  const campus = permissions.selectCampus
    ? info.campuses.find((item) => item.id === route.campus)
    : undefined;
  const pagination = usePaginatedQuery(
    functions.calendars.calendarPage,
    { deleted: false, ...(campus ? { campusId: campus.id } : {}) },
    { initialNumItems: 50 },
  );
  return (
    <CalendarsPanel
      info={{ ...info, calendars: pagination.results }}
      notify={notify}
      canSelectCampus={permissions.selectCampus}
      filter={campus?.id || ''}
      onFilter={(id) => {
        void navigate({ to: '/calendarios', search: { campus: id || undefined }, replace: true });
      }}
      pagination={pagination}
    />
  );
}
