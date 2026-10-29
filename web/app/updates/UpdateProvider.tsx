import { flushSync } from 'react-dom';
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type PropsWithChildren,
} from 'react';
import { Link, useRouter, useRouterState } from '@tanstack/react-router';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import { useFormDrafts } from '../../shared/forms/drafts.tsx';
import { readPrivateLinkToken } from '../private-links.ts';
import { sessionIdentity, useSessionState } from '../session.tsx';
import {
  getConfirmation,
  hasPendingConfirmation,
  subscribeConfirmation,
} from '../../components/confirmation.ts';
import { Notice } from '../../components/ui/Notice.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { documentTransition } from './transition.ts';
import { portalPageForPath } from '#src/app/routes.ts';
import { createVersionDetector, recentDifference } from './detector.ts';
import { createAttemptPolicy } from './attempts.ts';
import { trackScrollInset } from '../../scroll.ts';
import type { WorkRisk } from './work.ts';
import './updates.css';

const ownBuild = typeof __PORTAL_BUILD_ID__ === 'string' ? __PORTAL_BUILD_ID__ : '';
const attemptPolicy = createAttemptPolicy(ownBuild, () => sessionStorage);
const UpdateContext = createContext<((event: MouseEvent<HTMLAnchorElement>) => void) | null>(null);

// The most pressing risk names what the person must finish before the update can run.
const blockedReasons: [WorkRisk['kind'][], string][] = [
  [['form', 'editor'], 'Conclua os preenchimentos pendentes para atualizar.'],
  [['operation'], 'Aguarde a operação em andamento terminar para atualizar.'],
  [['interaction'], 'Feche a janela aberta para atualizar.'],
  [['access'], 'Conclua a entrada no portal para atualizar.'],
];
function blockedReason(risks: readonly WorkRisk[]) {
  return (
    blockedReasons.find(([kinds]) => risks.some((risk) => kinds.includes(risk.kind)))?.[1] ??
    'Conclua os preenchimentos e operações pendentes para atualizar.'
  );
}

export function useUpdateNavigation() {
  return useContext(UpdateContext);
}

export default function UpdateProvider({ children }: PropsWithChildren) {
  const drafts = useFormDrafts();
  if (!drafts) throw new Error('Update protection requires draft ownership');
  const work = drafts.protection;
  const session = useSessionState();
  const router = useRouter();
  const location = useRouterState({ select: (state) => state.location });
  const status = useRouterState({ select: (state) => state.status });
  const current = useRef({ session, location, status });
  useLayoutEffect(() => {
    current.current = { session, location, status };
    work.publish();
  }, [session, location, status, work]);
  const [detector] = useState(() => createVersionDetector(ownBuild));
  const detection = useSyncExternalStore(detector.subscribe, detector.getSnapshot);
  useSyncExternalStore(work.subscribe, work.getRevision);
  const transition = useSyncExternalStore(
    documentTransition.subscribe,
    documentTransition.getSnapshot,
  );
  const scope = useRef<HTMLDivElement>(null);
  const region = useRef<HTMLDivElement>(null);
  const request = useRef(0);
  const [message, setMessage] = useState(
    attemptPolicy.returnedToOrigin
      ? 'A atualização anterior voltou à versão de origem. Use Atualizar agora para uma nova tentativa manual; a atualização automática está suspensa nesta página.'
      : '',
  );
  const [checking, setChecking] = useState(false);
  const menuHandler = useRef<(event: MouseEvent<HTMLAnchorElement>) => void>(() => {});
  const [handleMenu] = useState(
    () => (event: MouseEvent<HTMLAnchorElement>) => menuHandler.current(event),
  );
  const risks = work.getSnapshot();
  const changed = Boolean(detection.observed && detection.observed.buildId !== detection.own);
  // Drafts record their pathname; on that page itself the link would lead nowhere.
  const pending = risks.find((risk) => risk.href && risk.href !== location.pathname)?.href;

  // The bar stays above the page while it scrolls; sticky content below it starts after it.
  useEffect(() => {
    if (region.current) return trackScrollInset(region.current);
  }, []);

  useLayoutEffect(() => {
    const unregister = work.register(() => {
      const { session: value, location, status } = current.current;
      if (hasPendingConfirmation()) return { kind: 'operation', loss: true };
      const privateStage =
        location.pathname === '/ativar-conta' || location.pathname === '/recuperar-senha';
      if (privateStage)
        return {
          kind: 'access',
          loss: Boolean(
            readPrivateLinkToken(location.pathname as '/ativar-conta' | '/recuperar-senha'),
          ),
        };
      if (
        value.isLoading ||
        value.loggingOut ||
        value.editorRecovery ||
        value.maintenance ||
        !value.isAuthenticated ||
        !value.info ||
        !value.status ||
        (value.status.user &&
          sessionIdentity(value.status.user) !== sessionIdentity(value.info.user))
      )
        return { kind: 'access', loss: false };
      if (
        getConfirmation() ||
        status !== 'idle' ||
        document.querySelector('dialog[open], [role="dialog"], [role="alertdialog"]')
      )
        return { kind: 'interaction', loss: false };
      return null;
    });
    const unsubscribeConfirmation = subscribeConfirmation(work.publish);
    work.setReady(true);
    work.publish();
    const unload = (event: BeforeUnloadEvent) => {
      if (!work.getSnapshot().some((risk) => risk.loss)) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', unload);
    return () => {
      unsubscribeConfirmation();
      work.setReady(false);
      unregister();
      window.removeEventListener('beforeunload', unload);
    };
  }, [work]);

  useEffect(() => {
    if (!ownBuild) return;
    const check = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void detector.check();
    };
    const show = (event: PageTransitionEvent) => {
      const active = documentTransition.getSnapshot();
      if (event.isTrusted && event.persisted && active) {
        documentTransition.finish(active.id);
        if (scope.current) scope.current.inert = false;
      }
      check();
    };
    check();
    const timer = setInterval(check, 120_000);
    window.addEventListener('online', check);
    window.addEventListener('pageshow', show);
    window.addEventListener('portal:chunk-error', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      detector.dispose();
      clearInterval(timer);
      window.removeEventListener('online', check);
      window.removeEventListener('pageshow', show);
      window.removeEventListener('portal:chunk-error', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [detector, work]);

  function start(href: string, automatic: boolean, onAuthorized = () => {}) {
    if (
      !ownBuild ||
      !navigator.onLine ||
      documentTransition.getSnapshot() ||
      work.locked ||
      work.getSnapshot().length ||
      !recentDifference(detector.getSnapshot())
    )
      return false;
    const target = detector.getSnapshot().observed!.buildId;
    if (!attemptPolicy.record(target, automatic)) return false;
    onAuthorized();
    // The store and its watchdog survive changes to the authenticated identity.
    let id: symbol | null = null;
    flushSync(() => {
      id = documentTransition.begin();
    });
    if (!id) return false;
    if (scope.current) scope.current.inert = true;
    if (href === window.location.href) window.location.reload();
    else window.location.assign(href);
    return true;
  }

  function menuClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const anchor = event.currentTarget;
    if (anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;
    const url = new URL(anchor.href);
    const location = router.state.location;
    if (url.origin !== window.location.origin || url.pathname === location.pathname || url.hash)
      return;
    const section = portalPageForPath(location.pathname);
    if (section && section === portalPageForPath(url.pathname)) return;
    // The actual rendered href must still equal the public router's resolved destination.
    const resolved = router.buildLocation({ to: url.pathname });
    if (
      url.pathname !== resolved.pathname ||
      url.search !== new URL(resolved.href, url.origin).search
    )
      return;
    request.current++;
    if (
      !start(url.href, true, () => event.preventDefault()) &&
      !recentDifference(detector.getSnapshot())
    )
      void detector.check();
  }

  useLayoutEffect(() => {
    menuHandler.current = menuClick;
  });

  async function manual() {
    if (work.locked || work.getSnapshot().length || checking) {
      setMessage(
        'Conclua ou descarte explicitamente os preenchimentos nos fluxos de origem antes de atualizar.',
      );
      return;
    }
    const id = ++request.current;
    const href = window.location.href;
    const revision = work.getRevision();
    setChecking(true);
    setMessage('');
    await detector.check(true);
    setChecking(false);
    if (
      id !== request.current ||
      href !== window.location.href ||
      revision !== work.getRevision()
    ) {
      setMessage(
        'A solicitação de atualização foi interrompida por uma alteração nesta aba. Confira o preenchimento e tente novamente.',
      );
      return;
    }
    if (work.getSnapshot().length) return;
    if (!recentDifference(detector.getSnapshot())) {
      setMessage(
        detector.getSnapshot().failure
          ? 'Não foi possível verificar a versão. Tente novamente.'
          : 'Este portal já está na versão pública.',
      );
      return;
    }
    if (!start(href, false))
      setMessage(
        'Não foi possível iniciar a atualização protegida. Verifique se o armazenamento da aba está disponível.',
      );
  }
  function cancel(id: symbol) {
    if (documentTransition.getSnapshot()?.id !== id) return;
    window.stop();
    documentTransition.finish(id);
    request.current++;
    if (scope.current) scope.current.inert = false;
    setMessage('Atualização cancelada. Verifique a versão novamente antes de tentar.');
    detector.invalidate();
  }
  return (
    <UpdateContext.Provider value={handleMenu}>
      <div role="status" aria-live="polite" className="portal-update-region" ref={region}>
        {transition ? (
          <Notice
            className="portal-update"
            tone="info"
            icon={LoaderCircle}
            data-busy
            actions={
              transition.delayed && (
                <Button type="button" variant="secondary" onClick={() => cancel(transition.id)}>
                  Cancelar atualização
                </Button>
              )
            }
          >
            <p>
              <strong>Atualizando portal…</strong>
              {transition.delayed &&
                ' A atualização está demorando. Você pode cancelar para continuar nesta aba.'}
            </p>
          </Notice>
        ) : changed || message || detection.failure ? (
          <Notice
            className="portal-update"
            tone="info"
            icon={changed ? RefreshCw : undefined}
            actions={
              changed ? (
                // A blocked update offers the way back to the pending work, never a dead button.
                risks.length > 0 ? (
                  pending && <Link to={pending}>Voltar ao preenchimento pendente</Link>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={checking}
                    onClick={() => {
                      void manual();
                    }}
                  >
                    {checking ? 'Verificando versão…' : 'Atualizar agora'}
                  </Button>
                )
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={detection.checking}
                  onClick={() => {
                    void detector.check(true).then(() => {
                      const value = detector.getSnapshot();
                      setMessage(
                        value.observed?.buildId === value.own && !value.failure
                          ? 'Este portal já está na versão pública.'
                          : '',
                      );
                    });
                  }}
                >
                  Verificar versão
                </Button>
              )
            }
          >
            {changed && (
              <p>
                <strong>Uma nova versão do portal está disponível.</strong>
                {risks.length > 0 && ` ${blockedReason(risks)}`}
              </p>
            )}
            {detection.failure && (
              <p>Não foi possível verificar a versão pública nesta consulta.</p>
            )}
            {message && <p>{message}</p>}
          </Notice>
        ) : null}
      </div>
      <div
        ref={scope}
        inert={Boolean(transition)}
        className="portal-update-scope"
        onInputCapture={() => {
          request.current++;
        }}
        onClickCapture={(event) => {
          if (work.locked) {
            event.preventDefault();
            event.stopPropagation();
          } else request.current++;
        }}
        onSubmitCapture={(event) => {
          if (work.locked) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        {children}
      </div>
    </UpdateContext.Provider>
  );
}
