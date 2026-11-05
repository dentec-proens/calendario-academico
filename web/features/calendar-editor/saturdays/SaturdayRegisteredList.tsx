import { compactDate } from '#src/domain/date-labels.ts';
import type { YearSaturday } from '#src/domain/calendar/activities/saturdays.ts';

/** Registered dates retain their own event identity, independently of other activities. */
export default function SaturdayRegisteredList({
  year,
  registered,
  hasAvailable,
  onOpen,
}: {
  year: number;
  registered: YearSaturday[];
  /** False when no Saturday can be selected, so the panel doesn't invite an impossible action. */
  hasAvailable: boolean;
  onOpen: (eventId: string) => void;
}) {
  return (
    <section className="saturday-panel-section" aria-label="Sábados registrados">
      {!hasAvailable && <p className="help">Não há sábados disponíveis para seleção.</p>}
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
                    <strong>{compactDate(day.date, year)}</strong>{' '}
                    <span>{day.registration!.name}</span>
                  </button>
                </li>
              ))}
          </ul>
        </>
      )}
    </section>
  );
}
