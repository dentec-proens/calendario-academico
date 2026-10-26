import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from './useCalendarForm.ts';
import { Select } from './fields.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';

export default function IntakeForm() {
  const { state, session, readOnly } = useCalendarEditor();
  const { form, submit, error } = useCalendarForm(
    'intake',
    {
      intake:
        state.secondSemesterIntake === undefined ? '' : state.secondSemesterIntake ? 'yes' : 'no',
    },
    function apply(value) {
      session.apply((current) => ({
        ...current,
        secondSemesterIntake: value.intake === '' ? undefined : value.intake === 'yes',
      }));
    },
  );
  return (
    <form id="intake-form" onSubmit={submit} hidden={state.regime === 'anual'}>
      <h3>Ingresso no segundo semestre</h3>
      <fieldset disabled={readOnly}>
        <form.Field name="intake">
          {(field) => (
            <Select
              field={field}
              label="Há ingresso de novos estudantes no 2º semestre?"
              id="second-semester-intake"
            >
              <option value="">Selecione</option>
              <option value="yes">Sim</option>
              <option value="no">Não, somente rematrícula</option>
            </Select>
          )}
        </form.Field>
        <small>
          Ao selecionar Não, a matrícula de ingressantes do 2º semestre deixa de ser exigida. A
          rematrícula continua obrigatória.
        </small>
        <button type="submit">Aplicar ingresso semestral</button>
        <FormFeedback error={error} />
      </fieldset>
    </form>
  );
}
