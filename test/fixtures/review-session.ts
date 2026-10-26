import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexProviderWithAuth, type ConvexReactClient } from 'convex/react';
import { convex, useFixtureAuth } from './review-session-client.ts';
import { AppSessionProvider } from '../../web/app/session.tsx';
import { ApplicationRouter } from '../../web/app/router.tsx';
import ConfirmationDialogHost from '../../web/components/ConfirmationDialog.tsx';
import '../../web/style.css';
import '../../web/portal.css';
import '../../web/portal/react-portal.css';

if (location.pathname === '/__review-session') history.replaceState(null, '', '/revisoes');
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
