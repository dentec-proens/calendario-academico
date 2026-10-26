import { isYearSaturday, type YearMonth, type YearSaturday } from '../../../../src/saturdays.ts';

const weekdays = ['D', 'S', 'T', 'Q', 'Q', 'S', 'SÁB'];

function saturdayLabel(day: { day: number }, month: YearMonth, year: number) {
  return `${String(day.day).padStart(2, '0')} de ${month.name.toLowerCase()} de ${year}`;
}

export default function SaturdayYearGrid({
  months,
  year,
  selected,
  editingId,
  disabled,
  onToggle,
  onBlur,
  onEdit,
}: {
  months: YearMonth[];
  year: number;
  selected: string[];
  editingId: string | null;
  disabled: boolean;
  onToggle: (date: string, checked: boolean) => void;
  onBlur: () => void;
  onEdit: (eventId: string) => void;
}) {
  function saturday(day: YearSaturday, month: YearMonth) {
    const label = saturdayLabel(day, month, year);
    const impediment = day.impediments.length
      ? ` · Não conta como dia letivo: ${day.impediments.join('; ')}`
      : '';
    const className = `saturday-day is-saturday${day.impediments.length ? ' has-impediment' : ''}`;
    if (day.status === 'available')
      return (
        <label
          key={day.date}
          className={className}
          data-saturday={day.date}
          data-status={day.status}
          title={day.impediments.join('; ') || undefined}
        >
          <input
            type="checkbox"
            name="dates"
            value={day.date}
            aria-label={label + impediment}
            checked={selected.includes(day.date)}
            disabled={disabled}
            onBlur={onBlur}
            onChange={(event) => onToggle(day.date, event.target.checked)}
          />
          <span aria-hidden="true">{day.day}</span>
        </label>
      );
    if (day.status === 'registered') {
      const registration = day.registration!;
      return (
        <span
          key={day.date}
          className={`${className}${editingId === registration.id ? ' is-editing' : ''}`}
          data-saturday={day.date}
          data-status={day.status}
        >
          <button
            type="button"
            {...(day.editable && { 'data-edit-saturday': registration.id })}
            aria-label={`${label} · já registrado: ${registration.name}${impediment}`}
            title={registration.name}
            onClick={() => onEdit(registration.id)}
          >
            {day.day}
          </button>
        </span>
      );
    }
    return (
      <span key={day.date} className={className} data-saturday={day.date} data-status={day.status}>
        <span aria-hidden="true">{day.day}</span>
        <span className="saturday-sr">{label} · fora dos períodos letivos</span>
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
                    title={day.impediments.join('; ') || undefined}
                    aria-hidden="true"
                  >
                    {day.day}
                  </span>
                ),
              )}
            </div>
          </section>
        ))}
      </div>
    </fieldset>
  );
}
