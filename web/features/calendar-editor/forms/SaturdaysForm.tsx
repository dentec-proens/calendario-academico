import { monthSaturdays } from '../../../../src/saturdays.ts';
import { applySaturdayActivities } from '../../../../src/calendar-edits/commands.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from './useCalendarForm.ts';
import { Input } from './fields.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';
import './saturday-form.css';

const monthNames = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export default function SaturdaysForm() {
  const { state, events, session, institutional, readOnly } = useCalendarEditor();
  const { form, values, submit, pending, error } = useCalendarForm(
    'saturdays',
    {
      dates: [] as string[],
      activities: {} as Record<string, { name: string; evidence: string }>,
      // Retain these defaults only to recover selections drafted before per-date activities.
      name: '',
      evidence: '',
    },
    function apply(value) {
      const selected = value.dates.filter(
        (date) =>
          !state.events.some(
            (event) => event.kind === 'include' && event.start <= date && date <= event.end,
          ),
      );
      session.apply((current) =>
        applySaturdayActivities(
          current,
          selected.map((date) => ({
            date,
            ...(value.activities[date] ?? { name: value.name, evidence: value.evidence }),
          })),
          institutional,
          () => crypto.randomUUID(),
        ),
      );
      return { dates: [], activities: {}, name: '', evidence: '' };
    },
  );
  const months = monthNames.map((name, index) => ({
    name,
    dates: monthSaturdays(state.year, index + 1).map((date) => ({
      date,
      included: state.events.some(
        (event) => event.kind === 'include' && event.start <= date && date <= event.end,
      ),
      impediments: events
        .filter((event) => event.kind === 'exclude' && event.start <= date && date <= event.end)
        .map((event) => event.name)
        .join('; '),
    })),
  }));
  const registered = new Set(
    months.flatMap((month) => month.dates.filter((item) => item.included).map((item) => item.date)),
  );
  const selected = values.dates.filter((date) => !registered.has(date)).sort();
  return (
    <form id="saturday-form" onSubmit={submit}>
      <fieldset disabled={readOnly || pending}>
        <p id="saturday-selection-help" className="help">
          Selecione um sábado para preencher a atividade e a fonte da decisão daquela data. Você
          pode preparar várias datas antes de adicioná-las. Só é possível incluir sábados dentro dos
          períodos letivos cadastrados.
        </p>
        <p id="saturday-summary" role="status" aria-live="polite">
          <strong>
            {selected.length}{' '}
            {selected.length === 1 ? 'sábado selecionado' : 'sábados selecionados'} para adicionar
          </strong>
          <span>
            {registered.size}{' '}
            {registered.size === 1 ? 'sábado já registrado' : 'sábados já registrados'}
          </span>
        </p>
        <form.Field name="dates">
          {(field) => (
            <fieldset id="saturday-dates">
              <legend>Sábados de {state.year}</legend>
              <table
                className="saturday-year-table"
                aria-describedby="saturday-selection-help saturday-date-legend"
              >
                <thead>
                  <tr>
                    <th scope="col">Mês</th>
                    <th scope="col">Sábados — dia do mês</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((month) => (
                    <tr key={month.name} className="saturday-month-row">
                      <th scope="row">{month.name}</th>
                      <td>
                        <div className="saturday-month-dates">
                          {month.dates.map(({ date, included, impediments }) => (
                            <label
                              className={`saturday-date ${included ? 'is-registered' : ''} ${impediments ? 'has-impediment' : ''}`}
                              key={date}
                            >
                              <span className="saturday-date-choice">
                                <input
                                  type="checkbox"
                                  name={field.name}
                                  value={date}
                                  aria-label={`${date.slice(-2)} de ${month.name.toLowerCase()} de ${state.year}${included ? ' · já registrado' : ''}${impediments ? ` · Não conta como dia letivo: ${impediments}` : ''}`}
                                  checked={included || field.state.value.includes(date)}
                                  disabled={included}
                                  onBlur={field.handleBlur}
                                  aria-controls={included ? undefined : `saturday-activity-${date}`}
                                  onChange={(event) => {
                                    if (event.target.checked) {
                                      const checkbox = event.currentTarget;
                                      form.setFieldValue(`activities.${date}`, {
                                        name: values.name,
                                        evidence: values.evidence,
                                      });
                                      field.handleChange([...field.state.value, date]);
                                      requestAnimationFrame(() => {
                                        // Preserve a field the person chose before this frame.
                                        if (document.activeElement === checkbox)
                                          document.getElementById(`saturday-name-${date}`)?.focus();
                                      });
                                    } else {
                                      field.handleChange(
                                        field.state.value.filter((item) => item !== date),
                                      );
                                      form.setFieldValue(
                                        'activities',
                                        Object.fromEntries(
                                          Object.entries(values.activities).filter(
                                            ([key]) => key !== date,
                                          ),
                                        ),
                                      );
                                    }
                                  }}
                                />
                                <span>{date.slice(-2)}</span>
                              </span>
                              {included && <small>Incluído</small>}
                              {impediments && (
                                <small title={impediments}>Não letivo: {impediments}</small>
                              )}
                            </label>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p id="saturday-date-legend" className="help">
                “Incluído” indica uma data já registrada. “Não letivo” mostra uma data que coincide
                com um impedimento identificado na grade. A atividade pode ser registrada, mas esse
                sábado não contará como dia letivo enquanto o impedimento permanecer. Para alterar
                ou remover uma data já incluída, use a etapa Atividades e datas do campus.
              </p>
            </fieldset>
          )}
        </form.Field>
        {selected.length > 0 && (
          <section className="saturday-activities" aria-labelledby="saturday-activities-title">
            <h4 id="saturday-activities-title">Atividades dos sábados selecionados</h4>
            <p id="saturday-evidence-help" className="help">
              Para cada data, identifique a atividade e o documento que a definiu, como uma
              resolução, portaria ou ata. Exemplo: Resolução nº 12/2026, de 15/10/2026.
            </p>
            {selected.map((date) => (
              <fieldset className="saturday-activity" id={`saturday-activity-${date}`} key={date}>
                <legend>Sábado, {date.split('-').reverse().join('/')}</legend>
                {months.flatMap((month) => month.dates).find((item) => item.date === date)
                  ?.impediments && (
                  <p className="help saturday-impediment">
                    Não conta como dia letivo:{' '}
                    {
                      months.flatMap((month) => month.dates).find((item) => item.date === date)
                        ?.impediments
                    }
                    . Confira esse impedimento na etapa Atividades e datas do campus.
                  </p>
                )}
                <div className="row-form">
                  <form.Field name={`activities.${date}.name`}>
                    {(field) => (
                      <Input
                        field={field}
                        label="Atividade"
                        id={`saturday-name-${date}`}
                        maxLength={160}
                        required
                      />
                    )}
                  </form.Field>
                  <form.Field name={`activities.${date}.evidence`}>
                    {(field) => (
                      <Input
                        field={field}
                        label="Fonte da decisão"
                        id={`saturday-evidence-${date}`}
                        aria-describedby="saturday-evidence-help"
                        maxLength={240}
                        required
                      />
                    )}
                  </form.Field>
                </div>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    form.setFieldValue(
                      'dates',
                      values.dates.filter((item) => item !== date),
                    );
                    form.setFieldValue(
                      'activities',
                      Object.fromEntries(
                        Object.entries(values.activities).filter(([key]) => key !== date),
                      ),
                    );
                    document
                      .querySelector<HTMLInputElement>(`#saturday-dates input[value="${date}"]`)
                      ?.focus();
                  }}
                >
                  Remover seleção de {date.split('-').reverse().join('/')}
                </button>
              </fieldset>
            ))}
          </section>
        )}
        <FormFeedback error={error} />
        <button type="submit" disabled={!selected.length}>
          Adicionar sábados selecionados
        </button>
      </fieldset>
    </form>
  );
}
