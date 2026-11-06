import {
  isYearSaturday,
  type YearMonth,
  type YearSaturday,
} from '#src/domain/calendar/activities/saturdays.ts';

import { groupExcludedDays, runDays } from '#src/domain/calendar/excluded-days.ts';
import { offerNames, partialOfferNames } from '#src/domain/calendar/offers.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';

const weekdays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'SÁB'];

function saturdayLabel(day: { day: number }, month: YearMonth, year: number) {
  return `${String(day.day).padStart(2, '0')} de ${month.name.toLowerCase()} de ${year}`;
}

const noPeriod = (names: string, dates = 1) =>
  `${names}: sem período letivo ${dates === 1 ? 'nesta data' : 'nestas datas'}`;

/**
 * Why days of the month do not count and which offers its Saturdays cannot reach, in text that a
 * tooltip could not show on a touch screen. Saturdays missing the same offers read as one line.
 */
function monthNotes(month: YearMonth, names: (ids: readonly string[]) => string) {
  const runs = groupExcludedDays(
    month.days.map(({ date, impediments }) => ({ date, names: impediments })),
  );
  const missing = new Map<string, number[]>();
  for (const day of month.days.filter(isYearSaturday)) {
    if (day.status === 'registered' || !day.offersOutOfPeriod.length) continue;
    const key = names(day.offersOutOfPeriod);
    missing.set(key, [...(missing.get(key) ?? []), day.day]);
  }
  if (!runs.length && !missing.size) return null;
  return (
    <ul className="saturday-month-notes" data-saturday-month-notes>
      {runs.map((run) => (
        <li key={run.start}>
          <strong>{runDays(run)}</strong> {run.names.join('; ')}
        </li>
      ))}
      {[...missing].map(([key, days]) => (
        <li key={key} data-saturday-period-note>
          <strong>{days.join(', ')}</strong> {noPeriod(key, days.length)}
        </li>
      ))}
    </ul>
  );
}

export default function SaturdayYearGrid({
  months,
  selected,
  editingId,
  disabled,
  onToggle,
  onBlur,
  onEdit,
}: {
  months: YearMonth[];
  selected: string[];
  editingId: string | null;
  disabled: boolean;
  onToggle: (date: string, checked: boolean) => void;
  onBlur: () => void;
  onEdit: (eventId: string) => void;
}) {
  const { state } = useCalendarEditor();
  const { year } = state;
  const names = (ids: readonly string[]) => offerNames(state, ids);
  function saturday(day: YearSaturday, month: YearMonth) {
    const label = saturdayLabel(day, month, year);
    const impediment = day.impediments.length
      ? ` · Não conta como dia letivo: ${day.impediments.join('; ')}`
      : '';
    const className = `saturday-day is-saturday${day.impediments.length ? ' has-impediment' : ''}`;
    if (day.status === 'available') {
      const partial = day.offersOutOfPeriod.length > 0;
      return (
        <label
          key={day.date}
          className={`${className}${partial ? ' is-partial' : ''}`}
          data-saturday={day.date}
          data-status={day.status}
        >
          <input
            type="checkbox"
            name="dates"
            value={day.date}
            aria-label={
              label + impediment + (partial ? ` · ${noPeriod(names(day.offersOutOfPeriod))}` : '')
            }
            checked={selected.includes(day.date)}
            disabled={disabled}
            onBlur={onBlur}
            onChange={(event) => onToggle(day.date, event.target.checked)}
          />
          <span aria-hidden="true">{day.day}</span>
        </label>
      );
    }
    if (day.status === 'registered') {
      const registration = day.registration!;
      const reached = partialOfferNames(state, registration.offers);
      return (
        <span
          key={day.date}
          className={`${className}${editingId === registration.id ? ' is-editing' : ''}${reached ? ' is-partial' : ''}`}
          data-saturday={day.date}
          data-status={day.status}
        >
          <button
            type="button"
            {...(day.editable && { 'data-edit-saturday': registration.id })}
            aria-label={`${label} · já registrado: ${registration.name}${reached ? ` · vale para ${reached}` : ''}${impediment}`}
            title={registration.name}
            onClick={() => onEdit(registration.id)}
          >
            {day.day}
          </button>
        </span>
      );
    }
    return (
      // Not in the tab order; it only receives focus when its registration is removed.
      <span
        key={day.date}
        className={className}
        data-saturday={day.date}
        data-status={day.status}
        tabIndex={-1}
      >
        <span aria-hidden="true">{day.day}</span>
        <span className="saturday-sr">
          {label} · {noPeriod(names(day.offersOutOfPeriod))}
        </span>
      </span>
    );
  }
  return (
    <fieldset id="saturday-dates" aria-describedby="saturday-legend">
      <legend>Sábados de {year}</legend>
      <ul id="saturday-legend" className="saturday-legend">
        <li className="is-available">Disponível</li>
        <li className="is-selected">Selecionado</li>
        <li className="is-registered">Registrado</li>
        <li className="has-impediment">Não conta como dia letivo</li>
        <li className="is-outside">Fora dos períodos letivos</li>
        {state.offers.length > 1 && <li className="is-partial">Só parte das ofertas</li>}
      </ul>
      <div className="saturday-year">
        {months.map((month) => (
          <section
            key={month.month}
            className="saturday-month"
            aria-labelledby={`saturday-month-${month.month}`}
          >
            <h4 id={`saturday-month-${month.month}`}>
              {month.name}
              {month.registered > 0 && (
                <small>
                  {month.registered} {month.registered === 1 ? 'registrado' : 'registrados'}
                </small>
              )}
            </h4>
            <div className="saturday-month-days">
              {weekdays.map((weekday, index) => (
                <span
                  key={index}
                  className={`saturday-weekday${index === 6 ? ' is-saturday' : ''}`}
                  aria-hidden="true"
                >
                  {weekday}
                </span>
              ))}
              {Array.from({ length: month.leadingBlanks }, (_, index) => (
                <span key={`blank-${index}`} aria-hidden="true" />
              ))}
              {month.days.map((day) =>
                isYearSaturday(day) ? (
                  saturday(day, month)
                ) : (
                  <span
                    key={day.date}
                    className={`saturday-day${day.impediments.length ? ' has-impediment' : ''}`}
                    aria-hidden="true"
                  >
                    {day.day}
                  </span>
                ),
              )}
            </div>
            {monthNotes(month, names)}
          </section>
        ))}
      </div>
    </fieldset>
  );
}
