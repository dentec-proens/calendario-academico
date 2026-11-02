import { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { categories } from '#src/domain/calendar/activities/categories.ts';
import { offerIds, labelFor } from '#src/domain/calendar/offers.ts';
import { activityPlan } from '#src/domain/calendar/activities/plan.ts';
import { applicabilityFor, policyFor } from '#src/domain/policies/registry.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useEventEditor } from './EventEditorProvider.tsx';
import {
  commonDestination,
  draftDestinations,
  eventTypes,
  keptDestinations,
  noticeActive,
  recordOffers,
} from './event-draft.ts';
import { destinationIssueLines, destinationText } from './notice-details.ts';
import { Input, Select } from '../forms/fields.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';
import { scrollIntoView } from '../../../scroll.ts';
import { Button } from '../../../components/ui/Button.tsx';
import { FormActions } from '../../../shared/forms/FormActions.tsx';
import { Notice } from '../../../components/ui/Notice.tsx';

const effectLabels = {
  exclude: 'Exclui dias letivos',
  include: 'Inclui dias letivos',
  note: 'Sem efeito na contagem',
};

export default function EventEditor() {
  const { state, readOnly } = useCalendarEditor();
  const regularAdmissionNotice = policyFor(state.year).notices?.regularAdmission;
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
  const checklist = activityPlan(state);
  const requirement = checklist.find((item) => item.id === values.requirementId);
  const publication =
    (Boolean(values.admissionType) && noticeActive(values)) ||
    requirement?.variant === 'admission-notice';
  const realDate = values.publicationStatus === 'published';
  // The form edits one destination common to every offer; distinct destinations saved by offer
  // can only be kept, and each offer is diagnosed on its own (plan, section 5.4).
  const saved = editor.eventId
    ? state.events.find((event) => event.id === editor.eventId)
    : undefined;
  const distinctSaved =
    commonDestination(
      saved?.notice?.admission?.destinations ?? [],
      saved?.offers?.length ? saved.offers : offerIds(state),
    ) === keptDestinations;
  const destinations = publication ? draftDestinations(values, saved) : [];
  const destinationIssues = destinationIssueLines(state, {
    offers: values.offers,
    notice: {
      admission: {
        type: values.admissionType || 'regular',
        year: Number(values.admissionYear),
        term: values.admissionTerm,
        destinations,
      },
    },
  });
  // Hours prove the annual minimum of training and planning; other activities do not ask.
  const showHours = !requirement || requirement.variant === 'hours' || Boolean(values.hours);
  // Inside an activity the link is fixed: the panel was opened from that activity.
  const activityRecord = editor.context?.kind === 'activity';
  const offers = recordOffers(state, requirement);
  const freeEvent = !values.requirementId;
  const answered = eventTypes.find(
    (type) =>
      type.id === values.eventType &&
      type.effect === values.effect &&
      type.category === values.category,
  );
  // Effect and category chosen freely in an earlier edit are shown as they are.
  const askType = freeEvent && (!values.effect || Boolean(answered));
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
  const effectField = (
    <form.Field name="effect">
      {(field) => (
        <Select field={field} label="Efeito na contagem" id="event-effect" required={!askType}>
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
                  form.setFieldValue('effect', type.effect);
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
      {activityRecord && (
        <button
          type="button"
          id="back-to-activity"
          className="link-button event-back"
          disabled={editor.pending}
          onClick={editor.backToActivity}
        >
          <ArrowLeft size={16} aria-hidden="true" /> Voltar à atividade
        </button>
      )}
      <h3 id="event-form-title" ref={heading} tabIndex={-1}>
        {editor.eventId ? 'Editar data' : activityRecord ? 'Adicionar data' : 'Nova data do campus'}
      </h3>
      <fieldset disabled={readOnly || editor.pending}>
        <fieldset className="event-fields">
          {/* The link comes from the context and is never edited here: a campus date has none,
              and a date kept with a link without generated activity shows it read-only. */}
          {!activityRecord && values.requirementId && (
            <p className="help" id="event-kept-link">
              Atividade vinculada: <code>{values.requirementId}</code> (preservada; somente
              leitura).
            </p>
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
                        : 'Data programada de início da publicação'
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
                        : 'Data programada de término da publicação'
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
          <div className="row-form">{nameField}</div>
          <form.Field name="offers">
            {(field) => {
              // Offers already chosen stay visible so a legacy scope can be corrected.
              const choices = offerIds(state).filter(
                (modality) => offers.includes(modality) || field.state.value.includes(modality),
              );
              return choices.length === 1 && field.state.value.join() === choices.join() ? (
                <p id="event-modalities" className="event-scope">
                  <strong>Oferta abrangida:</strong> {labelFor(state, choices[0])}
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
                      {labelFor(state, modality)}
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
          {askType && typeQuestion}
          <details id="event-more-options" className="event-more-options">
            <summary>
              Categoria e efeito
              <span className="event-more-summary">
                {categories.find(([id]) => id === values.category)?.[1] ?? 'Sem categoria'} ·{' '}
                {effectLabels[values.effect as keyof typeof effectLabels] ?? 'Efeito a definir'}
              </span>
            </summary>
            <div className="row-form">
              {categoryField}
              {effectField}
            </div>
          </details>
          {(values.effect === 'exclude' || values.deadlineExtensionCause) && (
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
                      <option value="planned">Publicação programada</option>
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
                      {(field.state.value === keptDestinations || distinctSaved) && (
                        <option value={keptDestinations}>
                          Manter os destinos distintos por oferta
                        </option>
                      )}
                      {state.periods.map((period) => (
                        <option key={period.id} value={period.id}>
                          {period.name} — {period.start.split('-').reverse().join('/')}
                        </option>
                      ))}
                    </Select>
                  )}
                </form.Field>
              </div>
              {values.admissionPeriodId === keptDestinations && (
                <p className="help" id="event-admission-destinations">
                  {destinationText(state, destinations)}
                </p>
              )}
              {destinationIssues.length > 0 && (
                <Notice
                  tone="warning"
                  id="event-destination-issues"
                  title="Destino de ingresso a revisar"
                >
                  <ul>
                    {destinationIssues.map((issue) => (
                      <li key={issue.offerId}>{issue.text}</li>
                    ))}
                  </ul>
                </Notice>
              )}
              {values.admissionType === 'regular' && regularAdmissionNotice && (
                <Notice tone="info">{regularAdmissionNotice}</Notice>
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
        </fieldset>
        <FormFeedback error={editor.error} />
        <FormActions preserveOnClose={editor.dirty}>
          <Button type="submit">{editor.eventId ? 'Aplicar alterações' : 'Adicionar data'}</Button>
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
