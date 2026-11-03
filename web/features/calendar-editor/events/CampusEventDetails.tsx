import { useRef, useState } from 'react';
import { Link2, Pencil, Trash2 } from 'lucide-react';
import { correctableLinkIssue, removeEvent } from '#src/domain/calendar/commands/events.ts';
import {
  generatedActivities,
  generatedActivity,
  linkIssueActions,
  linkIssueLabels,
  linksToReview,
} from '#src/domain/calendar/activities/links.ts';
import { activityKey } from '#src/domain/calendar/activities/activity-ref.ts';
import { Notice } from '../../../components/ui/Notice.tsx';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import type { EditorEvent } from '../types.ts';
import { useEventEditor } from './EventEditorProvider.tsx';
import EventRecordDetails from './EventRecordDetails.tsx';
import { FormActions } from '../../../shared/forms/FormActions.tsx';
import { Button } from '../../../components/ui/Button.tsx';
import ActivityChangeForm from './ActivityChangeForm.tsx';

/**
 * Details of one date, with its editing actions; the linked activity is read-only and changes only
 * by **Corrigir atividade vinculada**, offered while the date is under “Vínculo a conferir”. Dates
 * of the institutional base are only consulted here.
 */
export default function CampusEventDetails({ event }: { event: EditorEvent }) {
  const { state, record, institutional, applyCommand, readOnly } = useCalendarEditor();
  const editor = useEventEditor();
  const issue = event.institutional ? undefined : linksToReview(state).get(event.id);
  // The save boundary corrects only a date under review in the saved calendar.
  const correctable = issue && correctableLinkIssue(record.state, state, event.id) !== undefined;
  const activity = event.activity
    ? (generatedActivity(generatedActivities(state), event.activity)?.name ??
      activityKey(event.activity))
    : undefined;
  const [changing, setChanging] = useState(false);
  const changeButton = useRef<HTMLButtonElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  return (
    <section className="campus-event-details" aria-label="Detalhes da data">
      <div className="campus-event-record">
        <EventRecordDetails event={event} activity={activity} />
      </div>
      {issue && (
        <Notice
          tone="warning"
          id="link-review-reason"
          title={`Vínculo a conferir: ${linkIssueLabels[issue]}`}
        >
          <p>
            Vínculo gravado: <code>{event.activity && activityKey(event.activity)}</code>.{' '}
            {linkIssueActions[issue]}
          </p>
          {!correctable && (
            <p>
              A correção da atividade vinculada fica disponível depois que as alterações forem
              salvas.
            </p>
          )}
        </Notice>
      )}
      {correctable && changing && (
        <ActivityChangeForm
          eventId={event.id}
          onClose={(applied) => {
            setChanging(false);
            // The corrected date leaves the review group and its button: focus the next action.
            requestAnimationFrame(() =>
              (applied ? editButton : changeButton).current?.focus({ preventScroll: false }),
            );
          }}
        />
      )}
      {event.institutional ? (
        <p className="help">Data da base institucional, somente para consulta.</p>
      ) : (
        <FormActions>
          {correctable && !changing && (
            <Button
              type="button"
              variant="secondary"
              ref={changeButton}
              data-change-activity={event.id}
              disabled={readOnly || editor.pending}
              onClick={() => setChanging(true)}
            >
              <Link2 size={18} aria-hidden="true" /> Corrigir atividade vinculada
            </Button>
          )}
          <Button
            type="button"
            ref={editButton}
            data-edit-event={event.id}
            disabled={readOnly || editor.pending}
            onClick={() => editor.edit(event.id)}
          >
            <Pencil size={18} aria-hidden="true" /> Editar
          </Button>
          <Button
            type="button"
            variant="danger"
            data-remove-event={event.id}
            disabled={readOnly || editor.pending}
            aria-label={`Remover ${event.name}`}
            onClick={() => {
              if (!applyCommand((current) => removeEvent(current, event.id, institutional))) return;
              if (editor.eventId === event.id) editor.discard();
              else editor.close();
            }}
          >
            <Trash2 size={18} aria-hidden="true" /> Remover
          </Button>
        </FormActions>
      )}
    </section>
  );
}
