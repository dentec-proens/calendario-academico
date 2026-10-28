import type { YearSaturday } from '../../../../src/domain/calendar/activities/saturdays.ts';

const shortDate = (date: string) => date.slice(5).split('-').reverse().join('/');

/** Registered dates retain their own event identity, independently of other activities. */
export default function SaturdayRegisteredList({
  registered,
  hasAvailable,
  onOpen,
}: {
  registered: YearSaturday[];
  /** False when no Saturday can be selected, so the panel doesn't invite an impossible action. */
  hasAvailable: boolean;
  onOpen: (eventId: string) => void;
}) {
  return (
    <section className="saturday-panel-section" aria-label="Sábados registrados">
      <p className="help">
        {hasAvailable
          ? 'Selecione sábados disponíveis no calendário para informar a atividade.'
          : 'Não há sábados disponíveis para seleção.'}
      </p>
      {registered.length > 0 && (
        <>
          <h5>Sábados registrados</h5>
          <ul className="saturday-registrations">
            {[...registered]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((day) => (
                <li key={`${day.date}:${day.registration!.id}`}>
                  <button
                    type="button"
                    className="secondary"
                    {...(day.editable && { 'data-edit-saturday': day.registration!.id })}
                    onClick={() => onOpen(day.registration!.id)}
                  >
                    <strong>{shortDate(day.date)}</strong> {day.registration!.name}
                  </button>
                </li>
              ))}
          </ul>
        </>
      )}
    </section>
  );
}
