import { LoadingIndicator } from '../../components/ui/LoadingIndicator.tsx';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { convex, functions } from '../../shared/convex/client.ts';
import { nativeError } from '../../shared/convex/errors.ts';
import { Button } from '../../components/ui/Button.tsx';
import { Tabs } from '../../components/ui/Tabs.tsx';
import { useAppSession } from '../../app/session.tsx';
import AuditTable from './AuditTable.tsx';
import ClientErrors from './ClientErrors.tsx';
import FeedbackList from './FeedbackList.tsx';

type Logs = FunctionReturnType<typeof functions.workspace.logs>;
type AuditTab = 'operacoes' | 'feedback' | 'falhas';

const tabs = [
  { value: 'operacoes', label: 'Operações' },
  { value: 'feedback', label: 'Feedback' },
  { value: 'falhas', label: 'Falhas' },
] as const satisfies readonly { value: AuditTab; label: string }[];

/**
 * The administration reads three kinds of records here, each in its own tab: what people did, what
 * they said about the app, and the failures they met. Other profiles see only the operations.
 */
export default function AuditPage() {
  const { info } = useAppSession();
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  if (info.user.role !== 'ADMIN')
    return (
      <section className="panel audit-page" aria-label="Registros">
        <OperationsLog />
      </section>
    );
  const selected: AuditTab = search.aba ?? 'operacoes';
  return (
    <section className="panel audit-page" aria-label="Registros">
      <Tabs
        id="audit"
        label="Tipo de registro"
        tabs={tabs}
        selected={selected}
        onSelect={(next) =>
          void navigate({
            to: '/logs',
            search: { aba: next === 'operacoes' ? undefined : next },
            replace: true,
          })
        }
      >
        {selected === 'feedback' ? (
          <FeedbackList />
        ) : selected === 'falhas' ? (
          <ClientErrors />
        ) : (
          <OperationsLog />
        )}
      </Tabs>
    </section>
  );
}

function OperationsLog() {
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
    <>
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
      {entries.length > 0 && <AuditTable entries={entries} label="Operações" />}
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
    </>
  );
}
