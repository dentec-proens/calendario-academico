import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from './useCalendarForm.ts';
import { applyWeek } from '../../../../src/calendar-edits/commands.ts';
import { Input, Check } from './fields.tsx';
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
      weekEvidence: state.weekEvidence,
      weekConfirmed: state.weekConfirmed,
    },
    function apply(value) {
      session.apply((current) => applyWeek(current, value, institutional));
      if (next) void navigate({ to: next.path, params: { calendarId: record.id } });
    },
    () => 'Semana letiva atualizada.',
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
        <form.Field name="weekEvidence">
          {(field) => (
            <Input
              field={field}
              label="Referência da decisão"
              id="week-evidence"
              aria-describedby="week-evidence-help"
              placeholder="Ex.: Resolução nº 12/2026 ou Portaria nº 45/2026"
              required
              maxLength={240}
            />
          )}
        </form.Field>
        <p id="week-evidence-help" className="help editor-field-description">
          Indique o documento ou registro que definiu a semana letiva desta oferta, como uma
          resolução, portaria ou ata de reunião. Informe o número, o ano ou outra identificação que
          permita consultar a decisão.
        </p>
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
      </fieldset>
    </form>
  );
}
