import { useState } from 'react';
import { useCalendarEditor } from './session/CalendarEditorProvider.tsx';
import type { CalendarRecord } from './types.ts';

type Event = CalendarRecord['institutionalEvents'][number];
type Document = CalendarRecord['currentDocuments'][number];
const kindLabels: Record<string, string> = {
  include: 'Inclusão letiva',
  exclude: 'Exclusão letiva',
  note: 'Informativo',
};
function EventDescription({ event }: { event: Event }) {
  const date = (value: string) => value.split('-').reverse().join('/');
  return (
    <>
      {event.name} · {date(event.start)}
      {event.end !== event.start ? ` a ${date(event.end)}` : ''} ·{' '}
      {kindLabels[event.kind] || event.kind}
      {event.category ? ` · ${event.category}` : ''}
      {event.modalities?.length ? ` · Ofertas: ${event.modalities.join(', ')}` : ''}
      {event.hours !== undefined ? ` · ${event.hours} horas` : ''}
      {event.evidence ? ` · Fonte: ${event.evidence}` : ''}
      {event.source ? ` · ${event.source}` : ''}
      {event.originalStart &&
      (event.originalStart !== event.start ||
        (event.originalEnd && event.originalEnd !== event.end))
        ? ` · Data institucional: ${date(event.originalStart)}${event.originalEnd && event.originalEnd !== event.originalStart ? ` a ${date(event.originalEnd)}` : ''}`
        : ''}
    </>
  );
}
function DocumentDescription({ document }: { document: Document }) {
  return (
    <>
      {document.title} · Versão {document.version} · {document.filename}
      {document.source ? ` · Fonte: ${document.source}` : ''}
    </>
  );
}

export default function BaseUpdateCard() {
  const { record, remote, baseUpdate, readOnly, session, notify, connected, unapplied, status } =
    useCalendarEditor();
  const [pending, setPending] = useState(false);
  const latest = remote ?? record;
  if (readOnly || baseUpdate.compatible) return null;
  const { events, documents } = baseUpdate;
  const hasEvents = events.added.length + events.changed.length + events.removed.length > 0;
  const hasRules = baseUpdate.kind === 'rules';
  const hasDocuments =
    documents.added.length + documents.changed.length + documents.removed.length > 0;
  const title = hasRules
    ? 'Regras de 2027 atualizadas: nova revisão necessária'
    : hasEvents
      ? 'Há mudanças que afetam este calendário'
      : 'Documentos de referência atualizados';
  const actionLabel = hasRules
    ? 'Adotar regras e registrar nova versão'
    : hasEvents
      ? 'Incorporar mudanças ao calendário'
      : 'Atualizar referências do calendário';
  const newerCalendar = latest.version !== record.version;
  const blocked = !connected || unapplied || newerCalendar || status === 'saving';
  async function incorporate() {
    setPending(true);
    try {
      await session.confirmBase(baseUpdate.identity);
      notify(
        hasRules
          ? 'Regras vigentes adotadas em nova versão. Confira as pendências e registre nova revisão.'
          : hasEvents
            ? 'Mudanças da base institucional incorporadas ao calendário.'
            : 'Referências documentais atualizadas no calendário.',
      );
    } catch (cause) {
      notify(
        cause instanceof Error ? cause.message : 'Não foi possível incorporar as mudanças.',
        true,
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <details className="base-update-card">
      <summary>
        <span>
          <strong>{title}</strong>
          <span>
            {hasRules
              ? 'A revisão anterior não avaliou este conjunto de regras. Confira a aplicabilidade por oferta e preserve as datas registradas.'
              : hasEvents
                ? 'Confira as mudanças nos eventos institucionais antes de incorporá-las.'
                : 'Confira os documentos atualizados. As datas do calendário permanecem iguais.'}
          </span>
          <span className="base-update-card__toggle base-update-card__expand">Ver mudanças</span>
          <span className="base-update-card__toggle base-update-card__collapse">
            Recolher mudanças
          </span>
        </span>
      </summary>
      <div className="base-update-card__content">
        {hasRules && (
          <p>
            A mudança de política invalida a revisão anterior, mesmo quando o catálogo não mudou. A
            adoção registra nova versão e mantém as evidências existentes; ela não representa
            aprovação institucional.
          </p>
        )}
        {hasEvents && (
          <>
            <h3>Eventos institucionais</h3>
            <ul>
              {events.added.map((event) => (
                <li key={event.id}>
                  <strong>Incluído: </strong>
                  <EventDescription event={event} />
                </li>
              ))}
              {events.removed.map((event) => (
                <li key={event.id}>
                  <strong>Removido: </strong>
                  <EventDescription event={event} />
                </li>
              ))}
              {events.changed.map(({ before, after }) => (
                <li key={after.id}>
                  <strong>Alterado: {after.name}</strong>
                  <div>
                    Antes: <EventDescription event={before} />
                  </div>
                  <div>
                    Agora: <EventDescription event={after} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
        {hasDocuments && (
          <>
            <h3>Documentos de referência</h3>
            <ul>
              {documents.added.map((document) => (
                <li key={document.id}>
                  <strong>Incluído: </strong>
                  <DocumentDescription document={document} />
                </li>
              ))}
              {documents.removed.map((document) => (
                <li key={document.id}>
                  <strong>Removido: </strong>
                  <DocumentDescription document={document} />
                </li>
              ))}
              {documents.changed.map(({ before, after }) => (
                <li key={after.id}>
                  <strong>Atualizado: {after.title}</strong>
                  <div>
                    Antes: <DocumentDescription document={before} />
                  </div>
                  <div>
                    Agora: <DocumentDescription document={after} />
                  </div>
                  {before.hash !== after.hash && <div>O conteúdo do arquivo foi substituído.</div>}
                </li>
              ))}
            </ul>
          </>
        )}
        <p>
          {hasEvents
            ? 'Incorporar as mudanças recalcula o calendário e salva uma nova versão, incluindo as alterações locais já aplicadas.'
            : hasRules
              ? 'Adotar as regras salva uma nova versão com a política vigente, sem recalcular as datas registradas.'
              : 'Atualizar as referências salva uma nova versão com os documentos atuais, sem recalcular as datas.'}
        </p>
        <p>Você pode recolher este aviso e atualizar depois.</p>
        {unapplied && (
          <p>Aplique ou descarte os campos em preenchimento antes de incorporar as mudanças.</p>
        )}
        {newerCalendar && <p>Reabra o calendário atualizado antes de incorporar as mudanças.</p>}
        {!connected && <p>Aguarde a conexão para incorporar as mudanças.</p>}
        <button
          type="button"
          disabled={blocked || pending}
          onClick={() => {
            void incorporate();
          }}
        >
          {pending ? 'Atualizando calendário…' : actionLabel}
        </button>
      </div>
    </details>
  );
}
