import { useEffect, useState } from 'react';
import { createRouter, createBrowserHistory, RouterProvider } from '@tanstack/react-router';
import type { RouterHistory } from '@tanstack/react-router';
import { ApplicationError } from './errors.tsx';
import { routeTree } from './routes.tsx';
import { useSessionState, type SessionState } from './session.tsx';
import { pageDocument } from '../../src/app-routes.ts';
import { parseApplicationSearch, stringifyApplicationSearch } from './search.ts';

export function createApplicationRouter(
  session: SessionState,
  history: RouterHistory = createBrowserHistory(),
) {
  const initial = new URL(history.location.href, 'https://application.invalid');
  if (
    initial.pathname !== '/' &&
    initial.pathname.endsWith('/') &&
    pageDocument(initial.pathname)
  ) {
    history.replace(initial.pathname.replace(/\/+$/, '') + initial.search + initial.hash);
  }
  return createRouter({
    routeTree,
    defaultErrorComponent: ApplicationError,
    parseSearch: parseApplicationSearch,
    stringifySearch: stringifyApplicationSearch,
    history,
    context: { session },
    defaultPreload: 'intent',
    scrollRestoration: true,
    defaultPendingMinMs: 0,
    trailingSlash: 'never',
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createApplicationRouter>;
  }
}

export function ApplicationRouter() {
  const session = useSessionState();
  const [router] = useState(() => createApplicationRouter(session));
  useEffect(() => {
    void router.invalidate();
  }, [
    router,
    session.info,
    session.status,
    session.isLoading,
    session.isAuthenticated,
    session.editorRecovery?.calendarId,
  ]);
  return <RouterProvider router={router} context={{ session }} />;
}
