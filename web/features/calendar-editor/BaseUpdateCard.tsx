import { useState } from 'react';
import { useCalendarEditor } from './session/CalendarEditorProvider.tsx';
import type { CalendarRecord } from './types.ts';
import { labelFor } from '#src/domain/calendar/offers.ts';

type Event = CalendarRecord['institutionalEvents'][number];
const effectLabels: Record<string, string> = {
  include: 'Inclusão letiva',
  exclude: 'Exclusão letiva',
  note: 'Informativo',
};
function EventDescription({ event }: { event: Event }) {
  const { state } = useCalendarEditor();
  const { offers } = event;
  const date = (value: string) => value.split('-').reverse().join('/');
  return (
    <>
      {event.name} · {date(event.start)}
      {event.end !== event.start ? ` a ${date(event.end)}` : ''} ·{' '}
      {effectLabels[event.effect] || event.effect}
      {event.category ? ` · ${event.category}` : ''}
      {offers.length ? ` · Ofertas: ${offers.map((id) => labelFor(state, id)).join(', ')}` : ''}
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
export default function BaseUpdateCard() {
  const { record, remote, baseUpdate, readOnly, session, notify, connected, unapplied, status } =
    useCalendarEditor();
  const [pending, setPending] = useState(false);
  const latest = remote ?? record;
  if (readOnly || baseUpdate.compatible) return null;
  const { events } = baseUpdate;
  const newerCalendar = latest.version !== record.version;
  const blocked = !connected || unapplied || newerCalendar || status === 'saving';
  async function incorporate() {
    setPending(true);
    try {
      await session.confirmBase(baseUpdate.identity);
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
    <details className="base-update-card" open>
      <summary>
        <span>
          <strong>Há mudanças que afetam este calendário</strong>
          <span>Confira as mudanças nos eventos institucionais antes de incorporá-las.</span>
          <span className="base-update-card__toggle base-update-card__expand">Ver mudanças</span>
          <span className="base-update-card__toggle base-update-card__collapse">
            Recolher mudanças
          </span>
        </span>
      </summary>
      <div className="base-update-card__content">
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
        <p>
          Incorporar as mudanças recalcula o calendário e salva uma nova versão, incluindo as
          alterações locais já aplicadas.
        </p>
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
          {pending ? 'Atualizando calendário…' : 'Incorporar mudanças ao calendário'}
        </button>
      </div>
    </details>
  );
}
