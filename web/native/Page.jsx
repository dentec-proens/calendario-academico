import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useConvexAuth } from 'convex/react';
import NativeProvider from './Provider.jsx';

function Page({ load, requiresLogin }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  useEffect(() => {
    if (isLoading) return;
    if (requiresLogin && !isAuthenticated) {
      window.location.replace('/');
      return;
    }
    const main = document.querySelector('body > main');
    if (main) main.hidden = false;
    load().catch((error) => {
      const message = document.getElementById('message') || document.getElementById('log-message');
      if (message) message.textContent = error.message;
    });
  }, [isLoading, isAuthenticated, load, requiresLogin]);
  return isLoading ? <p role="status">Conectando ao Convex…</p> : null;
}

export function mountNativePage(load, requiresLogin = true) {
  const main = document.querySelector('body > main');
  if (main) main.hidden = true;
  const host = document.createElement('div');
  host.id = 'native-auth';
  document.body.prepend(host);
  createRoot(host).render(
    <NativeProvider>
      <Page load={load} requiresLogin={requiresLogin} />
    </NativeProvider>,
  );
}
