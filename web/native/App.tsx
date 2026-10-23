import { useCallback, useState } from 'react';
import { useConvexAuth, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { LogOut } from 'lucide-react';
import { Workspace } from '../portal/App.tsx';
import AuthPanel from '../portal/AuthPanel.tsx';
import { functions, nativeError } from './client.ts';
import type { Bootstrap, PortalMessage, Status } from './types.ts';
import BackendStatus from './BackendStatus.tsx';

export default function NativeApp() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const status: Status | undefined = useQuery(functions.nativeAuth.status, {});
  const info: Bootstrap | undefined = useQuery(
    functions.native.bootstrap,
    isAuthenticated ? { includeCalendars: false } : 'skip',
  );
  const [message, setMessage] = useState<PortalMessage | null>(null);
  const [pending, setPending] = useState(false);
  const notify = useCallback((text: string, error = false) => setMessage({ text, error }), []);
  const loading = isLoading || status === undefined || (isAuthenticated && info === undefined);

  async function logout() {
    setPending(true);
    try {
      await signOut();
      notify('Sessão encerrada.');
    } catch (error) {
      notify(nativeError(error).message, true);
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
        <span className="badge" id="account" data-profile={info?.user.role}>
          {info ? `${info.user.name} · ${info.user.role}` : 'Portal PROENS'}
        </span>
        {isAuthenticated ? (
          <button
            type="button"
            id="logout"
            className="secondary"
            disabled={pending}
            onClick={() => {
              void logout();
            }}
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
        <BackendStatus loading={loading} allowReload={!isLoading} />
        {loading ? null : isAuthenticated && info ? (
          <Workspace key={info.user.id} info={info} status={status} notify={notify} />
        ) : (
          <AuthPanel status={status} notify={notify} />
        )}
      </main>
    </>
  );
}
