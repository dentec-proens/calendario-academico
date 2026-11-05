import { LoadingIndicator } from '../../components/ui/LoadingIndicator.tsx';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { convex, functions } from '../../shared/convex/client.ts';
import { nativeError } from '../../shared/convex/errors.ts';
import { Button } from '../../components/ui/Button.tsx';
import { useAppSession } from '../../app/session.tsx';
import AuditTable from './AuditTable.tsx';
import ClientErrors from './ClientErrors.tsx';

type Logs = FunctionReturnType<typeof functions.workspace.logs>;
export default function AuditPage() {
  const { info } = useAppSession();
  const first = useQuery(functions.workspace.logs, {
    paginationOpts: { cursor: null, numItems: 50 },
  });
  const [older, setOlder] = useState<Logs[]>([]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const active = useRef(true);
  const loading = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const last = older.at(-1) || first;
  const entries = [...(first?.entries || []), ...older.flatMap((page) => page.entries)];
  async function loadMore() {
    if (loading.current || !last || last.isDone) return;
    loading.current = true;
    setMessage('');
    setPending(true);
    try {
      const page = await convex.query(functions.workspace.logs, {
        paginationOpts: { cursor: last.continueCursor, numItems: 50 },
      });
      if (active.current) setOlder((pages) => [...pages, page]);
    } catch (cause) {
      if (active.current) setMessage(nativeError(cause).message);
    } finally {
      loading.current = false;
      if (active.current) setPending(false);
    }
  }
  return (
    <section className="panel audit-page" aria-label="Registro de operações">
      <div className="audit-heading">
        <p className="help">Da mais recente à mais antiga · Horário de Brasília.</p>
        {older.length > 0 && (
          // The first page stays live; this only drops the older pages loaded on request.
          <Button
            type="button"
            variant="secondary"
            className="page-action"
            id="refresh-logs"
            disabled={pending}
            onClick={() => {
              setOlder([]);
              setMessage('');
            }}
          >
            Voltar às mais recentes
          </Button>
        )}
      </div>
      {!first ? <LoadingIndicator label="Carregando operações…" /> : null}
      <p id="log-message" role="status" aria-live="polite">
        {message ||
          (first && !entries.length ? 'Nenhuma operação registrada para este acesso.' : '')}
      </p>
      {entries.length > 0 && <AuditTable entries={entries} label="Registro de operações" />}
      {last && !last.isDone ? (
        <Button
          type="button"
          id="more-logs"
          pending={pending}
          loadingLabel="Carregando registros anteriores…"
          onClick={() => void loadMore()}
        >
          Carregar anteriores
        </Button>
      ) : null}
      {info.user.role === 'ADMIN' && <ClientErrors />}
    </section>
  );
}
