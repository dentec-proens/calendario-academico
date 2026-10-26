import type { PropsWithChildren } from 'react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { convex } from '../shared/convex/client.ts';
import ConfirmationDialogHost from '../components/ConfirmationDialog.tsx';
import ApplicationErrorBoundary from './ErrorBoundary.tsx';
import ApplicationPresence from './Presence.tsx';
import { AppSessionProvider } from './session.tsx';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <ConvexAuthProvider client={convex}>
      <ApplicationErrorBoundary>
        <AppSessionProvider>
          <ApplicationPresence />
          {children}
          <ConfirmationDialogHost />
        </AppSessionProvider>
      </ApplicationErrorBoundary>
    </ConvexAuthProvider>
  );
}
