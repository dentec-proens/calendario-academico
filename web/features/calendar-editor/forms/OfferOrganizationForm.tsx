import {
  assessmentStageCounts,
  calendarLimits,
  selectableModalities,
  organizationLabels,
  termsByOrganization,
  periodCountByOrganization,
  assessmentStageRequirementPattern,
} from '#src/domain/calendar/config.ts';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
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
import { periodsForOffer } from '#src/domain/calendar/organization/periods.ts';
import { modalityLabels } from '#src/domain/calendar/modalities.ts';
import { civilDate } from '../events/activity-query.ts';
import { Check, ChevronUp } from 'lucide-react';
import { Button } from '../../../components/ui/Button.tsx';
import { ChoiceGroup, focusableField } from '../../../components/ui/ChoiceGroup.tsx';
import { FormActions } from '../../../shared/forms/FormActions.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';
import { Input, Select } from './fields.tsx';
import { OfferTimeline, type TimelineCycle } from './OfferTimeline.tsx';
import { scrollIntoView } from '../../../scroll.ts';

export type OrganizationCheck = () => { message: string; reveal: () => void } | null;
export type RegisterOrganizationCheck = (offerId: string, check: OrganizationCheck) => () => void;

interface OfferFormValues extends OfferOrganizationDraft {
  kind: OfferKind | '';
  label: string;
  delivery: OfferDelivery;
  organizationBasis: string;
}

const deliveryOptions: ReadonlyArray<{ value: OfferDelivery; label: string }> = [
  { value: 'presencial', label: 'Presencial' },
  { value: 'ead', label: 'EaD' },
  { value: 'a-conferir', label: 'A conferir' },
];
const deliveryLabels: Record<OfferDelivery, string> = {
  presencial: 'Presencial',
  ead: 'Educação a distância (EaD)',
  'a-conferir': 'Modo de oferta a conferir',
};
const organizationOptions = Object.keys(termsByOrganization).map((organization) => ({
  value: organization,
  label: organizationLabels[organization],
}));
const identityPaths = ['kind', 'label', 'delivery', 'organizationBasis'];

function formDefaults(
  state: ActivityState & { offers: CalendarOffer[] },
  id?: string,
): OfferFormValues {
  const offer = state.offers.find((item) => item.id === id);
  return {
    ...offerOrganizationDraft(state, id ?? ''),
    kind: offer?.kind ?? '',
    label: offer?.label ?? '',
    delivery: offer?.delivery ?? 'presencial',
    organizationBasis: offer?.organizationBasis ?? '',
  };
}

function timelineCycles(draft: OfferOrganizationDraft): TimelineCycle[] {
  const semestral = draft.organization === 'semestral';
  const perTerm = Number(draft.count);
  const valid = (semestral ? [1, 2] : assessmentStageCounts).includes(perTerm);
  return draft.periods.slice(0, semestral ? 2 : 1).map((period, cycle) => ({
    period,
    stages: valid ? draft.stages.slice(cycle * perTerm, (cycle + 1) * perTerm) : [],
  }));
}

function BlockHeading({
  id,
  step,
  state,
  children,
}: {
  id: string;
  step: number;
  state: 'done' | 'current' | 'pending';
  children: ReactNode;
}) {
  return (
    <h5 id={id} className="offer-block-heading">
      <span className="offer-step" data-state={state} aria-hidden="true">
        {state === 'done' ? <Check size={14} strokeWidth={3} /> : step}
      </span>
      {children}
      {state === 'done' && <span className="visually-hidden"> (concluído)</span>}
    </h5>
  );
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
  const [showBasis, setShowBasis] = useState(Boolean(defaults.organizationBasis));
  const opener = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const formElement = useRef<HTMLFormElement>(null);
  const prefix = `offer-${existingId ?? 'new'}`;
  const firstField = existingId ? `${prefix}-organization` : `${prefix}-kind`;
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
      const target =
        document.getElementById(`${prefix}-stage-${number}-start`) ?? focusableField(firstField);
      target?.focus({ preventScroll: true });
      scrollIntoView(target, { block: 'center' });
    });
    return () => cancelAnimationFrame(frame);
  }, [requestedStage, prefix, firstField, location]);
  useEffect(() => {
    if (!expanded || requestedStage) return;
    const frame = requestAnimationFrame(() => {
      if (formElement.current?.contains(document.activeElement)) return;
      const target =
        (pendingFocus.current && focusableField(pendingFocus.current)) ||
        focusableField(firstField);
      pendingFocus.current = null;
      target?.focus({ preventScroll: true });
      scrollIntoView(target, { block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [expanded, requestedStage, firstField]);
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
  const periods = periodsForOffer(state, modality);
  const semestral = values.organization === 'semestral';
  const perTerm = Number(values.count);
  const allowedCounts: readonly number[] = semestral ? [1, 2] : assessmentStageCounts;
  const validCount = allowedCounts.includes(perTerm);
  const count = validCount ? perTerm * (semestral ? 2 : 1) : 0;
  const savedCount = savedOffer?.stages?.perTerm;
  const savedTotal = savedOffer ? stageCount(savedOffer) : 0;
  const unclassified = state.periods.filter((period) => period.association?.status !== 'defined');
  const datedStages = values.stages
    .slice(0, count)
    .filter((stage) => stage.start && stage.end).length;
  const stageIssues = issues.some(
    (issue) => issue.path.startsWith('stages') || issue.path === 'count',
  );
  const requiredLabel = Boolean(
    kind && state.offers.some((offer) => offer.kind === kind && offer.id !== existingId),
  );
  const blockIssues = [
    issues.some((issue) => identityPaths.includes(issue.path)),
    issues.some((issue) => issue.path === 'organization' || issue.path === 'count'),
    issues.some((issue) => /^(periods|stages)/.test(issue.path)),
  ];
  const currentBlock = blockIssues.indexOf(true);
  const blockState = (index: number) =>
    !blockIssues[index] ? 'done' : index === currentBlock ? 'current' : 'pending';
  const cycles = Array.from(
    { length: periodCountByOrganization[semestral ? 'semestral' : 'anual'] },
    (_, cycle) => cycle,
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
              : `${prefix}-${identityPaths.includes(issue.path) ? issue.path : 'organization'}`;
      return {
        message: `${label}: ${issue ? issue.message : 'Aplique as alterações da organização antes de continuar.'}`,
        reveal: () => {
          setAttempted(true);
          if (issue?.path === 'organizationBasis') setShowBasis(true);
          pendingFocus.current = targetId;
          setOpen(true);
          setCollapsedHref(null);
          requestAnimationFrame(() => {
            const target = focusableField(targetId);
            target?.focus({ preventScroll: true });
            scrollIntoView(target, { block: 'center' });
          });
        },
      };
    }),
  );
  const fieldError = (path: string, id?: string) => (
    <p className="field-error" id={id} role="alert">
      {messageFor(path)}
    </p>
  );

  return (
    <section
      className="offer-organization"
      data-offer={modality}
      data-expanded={expanded || undefined}
      aria-labelledby={`${prefix}-heading`}
    >
      <div className="offer-organization-heading">
        <div className="offer-organization-title">
          <h4 id={`${prefix}-heading`}>{label}</h4>
          {savedOffer?.legacyStageCount !== undefined && (
            <p className="help" data-legacy-stage-count>
              {savedOffer.legacyStageCount} etapas do formato anterior preservadas. Confirme a
              organização e a quantidade por ciclo para classificá-las.
            </p>
          )}
          {(included || dirty) && (
            <p
              className="offer-status"
              data-tone={stageIssues || dirty ? 'pending' : 'done'}
              data-organization-progress
              role="status"
            >
              {!validCount
                ? savedOffer?.legacyStageCount !== undefined
                  ? 'Organização e etapas por ciclo a definir; quantidade anterior preservada.'
                  : 'Etapas pendentes: defina a quantidade e as datas.'
                : datedStages < count
                  ? `Etapas pendentes: datas de ${datedStages} de ${count} etapas definidas.`
                  : stageIssues
                    ? 'Etapas a conferir: revise as datas.'
                    : `Datas de ${count} de ${count} etapas definidas.`}
              {dirty && ' Alterações ainda não aplicadas.'}
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
      {!expanded && (
        <div className="offer-summary">
          {savedOffer && (
            <ul className="offer-tags" aria-label={`Resumo de ${label}`}>
              <li>{deliveryLabels[savedOffer.delivery ?? 'a-conferir']}</li>
              <li>{organizationLabels[savedOffer.organization]}</li>
              <li>
                {savedCount
                  ? savedOffer.organization === 'semestral'
                    ? `${savedCount} etapa${savedCount === 1 ? '' : 's'} por semestre (${savedTotal} no ano)`
                    : `${savedCount} etapas no ano`
                  : savedOffer.legacyStageCount !== undefined
                    ? `${savedOffer.legacyStageCount} etapas anteriores preservadas; ciclos a conferir`
                    : 'Etapas a definir'}
              </li>
            </ul>
          )}
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
          </p>
          {included && <OfferTimeline year={state.year} cycles={timelineCycles(defaults)} />}
        </div>
      )}
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
            <section className="offer-block" aria-labelledby={`${prefix}-identity-heading`}>
              <BlockHeading id={`${prefix}-identity-heading`} step={1} state={blockState(0)}>
                Identificação
              </BlockHeading>
              <div className="offer-metadata">
                {savedOffer ? (
                  <p className="offer-readonly-field">
                    <span>Tipo de oferta</span>
                    {modalityLabels[savedOffer.kind]}
                  </p>
                ) : (
                  <div>
                    <form.Field name="kind">
                      {(field) => (
                        <Select field={field} label="Tipo de oferta" id={`${prefix}-kind`} required>
                          <option value="">Selecione</option>
                          {selectableModalities.map((kind) => (
                            <option key={kind} value={kind}>
                              {modalityLabels[kind]}
                            </option>
                          ))}
                        </Select>
                      )}
                    </form.Field>
                    {fieldError('kind')}
                  </div>
                )}
                <div>
                  <form.Field name="label">
                    {(field) => (
                      <Input
                        field={field}
                        label={
                          <span>
                            Nome da oferta{' '}
                            <span className={requiredLabel ? undefined : 'field-optional'}>
                              {requiredLabel ? '(obrigatório)' : '(opcional)'}
                            </span>
                          </span>
                        }
                        id={`${prefix}-label`}
                        maxLength={calendarLimits.maximumTextLength}
                        required={requiredLabel}
                        aria-invalid={Boolean(messageFor('label'))}
                        aria-describedby={`${prefix}-label-error`}
                      />
                    )}
                  </form.Field>
                  {fieldError('label', `${prefix}-label-error`)}
                </div>
              </div>
              <form.Field name="delivery">
                {(field) => (
                  <ChoiceGroup<OfferDelivery>
                    label="Modo de oferta"
                    id={`${prefix}-delivery`}
                    className="offer-choice"
                    value={field.state.value}
                    options={deliveryOptions}
                    disabled={readOnly}
                    onValueChange={(value) => field.handleChange(value)}
                  />
                )}
              </form.Field>
              {fieldError('delivery')}
              <details
                className="offer-more"
                open={showBasis || Boolean(messageFor('organizationBasis'))}
                onToggle={(event) => setShowBasis(event.currentTarget.open)}
              >
                <summary>
                  Base da organização <span className="field-optional">(opcional)</span>
                </summary>
                <form.Field name="organizationBasis">
                  {(field) => (
                    <Input
                      field={field}
                      label="Documento que fundamenta a organização"
                      id={`${prefix}-organizationBasis`}
                      placeholder="Ex.: PPC aprovado pela Resolução nº …"
                      maxLength={calendarLimits.maximumTextLength}
                    />
                  )}
                </form.Field>
                {fieldError('organizationBasis')}
              </details>
            </section>
            <section className="offer-block" aria-labelledby={`${prefix}-structure-heading`}>
              <BlockHeading id={`${prefix}-structure-heading`} step={2} state={blockState(1)}>
                Estrutura do ano
              </BlockHeading>
              <p className="help">
                A divisão do ano define quantos períodos e etapas aparecem a seguir.
              </p>
              <div className="offer-settings-grid">
                <div>
                  <form.Field name="organization">
                    {(field) => (
                      <ChoiceGroup
                        label="Organização"
                        id={`${prefix}-organization`}
                        className="offer-choice offer-choice-inline"
                        value={field.state.value || null}
                        options={organizationOptions}
                        disabled={readOnly}
                        aria-invalid={Boolean(messageFor('organization'))}
                        onValueChange={(value) => field.handleChange(value)}
                      />
                    )}
                  </form.Field>
                  {fieldError('organization')}
                </div>
                <div>
                  <form.Field name="count">
                    {(field) => (
                      <ChoiceGroup
                        label={semestral ? 'Etapas por semestre' : 'Etapas no ano'}
                        id={`${prefix}-count`}
                        className="offer-choice offer-choice-inline"
                        value={validCount ? field.state.value : null}
                        options={allowedCounts.map((count) => ({
                          value: String(count),
                          label: String(count),
                        }))}
                        disabled={readOnly || !values.organization}
                        aria-describedby={
                          values.organization === 'anual' ? undefined : `${prefix}-count-help`
                        }
                        aria-invalid={Boolean(messageFor('count'))}
                        onValueChange={(value) => field.handleChange(value)}
                      />
                    )}
                  </form.Field>
                  {values.organization !== 'anual' && (
                    <p className="help" id={`${prefix}-count-help`}>
                      {semestral
                        ? 'A numeração reinicia no segundo semestre.'
                        : 'Escolha a organização para definir a quantidade.'}
                    </p>
                  )}
                  {fieldError('count')}
                </div>
              </div>
              {savedTotal && count && count < savedTotal ? (
                <p className="help">
                  Etapas e atividades além da quantidade escolhida serão preservadas como registros
                  sem vínculo de avaliação.
                </p>
              ) : null}
            </section>
            <section className="offer-block" aria-labelledby={`${prefix}-dates-heading`}>
              <BlockHeading id={`${prefix}-dates-heading`} step={3} state={blockState(2)}>
                Períodos e etapas
              </BlockHeading>
              <OfferTimeline year={state.year} cycles={timelineCycles(values)} />
              {cycles.map((cycle) => {
                const term = semestral ? `${cycle + 1}º semestre` : 'Ano letivo';
                return (
                  <fieldset className="offer-term" key={cycle}>
                    <legend>{term}</legend>
                    <fieldset className="offer-period-fields">
                      <legend>
                        Período letivo<span className="visually-hidden"> — {term}</span>
                      </legend>
                      {unclassified.length > 0 && (
                        <label>
                          Usar período existente a classificar
                          <select
                            id={`${prefix}-source-${cycle}`}
                            value={values.periods[cycle].sourceId}
                            onChange={(event) => {
                              const period = unclassified.find(
                                (item) => item.id === event.target.value,
                              );
                              form.setFieldValue(`periods[${cycle}]`, {
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
                        {(['start', 'end'] as const).map((edge) => (
                          <form.Field key={edge} name={`periods[${cycle}].${edge}`}>
                            {(field) => (
                              <Input
                                field={field}
                                label={edge === 'start' ? 'Início' : 'Término'}
                                id={`${prefix}-period-${cycle}-${edge}`}
                                type="date"
                                required
                                min={`${state.year}-01-01`}
                                max={`${state.year}-12-31`}
                                aria-invalid={Boolean(messageFor(`periods[${cycle}]`))}
                                aria-describedby={`${prefix}-period-${cycle}-error`}
                              />
                            )}
                          </form.Field>
                        ))}
                      </div>
                      {fieldError(`periods[${cycle}]`, `${prefix}-period-${cycle}-error`)}
                    </fieldset>
                    {validCount ? (
                      values.stages
                        .slice(cycle * perTerm, (cycle + 1) * perTerm)
                        .map((_, localIndex) => {
                          const index = cycle * perTerm + localIndex;
                          const message = messageFor(`stages[${index}]`);
                          return (
                            <fieldset key={index} className="offer-stage-fields">
                              <legend>
                                {localIndex + 1}ª etapa
                                {semestral && <span className="visually-hidden"> — {term}</span>}
                              </legend>
                              <div className="offer-date-grid">
                                {(['start', 'end'] as const).map((edge) => (
                                  <form.Field key={edge} name={`stages[${index}].${edge}`}>
                                    {(field) => (
                                      <Input
                                        field={field}
                                        label={edge === 'start' ? 'Início' : 'Término'}
                                        id={`${prefix}-stage-${index}-${edge}`}
                                        type="date"
                                        required
                                        min={`${state.year}-01-01`}
                                        max={`${state.year}-12-31`}
                                        aria-invalid={Boolean(message)}
                                        aria-describedby={`${prefix}-stage-${index}-error`}
                                      />
                                    )}
                                  </form.Field>
                                ))}
                              </div>
                              {fieldError(`stages[${index}]`, `${prefix}-stage-${index}-error`)}
                            </fieldset>
                          );
                        })
                    ) : (
                      <p className="help offer-term-empty">
                        As etapas aparecem aqui depois de escolher a quantidade.
                      </p>
                    )}
                  </fieldset>
                );
              })}
              {fieldError('periods')}
            </section>
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
