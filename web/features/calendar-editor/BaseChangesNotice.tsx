import { compactRange, longDate } from '#src/domain/date-labels.ts';
import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Notice } from '../../components/ui/Notice.tsx';
import { teachingDayEffects } from './base-changes.ts';
import { announcedRuleChanges } from '#src/domain/policies/registry.ts';
import type { CalendarRecord, CalendarState } from './types.ts';
import { editorPages } from './editor-steps.ts';
import { useCalendarEditor } from './session/CalendarEditorProvider.tsx';

type BaseUpdate = ReturnType<typeof useCalendarEditor>['baseUpdate'];

/**
 * Tells what the system already applied: nothing here asks for a decision. Saving records what is
 * in force and ends the difference, so the notice stays for the session it first appeared in.
 */
export default function BaseChangesNotice() {
  const { record, state, baseUpdate, readOnly } = useCalendarEditor();
  const [dismissed, setDismissed] = useState(false);
  const [shown, setShown] = useState<ReturnType<typeof announcement>>(null);
  const current = readOnly ? null : announcement(record, state, baseUpdate);
  if (current && current.key !== shown?.key) setShown(current);
  if (dismissed || !shown) return null;
  return (
    <Notice
      id="base-changes-notice"
      tone="info"
      title={shown.title}
      onDismiss={() => setDismissed(true)}
      actions={
        <Link
          to={editorPages.issues.path}
          params={{ calendarId: record.id }}
          search={(previous) => previous}
        >
          Ver pendências
        </Link>
      }
    >
      <ul>
        {shown.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {shown.review && <p>Se já houver parecer, ele precisará ser refeito sob estas regras.</p>}
    </Notice>
  );
}

/** What the current base changed, compared with the copy stored by the last save. */
function eventItems({ added, removed, changed }: BaseUpdate['events'], year: number) {
  const dateRange = (dates: { start: string; end: string }) => compactRange(dates, year);
  return [
    ...added.map((event) => `Incluído: ${event.name}, ${dateRange(event)}.`),
    ...removed.map((event) => `Retirado: ${event.name}, ${dateRange(event)}.`),
    ...changed.map(({ before, after }) =>
      dateRange(before) === dateRange(after)
        ? `Alterado: ${after.name}.`
        : `Alterado: ${after.name}, de ${dateRange(before)} para ${dateRange(after)}.`,
    ),
  ];
}

function announcement(record: CalendarRecord, state: CalendarState, update: BaseUpdate) {
  const { rules, events } = update;
  const changes = announcedRuleChanges(rules, record.updatedAt);
  const dates = eventItems(events, state.year);
  const effects = dates.length
    ? teachingDayEffects(state, record.institutionalSnapshot, record.institutionalEvents)
    : [];
  const items = [...dates, ...effects, ...changes.map((change) => change.summary)];
  if (!items.length) return null;
  const latest = changes.at(-1)?.date;
  return {
    key: items.join('|'),
    title:
      latest && !dates.length
        ? `As regras de ${record.state.year} mudaram em ${longDate(latest)}. As novas regras não alteraram suas datas.`
        : 'Os eventos institucionais mudaram. Este calendário já segue a base vigente.',
    items,
    review: record.status === 'devolvido' && changes.some((change) => change.effect === 'tightens'),
  };
}
