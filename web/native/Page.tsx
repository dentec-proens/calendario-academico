import { ApplicationRouter, getAppRouter, navigateApp } from '../routing.tsx';
import { pageDocument } from '../../src/app-routes.ts';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useConvexAuth } from 'convex/react';
import NativeProvider from './Provider.tsx';
import NativeErrorBoundary from './ErrorBoundary.tsx';
import { nativeError } from './client.ts';
import BackendStatus from './BackendStatus.tsx';

type LoadPage = () => Promise<unknown>;

function Page({ load, requiresLogin }: { load: LoadPage; requiresLogin: boolean }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const [loadingPage, setLoadingPage] = useState(true);
  useEffect(() => {
    if (isLoading) return;
    if (requiresLogin && !isAuthenticated) {
      const target = new URL(getAppRouter().latestLocation.href, window.location.origin);
      const retorno = target.pathname + target.search;
      void navigateApp('/?retorno=' + encodeURIComponent(retorno), {
        replace: true,
        reloadDocument: true,
      });
      return;
    }
    const main = document.querySelector<HTMLElement>('body > main');
    if (main) main.hidden = false;
    let active = true;
    void load()
      .catch((error: unknown) => {
        if (!active) return;
        const message =
          document.getElementById('message') || document.getElementById('log-message');
        if (message) message.textContent = nativeError(error).message;
      })
      .finally(() => {
        if (active) setLoadingPage(false);
      });
    return () => {
      active = false;
    };
  }, [isLoading, isAuthenticated, load, requiresLogin]);
  return <BackendStatus loading={isLoading || loadingPage} loadingLabel="Carregando…" />;
}

export function mountNativePage(
  load: LoadPage,
  requiresLogin = true,
  documentName = pageDocument(window.location.pathname),
) {
  const main = document.querySelector<HTMLElement>('body > main');
  if (main) main.hidden = true;
  const host = document.createElement('div');
  host.id = 'native-auth';
  document.body.prepend(host);
  createRoot(host).render(
    <NativeProvider>
      <NativeErrorBoundary>
        {documentName ? (
          <ApplicationRouter document={documentName}>
            <Page load={load} requiresLogin={requiresLogin} />
          </ApplicationRouter>
        ) : (
          <Page load={load} requiresLogin={requiresLogin} />
        )}
      </NativeErrorBoundary>
    </NativeProvider>,
  );
}
