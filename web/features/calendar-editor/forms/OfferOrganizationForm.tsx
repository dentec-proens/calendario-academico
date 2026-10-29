import {
  assessmentStageCounts,
  calendarLimits,
  selectableModalities,
  organizationLabels,
  termsByOrganization,
  periodCountByOrganization,
  assessmentStageRequirementPattern,
} from '#src/domain/calendar/config.ts';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from './useCalendarForm.ts';
import {
  applyOfferOrganization,
  offerOrganizationDraft,
  offerOrganizationIssues,
} from '#src/domain/calendar/organization/offers.ts';
import { configureOfferMetadata } from '#src/domain/calendar/commands/organization.ts';
import { validateOffers } from '#src/domain/calendar/normalization/normalize-v4.ts';
import { nextOfferId, offerLabel, stageCount } from '#src/domain/calendar/offers.ts';
import type {
  CalendarOffer,
  OfferDelivery,
  OfferKind,
  ActivityState,
} from '#src/domain/calendar/model.ts';
import type {
  OfferOrganizationDraft,
  OrganizationIssue,
} from '#src/domain/calendar/organization/offers.ts';
import { periodsForModality } from '#src/domain/calendar/organization/periods.ts';
import { modalityLabels } from '#src/domain/calendar/modalities.ts';
import { civilDate } from '../events/activity-query.ts';
import { ChevronUp } from 'lucide-react';
import { Button } from '../../../components/ui/Button.tsx';
import { FormActions } from '../../../shared/forms/FormActions.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';
import { Input, Select } from './fields.tsx';
import { scrollIntoView } from '../../../scroll.ts';

export type OrganizationCheck = () => { message: string; reveal: () => void } | null;
export type RegisterOrganizationCheck = (offerId: string, check: OrganizationCheck) => () => void;

interface OfferFormValues extends OfferOrganizationDraft {
  kind: OfferKind | '';
  label: string;
  delivery: OfferDelivery;
  organizationBasis: string;
}

function formDefaults(
  state: ActivityState & { offers: CalendarOffer[] },
  id?: string,
): OfferFormValues {
  const offer = state.offers.find((item) => item.id === id);
  return {
    ...offerOrganizationDraft(state, id ?? ''),
    kind: offer?.kind ?? '',
    label: offer?.label ?? '',
    delivery: offer?.delivery ?? 'a-conferir',
    organizationBasis: offer?.organizationBasis ?? '',
  };
}

export default function OfferOrganizationForm({
  offerId: existingId,
  requestedStage,
  registerCheck,
  onResolved,
}: {
  offerId?: string;
  requestedStage?: string;
  registerCheck: RegisterOrganizationCheck;
  onResolved: () => void;
}) {
  const navigate = useNavigate();
  const { state, session, readOnly, record } = useCalendarEditor();
  const savedOffer = state.offers.find((offer) => offer.id === existingId);
  const defaults = formDefaults(state, existingId);
  const [open, setOpen] = useState(!existingId);
  const [collapsedHref, setCollapsedHref] = useState<string | null>(null);
  const location = useRouterState({ select: (router) => router.location.href });
  const [applied, setApplied] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLSelectElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const formElement = useRef<HTMLFormElement>(null);
  const prefix = `offer-${existingId ?? 'new'}`;
  function close() {
    setCollapsedHref(location);
    setOpen(false);
    if (requestedStage)
      void navigate({
        to: '/calendarios/$calendarId/periodos',
        params: { calendarId: record.id },
        search: (previous) => ({ ...previous, atividade: undefined }),
        hashScrollIntoView: false,
      });
    requestAnimationFrame(() => {
      opener.current?.focus({ preventScroll: true });
      scrollIntoView(opener.current, { block: 'nearest' });
    });
  }
  const { form, values, submit, error, dirty, clearDraft } = useCalendarForm(
    `organization:${existingId ?? 'new'}`,
    defaults,
    (value) => {
      const kind = selectableModalities.find((kind) => kind === value.kind);
      if (!kind) throw new Error('Selecione o tipo de oferta.');
      let next = state;
      let appliedId = existingId ?? '';
      session.apply((current) => {
        appliedId = existingId ?? nextOfferId(current, kind);
        const metadata = {
          label: value.label,
          delivery: value.delivery,
          organizationBasis: value.organizationBasis,
        };
        const prepared = existingId
          ? configureOfferMetadata(current, existingId, metadata)
          : current;
        const newOffer: CalendarOffer | undefined = existingId
          ? undefined
          : {
              id: appliedId,
              kind,
              organization: 'a-classificar',
              ...metadata,
            };
        next = applyOfferOrganization(
          prepared,
          appliedId,
          value,
          () => crypto.randomUUID(),
          newOffer,
        );
        return next;
      });
      setApplied(true);
      onResolved();
      close();
      return formDefaults(next, appliedId);
    },
  );
  const kind = selectableModalities.find((kind) => kind === values.kind);
  const selectedOffer: CalendarOffer | undefined =
    savedOffer ??
    (kind
      ? {
          id: nextOfferId(state, kind),
          kind,
          organization: 'a-classificar',
          delivery: values.delivery,
        }
      : undefined);
  const modality = selectedOffer?.id ?? 'new';
  const label = savedOffer
    ? offerLabel(savedOffer)
    : values.label.trim() || (kind ? modalityLabels[kind] : 'Nova oferta');
  const metadata = {
    label: values.label,
    delivery: values.delivery,
    organizationBasis: values.organizationBasis,
  };
  const candidate = selectedOffer ? { ...selectedOffer, ...metadata } : undefined;
  let prepared = state;
  const metadataIssues: OrganizationIssue[] = [];
  try {
    if (savedOffer) prepared = configureOfferMetadata(state, savedOffer.id, metadata);
    else if (candidate) validateOffers([...state.offers, candidate]);
  } catch (cause) {
    metadataIssues.push({
      path: !['presencial', 'ead', 'a-conferir'].includes(values.delivery)
        ? 'delivery'
        : values.organizationBasis.trim().length > calendarLimits.maximumTextLength
          ? 'organizationBasis'
          : 'label',
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
  const expanded = open || ((dirty || Boolean(requestedStage)) && collapsedHref !== location);
  useEffect(() => {
    if (!requestedStage) return;
    const frame = requestAnimationFrame(() => {
      const number = Number(requestedStage.match(assessmentStageRequirementPattern)?.[1] ?? 1) - 1;
      const target = document.getElementById(`${prefix}-stage-${number}-start`) ?? first.current;
      target?.focus({ preventScroll: true });
      scrollIntoView(target, { block: 'center' });
    });
    return () => cancelAnimationFrame(frame);
  }, [requestedStage, prefix, location]);
  useEffect(() => {
    if (!expanded || requestedStage) return;
    const frame = requestAnimationFrame(() => {
      if (formElement.current?.contains(document.activeElement)) return;
      const target =
        (pendingFocus.current && document.getElementById(pendingFocus.current)) || first.current;
      pendingFocus.current = null;
      target?.focus({ preventScroll: true });
      scrollIntoView(target, { block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [expanded, requestedStage]);
  const issues = [
    ...metadataIssues,
    ...(candidate
      ? offerOrganizationIssues(prepared, modality, values, savedOffer ? undefined : candidate)
      : [{ path: 'kind', message: 'Selecione o tipo de oferta.' }]),
  ];
  const visibleIssues =
    dirty || attempted ? issues : issues.filter((issue) => issue.message.includes('inteiramente'));
  const messageFor = (path: string) =>
    visibleIssues
      .filter((issue) => issue.path === path)
      .map((issue) => issue.message)
      .join(' ');
  const included = Boolean(savedOffer);
  const periods = periodsForModality(state, modality);
  const perTerm = Number(values.count);
  const allowedCounts: readonly number[] =
    values.organization === 'semestral' ? [1, 2] : assessmentStageCounts;
  const validCount = allowedCounts.includes(perTerm);
  const count = validCount ? perTerm * (values.organization === 'semestral' ? 2 : 1) : 0;
  const savedCount = savedOffer?.stages?.perTerm;
  const savedTotal = savedOffer ? stageCount(savedOffer) : 0;
  const unclassified = state.periods.filter((period) => period.association?.status !== 'defined');
  const datedStages = values.stages
    .slice(0, count)
    .filter((stage) => stage.start && stage.end).length;
  const stageIssues = issues.some(
    (issue) => issue.path.startsWith('stages') || issue.path === 'count',
  );
  useLayoutEffect(() =>
    registerCheck(existingId ?? 'new', () => {
      if (readOnly || (!included && !dirty) || (!dirty && issues.length === 0)) return null;
      const issue = issues[0];
      const stage = issue?.path.match(/^stages\[(\d+)\]/)?.[1];
      const period = issue?.path.match(/^periods\[(\d+)\]/)?.[1];
      const targetId = !issue
        ? `${prefix}-apply`
        : stage !== undefined
          ? `${prefix}-stage-${stage}-start`
          : period !== undefined
            ? `${prefix}-period-${period}-start`
            : issue.path === 'count'
              ? `${prefix}-count`
              : `${prefix}-${issue.path === 'kind' || issue.path === 'label' || issue.path === 'delivery' || issue.path === 'organizationBasis' ? issue.path : 'organization'}`;
      return {
        message: `${label}: ${issue ? issue.message : 'Aplique as alterações da organização antes de continuar.'}`,
        reveal: () => {
          setAttempted(true);
          pendingFocus.current = targetId;
          setOpen(true);
          setCollapsedHref(null);
          requestAnimationFrame(() => {
            const target = document.getElementById(targetId);
            target?.focus({ preventScroll: true });
            scrollIntoView(target, { block: 'center' });
          });
        },
      };
    }),
  );

  return (
    <section
      className="offer-organization"
      data-offer={modality}
      aria-labelledby={`${prefix}-heading`}
    >
      <div className="offer-organization-heading">
        <div>
          <h4 id={`${prefix}-heading`}>{label}</h4>
          {(included || dirty) && (
            <p
              className={stageIssues || dirty ? 'offer-organization-pending' : 'help'}
              data-organization-progress
              role="status"
            >
              {!validCount
                ? 'Etapas pendentes: defina a quantidade e as datas.'
                : datedStages < count
                  ? `Etapas pendentes: datas de ${datedStages} de ${count} etapas definidas.`
                  : stageIssues
                    ? 'Etapas a conferir: revise as datas.'
                    : `Datas de ${count} de ${count} etapas definidas.`}
              {dirty && ' Alterações ainda não aplicadas.'}
            </p>
          )}
          {!expanded && (
            <p className="help">
              {periods.length
                ? periods
                    .map(
                      (period) =>
                        `${period.association?.status === 'defined' && period.association.term !== 'annual' ? (period.association.term === 'first' ? '1º semestre: ' : '2º semestre: ') : 'Anual: '}${civilDate(period.start)} a ${civilDate(period.end)}`,
                    )
                    .join(' · ')
                : included
                  ? 'Períodos a definir'
                  : 'Não incluída neste calendário'}
              {included &&
                (savedCount
                  ? savedOffer?.organization === 'semestral'
                    ? ` · ${savedCount} etapa${savedCount === 1 ? '' : 's'} por semestre (${savedTotal} no ano)`
                    : ` · ${savedCount} etapas no ano`
                  : ' · Etapas a definir')}
            </p>
          )}
        </div>
        <Button
          ref={opener}
          type="button"
          variant="secondary"
          aria-expanded={expanded}
          aria-controls={`${prefix}-editor`}
          data-edit-organization={modality}
          onClick={() => {
            setApplied(false);
            setOpen(!expanded);
            setCollapsedHref(expanded ? location : null);
          }}
        >
          {expanded && <ChevronUp size={18} aria-hidden="true" />}
          {expanded
            ? 'Recolher'
            : dirty
              ? 'Retomar preenchimento'
              : readOnly
                ? 'Consultar organização'
                : periods.length
                  ? 'Editar organização'
                  : included
                    ? 'Configurar'
                    : 'Incluir e configurar'}
        </Button>
      </div>
      {!expanded && applied && (
        <p className="offer-applied" role="status">
          Organização aplicada. Confira o indicador de salvamento.
        </p>
      )}
      <div id={`${prefix}-editor`} hidden={!expanded}>
        <form
          ref={formElement}
          id={`${prefix}-form`}
          onSubmit={submit}
          onChangeCapture={() => setOpen(true)}
          aria-labelledby={`${prefix}-heading`}
        >
          <fieldset disabled={readOnly}>
            {!included && (
              <p className="help">
                Esta oferta será incluída no calendário ao aplicar os períodos e as etapas abaixo.
              </p>
            )}
            {dirty && (
              <p className="help" role="status">
                Alterações desta oferta ainda não aplicadas.
              </p>
            )}
            <div className="offer-metadata">
              {savedOffer ? (
                <p className="help">Tipo de oferta: {modalityLabels[savedOffer.kind]}</p>
              ) : (
                <form.Field name="kind">
                  {(field) => (
                    <Select
                      field={field}
                      label="Tipo de oferta"
                      id={`${prefix}-kind`}
                      ref={first}
                      required
                    >
                      <option value="">Selecione</option>
                      {selectableModalities.map((kind) => (
                        <option key={kind} value={kind}>
                          {modalityLabels[kind]}
                        </option>
                      ))}
                    </Select>
                  )}
                </form.Field>
              )}
              {messageFor('kind') && (
                <p className="field-error" role="alert">
                  {messageFor('kind')}
                </p>
              )}
              <form.Field name="label">
                {(field) => (
                  <Input
                    field={field}
                    label={`Nome da oferta${kind && state.offers.some((offer) => offer.kind === kind && offer.id !== existingId) ? ' (obrigatório)' : ' (opcional)'}`}
                    id={`${prefix}-label`}
                    maxLength={calendarLimits.maximumTextLength}
                    required={Boolean(
                      kind &&
                      state.offers.some((offer) => offer.kind === kind && offer.id !== existingId),
                    )}
                    aria-invalid={Boolean(messageFor('label'))}
                    aria-describedby={`${prefix}-label-error`}
                  />
                )}
              </form.Field>
              <p className="field-error" id={`${prefix}-label-error`} role="alert">
                {messageFor('label')}
              </p>
              <form.Field name="delivery">
                {(field) => (
                  <Select field={field} label="Modo de oferta" id={`${prefix}-delivery`}>
                    <option value="a-conferir">A conferir</option>
                    <option value="presencial">Presencial</option>
                    <option value="ead">Educação a distância (EaD)</option>
                  </Select>
                )}
              </form.Field>
              {messageFor('delivery') && (
                <p className="field-error" role="alert">
                  {messageFor('delivery')}
                </p>
              )}
              <form.Field name="organizationBasis">
                {(field) => (
                  <Input
                    field={field}
                    label="Base da organização (opcional)"
                    id={`${prefix}-organizationBasis`}
                    placeholder="Ex.: PPC aprovado pela Resolução nº …"
                    maxLength={calendarLimits.maximumTextLength}
                  />
                )}
              </form.Field>
              {messageFor('organizationBasis') && (
                <p className="field-error" role="alert">
                  {messageFor('organizationBasis')}
                </p>
              )}
            </div>
            <div className="offer-settings-grid">
              <div>
                <form.Field name="organization">
                  {(field) => (
                    <Select
                      field={field}
                      label="Organização"
                      id={`${prefix}-organization`}
                      ref={existingId ? first : undefined}
                      required
                    >
                      <option value="">Selecione</option>
                      {Object.keys(termsByOrganization).map((organization) => (
                        <option key={organization} value={organization}>
                          {organizationLabels[organization]}
                        </option>
                      ))}
                    </Select>
                  )}
                </form.Field>
                {messageFor('organization') && (
                  <p className="field-error" role="alert">
                    {messageFor('organization')}
                  </p>
                )}
              </div>
            </div>
            <h5>Períodos letivos</h5>
            {Array.from(
              {
                length:
                  periodCountByOrganization[
                    values.organization === 'semestral' ? 'semestral' : 'anual'
                  ],
              },
              (_, index) => (
                <fieldset className="offer-period-fields" key={index}>
                  <legend>
                    {values.organization === 'semestral' ? `${index + 1}º semestre` : 'Ano letivo'}
                  </legend>
                  {unclassified.length > 0 && (
                    <label>
                      Usar período existente a classificar
                      <select
                        id={`${prefix}-source-${index}`}
                        value={values.periods[index].sourceId}
                        onChange={(event) => {
                          const period = unclassified.find(
                            (item) => item.id === event.target.value,
                          );
                          form.setFieldValue(`periods[${index}]`, {
                            sourceId: period?.id ?? '',
                            name: period?.name ?? '',
                            start: period?.start ?? '',
                            end: period?.end ?? '',
                          });
                        }}
                      >
                        <option value="">Definir novas datas</option>
                        {unclassified.map((period) => (
                          <option key={period.id} value={period.id}>
                            {period.name} · {civilDate(period.start)} a {civilDate(period.end)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="offer-date-grid">
                    <form.Field name={`periods[${index}].start`}>
                      {(field) => (
                        <Input
                          field={field}
                          label="Início"
                          id={`${prefix}-period-${index}-start`}
                          type="date"
                          required
                          min={`${state.year}-01-01`}
                          max={`${state.year}-12-31`}
                          aria-invalid={Boolean(messageFor(`periods[${index}]`))}
                          aria-describedby={`${prefix}-period-${index}-error`}
                        />
                      )}
                    </form.Field>
                    <form.Field name={`periods[${index}].end`}>
                      {(field) => (
                        <Input
                          field={field}
                          label="Término"
                          id={`${prefix}-period-${index}-end`}
                          type="date"
                          required
                          min={`${state.year}-01-01`}
                          max={`${state.year}-12-31`}
                          aria-invalid={Boolean(messageFor(`periods[${index}]`))}
                          aria-describedby={`${prefix}-period-${index}-error`}
                        />
                      )}
                    </form.Field>
                  </div>
                  <p className="field-error" id={`${prefix}-period-${index}-error`} role="alert">
                    {messageFor(`periods[${index}]`)}
                  </p>
                </fieldset>
              ),
            )}
            {messageFor('periods') && (
              <p className="field-error" role="alert">
                {messageFor('periods')}
              </p>
            )}
            <div className="offer-assessments">
              <h5>Etapas de avaliação</h5>
              <form.Field name="count">
                {(field) => (
                  <Select
                    field={field}
                    label="Etapas"
                    id={`${prefix}-count`}
                    required
                    disabled={!values.organization}
                    aria-describedby={`${prefix}-count-help`}
                  >
                    <option value="">Selecione</option>
                    {allowedCounts.map((count) => (
                      <option key={count} value={count}>
                        {count} etapa{count === 1 ? '' : 's'}
                      </option>
                    ))}
                  </Select>
                )}
              </form.Field>
              <p className="help" id={`${prefix}-count-help`}>
                {values.organization === 'semestral'
                  ? 'Quantidade em cada semestre. A numeração reinicia no segundo semestre.'
                  : 'Quantidade no ano letivo.'}
              </p>
              {messageFor('count') && (
                <p className="field-error" role="alert">
                  {messageFor('count')}
                </p>
              )}
              {savedTotal && count && count < savedTotal ? (
                <p className="help">
                  Etapas e atividades além da quantidade escolhida serão preservadas como registros
                  sem vínculo de avaliação.
                </p>
              ) : null}
              {(values.organization === 'semestral' ? [0, 1] : [0]).map((cycle) => (
                <fieldset className="offer-stage-cycle" key={cycle}>
                  <legend>
                    {values.organization === 'semestral' ? `${cycle + 1}º semestre` : 'Ano letivo'}
                  </legend>
                  <div className="offer-stages-grid">
                    {values.stages
                      .slice(cycle * perTerm, validCount ? (cycle + 1) * perTerm : 0)
                      .map((_, localIndex) => {
                        const index = cycle * perTerm + localIndex;
                        const message = messageFor(`stages[${index}]`);
                        return (
                          <fieldset key={index} className="offer-stage-fields">
                            <legend>
                              {localIndex + 1}ª etapa
                              {values.organization === 'semestral'
                                ? ` — ${cycle + 1}º semestre`
                                : ''}
                            </legend>
                            <div className="offer-date-grid">
                              <form.Field name={`stages[${index}].start`}>
                                {(field) => (
                                  <Input
                                    field={field}
                                    label="Início"
                                    id={`${prefix}-stage-${index}-start`}
                                    type="date"
                                    required
                                    min={`${state.year}-01-01`}
                                    max={`${state.year}-12-31`}
                                    aria-invalid={Boolean(message)}
                                    aria-describedby={`${prefix}-stage-${index}-error`}
                                  />
                                )}
                              </form.Field>
                              <form.Field name={`stages[${index}].end`}>
                                {(field) => (
                                  <Input
                                    field={field}
                                    label="Término"
                                    id={`${prefix}-stage-${index}-end`}
                                    type="date"
                                    required
                                    min={`${state.year}-01-01`}
                                    max={`${state.year}-12-31`}
                                    aria-invalid={Boolean(message)}
                                    aria-describedby={`${prefix}-stage-${index}-error`}
                                  />
                                )}
                              </form.Field>
                            </div>
                            <p
                              className="field-error"
                              id={`${prefix}-stage-${index}-error`}
                              role="alert"
                            >
                              {message}
                            </p>
                          </fieldset>
                        );
                      })}
                  </div>
                </fieldset>
              ))}
            </div>
            <FormFeedback error={error} />
            <FormActions>
              <Button type="submit" id={`${prefix}-apply`} disabled={issues.length > 0}>
                Aplicar organização de {label}
              </Button>
              <Button
                type="button"
                variant="secondary"
                id={`${prefix}-cancel`}
                onClick={() => {
                  form.reset(defaults);
                  clearDraft();
                  session.setFormDirty(`organization:${existingId ?? 'new'}`, false);
                  onResolved();
                  setCollapsedHref(expanded ? location : null);
                  close();
                }}
              >
                Cancelar edição
              </Button>
            </FormActions>
          </fieldset>
        </form>
      </div>
    </section>
  );
}
