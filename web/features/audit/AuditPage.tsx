import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { convex, functions } from '../../shared/convex/client.ts';
import { nativeError } from '../../shared/convex/errors.ts';
import { Button } from '../../components/ui/Button.tsx';

type Logs = FunctionReturnType<typeof functions.workspace.logs>;
export default function AuditPage() {
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
    <section className="page">
      <Link to="/calendarios">← Voltar aos calendários</Link>
      <h1>Histórico de alterações</h1>
      <p>Exibe somente operações salvas.</p>
      <Button
        type="button"
        id="refresh-logs"
        disabled={pending}
        onClick={() => {
          setOlder([]);
          setMessage('Histórico atualizado.');
        }}
      >
        Atualizar histórico
      </Button>
      <p id="log-message" role="status" aria-live="polite">
        {message ||
          (!first
            ? 'Carregando histórico…'
            : entries.length
              ? 'Histórico atualizado.'
              : 'Nenhuma operação registrada para este acesso.')}
      </p>
      <ul id="log-list" className="records">
        {entries.map((entry, index) => (
          <li key={`${entry.at}:${entry.action}:${index}`}>
            <div>
              <strong>
                {entry.action}
                {entry.calendar ? ' — ' + entry.calendar : ''}
              </strong>
              <small>
                {new Date(entry.at).toLocaleString('pt-BR')} · {entry.actor}
                {entry.version ? ' · versão ' + entry.version : ''}
              </small>
            </div>
          </li>
        ))}
      </ul>
      {last && !last.isDone ? (
        <Button type="button" id="more-logs" disabled={pending} onClick={() => void loadMore()}>
          Carregar anteriores
        </Button>
      ) : null}
    </section>
  );
}
