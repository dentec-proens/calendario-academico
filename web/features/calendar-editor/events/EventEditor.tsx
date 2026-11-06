import { compactDate } from '#src/domain/date-labels.ts';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { categories } from '#src/domain/calendar/activities/categories.ts';
import { CategoryMark } from '../../../components/ui/CategoryMark.tsx';
import { offerIds, labelFor } from '#src/domain/calendar/offers.ts';
import { generatedActivities, generatedActivity } from '#src/domain/calendar/activities/links.ts';
import { activityKey } from '#src/domain/calendar/activities/activity-ref.ts';
import { applicabilityFor, policyFor } from '#src/domain/policies/registry.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import EventDateCalendar from './EventDateCalendar.tsx';
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
import {
  canBeInternal,
  internalDateIssue,
  internalDateOption,
} from '#src/domain/calendar/internal-dates.ts';
import { Check, Input, Select } from '../forms/fields.tsx';
import { ChoiceGroup } from '../../../components/ui/ChoiceGroup.tsx';
import { countEffects, meetingEffects } from '../../../shared/count-effects.ts';
import {
  schoolDayIssue,
  schoolDayNature,
  underNorm,
} from '#src/domain/calendar/activities/school-day.ts';
import type { EventEffect } from '#src/domain/calendar/model.ts';
import type { CivilDate } from '#src/domain/civil-date.ts';
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
const meetingLabels = { ...effectLabels, exclude: 'Aulas suspensas', note: 'Aulas mantidas' };

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
  const requirement = generatedActivity(generatedActivities(state), editor.activity);
  const publication =
    (Boolean(values.admissionType) && noticeActive(values)) ||
    requirement?.variant === 'admission-notice';
  const realDate = values.publicationStatus === 'published';
  // The form edits one destination common to every offer; distinct destinations saved by offer
  // can only be kept, and each offer is diagnosed on its own.
  const saved = editor.eventId
    ? state.events.find((event) => event.id === editor.eventId)
    : undefined;
  const distinctSaved =
    commonDestination(
      saved?.notice?.admission?.destinations ?? [],
      saved ? saved.offers : offerIds(state),
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
  const freeEvent = !editor.activity;
  const answered = eventTypes.find(
    (type) =>
      type.id === values.eventType &&
      type.effect === values.effect &&
      type.category === values.category,
  );
  // Effect and category chosen freely in an earlier edit are shown as they are.
  const askType = freeEvent && (!values.effect || Boolean(answered));
  // An internal date (art. 18) is offered only while effect and category allow it; changing to an
  // incompatible one unmarks it, with a notice, before the date is applied.
  const internalAllowed = canBeInternal({
    effect: values.effect,
    category: values.category,
    activity: editor.activity,
  });
  const [unmarked, setUnmarked] = useState<{ context: unknown; reason: string } | null>(null);
  const unmarkedReason = unmarked?.context === editor.context ? unmarked.reason : undefined;
  function keepInternalEligible(next: { effect: string; category: string }) {
    if (!form.getFieldValue('internal')) return;
    const reason = internalDateIssue({ ...next, activity: editor.activity });
    if (!reason) return;
    form.setFieldValue('internal', false);
    setUnmarked({ context: editor.context, reason });
  }
  const nameField = (
    <form.Field name="name">
      {(field) => (
        <Input field={field} label="Descrição" id="event-name" required maxLength={160} />
      )}
    </form.Field>
  );
  const categoryField = (
    <form.Field
      name="category"
      listeners={{
        onChange: ({ value }) =>
          keepInternalEligible({ effect: form.getFieldValue('effect'), category: value }),
      }}
    >
      {(field) => (
        <ChoiceGroup
          id="event-category"
          className="event-category"
          label="Categoria na legenda PROENS"
          value={field.state.value || null}
          disabled={readOnly || editor.pending}
          options={categories.map(([id, label, color]) => ({
            value: id,
            label: (
              <span className="category-mark">
                <span
                  className={
                    color
                      ? 'category-mark__swatch'
                      : 'category-mark__swatch category-mark__swatch--none'
                  }
                  style={color ? ({ '--category-color': color } as CSSProperties) : undefined}
                  aria-hidden="true"
                />
                {label}
              </span>
            ),
          }))}
          onValueChange={field.handleChange}
        />
      )}
    </form.Field>
  );
  // Art. 5º: a meeting keeps or suspends the day's classes; a deadline never adds days.
  // Offers outside the norm (excluded or under their own regulation) keep every effect.
  const nature = underNorm(state, values.offers)
    ? schoolDayNature(state.year, {
        activity: editor.activity,
        category: values.category,
        effect: values.effect as EventEffect,
      })
    : undefined;
  const effectOptions =
    nature === 'meeting'
      ? meetingEffects
      : nature === 'deadline'
        ? countEffects.filter(({ value }) => value !== 'include')
        : countEffects;
  const basis = policyFor(state.year).schoolDay?.basis;
  // A saved or switched `include` the rule no longer offers: shown, not changed silently.
  const effectIssue =
    nature &&
    schoolDayIssue(state, {
      name: values.name.trim() || 'A data',
      activity: editor.activity,
      category: values.category,
      effect: values.effect as EventEffect,
      offers: values.offers,
      start: values.start as CivilDate,
      end: values.end as CivilDate,
    });
  const effectField = (
    <form.Field
      name="effect"
      listeners={{
        onChange: ({ value }) =>
          keepInternalEligible({ effect: value, category: form.getFieldValue('category') }),
      }}
    >
      {(field) => (
        <ChoiceGroup<EventEffect>
          id="event-effect"
          className="ui-choice-described event-effect"
          label={nature === 'meeting' ? 'Aulas nesse dia' : 'Efeito na contagem'}
          value={field.state.value || null}
          disabled={readOnly || editor.pending}
          options={effectOptions.map(({ value, title, description }) => ({
            value,
            label: (
              <>
                <strong>{title}</strong>
                <small>{description}</small>
              </>
            ),
          }))}
          onValueChange={field.handleChange}
        />
      )}
    </form.Field>
  );
  const schoolDayHelp =
    nature === 'meeting' || nature === 'deadline' ? (
      <p className="help" id="event-school-day-help">
        {nature === 'meeting'
          ? 'Sem a efetiva participação de estudantes, a atividade não constitui dia letivo'
          : 'Prazos e marcos não constituem dia letivo'}{' '}
        ({basis}).{' '}
        {nature === 'meeting'
          ? 'Em dia de aula, as aulas são mantidas, salvo se o campus as suspender para a atividade. Se a suspensão valer para todo o campus, cadastre outra data.'
          : 'A data não acrescenta dias à contagem.'}
      </p>
    ) : null;
  const typeQuestion = (
    <form.Field name="eventType">
      {(field) => (
        <fieldset id="event-type" className="event-type event-section">
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
                  keepInternalEligible(type);
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
    <form id="event-form" hidden={!editor.open} onSubmit={editor.submit}>
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
          {!activityRecord && editor.activity && (
            <p className="help" id="event-kept-link">
              Atividade vinculada: <code>{activityKey(editor.activity)}</code> (preservada; somente
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
          <EventDateCalendar
            start={values.start}
            end={values.end}
            eventId={editor.eventId}
            onChange={(range) => {
              form.setFieldValue('start', range.start);
              form.setFieldValue('end', range.end);
            }}
          />
          <div className="row-form">{nameField}</div>
          <form.Field name="offers">
            {(field) => {
              // Offers already chosen stay visible so a legacy list can be corrected.
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
              <span className="event-more-heading">
                <span className="event-more-title">Categoria e efeito</span>
                {/* Only while closed: open, the fields themselves show both values. */}
                <span className="event-more-summary">
                  {values.category ? (
                    <CategoryMark event={{ category: values.category }} withLabel />
                  ) : (
                    'Sem categoria'
                  )}{' '}
                  ·{' '}
                  {values.effect ? (
                    (nature === 'meeting' ? meetingLabels : effectLabels)[
                      values.effect as keyof typeof effectLabels
                    ]
                  ) : (
                    <span className="event-more-pending">Efeito a definir</span>
                  )}
                </span>
              </span>
              <ChevronDown className="event-more-chevron" aria-hidden="true" />
            </summary>
            <div className="event-more-fields">
              {categoryField}
              {effectField}
              {schoolDayHelp}
            </div>
          </details>
          {effectIssue && (
            <Notice tone="warning" id="event-school-day-issue" title="Efeito a corrigir">
              {effectIssue} Escolha outro efeito em Categoria e efeito.
            </Notice>
          )}
          {freeEvent && internalAllowed && (
            <form.Field
              name="internal"
              listeners={{ onChange: ({ value }) => value && setUnmarked(null) }}
            >
              {(field) => (
                <div className="event-internal">
                  <Check
                    field={field}
                    id="event-internal"
                    label={internalDateOption}
                    aria-describedby="event-internal-help"
                  />
                  <p className="help" id="event-internal-help">
                    Data de organização interna do campus: aparece no editor com o selo Interna, mas
                    fica fora do calendário oficial e das evidências do parecer.
                  </p>
                </div>
              )}
            </form.Field>
          )}
          {unmarkedReason && !values.internal && (
            <Notice
              tone="warning"
              id="event-internal-unmarked"
              title="Data interna desmarcada"
              onDismiss={() => setUnmarked(null)}
            >
              {unmarkedReason} A data passa a constar do calendário oficial.
            </Notice>
          )}
          {/* A municipal holiday or recess is a date of the campus, never an activity or meeting. */}
          {((values.effect === 'exclude' && !editor.activity && nature !== 'meeting') ||
            values.deadlineExtensionCause) && (
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
              !editor.activity &&
              ['prazo', 'evento', 'institucional'].includes(values.category))) && (
            <form.Field name="admissionType">
              {(field) => (
                <Select
                  field={field}
                  label="Tipo de edital (quando aplicável)"
                  id="event-admission-type"
                  required={values.eventType === 'notice' && !editor.activity}
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
                          {period.name} — {compactDate(period.start, state.year)}
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
        {/* The refusal repeats “Efeito a corrigir”, already shown above the fields. */}
        <FormFeedback
          error={
            effectIssue && editor.error === effectIssue
              ? 'Corrija o efeito indicado em “Efeito a corrigir”.'
              : editor.error
          }
        />
        <FormActions>
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
