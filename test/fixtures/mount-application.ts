import { createElement, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexProvider, type ConvexReactClient } from 'convex/react';
import { ApplicationRouter } from '../../web/app/router.tsx';
import { AppSessionContext, type SessionState } from '../../web/app/session.tsx';
import { capturePrivateLinkToken } from '../../web/app/private-links.ts';
import { configureFormInstrumentation } from '../../web/app/form-instrumentation.ts';
import ConfirmationDialogHost from '../../web/components/ConfirmationDialog.tsx';
import type { Bootstrap, Status } from '../../web/shared/convex/types.ts';
import '../../web/style.css';
import '../../web/portal.css';
import '../../web/portal/react-portal.css';

export function mountApplication({
  client,
  info,
  status,
  isAuthenticated = true,
}: {
  client: object;
  info?: Bootstrap;
  status: Status;
  isAuthenticated?: boolean;
}) {
  capturePrivateLinkToken(window.location, window.history);
  configureFormInstrumentation(true);
  let bootstrap = info;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  function SyntheticApplication() {
    const [message, setMessage] = useState<SessionState['message']>(null);
    const currentInfo = useSyncExternalStore(subscribe, () => bootstrap);
    const session: SessionState = {
      info: currentInfo,
      status,
      isLoading: false,
      isAuthenticated,
      loggingOut: false,
      message,
      notify: (text, error = false) => setMessage({ text, error }),
      logout: () => Promise.resolve(),
      maintenance: false,
    };
    return createElement(
      ConvexProvider,
      { client: client as unknown as ConvexReactClient },
      createElement(
        AppSessionContext.Provider,
        { value: session },
        createElement(ApplicationRouter),
        createElement(ConfirmationDialogHost),
      ),
    );
  }
  createRoot(document.getElementById('root')!).render(createElement(SyntheticApplication));
  return {
    updateInfo(value: Bootstrap) {
      bootstrap = value;
      listeners.forEach((listener) => listener());
    },
  };
}
