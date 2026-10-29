import { useNavigate } from '@tanstack/react-router';
import { documentedYears } from '#src/domain/policies/registry.ts';
import { useFeatureRoute } from '../../app/navigation.ts';
import { Notice } from '../../components/ui/Notice.tsx';
import { offerStatusLabels, referenceAssumption, rulesView, type RulesView } from './rules-view.ts';
import './rules.css';

const civilDate = (date: string) => date.split('-').reverse().join('/');

function Activities({
  id,
  view,
  section,
}: {
  id: string;
  view: RulesView;
  section: RulesView['sections'][number];
}) {
  return (
    <section className="rules-section" aria-labelledby={id}>
      <h4 id={id}>{section.title}</h4>
      <p className="help">{section.help}</p>
      <table className="rules-table rules-activities">
        <thead>
          <tr>
            <th scope="col">Atividade</th>
            {view.offers.map((offer) => (
              <th scope="col" key={offer.id}>
                {offer.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.activities.map((activity) => (
            <tr key={activity.id} data-rule={activity.id}>
              <th scope="row">
                <strong>{activity.name}</strong>
                <small>
                  {activity.basis ?? 'Sem base normativa'}
                  {activity.criterion ? ` · Critério ${activity.criterion}` : ''}
                </small>
                {activity.decision ? <small>Decisão: {activity.decision}.</small> : null}
                {activity.details.map((detail) => (
                  <small key={detail}>{detail}</small>
                ))}
              </th>
              {activity.byOffer.map(({ offer, status, note }) => (
                <td key={offer} data-offer={offer}>
                  <span className="rules-cell-label" aria-hidden="true">
                    {view.offers.find((item) => item.id === offer)?.label}
                  </span>
                  <span>
                    <span className="rules-status" data-status={status}>
                      {offerStatusLabels[status]}
                    </span>
                    {note && status === 'optional' ? <small>{note}</small> : null}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function RulesPage() {
  const navigate = useNavigate();
  const route = useFeatureRoute();
  const latest = documentedYears.at(-1);
  const year = documentedYears.includes(Number(route.ano)) ? Number(route.ano) : latest;
  if (year === undefined)
    return (
      <section className="page panel rules-page">
        <p role="status">Nenhum ano tem regras publicadas.</p>
      </section>
    );
  const view = rulesView(year);
  return (
    <section className="page panel rules-page" aria-labelledby="rules-title">
      <div className="rules-heading">
        <div>
          <h2 id="rules-title">Regras do calendário de {view.year}</h2>
          <p className="help">
            As mesmas regras que o editor usa para indicar pendências e que a revisão confere.
          </p>
        </div>
        {documentedYears.length > 1 ? (
          <label>
            Ano
            <select
              value={view.year}
              onChange={(event) =>
                void navigate({ to: '/regras', search: { ano: event.target.value }, replace: true })
              }
            >
              {documentedYears.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <dl className="rules-summary">
        <div>
          <dt>Norma</dt>
          <dd>{view.norm}</dd>
        </div>
        <div>
          <dt>Conjunto de regras</dt>
          <dd>
            <code>{view.version}</code>
          </dd>
        </div>
        <div>
          <dt>Ano letivo</dt>
          <dd>
            {view.window
              ? `${civilDate(view.window.start)} a ${civilDate(view.window.end)}, início até ${civilDate(view.window.latestStart)}`
              : 'Sem janela definida'}
          </dd>
        </div>
        <div>
          <dt>Ofertas com norma própria</dt>
          <dd>{view.excluded.join(', ') || 'Nenhuma'}</dd>
        </div>
      </dl>
      <Notice tone="info">{referenceAssumption}</Notice>

      <h3>Atividades exigidas</h3>
      {view.sections.map((section, index) => (
        <Activities
          key={section.title}
          id={`rules-section-${index}`}
          view={view}
          section={section}
        />
      ))}

      <h3>Mínimos de dias letivos</h3>
      <p className="help">Aplicados na contagem depois que o escopo da norma é confirmado.</p>
      <table className="rules-table rules-compact">
        <thead>
          <tr>
            <th scope="col">Oferta</th>
            <th scope="col">Ano letivo</th>
            <th scope="col">Semestre</th>
          </tr>
        </thead>
        <tbody>
          {view.minimums.map((row) => (
            <tr key={row.offer}>
              <th scope="row">{row.offer}</th>
              <td>{row.annual ?? 'Não aplicado'}</td>
              <td>{row.semester ?? 'Não aplicado'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {view.changes.length ? (
        <>
          <h3>Histórico das regras</h3>
          <p className="help">
            Só versões que estabelecem ou ampliam exigências pedem nova incorporação e nova revisão
            dos calendários.
          </p>
          <ol className="rules-history">
            {view.changes.map((change) => (
              <li key={change.version}>
                <strong>
                  <code>{change.version}</code> · {change.date} · {change.effect}
                </strong>
                <span>{change.summary}</span>
                <small>
                  Fonte: {change.source}
                  {change.criteria?.length ? ` · Critérios ${change.criteria.join(', ')}` : ''}
                </small>
              </li>
            ))}
          </ol>
        </>
      ) : null}

      <details className="rules-criteria">
        <summary>Critérios da revisão ({view.criteria.length})</summary>
        <table className="rules-table rules-compact">
          <thead>
            <tr>
              <th scope="col">Critério</th>
              <th scope="col">Dispositivo</th>
              <th scope="col">Título</th>
            </tr>
          </thead>
          <tbody>
            {view.criteria.map((criterion) => (
              <tr key={criterion.id}>
                <th scope="row">{criterion.id}</th>
                <td>{criterion.item}</td>
                <td>{criterion.title}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
