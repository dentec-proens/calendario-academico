import type { YearSaturday } from '../../../../src/saturdays.ts';

const shortDate = (date: string) => date.slice(5).split('-').reverse().join('/');

function bySource(days: YearSaturday[]) {
  const groups = new Map<string, YearSaturday[]>();
  for (const day of days) {
    const source = day.registration!.evidence;
    groups.set(source, [...(groups.get(source) ?? []), day]);
  }
  return groups;
}

/** The panel's resting state: how to start, and the registered Saturdays grouped by source. */
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
          ? 'Selecione sábados disponíveis no calendário para informar a atividade e a fonte da decisão.'
          : 'Não há sábados disponíveis para seleção.'}
      </p>
      {registered.length > 0 && (
        <>
          <h5>Sábados registrados</h5>
          {[...bySource(registered)].map(([source, days]) => (
            <section key={source} className="saturday-source">
              <h6>{source}</h6>
              <ul>
                {days.map((day) => (
                  <li key={day.date}>
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
            </section>
          ))}
        </>
      )}
    </section>
  );
}
