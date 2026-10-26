import { useEffect, useMemo, useRef } from 'react';
import { categories } from '../../../../src/categories.ts';
import { modalityLabels } from '../../../../src/modalities.ts';
import { activityChecklist, stageRequirement } from '../../../../src/obligations.ts';
import {
  isFirstStageStart,
  suggestStages,
  suggestStageEnd,
} from '../../../../src/stage-suggestions.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useEventEditor } from './EventEditorProvider.tsx';
import { Check, Input, Select } from '../forms/fields.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';
import { scrollIntoView } from '../../../scroll.ts';

export default function EventEditor() {
  const { state, events, readOnly } = useCalendarEditor();
  const editor = useEventEditor();
  const { form, values } = editor;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!editor.open) return;
    const frame = requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      scrollIntoView(heading.current, { block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [editor.open, editor.context]);
  const stage =
    stageRequirement(values.requirementId) ||
    (!values.requirementId && isFirstStageStart(values.name));
  const suggestion = useMemo(() => {
    if (!stage || editor.eventId || !values.start) return null;
    try {
      const scoped = { ...state, modalities: values.modalities, offer: values.modalities[0] };
      const number = Number(values.requirementId.match(/^stage-([1-4])/)?.[1] || 1);
      if (
        number === 1 &&
        !events.some(
          (event) =>
            stageRequirement(event.requirementId) &&
            (!event.modalities?.length ||
              event.modalities.some((item) => values.modalities.includes(item))),
        )
      ) {
        const result = suggestStages(scoped, events, values.start);
        return { end: result.stages[0].end, stages: result.stages, error: '' };
      }
      const result = suggestStageEnd(scoped, events, values.start, number);
      return { end: result.end, stages: [], error: '' };
    } catch (error) {
      return {
        end: '',
        stages: [],
        error: error instanceof Error ? error.message : 'Confira os períodos e as ofertas.',
      };
    }
  }, [editor.eventId, events, stage, state, values.modalities, values.requirementId, values.start]);
  useEffect(() => {
    if (suggestion?.end && form.state.values.end !== suggestion.end)
      form.setFieldValue('end', suggestion.end);
  }, [form, suggestion?.end]);
  return (
    <form
      id="event-form"
      hidden={!editor.open}
      onSubmit={editor.submit}
      className={
        editor.context?.kind === 'history' || editor.context?.kind === 'activity'
          ? 'inline-history-review'
          : undefined
      }
    >
      <h3 id="event-form-title" ref={heading} tabIndex={-1}>
        {editor.eventId ? 'Editar evento local' : 'Novo evento local'}
      </h3>
      <p id="historical-event-source" className="notice" hidden={!editor.source}>
        {editor.source
          ? `Origem histórica: página ${editor.source.page}. Confira a descrição, informe as datas de ${state.year} e a fonte vigente. O PDF anterior não comprova a vigência do feriado.`
          : ''}
      </p>
      <fieldset disabled={readOnly || editor.pending}>
        <legend>Forma de oferta/nível deste evento</legend>
        <form.Field name="modalities">
          {(field) => (
            <div id="event-modalities">
              {state.modalities.map((modality) => (
                <label className="check" key={modality}>
                  <input
                    type="checkbox"
                    name="event-modality"
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
            </div>
          )}
        </form.Field>
        <form.Field name="requirementId">
          {(field) => (
            <label>
              Atividade do roteiro
              <select
                name={field.name}
                value={field.state.value}
                onChange={(event) => editor.changeRequirement(event.target.value)}
                id="event-requirement"
              >
                <option value="">Outro evento / sem vínculo</option>
                {activityChecklist(state).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </form.Field>
        <div className="row-form">
          <form.Field name="name">
            {(field) => (
              <Input field={field} label="Descrição" id="event-name" required maxLength={160} />
            )}
          </form.Field>
          <form.Field name="category">
            {(field) => (
              <Select field={field} label="Categoria e cor PROENS" id="event-category">
                {categories.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </form.Field>
          <form.Field name="kind">
            {(field) => (
              <Select field={field} label="Efeito na contagem" id="event-kind">
                <option value="exclude">Excluir dias · feriado ou recesso</option>
                <option value="include">Incluir dias · sábado ou reposição</option>
                <option value="note">Somente registrar · sem efeito</option>
              </Select>
            )}
          </form.Field>
        </div>
        <div className="row-form">
          <form.Field name="start">
            {(field) => (
              <Input field={field} label="Início" id="event-start" type="date" required />
            )}
          </form.Field>
          <form.Field name="end">
            {(field) => <Input field={field} label="Término" id="event-end" type="date" required />}
          </form.Field>
          {!stage && (
            <form.Field name="hours">
              {(field) => (
                <Input
                  field={field}
                  label="Carga horária do evento (horas, quando aplicável)"
                  id="event-hours"
                  type="number"
                  min="0.01"
                  max="8784"
                  step="0.01"
                />
              )}
            </form.Field>
          )}
          <form.Field name="evidence">
            {(field) => (
              <Input
                field={field}
                label="Fonte ou decisão"
                id="event-evidence"
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
              id="event-confirmed"
              required
              label="Confirmo as datas, a fonte e a aplicação à oferta selecionada."
            />
          )}
        </form.Field>
        <FormFeedback error={editor.error} />
        <p className="help">
          Fechar mantém o preenchimento para continuar depois. Cancelar e descartar limpa somente as
          alterações ainda não aplicadas ao calendário.
        </p>
        <div className="actions">
          <button type="submit">
            {editor.eventId ? 'Aplicar alterações do evento' : 'Adicionar evento'}
          </button>
          <button type="button" id="close-event-form" className="secondary" onClick={editor.close}>
            Voltar à lista
          </button>
          <button
            type="button"
            id="discard-event-form"
            className="secondary"
            onClick={editor.discard}
          >
            Cancelar e descartar
          </button>
          {editor.context?.kind === 'history' || editor.context?.kind === 'activity' ? (
            <button
              id="cancel-inline-history"
              type="button"
              className="secondary"
              onClick={editor.close}
            >
              Fechar preenchimento
            </button>
          ) : null}
        </div>
        {stage && !editor.eventId && (
          <section id="stage-suggestion" className="notice" aria-live="polite">
            {!values.start
              ? 'Informe o início da etapa. O sistema usará o número de etapas cadastrado e os dias letivos até o final dos períodos.'
              : suggestion?.error || (
                  <>
                    <strong>Sugestão de distribuição das etapas</strong>
                    <p>
                      Confira as datas e a norma vigente antes de aplicar. Não representa aprovação
                      institucional.
                    </p>
                    <ul>
                      {suggestion?.stages.map((item) => (
                        <li key={item.requirementId}>
                          {item.name}: {item.start} a {item.end} — {item.days} dias letivos
                        </li>
                      ))}
                    </ul>
                    {suggestion?.stages.length ? (
                      <button
                        type="button"
                        id="apply-stage-suggestion"
                        onClick={editor.applyStages}
                      >
                        Aplicar todas as etapas sugeridas
                      </button>
                    ) : (
                      <p>Término sugerido: {suggestion?.end}</p>
                    )}
                  </>
                )}
          </section>
        )}
      </fieldset>
    </form>
  );
}
