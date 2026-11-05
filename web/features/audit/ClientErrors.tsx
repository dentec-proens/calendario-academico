import { useQuery } from 'convex/react';
import { functions } from '../../shared/convex/client.ts';
import AuditTable from './AuditTable.tsx';

const kinds = {
  save: 'Salvamento recusado',
  render: 'Falha ao exibir a página',
  rejection: 'Falha inesperada',
};

/** Only the latest: older failures are removed after 90 days and rarely matter to a diagnosis. */
export default function ClientErrors() {
  const failures = useQuery(functions.clientErrors.list, {
    paginationOpts: { cursor: null, numItems: 50 },
  });
  if (!failures?.entries.length) return null;
  return (
    <>
      <h2>Falhas registradas</h2>
      <p className="help">As 50 mais recentes vistas pelas pessoas no navegador.</p>
      <AuditTable
        id="client-errors"
        label="Falhas registradas"
        showVersion={false}
        entries={failures.entries.map((failure) => ({
          at: failure.at,
          action: `${kinds[failure.kind]}${failure.status ? ` (${failure.status})` : ''}: ${failure.message} · ${failure.route} · publicação ${failure.release.slice(0, 8)}`,
          actor: failure.actor,
          calendar: failure.calendar,
          version: null,
        }))}
      />
    </>
  );
}
