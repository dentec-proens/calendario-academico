import { compactDate, longDate } from '#src/domain/date-labels.ts';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { categories } from '#src/domain/calendar/activities/categories.ts';
import { CategoryMark } from '../../../components/ui/CategoryMark.tsx';
import { offerIds, labelFor } from '#src/domain/calendar/offers.ts';
import { deadlineAdjustmentRefusal } from '#src/domain/calendar/activities/deadlines.ts';
import { generatedActivities, generatedActivity } from '#src/domain/calendar/activities/links.ts';
import { activityKey } from '#src/domain/calendar/activities/activity-ref.ts';
import { applicabilityFor, policyFor } from '#src/domain/policies/registry.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import ActivityRuleNote from './ActivityRuleNote.tsx';
import EventDateCalendar from './EventDateCalendar.tsx';
import { useEventEditor } from './EventEditorProvider.tsx';
import {
  draftDestinations,
  eventTypes,
  eventValues,
  destinationsByOffer,
  noticeActive,
  noticeAnswered,
  publicationDeadlineView,
  recordOffers,
} from './event-draft.ts';
import { destinationIssueLines } from './notice-details.ts';
import { periodsForOffer } from '#src/domain/calendar/organization/periods.ts';
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
import { PanelFooter } from '../../../components/ui/Panel.tsx';
import { Notice } from '../../../components/ui/Notice.tsx';

const effectLabels = {
  exclude: 'Exclui dias letivos',
  include: 'Inclui dias letivos',
  note: 'Sem efeito na contagem',
};
const meetingLabels = { ...effectLabels, exclude: 'Aulas suspensas', note: 'Aulas mantidas' };

export default function EventEditor() {
  const { state, readOnly, events } = useCalendarEditor();
  const regularAdmissionNotice = policyFor(state.year).notices?.regularAdmission;
  const editor = useEventEditor();
  const { form, values } = editor;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!editor.open) return;
    const frame = requestAnimationFrame(() => {
      // A date of the campus has the panel's own title; inside an activity the title names it.
      const title = heading.current ?? document.getElementById('event-panel-title');
      // Keep the heading clear of the panel's sticky top.
      const panel = title?.closest('dialog');
      const top = panel?.querySelector('.event-panel-top');
      if (panel && top)
        panel.style.scrollPaddingTop = `${top.getBoundingClientRect().height + 8}px`;
      title?.focus({ preventScroll: true });
      if (heading.current) scrollIntoView(heading.current, { block: 'start' });
      else if (panel) panel.scrollTop = 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [editor.open, editor.context]);
  const requirement = generatedActivity(generatedActivities(state), editor.activity);
  const publication =
    (Boolean(values.admissionType) && noticeActive(values)) ||
    requirement?.variant === 'admission-notice';
  const realDate = values.publicationStatus === 'published';
  // One destination common to every offer, or one period for each offer; each offer is
  // diagnosed on its own.
  const saved = editor.eventId
    ? state.events.find((event) => event.id === editor.eventId)
    : undefined;
  const destinations = publication ? draftDestinations(values) : [];
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
  const deadlineView = publication
    ? publicationDeadlineView(state, requirement, events, values)
    : undefined;
  // Decided from what the date opened with, so the fields do not vanish while being corrected.
  const fixedNotice =
    deadlineView !== undefined &&
    noticeAnswered(saved ? eventValues(saved) : values, requirement, state.year);
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
          // Vacations have a step of their own; a saved date keeps showing what it has.
          options={categories
            .filter(([id]) => id !== 'ferias' || field.state.value === 'ferias')
            .map(([id, label, color]) => ({
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
        <fieldset
          id="event-type"
          // Below other fields it opens its own section; as the first question it needs no rule.
          className={editor.eventId ? 'event-type event-section' : 'event-type'}
        >
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
  const publicationStatusField = (
    <form.Field name="publicationStatus">
      {(field) => (
        <Select field={field} id="event-publication-status" label="Situação da publicação" required>
          <option value="">Selecione</option>
          <option value="planned">Publicação programada</option>
          <option value="published">Publicação realizada</option>
        </Select>
      )}
    </form.Field>
  );
  // A notice's situation names the dates and its fields are required: answered as a notice, they
  // come before the dates, and a stated notice leaves only its situation, after them; otherwise the
  // classification stays an optional detail at the end.
  const noticeFirst = values.eventType === 'notice' || requirement?.variant === 'admission-notice';
  const noticeFields = fixedNotice ? (
    <p className="event-scope" id="event-notice-summary">
      <strong>Ingresso em {values.admissionYear}</strong>
      {deadlineView.limit
        ? ` · Prazo: até ${longDate(deadlineView.limit)}${deadlineView.extended ? ' (prorrogado)' : ''}`
        : ` · Prazo de ${longDate(deadlineView.original)} prorrogado; dia a conferir`}
      {requirement?.basis ? ` (${requirement.basis})` : ''}
    </p>
  ) : (
    <>
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
            {publicationStatusField}
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
                  {(field.state.value === destinationsByOffer || values.offers.length > 1) && (
                    <option value={destinationsByOffer}>Um período para cada oferta</option>
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
          {values.admissionPeriodId === destinationsByOffer && (
            <div className="row-form" id="event-admission-destinations">
              {values.offers.map((offerId) => (
                <form.Field key={offerId} name={`admissionPeriods.${offerId}`}>
                  {(field) => (
                    <Select
                      field={field}
                      id={`event-admission-period-${offerId}`}
                      label={`Período de destino — ${labelFor(state, offerId)}`}
                    >
                      <option value="">Ingresso futuro / período ainda não cadastrado</option>
                      {periodsForOffer(state, offerId).map((period) => (
                        <option key={period.id} value={period.id}>
                          {period.name} — {compactDate(period.start, state.year)}
                        </option>
                      ))}
                    </Select>
                  )}
                </form.Field>
              ))}
            </div>
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
        </section>
      )}
    </>
  );
  const lateTitle =
    deadlineView?.limit && deadlineView.daysLate
      ? `A publicação termina ${deadlineView.daysLate} ${deadlineView.daysLate === 1 ? 'dia' : 'dias'} depois do prazo`
      : 'Prazo prorrogado a conferir';
  // The declared deadline is asked only when the date needs it; one already saved stays editable,
  // even while its field is emptied.
  const askAdjustment =
    noticeActive(values) &&
    ((deadlineView && deadlineView.standing !== 'within') ||
      Boolean(values.adjustedDeadline) ||
      Boolean(saved?.deadlineAdjustment));
  const deadlineStatus = deadlineView && (
    // Always mounted: a live region announces what appears in it, not a region that appears.
    <div className="event-deadline-status" aria-live="polite">
      {deadlineView.standing === 'late' && (
        <Notice tone="warning" id="event-deadline-late" title={lateTitle}>
          {deadlineView.limit
            ? `Termine a publicação até ${longDate(deadlineView.limit)}. `
            : `O prazo de ${longDate(deadlineView.original)} foi prorrogado por feriado municipal ou recesso, mas o dia letivo seguinte ainda não pode ser calculado. Confira os dias letivos. `}
          Se a Proens definiu outro prazo para o campus, informe-o abaixo.
        </Notice>
      )}
      {deadlineView.standing === 'adjusted' && !deadlineView.issue && (
        <Notice tone="info" id="event-deadline-adjusted">
          A publicação termina depois do prazo de {longDate(deadlineView.original)}, dentro do novo
          prazo informado.
        </Notice>
      )}
    </div>
  );
  const deadlineFields = (
    <div className="event-deadline">
      <form.Field name="adjustedDeadline">
        {(field) => (
          <Input
            field={field}
            id="event-adjusted-deadline"
            label="Novo prazo definido pela Proens"
            type="date"
            aria-invalid={deadlineView?.issue ? true : undefined}
            aria-describedby={deadlineView?.issue ? 'event-deadline-issue' : 'event-deadline-help'}
          />
        )}
      </form.Field>
      {deadlineView?.issue ? (
        <Notice tone="warning" id="event-deadline-issue">
          {deadlineView.issue}
        </Notice>
      ) : (
        <p className="help" id="event-deadline-help">
          {deadlineView?.standing === 'within'
            ? 'A publicação está dentro do prazo. Apague este campo se a Proens não definiu outro prazo.'
            : 'A revisão institucional confere essa informação.'}
        </p>
      )}
    </div>
  );
  // The error stays until the next attempt: a refusal of the deadline follows the field instead.
  const adjustmentRefused = editor.error.startsWith(deadlineAdjustmentRefusal);
  return (
    <form id="event-form" className="ui-panel-view" hidden={!editor.open} onSubmit={editor.submit}>
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
      {activityRecord && (
        <h3 id="event-form-title" ref={heading} tabIndex={-1}>
          {editor.eventId ? 'Editar data' : 'Adicionar data'}
        </h3>
      )}
      <fieldset className="ui-panel-view" disabled={readOnly || editor.pending}>
        <div className="ui-panel-view__body">
          {requirement ? <ActivityRuleNote year={state.year} item={requirement} withBasis /> : null}
          <fieldset className="event-fields">
            {/* The link comes from the context and is never edited here: a campus date has none,
              and a date kept with a link without generated activity shows it read-only. */}
            {!activityRecord && editor.activity && (
              <p className="help" id="event-kept-link">
                Atividade vinculada: <code>{activityKey(editor.activity)}</code> (preservada;
                somente leitura).
              </p>
            )}
            {askType && !editor.eventId && typeQuestion}
            {noticeFirst && noticeFields}
            <div className="row-form">{nameField}</div>
            <div className="row-form">
              <form.Field name="start">
                {(field) => (
                  <Input
                    field={field}
                    label={
                      fixedNotice
                        ? 'Início da publicação'
                        : publication
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
                      fixedNotice
                        ? 'Término da publicação'
                        : publication
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
            {deadlineStatus}
            {askAdjustment && deadlineFields}
            {fixedNotice && <div className="row-form">{publicationStatusField}</div>}
            {showHours && (
              <div className="row-form">
                <form.Field name="hours">
                  {(field) => (
                    <Input
                      field={field}
                      label="Carga horária (horas)"
                      id="event-hours"
                      type="number"
                      min="0.01"
                      max="8784"
                      step="0.01"
                    />
                  )}
                </form.Field>
              </div>
            )}
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
            {askType && editor.eventId && typeQuestion}
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
                      Data de organização interna do campus: aparece no editor com o selo Interna,
                      mas fica fora do calendário oficial e das evidências do parecer.
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
                    <option value="municipal-recess">
                      Recesso decorrente de feriado municipal
                    </option>
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
            {!noticeFirst && noticeFields}
          </fieldset>
        </div>
        {/* The refusal repeats “Efeito a corrigir”, already shown above the fields. */}
        <PanelFooter
          feedback={
            <FormFeedback
              error={
                effectIssue && editor.error === effectIssue
                  ? 'Corrija o efeito indicado em “Efeito a corrigir”.'
                  : adjustmentRefused
                    ? deadlineView?.issue
                      ? 'Corrija o novo prazo indicado acima.'
                      : ''
                    : editor.error
              }
            />
          }
        >
          <Button type="submit">{editor.eventId ? 'Aplicar alterações' : 'Adicionar data'}</Button>
          {/* Only a new date of an activity continues the filling: a date of the campus or an edit
              of a saved date has no list to go on with. */}
          {activityRecord && !editor.eventId && (
            <Button
              id="apply-and-next-pending"
              variant="secondary"
              onClick={(event) => editor.applyAndAdvance(event.currentTarget.form)}
            >
              Aplicar e ir para a próxima pendente
            </Button>
          )}
          {editor.dirty && (
            <Button id="discard-event-form" variant="secondary" onClick={editor.discard}>
              Descartar alterações
            </Button>
          )}
        </PanelFooter>
      </fieldset>
    </form>
  );
}
