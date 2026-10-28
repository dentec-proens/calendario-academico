import { useEffect, useRef } from 'react';
import { categories } from '../../../../src/categories.ts';
import { modalityLabels } from '../../../../src/modalities.ts';
import { activityChecklist } from '../../../../src/obligations.ts';
import { applicabilityFor } from '../../../../src/calendar-rules/index.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useEventEditor } from './EventEditorProvider.tsx';
import { eventTypes, noticeActive, recordOffers } from './event-draft.ts';
import { Input, Select } from '../forms/fields.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';
import { scrollIntoView } from '../../../scroll.ts';
import { Button } from '../../../components/ui/Button.tsx';
import { FormActions } from '../../../shared/forms/FormActions.tsx';
import { Notice } from '../../../components/ui/Notice.tsx';

export default function EventEditor() {
  const { state, readOnly } = useCalendarEditor();
  const editor = useEventEditor();
  const { form, values } = editor;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!editor.open) return;
    const frame = requestAnimationFrame(() => {
      // Inside the side panel, keep the heading clear of the panel's sticky header.
      const panel = heading.current?.closest('dialog');
      const header = panel?.querySelector('.ui-panel-header');
      if (panel && header)
        panel.style.scrollPaddingTop = `${header.getBoundingClientRect().height + 8}px`;
      heading.current?.focus({ preventScroll: true });
      scrollIntoView(heading.current, { block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [editor.open, editor.context]);
  const checklist = activityChecklist(state);
  const requirement = checklist.find((item) => item.id === values.requirementId);
  const publication =
    (Boolean(values.admissionType) && noticeActive(values)) ||
    requirement?.variant === 'admission-notice';
  const realDate = values.publicationStatus === 'published';
  // Hours prove the annual minimum of training and planning; other activities do not ask.
  const showHours = !requirement || requirement.variant === 'hours' || Boolean(values.hours);
  // Creating from an activity card: the link, label and effect are already known.
  const activityCreation = editor.context?.kind === 'activity' && !editor.eventId;
  const showLink = !activityCreation || editor.linkUnlocked;
  const offers = recordOffers(state, requirement);
  const linkOptions = checklist.filter((item) => item.variant !== 'stage');
  const showRecordType =
    !values.requirementId ||
    Boolean(requirement?.acceptsPriorReference) ||
    values.recordType === 'prior-reference';
  const freeEvent = !values.requirementId && values.recordType !== 'prior-reference';
  const answered = eventTypes.find(
    (type) =>
      type.id === values.eventType &&
      type.kind === values.kind &&
      type.category === values.category,
  );
  // Effect and category chosen freely in an earlier edit are shown as they are.
  const askType = freeEvent && (!values.kind || Boolean(answered));
  const nameField = (
    <form.Field name="name">
      {(field) => (
        <Input field={field} label="Descrição" id="event-name" required maxLength={160} />
      )}
    </form.Field>
  );
  const categoryField = (
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
  );
  const kindField = (
    <form.Field name="kind">
      {(field) => (
        <Select
          field={field}
          label="Efeito na contagem"
          id="event-kind"
          required={!askType}
          disabled={values.recordType === 'prior-reference'}
        >
          <option value="">Escolha o efeito</option>
          <option value="exclude">Excluir dias · feriado ou recesso</option>
          <option value="include">Incluir dias · sábado ou reposição</option>
          <option value="note">Somente registrar · sem efeito</option>
        </Select>
      )}
    </form.Field>
  );
  const typeQuestion = (
    <form.Field name="eventType">
      {(field) => (
        <fieldset id="event-type" className="event-type">
          <legend>O que é este evento?</legend>
          {eventTypes.map((type, index) => (
            <label className="check" key={type.id}>
              <input
                type="radio"
                id={`event-type-${type.id}`}
                name={field.name}
                value={type.id}
                required={index === 0}
                checked={field.state.value === type.id}
                onChange={() => {
                  field.handleChange(type.id);
                  form.setFieldValue('kind', type.kind);
                  form.setFieldValue('category', type.category);
                }}
              />
              {type.label}
            </label>
          ))}
        </fieldset>
      )}
    </form.Field>
  );
  return (
    <form
      id="event-form"
      hidden={!editor.open}
      onSubmit={editor.submit}
      onInvalidCapture={(event) => {
        // Reveal a collapsed group so the browser can point at the invalid field.
        const group = (event.target as HTMLElement).closest('details');
        if (group && !group.open) group.open = true;
      }}
    >
      <h3 id="event-form-title" ref={heading} tabIndex={-1}>
        {editor.context?.kind === 'activity'
          ? editor.eventId
            ? 'Editar registro da atividade'
            : 'Novo registro da atividade'
          : editor.eventId
            ? 'Editar evento local'
            : 'Novo evento local'}
      </h3>
      <fieldset disabled={readOnly || editor.pending}>
        <fieldset className="event-fields">
          {activityCreation && (
            <div id="event-activity-header" className="event-activity-header">
              {/* The activity title is the card heading right above this form. */}
              <p>
                <strong>Vinculado a esta atividade</strong>
              </p>
              {!showLink && (
                <button
                  type="button"
                  id="change-event-link"
                  className="secondary"
                  onClick={() => {
                    editor.unlockLink();
                    // The button disappears; keep keyboard focus on the field it revealed.
                    requestAnimationFrame(() =>
                      document.getElementById('event-requirement')?.focus(),
                    );
                  }}
                >
                  Alterar vínculo
                </button>
              )}
            </div>
          )}
          {showLink && (
            <form.Field name="requirementId">
              {(field) => (
                <label>
                  Atividade vinculada
                  <select
                    name={field.name}
                    value={field.state.value}
                    onChange={(event) => editor.changeRequirement(event.target.value)}
                    id="event-requirement"
                  >
                    <option value="">Sem vínculo (evento do campus)</option>
                    {linkOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </form.Field>
          )}
          {showRecordType && (
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
          )}
          {values.recordType === 'prior-reference' && (
            <Notice tone="info">
              Referência anterior, somente informativa. Não comprova dias, horas, férias ou
              avaliações do ano atual. Informe as datas reais; uma publicação anterior precisa estar
              realizada.
            </Notice>
          )}
          <form.Field name="modalities">
            {(field) => {
              // Offers already chosen stay visible so a legacy scope can be corrected.
              const choices = state.modalities.filter(
                (modality) => offers.includes(modality) || field.state.value.includes(modality),
              );
              return choices.length === 1 && field.state.value.join() === choices.join() ? (
                <p id="event-modalities" className="event-scope">
                  <strong>Oferta abrangida:</strong> {modalityLabels[choices[0]]}
                </p>
              ) : (
                <fieldset id="event-modalities" className="event-scope">
                  <legend>Ofertas abrangidas</legend>
                  {choices.map((modality) => (
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
                      {requirement &&
                      offers.includes(modality) &&
                      applicabilityFor(state, requirement, modality) === 'required'
                        ? ' (obrigatória)'
                        : ''}
                    </label>
                  ))}
                </fieldset>
              );
            }}
          </form.Field>
          {activityCreation ? (
            <details id="event-more-options" className="event-more-options">
              <summary>Mais opções: descrição, categoria e efeito</summary>
              <div className="row-form">
                {nameField}
                {categoryField}
                {kindField}
              </div>
            </details>
          ) : askType ? (
            <>
              <div className="row-form">{nameField}</div>
              {typeQuestion}
              <details id="event-more-options" className="event-more-options">
                <summary>Mais opções: categoria e efeito</summary>
                <div className="row-form">
                  {categoryField}
                  {kindField}
                </div>
              </details>
            </>
          ) : (
            <div className="row-form">
              {nameField}
              {categoryField}
              {kindField}
            </div>
          )}
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
              Art. 3º, § 2º: classifique o feriado municipal ou recesso correspondente. A política
              confere os prazos afetados por oferta e preserva as datas reais das atividades.
            </p>
          )}
          {(publication ||
            values.eventType === 'notice' ||
            (!askType &&
              !values.requirementId &&
              ['prazo', 'evento', 'institucional'].includes(values.category))) && (
            <form.Field name="admissionType">
              {(field) => (
                <Select
                  field={field}
                  label="Tipo de edital (quando aplicável)"
                  id="event-admission-type"
                  required={values.eventType === 'notice' && !values.requirementId}
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
                  preenche a data de publicação. Cronograma ajustado pela Proens exige conferência
                  institucional.
                </Notice>
              )}
              {values.admissionType === 'transfer' && (
                <p className="help">
                  Art. 11, VIII: publicação antes do início do período de destino. Vincule o período
                  correspondente quando ele já estiver cadastrado.
                </p>
              )}
              <details>
                <summary>Informar ajuste do prazo</summary>
                <p>
                  O registro pelo campus não representa autorização da Proens. A revisão
                  institucional confere sua origem.
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
            {showHours && (
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
          </div>
        </fieldset>
        <FormFeedback error={editor.error} />
        <FormActions preserveOnClose={editor.dirty}>
          <Button type="submit">
            {editor.eventId ? 'Aplicar alterações' : 'Adicionar evento'}
          </Button>
          {editor.dirty && (
            <Button id="discard-event-form" variant="secondary" onClick={editor.discard}>
              Descartar alterações
            </Button>
          )}
        </FormActions>
      </fieldset>
    </form>
  );
}
