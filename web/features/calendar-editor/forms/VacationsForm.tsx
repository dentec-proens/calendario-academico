import { useEffect } from 'react';
import { durationEnd } from '../../../../src/duration.ts';
import { teacherVacations } from '../../../../src/teacher-vacations.ts';
import { applyVacations } from '../../../../src/calendar-edits/commands.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from './useCalendarForm.ts';
import { Input } from './fields.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';

export default function VacationsForm() {
  const { state, session, institutional, readOnly } = useCalendarEditor();
  const { form, values, submit, error } = useCalendarForm(
    'vacations',
    {
      firstStart: state.teacherVacations?.firstStart || '',
      firstEnd: state.teacherVacations?.firstEnd || '',
      secondStart: state.teacherVacations?.secondStart || '',
      secondEnd: state.teacherVacations?.secondEnd || '',
      thirdStart: state.teacherVacations?.thirdStart || '',
      thirdEnd: state.teacherVacations?.thirdEnd || '',
      evidence: state.teacherVacations?.evidence || '',
      firstDays: '',
      secondDays: '',
      thirdDays: '',
    },
    function apply(value) {
      const { firstDays: _first, secondDays: _second, thirdDays: _third, ...periods } = value;
      session.apply((current) => applyVacations(current, periods, institutional));
    },
  );
  useEffect(() => {
    for (const part of ['first', 'second', 'third'] as const) {
      const days = values[`${part}Days`],
        start = values[`${part}Start`];
      if (!days || !start) continue;
      try {
        const end = durationEnd(start, days);
        if (end !== form.state.values[`${part}End`]) form.setFieldValue(`${part}End`, end);
      } catch {
        /* The preview below presents the validation error. */
      }
    }
  }, [form, values]);
  let preview = '';
  try {
    const result = teacherVacations(state.year, values, values.evidence || 'Prévia');
    preview = `Total informado: ${result.total} dias. Confira o quantitativo e a decisão do campus.`;
  } catch (cause) {
    preview = cause instanceof Error ? cause.message : '';
  }
  return (
    <form id="vacation-form" onSubmit={submit}>
      <fieldset disabled={readOnly}>
        {(['first', 'second', 'third'] as const).map((part, index) => (
          <div key={part} className="row-form">
            <form.Field name={`${part}Start`}>
              {(field) => (
                <Input
                  field={field}
                  label={`${['Primeiro', 'Segundo', 'Terceiro'][index]} período — início${index ? ' (opcional)' : ''}`}
                  id={`vacation-${part}-start`}
                  type="date"
                  required={!index}
                />
              )}
            </form.Field>
            <form.Field name={`${part}Days`}>
              {(field) => (
                <Input
                  field={field}
                  label="Quantidade de dias corridos"
                  id={`vacation-${part}-days`}
                  type="number"
                  min="1"
                  max="366"
                  step="1"
                />
              )}
            </form.Field>
            <form.Field name={`${part}End`}>
              {(field) => (
                <label>
                  {`${['Primeiro', 'Segundo', 'Terceiro'][index]} período — término`}
                  <input
                    name={field.name}
                    id={`vacation-${part}-end`}
                    type="date"
                    required={!index}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      form.setFieldValue(`${part}Days`, '');
                      field.handleChange(event.target.value);
                    }}
                  />
                </label>
              )}
            </form.Field>
          </div>
        ))}
        <form.Field name="evidence">
          {(field) => (
            <Input
              field={field}
              label="Fonte ou decisão"
              id="vacation-evidence"
              maxLength={240}
              required
            />
          )}
        </form.Field>
        <p id="vacation-preview" role="status">
          {preview}
        </p>
        <FormFeedback error={error} />
        <button type="submit">Aplicar férias docentes ao rascunho</button>
      </fieldset>
    </form>
  );
}
