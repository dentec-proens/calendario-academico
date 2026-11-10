import { roleLabels } from '../../shared/role-labels.ts';
import UpdateProvider from '../updates/UpdateProvider.tsx';
import { LoadingIndicator } from '../../components/ui/LoadingIndicator.tsx';
import { Suspense, useCallback, useEffect, useRef } from 'react';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { LogOut } from 'lucide-react';
import { Button } from '../../components/ui/Button.tsx';
import BackendStatus from '../BackendStatus.tsx';
import { AccountMenu } from '../AccountMenu.tsx';
import { sessionIdentity, useSessionState } from '../session.tsx';
import { clearPrivateLinkWhenLeaving } from '../private-links.ts';
import { FormDraftProvider } from '../../shared/forms/drafts.tsx';
import { DevelopmentTools } from '../devtools.tsx';
import { parseEditorPath } from '#src/app/routes.ts';
import { Notice } from '../../components/ui/Notice.tsx';
import { useArrivalFocus } from '../arrival-focus.ts';
import { FeedbackProvider, SuggestionsButton } from '../../features/feedback/FeedbackProvider.tsx';
import ifprLogo from '../../assets/ifpr-logo-horizontal.png';

export default function RootLayout() {
  const session = useSessionState();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const accessDenied = useRouterState({
    select: (state) => state.location.search.aviso === 'acesso-negado',
  });
  const editorPath = parseEditorPath(pathname);
  const identity = session.info ? sessionIdentity(session.info.user) : 'public';
  const user = session.info?.user;
  const accountScope =
    user?.role === 'CAMPUS'
      ? session.info?.campuses.find((campus) => campus.id === user.campusId)?.name
      : user
        ? roleLabels[user.role]
        : undefined;
  const checkingSession = session.isLoading || session.editorRecovery?.checkingIdentity;
  // A tab opened while the bootstrap is unavailable has no portal to show until maintenance ends.
  const paused = session.maintenance && session.isAuthenticated && !session.info;
  const main = useRef<HTMLElement>(null);
  const { setArrivalPending } = session;
  useEffect(() => clearPrivateLinkWhenLeaving(pathname), [pathname]);
  useArrivalFocus(
    main,
    session.arrivalPending,
    useCallback(() => setArrivalPending(false), [setArrivalPending]),
  );
  return (
    <FormDraftProvider key={identity} identity={identity}>
      <UpdateProvider>
        <FeedbackProvider>
          <header>
            <Link to="/" className="brand" aria-label="Calendários Acadêmicos — página inicial">
              <img src={ifprLogo} width={235} height={54} alt="Instituto Federal do Paraná" />
              <span className="brand-copy">
                <strong>Calendários Acadêmicos</strong>
                <span>PROENS</span>
              </span>
            </Link>
            {checkingSession ? (
              <span className="account-menu account-menu--pending" id="account">
                <span className="account-menu__scope">Verificando sessão…</span>
              </span>
            ) : user ? (
              <div className="header-actions">
                <SuggestionsButton />
                <AccountMenu
                  name={user.name}
                  email={user.email}
                  scope={accountScope}
                  role={user.role}
                  loggingOut={session.loggingOut}
                  onLogout={() => {
                    void session.logout();
                  }}
                />
              </div>
            ) : session.isAuthenticated ? (
              // Without the bootstrap (maintenance) there is no identity to show, only the way out.
              <Button
                type="button"
                id="logout"
                variant="secondary"
                className="header-logout"
                disabled={session.loggingOut}
                onClick={() => {
                  void session.logout();
                }}
              >
                <LogOut aria-hidden="true" size={18} /> Sair
              </Button>
            ) : null}
          </header>
          <main id="app-main" ref={main}>
            {!editorPath && (
              <div id="message" role="status" aria-live="polite">
                {session.message?.text ? (
                  <Notice
                    tone={session.message.error ? 'danger' : 'success'}
                    elevated
                    onDismiss={session.dismissMessage}
                  >
                    {session.message.text}
                  </Notice>
                ) : null}
              </div>
            )}
            <BackendStatus
              loading={session.isLoading}
              allowReload={pathname !== '/ativar-conta' && pathname !== '/recuperar-senha'}
            />
            {accessDenied ? (
              <Notice tone="danger" announce="assertive">
                Seu perfil não permite acessar a área solicitada.
              </Notice>
            ) : null}
            {session.maintenance && (!editorPath || paused) ? (
              <Notice tone="warning" announce="assertive">
                O portal está em manutenção. Mantenha esta página aberta; novas alterações estarão
                disponíveis após a conclusão.
              </Notice>
            ) : null}
            <fieldset
              className="app-operation-scope"
              disabled={session.maintenance && session.isAuthenticated && !session.editorRecovery}
            >
              {session.isLoading || paused ? null : (
                <Suspense
                  fallback={<LoadingIndicator layout="overlay" label="Carregando página…" />}
                >
                  <Outlet />
                </Suspense>
              )}
            </fieldset>
          </main>
        </FeedbackProvider>
        <DevelopmentTools />
      </UpdateProvider>
    </FormDraftProvider>
  );
}
