import { useCallback, useState } from 'react';
import { useConvexAuth, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { LogOut } from 'lucide-react';
import { Workspace } from '../portal/App.jsx';
import AuthPanel from '../portal/AuthPanel.jsx';
import { functions, nativeApi } from './client.js';

export default function NativeApp() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const status = useQuery(functions.nativeAuth.status, {});
  const info = useQuery(
    functions.native.read,
    isAuthenticated ? { path: '/api/bootstrap' } : 'skip',
  );
  const documentsData = useQuery(
    functions.native.read,
    isAuthenticated ? { path: '/api/documents' } : 'skip',
  );
  const trashData = useQuery(
    functions.native.read,
    isAuthenticated ? { path: '/api/calendar-trash' } : 'skip',
  );
  const [message, setMessage] = useState(null);
  const [pending, setPending] = useState(false);
  const notify = useCallback((text, error = false) => setMessage({ text, error }), []);
  // A query read is useful to callers awaiting a completed mutation. The rendered
  // lists themselves come exclusively from the subscriptions above.
  const refresh = useCallback(() => nativeApi('/api/bootstrap'), []);

  async function logout() {
    setPending(true);
    try {
      await signOut();
      notify('Sessão encerrada.');
    } catch (error) {
      notify(error.message, true);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <header>
        <div className="brand">P</div>
        <div>
          <strong>PROENS - Pró-Reitoria de Ensino</strong>
          <div className="muted">Assistente de Calendário PROENS</div>
        </div>
        <span className="badge" id="account">
          {info ? `${info.user.name} · ${info.user.role}` : 'Convex · experimento'}
        </span>
        {isAuthenticated ? (
          <button
            type="button"
            id="logout"
            className="secondary"
            disabled={pending}
            onClick={logout}
          >
            <LogOut aria-hidden="true" size={18} /> Sair
          </button>
        ) : null}
      </header>
      <main>
        <div
          id="message"
          className={message?.error ? 'error' : ''}
          role="status"
          aria-live="polite"
        >
          {message?.text}
        </div>
        {isLoading || status === undefined || (isAuthenticated && info === undefined) ? (
          <p role="status">Carregando portal…</p>
        ) : isAuthenticated && info ? (
          <Workspace
            key={info.user.id}
            info={info}
            status={status}
            onRefresh={refresh}
            notify={notify}
            documentsData={documentsData}
            trashData={trashData}
          />
        ) : (
          <AuthPanel status={status} onLogin={async () => {}} notify={notify} />
        )}
      </main>
    </>
  );
}
