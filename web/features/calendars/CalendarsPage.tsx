import { useNavigate } from '@tanstack/react-router';
import { usePaginatedQuery } from 'convex/react';
import { useAppSession } from '../../app/session.tsx';
import { functions } from '../../shared/convex/client.ts';
import { useSelectedCampus } from '../calendar-list/selected-campus.ts';
import CalendarsPanel from './CalendarsPanel.tsx';

export default function CalendarsPage() {
  const { info, notify, permissions } = useAppSession();
  const campus = useSelectedCampus();
  const navigate = useNavigate();
  const pagination = usePaginatedQuery(
    functions.calendars.calendarPage,
    { deleted: false, ...(campus ? { campusId: campus.id } : {}) },
    { initialNumItems: 50 },
  );
  return (
    <CalendarsPanel
      info={info}
      calendars={pagination.results}
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
