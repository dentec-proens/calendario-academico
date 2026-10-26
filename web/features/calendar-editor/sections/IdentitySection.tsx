import { modalityLabels } from '../../../../src/modalities.ts';
import { regimeLabels } from '../../../../src/calendar-label.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import WeekForm from '../forms/WeekForm.tsx';
import { useCalendarForm } from '../forms/useCalendarForm.ts';
import { Select } from '../forms/fields.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';

function IntakeForm() {
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
    <form onSubmit={submit} hidden={state.regime === 'anual'}>
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

export default function IdentitySection() {
  const { state } = useCalendarEditor();
  return (
    <section id="edit" className="view">
      <div className="panel">
        <h3>Identificação</h3>
        <label>
          Campus
          <input id="campus" value={state.campus} readOnly disabled />
        </label>
        <label>
          Ano
          <input id="year" type="number" value={state.year} readOnly disabled />
        </label>
        <p id="selected-modalities">
          Forma de oferta/nível: {state.modalities.map((item) => modalityLabels[item]).join(' + ')}
        </p>
        <p id="regime-summary">Organização: {regimeLabels[state.regime]}</p>
        <IntakeForm />
      </div>
      <div className="panel">
        <WeekForm />
      </div>
    </section>
  );
}
