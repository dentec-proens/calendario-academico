import { useNavigate } from '@tanstack/react-router';
import { documentedYears } from '#src/domain/policies/registry.ts';
import { windowLabel } from '#src/domain/policy-references.ts';
import { compactDate } from '#src/domain/date-labels.ts';
import { useFeatureRoute } from '../../app/navigation.ts';
import { offerStatusLabels, rulesView, statusHelp, type RulesView } from './rules-view.ts';
import './rules.css';

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
      {section.help ? <p className="help">{section.help}</p> : null}
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
          <dd>
            {view.norm}
            {view.normUrl ? (
              <>
                {' · '}
                <a href={view.normUrl} target="_blank" rel="noopener noreferrer">
                  Abrir publicação oficial
                </a>
              </>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Conjunto de regras</dt>
          <dd>
            <code>{view.version}</code>
          </dd>
        </div>
        <div>
          <dt>Ano letivo</dt>
          <dd>{view.window ? windowLabel(view.window, view.year) : 'Sem janela definida'}</dd>
        </div>
        <div>
          <dt>Ofertas com norma própria</dt>
          <dd>{view.excluded.join(', ') || 'Nenhuma'}</dd>
        </div>
      </dl>
      <h3>Atividades exigidas</h3>
      <p className="help rules-legend">
        {statusHelp.map(([status, meaning]) => (
          <span key={status}>
            <strong>{offerStatusLabels[status]}</strong>: {meaning}.
          </span>
        ))}
      </p>
      {view.sections.map((section, index) => (
        <Activities
          key={section.title}
          id={`rules-section-${index}`}
          view={view}
          section={section}
        />
      ))}

      {view.observances.length > 0 && (
        <section className="rules-section" aria-labelledby="rules-observances-title">
          <h3 id="rules-observances-title">Datas de observância</h3>
          <p className="help">
            O campus escolhe uma das datas permitidas para cada calendário que contém o evento.
          </p>
          <dl>
            {view.observances.map((rule) => (
              <div key={rule.key} data-observance-rule={rule.key}>
                <dt>
                  <strong>{rule.label}</strong>
                </dt>
                <dd>{rule.allowedDates.map((date) => compactDate(date, view.year)).join(', ')}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {view.schoolDay && (
        <section className="rules-section" aria-labelledby="rules-school-day-title">
          <h3 id="rules-school-day-title">O que conta como dia letivo</h3>
          <ul className="rules-school-day">
            <li>
              Cada dia da semana normal de aulas dentro de um período letivo da oferta, mais as
              inclusões (sábados letivos e reposições) e menos as exclusões (feriados, recessos e
              suspensões de aula).
            </li>
            <li>
              Dia letivo exige atividades com a efetiva participação de professores e estudantes (
              {view.schoolDay.basis}). Conselhos de classe, reuniões, formação pedagógica,
              planejamento coletivo e encontro de egressos, assim como prazos e marcos, não
              constituem dia letivo: não acrescentam dias à contagem.
            </li>
            <li>
              Uma dessas atividades em dia de aula não muda a contagem: as aulas são mantidas, salvo
              se o campus as suspender para a atividade, e então o dia deixa de contar.
            </li>
          </ul>
        </section>
      )}
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

      {view.minimumSources.map((source) => (
        <p className="help" key={source}>
          {source}
        </p>
      ))}

      {view.changes.length ? (
        <>
          <h3>Histórico das regras</h3>
          <p className="help">
            Só versões que estabelecem ou ampliam exigências pedem nova revisão dos calendários.
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
              <th scope="col">Nome</th>
              <th scope="col">A regra exige</th>
              <th scope="col">Fonte</th>
            </tr>
          </thead>
          <tbody>
            {view.criteria.map((criterion) => (
              <tr key={criterion.id}>
                <th scope="row">{criterion.id}</th>
                <td>{criterion.title}</td>
                <td>{criterion.requirement}</td>
                <td>{criterion.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      {view.notEvaluated.length ? (
        <details className="rules-criteria">
          <summary>O que a revisão não avalia</summary>
          <ul>
            {view.notEvaluated.map((device) => (
              <li key={device}>{device}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
