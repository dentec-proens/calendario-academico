import type { FunctionReturnType } from 'convex/server';
import type { functions } from '../../shared/convex/client.ts';
import './audit.css';

const formatDate = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'America/Sao_Paulo',
});

export type AuditEntry = FunctionReturnType<typeof functions.workspace.logs>['entries'][number];

/** Operations table shared by the workspace log and a calendar's own history. */
export default function AuditTable({
  entries,
  label,
  id = 'log-list',
  showCalendar = true,
  showVersion = true,
}: {
  entries: AuditEntry[];
  label: string;
  id?: string;
  /** A single calendar's history omits the column, which would repeat on every row. */
  showCalendar?: boolean;
  /** A failure belongs to no calendar version. */
  showVersion?: boolean;
}) {
  const columns = [
    { key: 'at', label: 'Data e hora' },
    { key: 'action', label: 'Operação' },
    ...(showCalendar ? [{ key: 'calendar', label: 'Calendário' }] : []),
    { key: 'actor', label: 'Responsável' },
    ...(showVersion ? [{ key: 'version', label: 'Versão' }] : []),
  ];
  return (
    <table
      id={id}
      className={`audit-table ${showCalendar ? '' : 'audit-table-single'}`}
      role="table"
      aria-label={label}
    >
      <thead role="rowgroup">
        <tr role="row">
          {columns.map(({ key, label }) => (
            <th scope="col" role="columnheader" className={`audit-col-${key}`} key={key}>
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
            {showCalendar && (
              <td role="cell">
                <span className="audit-cell-label" aria-hidden="true">
                  Calendário
                </span>
                <span>{entry.calendar ?? '—'}</span>
              </td>
            )}
            <td role="cell">
              <span className="audit-cell-label" aria-hidden="true">
                Responsável
              </span>
              <span>{entry.actor}</span>
            </td>
            {showVersion && (
              <td role="cell">
                <span className="audit-cell-label" aria-hidden="true">
                  Versão
                </span>
                <span>{entry.version ?? '—'}</span>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
