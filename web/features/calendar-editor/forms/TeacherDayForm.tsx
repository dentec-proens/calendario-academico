import { teacherDayWeek, validateTeacherDay } from '../../../../src/teacher-day.ts';
import { recalculateCalendar } from '../../../../src/calendar-edits/commands.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from './useCalendarForm.ts';
import { Input } from './fields.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';
import { FormActions } from '../../../shared/forms/FormActions.tsx';
import { Button } from '../../../components/ui/Button.tsx';

export default function TeacherDayForm({ date, onClose }: { date: string; onClose: () => void }) {
  const { state, session, institutional, readOnly } = useCalendarEditor();
  const { form, submit, error, dirty, pending } = useCalendarForm(
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
    <form id="teacher-day-form" onSubmit={submit}>
      <fieldset disabled={readOnly || pending}>
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
              aria-describedby="teacher-day-help"
            />
          )}
        </form.Field>
        <p id="teacher-day-help" className="help editor-field-description">
          Escolha de {week.start.split('-').reverse().join('/')} a{' '}
          {week.end.split('-').reverse().join('/')}. A alteração vale apenas para este calendário.
        </p>
        <FormFeedback error={error} />
        <FormActions preserveOnClose={dirty}>
          <Button type="submit" id="apply-teacher-day">
            Aplicar data
          </Button>
          <Button
            variant="secondary"
            id="reset-teacher-day"
            onClick={() => {
              session.apply((current) =>
                recalculateCalendar({ ...current, teacherDayDate: undefined }, institutional),
              );
              form.reset({ date });
            }}
          >
            Restaurar data institucional
          </Button>
          {dirty && (
            <Button
              id="discard-teacher-day"
              variant="secondary"
              onClick={() => {
                form.reset({ date: state.teacherDayDate || date });
                session.setFormDirty('teacher-day', false);
                onClose();
              }}
            >
              Descartar alterações
            </Button>
          )}
        </FormActions>
      </fieldset>
    </form>
  );
}
