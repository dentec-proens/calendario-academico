import { Link } from '@tanstack/react-router';
import { compactDate } from '#src/domain/date-labels.ts';
import type { YearSaturday } from '#src/domain/calendar/activities/saturdays.ts';
import { offerNames, partialOfferNames } from '#src/domain/calendar/offers.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { editorPages } from '../editor-steps.ts';

/** Registered dates retain their own event identity, independently of other activities. */
export default function SaturdayRegisteredList({
  calendarId,
  registered,
  hasAvailable,
  offersWithoutPeriods,
  onOpen,
}: {
  calendarId: string;
  registered: YearSaturday[];
  /** False when no Saturday can be selected, so the panel doesn't invite an impossible action. */
  hasAvailable: boolean;
  offersWithoutPeriods: readonly string[];
  onOpen: (eventId: string) => void;
}) {
  const { state } = useCalendarEditor();
  return (
    <section
      className="saturday-panel-section saturday-registered"
      aria-label="Sábados registrados"
    >
      {!hasAvailable && (
        <p className="help" id="saturday-none-available">
          Não há sábados disponíveis para seleção:{' '}
          {offersWithoutPeriods.length
            ? `${offerNames(state, offersWithoutPeriods)} sem período letivo.`
            : 'os períodos cadastrados não têm sábados livres.'}{' '}
          Corrija em{' '}
          <Link to={editorPages.periods.path} params={{ calendarId }}>
            {editorPages.periods.title}
          </Link>
          .
        </p>
      )}
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
                    <strong>{compactDate(day.date, state.year)}</strong>{' '}
                    <span>
                      {day.registration!.name}
                      {partialOfferNames(state, day.registration!.offers) && (
                        <small>{partialOfferNames(state, day.registration!.offers)}</small>
                      )}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </>
      )}
    </section>
  );
}
