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
import { Notice } from '../../../components/ui/Notice.tsx';

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
  const publication =
    Boolean(values.admissionType) ||
    values.requirementId.startsWith('admission-notice-') ||
    values.requirementId === 'regular-admission-notice';
  const realDate = values.publicationStatus === 'published';
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
      <Notice tone="info" id="historical-event-source" hidden={!editor.source}>
        {editor.source
          ? `Origem histórica: página ${editor.source.page}. ${values.recordType === 'prior-reference' ? 'Conserve as datas reais e confirme a pertinência documental. A referência não altera os dias letivos.' : 'Prepare uma nova ocorrência com datas e fonte próprias; o PDF anterior não comprova sua vigência.'}`
          : ''}
      </Notice>
      {editor.source && values.historyWarning && (
        <Notice tone="warning" id="historical-event-date-warning">
          {values.historyWarning}
        </Notice>
      )}
      <fieldset disabled={readOnly || editor.pending}>
        <form.Field name="recordType">
          {(field) => (
            <label>
              Intenção do registro
              <select
                id="event-record-type"
                name={field.name}
                value={field.state.value}
                onChange={(event) => {
                  const type =
                    event.target.value === 'prior-reference' ? 'prior-reference' : 'event';
                  field.handleChange(type);
                  if (type === 'prior-reference') form.setFieldValue('kind', 'note');
                }}
              >
                <option value="event">Registrar atividade deste calendário</option>
                <option value="prior-reference">Referenciar fato anterior</option>
              </select>
            </label>
          )}
        </form.Field>
        {values.recordType === 'prior-reference' && (
          <Notice tone="info">
            Referência anterior comprovada, somente informativa. Não comprova dias, horas, férias ou
            avaliações do ano atual. Informe datas reais e fonte; uma publicação anterior precisa
            estar realizada.
          </Notice>
        )}
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
              <Select
                field={field}
                label="Efeito na contagem"
                id="event-kind"
                required
                disabled={values.recordType === 'prior-reference'}
              >
                <option value="">Escolha o efeito</option>
                <option value="exclude">Excluir dias · feriado ou recesso</option>
                <option value="include">Incluir dias · sábado ou reposição</option>
                <option value="note">Somente registrar · sem efeito</option>
              </Select>
            )}
          </form.Field>
        </div>
        {(values.kind === 'exclude' || values.deadlineExtensionCause) && (
          <form.Field name="deadlineExtensionCause">
            {(field) => (
              <Select
                field={field}
                id="event-deadline-extension-cause"
                label="Prorrogação de prazos por motivo municipal"
              >
                <option value="">Sem prorrogação municipal vinculada</option>
                <option value="municipal-holiday">Feriado municipal</option>
                <option value="municipal-recess">Recesso decorrente de feriado municipal</option>
              </Select>
            )}
          </form.Field>
        )}
        {values.deadlineExtensionCause && (
          <p className="help">
            Art. 3º, § 2º: identifique na fonte o feriado municipal ou recesso correspondente. A
            política confere os prazos afetados por oferta e preserva as datas reais das atividades.
          </p>
        )}
        {(publication ||
          (!values.requirementId &&
            ['prazo', 'evento', 'institucional'].includes(values.category))) && (
          <form.Field name="admissionType">
            {(field) => (
              <Select
                field={field}
                label="Tipo de edital (quando aplicável)"
                id="event-admission-type"
              >
                <option value="">Não é edital de ingresso / classificação pendente</option>
                <option value="regular">Processo seletivo regular</option>
                <option value="transfer">Transferência, reingresso e portador de diploma</option>
              </Select>
            )}
          </form.Field>
        )}
        {publication && (
          <section className="event-publication" aria-label="Finalidade e situação do edital">
            <p className="help">
              O ingresso pode ocorrer em outro ano. Informe a data da publicação e identifique a
              turma/período a que o edital se refere.
            </p>
            <div className="row-form">
              <form.Field name="publicationStatus">
                {(field) => (
                  <Select
                    field={field}
                    id="event-publication-status"
                    label="Situação da publicação"
                    required
                  >
                    <option value="">Selecione</option>
                    <option value="planned">Publicação prevista</option>
                    <option value="published">Publicação realizada</option>
                  </Select>
                )}
              </form.Field>
              <form.Field name="admissionYear">
                {(field) => (
                  <Input
                    field={field}
                    id="event-admission-year"
                    label="Ano de ingresso"
                    type="number"
                    min="1900"
                    max="9999"
                    step="1"
                    required
                  />
                )}
              </form.Field>
              <form.Field name="admissionTerm">
                {(field) => (
                  <Select
                    field={field}
                    id="event-admission-term"
                    label="Período de ingresso"
                    required
                  >
                    <option value="annual">Ciclo anual</option>
                    <option value="first">Primeiro semestre</option>
                    <option value="second">Segundo semestre</option>
                  </Select>
                )}
              </form.Field>
              <form.Field name="admissionPeriodId">
                {(field) => (
                  <Select
                    field={field}
                    id="event-admission-period"
                    label="Vínculo ao período cadastrado"
                  >
                    <option value="">Ingresso futuro / período ainda não cadastrado</option>
                    {state.periods.map((period) => (
                      <option key={period.id} value={period.id}>
                        {period.name} — {period.start.split('-').reverse().join('/')}
                      </option>
                    ))}
                  </Select>
                )}
              </form.Field>
            </div>
            {values.admissionType === 'regular' && state.year === 2027 && (
              <Notice tone="info">
                Art. 10: publicação do processo seletivo de 2028 até 15/06/2027. O prazo não
                preenche a data de publicação. Cronograma ajustado pela Proens exige fonte e
                conferência institucional.
              </Notice>
            )}
            {values.admissionType === 'transfer' && (
              <p className="help">
                Art. 11, VIII: publicação antes do início do período de destino. Vincule o período
                correspondente quando ele já estiver cadastrado.
              </p>
            )}
            <details>
              <summary>Informar fonte de ajuste do prazo</summary>
              <p>
                O registro pelo campus não representa autorização da Proens. A revisão institucional
                confere sua origem.
              </p>
              <form.Field name="adjustedDeadline">
                {(field) => (
                  <Input
                    field={field}
                    id="event-adjusted-deadline"
                    label="Prazo ajustado"
                    type="date"
                  />
                )}
              </form.Field>
              <form.Field name="adjustmentEvidence">
                {(field) => (
                  <Input
                    field={field}
                    id="event-adjustment-evidence"
                    label="Fonte do cronograma ajustado"
                    maxLength={240}
                  />
                )}
              </form.Field>
            </details>
          </section>
        )}
        <div className="row-form">
          <form.Field name="start">
            {(field) => (
              <Input
                field={field}
                label={
                  publication
                    ? realDate
                      ? 'Data real de início da publicação'
                      : 'Data prevista de início da publicação'
                    : 'Início'
                }
                id="event-start"
                type="date"
                required
              />
            )}
          </form.Field>
          <form.Field name="end">
            {(field) => (
              <Input
                field={field}
                label={
                  publication
                    ? realDate
                      ? 'Data real de término da publicação'
                      : 'Data prevista de término da publicação'
                    : 'Término'
                }
                id="event-end"
                type="date"
                required
              />
            )}
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
          <Notice
            as="section"
            id="stage-suggestion"
            tone={values.start && suggestion?.error ? 'warning' : 'info'}
            aria-live="polite"
          >
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
          </Notice>
        )}
      </fieldset>
    </form>
  );
}
