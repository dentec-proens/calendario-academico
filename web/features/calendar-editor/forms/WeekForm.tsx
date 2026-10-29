import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from './useCalendarForm.ts';
import { applyWeek } from '#src/domain/calendar/commands/periods.ts';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';
import { useNavigate } from '@tanstack/react-router';
import { editorPages, editorNavigation } from '../editor-steps.ts';

export default function WeekForm() {
  const { state, record, session, institutional, readOnly } = useCalendarEditor();
  const navigate = useNavigate();
  const next = editorNavigation('edit').next;
  const { form, submit, error } = useCalendarForm(
    'week',
    {
      weekdays: state.weekdays,
    },
    function apply(value) {
      session.apply((current) =>
        applyWeek(current, { ...value, weekConfirmed: true }, institutional),
      );
    },
    {
      applyOnChange: true,
      onSubmit: () => {
        if (next)
          void navigate({
            to: next.path,
            params: { calendarId: record.id },
            search: (previous) => previous,
          });
      },
    },
  );
  return (
    <form id="week-form" onSubmit={submit} aria-labelledby="editor-section-title">
      <p className="help">
        Os sábados são definidos separadamente na etapa {editorPages.days.title}.
      </p>
      <fieldset disabled={readOnly}>
        <form.Field name="weekdays">
          {(field) => (
            <fieldset id="weekdays">
              <legend>Dias com atividade letiva</legend>
              {['Seg', 'Ter', 'Qua', 'Qui', 'Sex'].map((label, index) => (
                <label key={label}>
                  <input
                    type="checkbox"
                    value={index + 1}
                    checked={field.state.value.includes(index + 1)}
                    onChange={(event) =>
                      field.handleChange(
                        event.target.checked
                          ? [...field.state.value, index + 1]
                          : field.state.value.filter((day) => day !== index + 1),
                      )
                    }
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          )}
        </form.Field>
        <FormFeedback error={error} />
      </fieldset>
    </form>
  );
}
