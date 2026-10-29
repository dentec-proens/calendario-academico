import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexProviderWithAuth, type ConvexReactClient } from 'convex/react';
import { convex, useFixtureAuth } from './editor-session-client.ts';
import { AppSessionProvider } from '../../web/app/session.tsx';
import { ApplicationRouter } from '../../web/app/router.tsx';
import ConfirmationDialogHost from '../../web/components/ConfirmationDialog.tsx';
import { editorUrl } from '../../src/app/routes.ts';
import '../../web/style.css';
import '../../web/portal.css';
import '../../web/portal/react-portal.css';
import '../../assets/printing/calendar.css';

if (location.pathname === '/__editor-session')
  history.replaceState(null, '', editorUrl('synthetic-calendar'));
createRoot(document.getElementById('root')!).render(
  createElement(
    ConvexProviderWithAuth,
    { client: convex as unknown as ConvexReactClient, useAuth: useFixtureAuth },
    createElement(
      AppSessionProvider,
      null,
      createElement(ApplicationRouter),
      createElement(ConfirmationDialogHost),
    ),
  ),
);
