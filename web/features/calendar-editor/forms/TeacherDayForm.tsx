import { teacherDayWeek, validateTeacherDay } from '../../../../src/teacher-day.ts';
import { recalculateCalendar } from '../../../../src/calendar-edits/commands.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from './useCalendarForm.ts';
import { Input } from './fields.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';

export default function TeacherDayForm({ date }: { date: string }) {
  const { state, session, institutional, readOnly } = useCalendarEditor();
  const { form, submit, error } = useCalendarForm(
    'teacher-day',
    { date: state.teacherDayDate || date },
    function apply(value) {
      const teacherDayDate = validateTeacherDay(value.date, state.year);
      session.apply((current) =>
        recalculateCalendar({ ...current, teacherDayDate }, institutional),
      );
    },
  );
  const week = teacherDayWeek(state.year);
  return (
    <form onSubmit={submit}>
      <fieldset disabled={readOnly}>
        <form.Field name="date">
          {(field) => (
            <Input
              field={field}
              label="Dia do Professor neste calendário"
              id="teacher-day-date"
              type="date"
              min={week.start}
              max={week.end}
              required
            />
          )}
        </form.Field>
        <button type="submit" id="apply-teacher-day">
          Aplicar data
        </button>
        <button
          type="button"
          id="reset-teacher-day"
          onClick={() => {
            session.apply((current) =>
              recalculateCalendar({ ...current, teacherDayDate: undefined }, institutional),
            );
            form.reset({ date });
          }}
        >
          Restaurar data institucional
        </button>
        <small>
          Escolha de {week.start} a {week.end}. A alteração vale apenas para este calendário.
        </small>
        <FormFeedback error={error} />
      </fieldset>
    </form>
  );
}
