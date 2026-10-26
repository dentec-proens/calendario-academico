import { useNavigate, useParams, useRouterState, useSearch } from '@tanstack/react-router';
import type { PortalPageId } from '../../src/app-routes.ts';

export function useAppLocation() {
  return useRouterState({ select: (state) => state.location });
}

export function useFeatureRoute() {
  const search = useSearch({ strict: false });
  const params = useParams({ strict: false });
  const creating = useRouterState({
    select: (state) => state.matches.some((match) => match.staticData.creating),
  });
  return {
    creating,
    eventId: params.eventId,
    calendarId: params.calendarId,
    campus: search.campus ?? '',
    ano: search.ano ?? '',
    situacao: search.situacao ?? '',
    busca: search.busca ?? '',
  };
}

export function useRouteForm(page: PortalPageId) {
  const { creating } = useFeatureRoute();
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  function setCreating(open: boolean) {
    switch (page) {
      case 'calendars':
        void navigate({ to: open ? '/calendarios/novo' : '/calendarios', search });
        break;
      case 'institution':
        void navigate({ to: open ? '/documentos/novo' : '/documentos', search });
        break;
      case 'institution-events':
        void navigate({
          to: open ? '/eventos-institucionais/novo' : '/eventos-institucionais',
          search,
        });
        break;
      case 'campuses':
        void navigate({ to: open ? '/campi/novo' : '/campi', search });
        break;
      case 'accounts':
        void navigate({ to: open ? '/contas/nova' : '/contas', search });
        break;
      default:
        break;
    }
  }
  return [creating, setCreating] as const;
}
