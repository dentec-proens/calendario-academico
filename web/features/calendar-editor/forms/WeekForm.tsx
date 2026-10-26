import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from './useCalendarForm.ts';
import { applyWeek } from '../../../../src/calendar-edits/commands.ts';
import { Input, Check } from './fields.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';

export default function WeekForm() {
  const { state, session, institutional, readOnly } = useCalendarEditor();
  const { form, submit, error } = useCalendarForm(
    'week',
    {
      weekdays: state.weekdays,
      weekEvidence: state.weekEvidence,
      weekConfirmed: state.weekConfirmed,
    },
    function apply(value) {
      session.apply((current) => applyWeek(current, value, institutional));
    },
  );
  return (
    <form id="week-form" onSubmit={submit}>
      <h3>Semana letiva</h3>
      <p className="help">
        Marque os dias regulares. Selecione os sábados na seção Sábados letivos por mês.
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
        <form.Field name="weekEvidence">
          {(field) => (
            <Input
              field={field}
              label="Referência da decisão"
              id="week-evidence"
              required
              maxLength={240}
            />
          )}
        </form.Field>
        <form.Field name="weekConfirmed">
          {(field) => (
            <Check
              field={field}
              id="week-confirmed"
              required
              label="Confirmo essa organização para a oferta."
            />
          )}
        </form.Field>
        <FormFeedback error={error} />
        <button className="wide" type="submit">
          Aplicar semana
        </button>
      </fieldset>
    </form>
  );
}
