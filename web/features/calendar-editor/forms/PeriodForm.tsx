import { editorPages } from '../editor-steps.ts';
import { useEffect, useRef } from 'react';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from './useCalendarForm.ts';
import { applyPeriod, removePeriod } from '../../../../src/calendar-edits/commands.ts';
import { durationEnd } from '../../../../src/duration.ts';
import { Input, Select } from './fields.tsx';
import { modalityLabels } from '../../../../src/modalities.ts';
import { organizationForModality, termLabels } from '../../../../src/calendar-rules/index.ts';
import type { AcademicTerm } from '../../../../src/domain-types.ts';
import type { Modality } from '../types.ts';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';
import { scrollIntoView } from '../../../scroll.ts';

export default function PeriodForm() {
  const name = useRef<HTMLInputElement>(null);
  const { state, session, events, institutional, readOnly, applyCommand } = useCalendarEditor();
  const empty = {
    id: '',
    name: '',
    start: '',
    end: '',
    days: '',
    modalities: [...state.modalities],
    term: (state.modalities.every(
      (modality) => organizationForModality(state, modality) === 'semestral',
    )
      ? 'first'
      : 'annual') as AcademicTerm,
  };
  const { form, values, submit, error } = useCalendarForm('period', empty, function apply(value) {
    session.apply((current) =>
      applyPeriod(
        current,
        {
          ...value,
          association: { status: 'defined', modalities: value.modalities, term: value.term },
        },
        institutional,
        () => crypto.randomUUID(),
      ),
    );
    return empty;
  });
  let preview = '';
  try {
    if (values.days && values.start)
      preview = durationEnd(
        values.start,
        values.days,
        {
          ...(state.weekConfirmed
            ? state
            : { ...state, weekConfirmed: true, weekdays: [1, 2, 3, 4, 5] }),
          modalities: values.modalities,
          offer: values.modalities[0],
        },
        events,
      );
  } catch (cause) {
    preview = cause instanceof Error ? cause.message : '';
  }
  useEffect(() => {
    if (values.days && /^\d{4}-\d{2}-\d{2}$/.test(preview) && form.state.values.end !== preview)
      form.setFieldValue('end', preview);
  }, [form, preview, values.days]);
  useEffect(() => {
    if (!values.id) return;
    const frame = requestAnimationFrame(() => {
      // A quick click or keystroke may already have moved focus into the form.
      if (document.activeElement?.closest('#period-form')) return;
      name.current?.focus({ preventScroll: true });
      scrollIntoView(name.current, { block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [values.id]);
  return (
    <>
      <ul id="period-list" className="records">
        {state.periods.length ? (
          state.periods.map((period) => (
            <li key={period.id}>
              <div>
                <strong>{period.name}</strong>
                <small>
                  {period.start} a {period.end}
                  {period.association?.status === 'defined'
                    ? ` · ${period.association.modalities.map((modality) => modalityLabels[modality]).join(', ')} · ${termLabels[period.association.term]}`
                    : ' · Associação a conferir'}
                  {period.targetDays
                    ? ` · Meta: ${period.targetDays} dias letivos · término automático`
                    : ''}
                </small>
              </div>
              <div className="actions">
                <button
                  type="button"
                  data-edit-period={period.id}
                  disabled={readOnly}
                  onClick={() =>
                    form.reset({
                      id: period.id,
                      name: period.name,
                      start: period.start,
                      end: period.end,
                      days: period.targetDays ? String(period.targetDays) : '',
                      modalities:
                        period.association?.status === 'defined'
                          ? state.modalities.filter(
                              (modality) =>
                                period.association?.status === 'defined' &&
                                period.association.modalities.includes(modality),
                            )
                          : [],
                      term:
                        period.association?.status === 'defined'
                          ? period.association.term
                          : 'annual',
                    })
                  }
                >
                  Editar período
                </button>
                <button
                  type="button"
                  data-remove-period={period.id}
                  disabled={readOnly}
                  onClick={() => {
                    if (
                      applyCommand((current) => removePeriod(current, period.id, institutional)) &&
                      values.id === period.id
                    )
                      form.reset(empty);
                  }}
                >
                  Remover
                </button>
              </div>
            </li>
          ))
        ) : (
          <li className="help">Nenhum período cadastrado.</li>
        )}
      </ul>
      <form id="period-form" className="row-form" onSubmit={submit}>
        <fieldset disabled={readOnly}>
          <form.Field name="modalities">
            {(field) => (
              <fieldset>
                <legend>Ofertas deste período</legend>
                {state.modalities.map((modality: Modality) => (
                  <label className="check" key={modality}>
                    <input
                      type="checkbox"
                      value={modality}
                      checked={field.state.value.includes(modality)}
                      onChange={(event) =>
                        field.handleChange(
                          event.target.checked
                            ? [...field.state.value, modality]
                            : field.state.value.filter((item) => item !== modality),
                        )
                      }
                    />
                    {modalityLabels[modality]}
                  </label>
                ))}
              </fieldset>
            )}
          </form.Field>
          <form.Field name="term">
            {(field) => (
              <Select field={field} label="Identidade do ciclo/período" id="period-term">
                <option value="annual">Ciclo anual</option>
                <option value="first">Primeiro semestre</option>
                <option value="second">Segundo semestre</option>
              </Select>
            )}
          </form.Field>
          <form.Field name="name">
            {(field) => (
              <Input
                field={field}
                label="Nome"
                id="period-name"
                ref={name}
                required
                maxLength={80}
              />
            )}
          </form.Field>
          <form.Field name="start">
            {(field) => (
              <Input field={field} label="Início" id="period-start" type="date" required />
            )}
          </form.Field>
          <form.Field name="days">
            {(field) => (
              <Input
                field={field}
                label="Quantidade de dias letivos (opcional)"
                id="period-days"
                type="number"
                min="1"
                max="366"
                step="1"
              />
            )}
          </form.Field>
          <form.Field name="end">
            {(field) => (
              <Input
                field={field}
                label="Término"
                id="period-end"
                type="date"
                required={!values.days}
                readOnly={Boolean(values.days)}
              />
            )}
          </form.Field>
          <button id="period-submit" type="submit">
            {values.id ? 'Aplicar alterações do período' : 'Adicionar período'}
          </button>
          <button
            id="cancel-period-edit"
            type="button"
            className="secondary"
            hidden={!values.id}
            onClick={() => {
              form.reset(empty);
              name.current?.focus({ preventScroll: true });
              scrollIntoView(name.current, { block: 'start' });
            }}
          >
            Cancelar edição
          </button>
          <FormFeedback error={error} />
        </fieldset>
      </form>
      <p id="period-duration-status" role="status">
        {preview
          ? `${state.weekConfirmed ? '' : `Estimativa provisória. Confirme e aplique a semana letiva em ${editorPages.edit.title}. `}Término previsto: ${preview}`
          : 'Informe início e quantidade para sugerir o término usando os impedimentos já registrados.'}
      </p>
      <p id="period-auto-status" role="status">
        {state.periods.some((period) => period.targetDays)
          ? 'Metas de dias letivos ativas: términos recalculados ao alterar os impedimentos.'
          : ''}
      </p>
    </>
  );
}
