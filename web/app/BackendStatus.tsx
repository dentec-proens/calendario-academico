import { LoadingIndicator } from '../components/ui/LoadingIndicator.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Notice } from '../components/ui/Notice.tsx';
import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { useConvexConnectionState } from 'convex/react';
import './backend-status.css';

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}
const isOnline = () => navigator.onLine;
const serverOnline = () => true;

function useLongWait(waiting: boolean) {
  const [wait, setWait] = useState({ waiting, elapsed: false });
  if (wait.waiting !== waiting) setWait({ waiting, elapsed: false });
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(() => setWait({ waiting: true, elapsed: true }), 10_000);
    return () => window.clearTimeout(timer);
  }, [waiting]);
  return waiting && wait.waiting && wait.elapsed;
}

interface BackendStatusProps {
  loading: boolean;
  loadingLabel?: string;
  allowReload?: boolean;
}

export default function BackendStatus({
  loading,
  loadingLabel = 'Carregando portal…',
  allowReload = false,
}: BackendStatusProps) {
  const { isWebSocketConnected, hasEverConnected } = useConvexConnectionState();
  const online = useSyncExternalStore(subscribeOnline, isOnline, serverOnline);
  const delayed = useLongWait(loading || !isWebSocketConnected);
  const titleId = useId();
  const [hasLoaded, setHasLoaded] = useState(!loading);
  if (!loading && !hasLoaded) setHasLoaded(true);

  if (online && !delayed)
    return loading ? (
      <div className="backend-loading">
        <LoadingIndicator label={loadingLabel} />
      </div>
    ) : null;

  const title = !online
    ? 'Sem conexão com a internet'
    : isWebSocketConnected
      ? 'O portal está demorando para responder'
      : hasEverConnected
        ? 'Conexão com o portal interrompida'
        : 'Portal temporariamente indisponível';

  return (
    <Notice
      as="section"
      className="backend-status"
      tone="warning"
      announce="assertive"
      aria-labelledby={titleId}
      title={title}
      titleAs="h2"
      titleProps={{ id: titleId }}
      actions={
        allowReload && online && loading && !hasLoaded ? (
          <Button type="button" onClick={() => window.location.reload()}>
            Tentar novamente
          </Button>
        ) : null
      }
    >
      <p>
        {!online
          ? 'Verifique sua conexão para acessar os dados do portal.'
          : isWebSocketConnected
            ? 'Ainda não foi possível carregar os dados. O serviço pode estar em manutenção ou respondendo lentamente.'
            : 'Não conseguimos acessar os dados do portal. O serviço pode estar em manutenção ou indisponível no momento.'}
      </p>
      <p>A conexão será restabelecida automaticamente assim que o serviço estiver disponível.</p>
      {hasLoaded ? (
        <p>
          Se você estava editando, mantenha esta página aberta: alterações recentes podem ainda não
          ter sido salvas.
        </p>
      ) : null}
    </Notice>
  );
}
