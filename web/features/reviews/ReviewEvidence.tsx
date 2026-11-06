import { compactRange } from '#src/domain/date-labels.ts';
import type { reviews } from '../../shared/convex/reviews.ts';
import { StatusBadge } from '../../components/ui/Feedback.tsx';

export type Criterion = Awaited<ReturnType<typeof reviews.get>>['criteria'][number];
type Evidence = Criterion['evidence'];
type CoverageRow = Extract<Evidence, { kind: 'coverage' }>['rows'][number];

/** Above this, the records collapse: name search can bring many without relation to the rule. */
const openRecords = 5;
/** Above this, the activities collapse behind a count of how their planning stands. */
const openActivities = 6;

const applicabilityLabels: Record<CoverageRow['applicability'], string> = {
  required: 'Obrigatório',
  optional: 'Opcional',
  unconfigured: 'Escopo a conferir',
};
const coverageLabels: Record<CoverageRow['coverage'], string> = {
  complete: 'Planejamento completo',
  partial: 'Planejamento parcial',
  pending: 'Planejamento pendente',
};
const executionLabels: Record<NonNullable<CoverageRow['execution']>, string> = {
  published: 'Publicação realizada',
  planned: 'Publicação programada',
  unclassified: 'Publicação a classificar',
};
const datesStateLabels = {
  'not-applied': 'Datas da norma de referência não aplicadas. Consulte a resolução do ano.',
  scope: 'Aplicabilidade a conferir: identifique o escopo e a norma própria, quando houver.',
  empty: 'Nenhum período cadastrado.',
} as const;

/**
 * One line per activity and shared situation. Offers in the same situation read together, and an
 * optional activity with nothing registered and nothing wrong has nothing to assess.
 */
function coverageLines(rows: readonly CoverageRow[]) {
  const lines = new Map<string, CoverageRow & { offers: string[] }>();
  for (const row of rows) {
    const messages = [...row.issues, ...row.warnings];
    if (row.applicability === 'optional' && row.coverage === 'pending' && !messages.length)
      continue;
    const key = JSON.stringify([
      row.activity,
      row.applicability,
      row.coverage,
      row.execution,
      messages,
    ]);
    const line = lines.get(key);
    if (line) line.offers.push(row.offer);
    else lines.set(key, { ...row, offers: [row.offer] });
  }
  return [...lines.values()];
}

function CoverageList({ rows }: { rows: readonly CoverageRow[] }) {
  const lines = coverageLines(rows);
  if (!lines.length)
    return (
      <p className="review-evidence__muted">Nenhuma data vinculada às atividades opcionais.</p>
    );
  const list = (
    <ul className="review-coverage">
      {lines.map((line) => (
        <li key={`${line.activity}:${line.offers.join()}`}>
          <span>{line.activity}</span>
          <small>
            {[
              line.offers.join(', '),
              applicabilityLabels[line.applicability],
              coverageLabels[line.coverage],
              line.execution ? executionLabels[line.execution] : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </small>
          {[...new Set([...line.issues, ...line.warnings])].map((message) => (
            <small key={message} className="review-evidence__issue">
              {message}
            </small>
          ))}
        </li>
      ))}
    </ul>
  );
  if (lines.length <= openActivities) return list;
  // One activity can span lines, one per situation; the count reads by activity.
  const byActivity = new Map<string, typeof lines>();
  for (const line of lines)
    byActivity.set(line.activity, [...(byActivity.get(line.activity) ?? []), line]);
  const activities = [...byActivity.values()];
  const count = (coverage: CoverageRow['coverage']) =>
    activities.filter((group) =>
      coverage === 'partial'
        ? new Set(group.map((line) => line.coverage)).size > 1 ||
          group.every((line) => line.coverage === 'partial')
        : group.every((line) => line.coverage === coverage),
    ).length;
  const problems = activities.filter((group) =>
    group.some((line) => line.issues.length + line.warnings.length > 0),
  ).length;
  return (
    <details className="review-item__coverage-all">
      <summary>
        Ver {activities.length} atividades: {count('complete')} completas, {count('partial')}{' '}
        parciais, {count('pending')} pendentes
        {problems ? `, ${problems} com aviso` : ''}
      </summary>
      {list}
    </details>
  );
}

function result({ minimum, met }: { minimum: number | null; met: boolean | null }) {
  if (minimum === null || met === null)
    return <span className="review-evidence__muted">Sem mínimo</span>;
  return (
    <span data-met={met}>
      {met ? 'Alcança' : 'Abaixo de'} {minimum}
    </span>
  );
}

function Evidence({ evidence, calendarYear }: { evidence: Evidence; calendarYear: number }) {
  switch (evidence.kind) {
    case 'counts':
      return (
        <>
          {evidence.provisional ? (
            <p className="review-evidence__issue">
              Contagem provisória: confirme a semana letiva no editor.
            </p>
          ) : null}
          {evidence.issue ? <p className="review-evidence__issue">{evidence.issue}</p> : null}
          <table className="review-evidence">
            <thead className="visually-hidden">
              <tr>
                <th scope="col">Oferta</th>
                <th scope="col">Dias letivos</th>
                <th scope="col">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {evidence.rows.map((row) => (
                <tr key={`${row.offer}:${row.period ?? ''}`}>
                  <th scope="row">
                    {row.offer}
                    {row.period ? ` · ${row.period}` : ''}
                  </th>
                  <td>{row.days} dias</td>
                  <td>{result(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      );
    case 'dates':
      if (evidence.state in datesStateLabels)
        return (
          <p className="review-evidence__muted">
            {datesStateLabels[evidence.state as keyof typeof datesStateLabels]}
          </p>
        );
      return (
        <>
          <table className="review-evidence">
            <thead className="visually-hidden">
              <tr>
                <th scope="col">Período</th>
                <th scope="col">Datas</th>
              </tr>
            </thead>
            <tbody>
              {evidence.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td>{compactRange(row, calendarYear)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {evidence.state === 'compared' ? (
            <p data-met={evidence.withinWindow === true}>
              {evidence.withinWindow ? 'Dentro do período da norma.' : 'Fora do período da norma.'}
            </p>
          ) : null}
        </>
      );
    case 'coverage':
      return <CoverageList rows={evidence.rows} />;
    case 'unavailable':
      return (
        <p className="review-evidence__issue">
          <strong>Contagem automática indisponível.</strong>{' '}
          {evidence.reason.replace(/[.!?]+\s*$/, '')}. Confira os documentos para avaliar este
          critério.
        </p>
      );
    case 'documental':
      return (
        <p className="review-evidence__muted">Não verificado pelo sistema: confira no processo.</p>
      );
    case 'search':
      return null;
  }
}

function RecordList({
  records,
  calendarYear,
}: {
  records: Criterion['candidates'];
  calendarYear: number;
}) {
  return (
    <ul>
      {records.map((record) => (
        <li key={record.id}>
          {compactRange(record, calendarYear)} · {record.name}
        </li>
      ))}
    </ul>
  );
}

/** A labelled list, collapsed when long. */
function Records({
  label,
  records,
  calendarYear,
}: {
  label: string;
  records: Criterion['candidates'];
  calendarYear: number;
}) {
  if (!records.length) return null;
  if (records.length > openRecords)
    return (
      <details className="review-item__records">
        <summary>
          {label} ({records.length})
        </summary>
        <RecordList records={records} calendarYear={calendarYear} />
      </details>
    );
  return (
    <div className="review-item__records">
      <p className="review-item__records-label">{label}</p>
      <RecordList records={records} calendarYear={calendarYear} />
    </div>
  );
}

/** What the calendar has for a criterion: computed data, related records and internal dates. */
export default function ReviewEvidence({
  criterion,
  calendarYear,
}: {
  criterion: Criterion;
  calendarYear: number;
}) {
  const { linkedRecords, candidates, internalDates, evidence } = criterion;
  return (
    <>
      <Evidence evidence={evidence} calendarYear={calendarYear} />
      <Records
        label="Datas vinculadas às atividades"
        records={linkedRecords}
        calendarYear={calendarYear}
      />
      <Records
        label="Encontrados por nome e categoria"
        records={candidates}
        calendarYear={calendarYear}
      />
      {candidates.length ? (
        <p className="review-evidence__muted">
          A busca por nome e categoria pode omitir registros ou trazer itens sem relação.
        </p>
      ) : evidence.kind === 'search' ? (
        <p className="review-evidence__muted">
          Nenhum registro localizado por nome e categoria. Isso não comprova ausência no processo.
        </p>
      ) : null}
      {internalDates.length ? (
        <details className="review-item__records" data-internal-dates={criterion.id}>
          <summary>Datas internas do campus, só para consulta ({internalDates.length})</summary>
          <p>
            Datas de organização interna (art. 18) ficam fora do calendário oficial e não comprovam
            o critério.
          </p>
          <ul>
            {internalDates.map((record) => (
              <li key={record.id}>
                <StatusBadge data-internal-badge>Interna</StatusBadge>{' '}
                {compactRange(record, calendarYear)} · {record.name}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
