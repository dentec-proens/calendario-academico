import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useConvexAuth } from 'convex/react';
import NativeProvider from './Provider.tsx';
import NativeErrorBoundary from './ErrorBoundary.tsx';
import { nativeError } from './client.ts';

type LoadPage = () => Promise<unknown>;

function Page({ load, requiresLogin }: { load: LoadPage; requiresLogin: boolean }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  useEffect(() => {
    if (isLoading) return;
    if (requiresLogin && !isAuthenticated) {
      window.location.replace('/');
      return;
    }
    const main = document.querySelector<HTMLElement>('body > main');
    if (main) main.hidden = false;
    load().catch((error: unknown) => {
      const message = document.getElementById('message') || document.getElementById('log-message');
      if (message) message.textContent = nativeError(error).message;
    });
  }, [isLoading, isAuthenticated, load, requiresLogin]);
  return isLoading ? <p role="status">Carregando…</p> : null;
}

export function mountNativePage(load: LoadPage, requiresLogin = true) {
  const main = document.querySelector<HTMLElement>('body > main');
  if (main) main.hidden = true;
  const host = document.createElement('div');
  host.id = 'native-auth';
  document.body.prepend(host);
  createRoot(host).render(
    <NativeProvider>
      <NativeErrorBoundary>
        <Page load={load} requiresLogin={requiresLogin} />
      </NativeErrorBoundary>
    </NativeProvider>,
  );
}
