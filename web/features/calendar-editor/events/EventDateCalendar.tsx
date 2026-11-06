import { useId, useMemo, useState } from 'react';
import { DayPicker } from '@daypicker/react';
import { ptBR } from '@daypicker/react/locale';
import { CalendarDays, ChevronUp } from 'lucide-react';
import { longDate } from '#src/domain/date-labels.ts';
import { excludedDays, groupExcludedDays, runDays } from '#src/domain/calendar/excluded-days.ts';
import { Button } from '../../../components/ui/Button.tsx';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { initialMonth, isoDate, localDate, nextDateRange } from './date-calendar.ts';
import './event-date-calendar.css';

/**
 * Chooses the dates of an event seeing what the fields cannot show: the days that do not count as
 * school days and the ones outside the periods. Marks inform and never block: an event may fall
 * on a holiday. The fields stay as they are, for whoever prefers typing.
 */
export default function EventDateCalendar({
  start,
  end,
  eventId,
  onChange,
}: {
  start: string;
  end: string;
  /** The date being edited, which should not explain itself as an obstacle. */
  eventId: string | null;
  onChange: (range: { start: string; end: string }) => void;
}) {
  const { events, state } = useCalendarEditor();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => initialMonth(start, state.periods, state.year));
  const excluded = useMemo(
    () => excludedDays(events.filter((event) => event.id !== eventId)),
    [events, eventId],
  );
  const inPeriod = (day: string) =>
    state.periods.some((period) => period.start <= day && day <= period.end);
  const monthKey = isoDate(month).slice(0, 7);
  const monthRuns = groupExcludedDays(
    [...excluded]
      .filter(([date]) => date.startsWith(monthKey))
      .map(([date, names]) => ({ date, names })),
  );
  return (
    <div className="event-date-calendar">
      <Button
        variant="secondary"
        aria-expanded={open}
        aria-controls={id}
        data-event-calendar-toggle
        onClick={() => {
          if (!open) setMonth(initialMonth(start, state.periods, state.year));
          setOpen(!open);
        }}
      >
        {open ? (
          <ChevronUp size={18} aria-hidden="true" />
        ) : (
          <CalendarDays size={18} aria-hidden="true" />
        )}
        {open ? 'Recolher calendário' : 'Escolher no calendário'}
      </Button>
      <div id={id} hidden={!open}>
        {open && (
          <>
            <p className="help">Escolha o início. Para um período, escolha depois o término.</p>
            <DayPicker
              mode="range"
              required
              locale={ptBR}
              month={month}
              onMonthChange={setMonth}
              showOutsideDays={false}
              selected={{ from: localDate(start), to: localDate(end) }}
              onSelect={(_, day) => onChange(nextDateRange({ start, end }, isoDate(day)))}
              modifiers={{
                excludedDay: (day) => excluded.has(isoDate(day)),
                outsidePeriod: (day) => state.periods.length > 0 && !inPeriod(isoDate(day)),
              }}
              modifiersClassNames={{
                excludedDay: 'is-excluded-day',
                outsidePeriod: 'is-outside-period',
              }}
              labels={{
                labelDayButton: (day, modifiers) => {
                  const date = isoDate(day);
                  const names = excluded.get(date);
                  return [
                    longDate(date),
                    modifiers.selected ? 'selecionado' : '',
                    names ? `não conta como dia letivo: ${names.join('; ')}` : '',
                    modifiers.outsidePeriod ? 'fora dos períodos letivos' : '',
                  ]
                    .filter(Boolean)
                    .join(' · ');
                },
              }}
            />
            <ul className="event-date-legend">
              <li className="is-excluded-day">Não conta como dia letivo</li>
              {state.periods.length > 0 && (
                <li className="is-outside-period">Fora dos períodos letivos</li>
              )}
            </ul>
            {monthRuns.length > 0 && (
              <ul className="event-date-month-notes" data-event-calendar-notes>
                {monthRuns.map((run) => (
                  <li key={run.start}>
                    <strong>{runDays(run)}</strong> {run.names.join('; ')}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
