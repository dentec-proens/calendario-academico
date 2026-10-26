import { monthSaturdays } from '../../../../src/saturdays.ts';
import { applySaturdays } from '../../../../src/calendar-edits/commands.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from './useCalendarForm.ts';
import { Input, Check, Select } from './fields.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';

export default function SaturdaysForm() {
  const { state, events, session, institutional, readOnly } = useCalendarEditor();
  const { form, values, submit, error } = useCalendarForm(
    'saturdays',
    { month: '1', dates: [] as string[], name: 'Sábado letivo', evidence: '', confirmed: false },
    function apply(value) {
      session.apply((current) =>
        applySaturdays(current, value, institutional, () => crypto.randomUUID()),
      );
      return { ...value, dates: [], confirmed: false };
    },
    undefined,
    ['month'],
  );
  return (
    <form id="saturday-form" onSubmit={submit}>
      <fieldset disabled={readOnly}>
        <form.Field name="month">
          {(field) => (
            <Select field={field} label="Mês" id="saturday-month">
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index} value={index + 1}>
                  {new Date(Date.UTC(state.year, index)).toLocaleDateString('pt-BR', {
                    month: 'long',
                    timeZone: 'UTC',
                  })}
                </option>
              ))}
            </Select>
          )}
        </form.Field>
        <form.Field name="dates">
          {(field) => (
            <fieldset id="saturday-dates">
              <legend>Sábados disponíveis</legend>
              {monthSaturdays(state.year, Number(values.month)).map((date) => {
                const included = state.events.some(
                  (event) => event.kind === 'include' && event.start <= date && date <= event.end,
                );
                const blocked = events.some(
                  (event) => event.kind === 'exclude' && event.start <= date && date <= event.end,
                );
                return (
                  <label className="check" key={date}>
                    <input
                      type="checkbox"
                      value={date}
                      checked={included || field.state.value.includes(date)}
                      disabled={included}
                      onChange={(event) =>
                        field.handleChange(
                          event.target.checked
                            ? [...field.state.value, date]
                            : field.state.value.filter((item) => item !== date),
                        )
                      }
                    />
                    {date.split('-').reverse().join('/')}
                    {included
                      ? ' · já registrado'
                      : blocked
                        ? ' · feriado/recesso: conflito se incluído'
                        : ''}
                  </label>
                );
              })}
            </fieldset>
          )}
        </form.Field>
        <div className="row-form">
          <form.Field name="name">
            {(field) => (
              <Input field={field} label="Atividade" id="saturday-name" maxLength={160} required />
            )}
          </form.Field>
          <form.Field name="evidence">
            {(field) => (
              <Input
                field={field}
                label="Fonte da decisão"
                id="saturday-evidence"
                maxLength={240}
                required
              />
            )}
          </form.Field>
        </div>
        <form.Field name="confirmed">
          {(field) => (
            <Check
              field={field}
              required
              label="Confirmo essas atividades para a oferta deste calendário."
            />
          )}
        </form.Field>
        <FormFeedback error={error} />
        <button type="submit">Adicionar sábados selecionados</button>
      </fieldset>
      <p id="saturday-summary" className="help">
        {values.dates.length} sábados selecionados.
      </p>
    </form>
  );
}
