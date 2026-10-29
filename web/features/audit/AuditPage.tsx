import { useEffect, useRef, useState } from 'react';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { convex, functions } from '../../shared/convex/client.ts';
import { nativeError } from '../../shared/convex/errors.ts';
import { Button } from '../../components/ui/Button.tsx';
import './audit.css';

const formatDate = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'America/Sao_Paulo',
});

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
    <section className="panel audit-page" aria-label="Operações salvas">
      <div className="audit-heading">
        <div>
          <h2>Operações salvas</h2>
          <p className="help">Da mais recente à mais antiga · Horário de Brasília.</p>
        </div>
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
          Atualizar registros
        </Button>
      </div>
      <p id="log-message" role="status" aria-live="polite">
        {message ||
          (!first
            ? 'Carregando histórico…'
            : entries.length
              ? 'Histórico atualizado.'
              : 'Nenhuma operação registrada para este acesso.')}
      </p>
      {entries.length > 0 && (
        <table
          id="log-list"
          className="audit-table"
          role="table"
          aria-label="Registro de operações"
        >
          <thead role="rowgroup">
            <tr role="row">
              {['Data e hora', 'Operação', 'Calendário', 'Responsável', 'Versão'].map((label) => (
                <th scope="col" role="columnheader" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {entries.map((entry, index) => (
              <tr role="row" key={`${entry.at}:${entry.action}:${index}`}>
                <td role="cell">
                  <span className="audit-cell-label" aria-hidden="true">
                    Data e hora
                  </span>
                  <time dateTime={entry.at}>{formatDate.format(new Date(entry.at))}</time>
                </td>
                <td role="cell">
                  <span className="audit-cell-label" aria-hidden="true">
                    Operação
                  </span>
                  <strong>{entry.action}</strong>
                </td>
                <td role="cell">
                  <span className="audit-cell-label" aria-hidden="true">
                    Calendário
                  </span>
                  <span>{entry.calendar ?? '—'}</span>
                </td>
                <td role="cell">
                  <span className="audit-cell-label" aria-hidden="true">
                    Responsável
                  </span>
                  <span>{entry.actor}</span>
                </td>
                <td role="cell">
                  <span className="audit-cell-label" aria-hidden="true">
                    Versão
                  </span>
                  <span>{entry.version ?? '—'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {last && !last.isDone ? (
        <Button type="button" id="more-logs" disabled={pending} onClick={() => void loadMore()}>
          {pending ? 'Carregando…' : 'Carregar anteriores'}
        </Button>
      ) : null}
    </section>
  );
}
