import type { ReactNode } from 'react';
import { calendarName } from '#src/domain/calendar/label.ts';
import { modalityLabels } from '#src/domain/calendar/modalities.ts';
import type { Bootstrap } from '../../shared/convex/types.ts';
import './calendar-list.css';

export type CalendarSummary = Bootstrap['calendars'][number];

/**
 * What identifies a calendar in any list. Screens without a campus column ask for the origin, shown
 * only when the name does not already state it.
 */
export default function CalendarIdentityCell({
  calendar,
  badge,
  withOrigin = false,
}: {
  calendar: CalendarSummary;
  badge?: ReactNode;
  withOrigin?: boolean;
}) {
  const statesOrigin =
    calendar.name === calendarName(calendar.year, calendar.campusName, calendar.label);
  const details = [calendar.classes, calendar.shifts].filter(Boolean).join(' · ');
  return (
    <div className="calendar-list-details">
      {badge}
      <strong className="calendar-list-name">{calendar.name}</strong>
      <p className="calendar-list-offering">
        {withOrigin && !statesOrigin ? (
          <>
            {calendar.campusName} · {calendar.year} ·{' '}
          </>
        ) : null}
        {calendar.offerKinds.map((kind) => modalityLabels[kind] || kind).join(' + ')}
      </p>
      {calendar.courses || details ? (
        <p className="calendar-list-courses">
          {calendar.courses}
          {details ? <span>{details}</span> : null}
        </p>
      ) : null}
      {calendar.seiProcess ? (
        <small className="calendar-list-sei">Processo SEI nº {calendar.seiProcess}</small>
      ) : null}
      {calendar.supersededByName ? (
        <small className="calendar-list-superseded">
          Substituído por {calendar.supersededByName}
        </small>
      ) : null}
    </div>
  );
}
