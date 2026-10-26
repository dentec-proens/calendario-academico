import { useState } from 'react';
import { baseChanges } from './base-changes.ts';
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
  const { record, remote, readOnly, session, notify, connected, unapplied, status } =
    useCalendarEditor();
  const [pending, setPending] = useState(false);
  const latest = remote ?? record;
  if (readOnly || record.catalogueRevision === latest.currentCatalogueRevision) return null;
  const events = baseChanges(record.institutionalSnapshot, latest.institutionalEvents);
  const documents = baseChanges(record.documentSnapshot, latest.currentDocuments);
  const eventCount = events.added.length + events.changed.length + events.removed.length;
  const documentCount =
    documents.added.length + documents.changed.length + documents.removed.length;
  const newerCalendar = latest.version !== record.version;
  const blocked = !connected || unapplied || newerCalendar || status === 'saving';
  async function incorporate() {
    setPending(true);
    try {
      await session.confirmBase();
      notify('Mudanças da base institucional incorporadas ao calendário.');
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
          <strong>Há mudanças na base institucional</strong>
          <span>Este calendário usa uma versão anterior das referências institucionais.</span>
          <span className="base-update-card__toggle base-update-card__expand">Ver mudanças</span>
          <span className="base-update-card__toggle base-update-card__collapse">
            Recolher mudanças
          </span>
        </span>
      </summary>
      <div className="base-update-card__content">
        <p>
          Base incorporada: {record.catalogueRevision} · Base atual:{' '}
          {latest.currentCatalogueRevision}.
        </p>
        <h3>Eventos institucionais</h3>
        {!eventCount ? (
          <p>Não há alterações nos eventos institucionais deste calendário.</p>
        ) : (
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
        )}
        <h3>Documentos de referência</h3>
        {!documentCount ? (
          <p>Não há alterações nos documentos de referência.</p>
        ) : (
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
        )}
        {!eventCount && documentCount > 0 && (
          <p>Apenas os documentos de referência foram atualizados.</p>
        )}
        {!eventCount && !documentCount && (
          <p>
            A revisão da base mudou, sem diferenças nos eventos e documentos usados por este
            calendário.
          </p>
        )}
        <p>
          Incorporar as mudanças recalcula o calendário e salva uma nova versão, incluindo as
          alterações locais já aplicadas.
        </p>
        <p>Você pode recolher este card e incorporar as mudanças depois.</p>
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
          {pending ? 'Incorporando mudanças…' : 'Incorporar mudanças ao calendário'}
        </button>
      </div>
    </details>
  );
}
