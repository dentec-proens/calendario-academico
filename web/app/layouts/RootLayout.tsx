import { Suspense, useEffect } from 'react';
import { Outlet, useRouterState } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import BackendStatus from '../BackendStatus.tsx';
import { sessionIdentity, useSessionState } from '../session.tsx';
import { clearPrivateLinkWhenLeaving } from '../private-links.ts';
import { FormDraftProvider } from '../../shared/forms/drafts.tsx';
import { DevelopmentTools } from '../devtools.tsx';
import { parseEditorPath } from '../../../src/app-routes.ts';

export default function RootLayout() {
  const session = useSessionState();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const accessDenied = useRouterState({
    select: (state) => state.location.search.aviso === 'acesso-negado',
  });
  const identity = session.info ? sessionIdentity(session.info.user) : 'public';
  useEffect(() => clearPrivateLinkWhenLeaving(pathname), [pathname]);
  return (
    <FormDraftProvider key={identity} identity={identity}>
      <header>
        <div className="brand">P</div>
        <div>
          <strong>PROENS - Pró-Reitoria de Ensino</strong>
          <div className="muted">Assistente de Calendário PROENS</div>
        </div>
        <span
          className="badge"
          id="account"
          data-profile={session.isLoading ? undefined : session.info?.user.role}
        >
          {session.isLoading || session.editorRecovery?.checkingIdentity
            ? 'Verificando sessão…'
            : session.info
              ? `${session.info.user.name} · ${session.info.user.role}`
              : 'Portal PROENS'}
        </span>
        {session.isAuthenticated ? (
          <Button
            type="button"
            id="logout"
            variant="secondary"
            disabled={session.loggingOut}
            onClick={() => {
              void session.logout();
            }}
          >
            <LogOut aria-hidden="true" size={18} /> Sair
          </Button>
        ) : null}
      </header>
      <main id="app-main">
        {!parseEditorPath(pathname) && (
          <div
            id="message"
            className={session.message?.error ? 'error' : ''}
            role="status"
            aria-live="polite"
          >
            {session.message?.text}
          </div>
        )}
        <BackendStatus
          loading={session.isLoading}
          allowReload={pathname !== '/ativar-conta' && pathname !== '/recuperar-senha'}
        />
        {accessDenied ? (
          <p className="notice" role="alert">
            Seu perfil não permite acessar a área solicitada.
          </p>
        ) : null}
        {session.maintenance ? (
          <p className="notice" role="alert">
            O portal está em manutenção. Mantenha esta página aberta; novas alterações estarão
            disponíveis após a conclusão.
          </p>
        ) : null}
        <fieldset
          className="app-operation-scope"
          disabled={session.maintenance && session.isAuthenticated && !session.editorRecovery}
        >
          {session.isLoading ? null : (
            <Suspense fallback={<p role="status">Carregando página…</p>}>
              <Outlet />
            </Suspense>
          )}
        </fieldset>
      </main>
      <DevelopmentTools />
    </FormDraftProvider>
  );
}
