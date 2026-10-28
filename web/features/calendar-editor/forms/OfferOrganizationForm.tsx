import {
  assessmentStageCounts,
  organizationLabels,
  termsByOrganization,
  periodCountByOrganization,
  assessmentStageRequirementPattern,
} from '../../../../src/calendar-config.ts';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from './useCalendarForm.ts';
import {
  applyOfferOrganization,
  offerOrganizationDraft,
  offerOrganizationIssues,
} from '../../../../src/offer-organization.ts';
import { periodsForModality } from '../../../../src/calendar-rules/index.ts';
import { modalityLabels } from '../../../../src/modalities.ts';
import { civilDate } from '../events/activity-query.ts';
import { ChevronUp } from 'lucide-react';
import { Button } from '../../../components/ui/Button.tsx';
import { FormActions } from '../../../shared/forms/FormActions.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';
import { Input, Select } from './fields.tsx';
import { scrollIntoView } from '../../../scroll.ts';
import type { Modality } from '../types.ts';

export type OrganizationCheck = () => { message: string; reveal: () => void } | null;
export type RegisterOrganizationCheck = (
  modality: Modality,
  check: OrganizationCheck,
) => () => void;

export default function OfferOrganizationForm({
  modality,
  requestedStage,
  registerCheck,
  onResolved,
}: {
  modality: Modality;
  requestedStage?: string;
  registerCheck: RegisterOrganizationCheck;
  onResolved: () => void;
}) {
  const navigate = useNavigate();
  const { state, session, readOnly, record } = useCalendarEditor();
  const defaults = offerOrganizationDraft(state, modality);
  const [open, setOpen] = useState(false);
  const [collapsedHref, setCollapsedHref] = useState<string | null>(null);
  const location = useRouterState({ select: (router) => router.location.href });
  const [applied, setApplied] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const first = useRef<HTMLSelectElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const formElement = useRef<HTMLFormElement>(null);
  const prefix = `offer-${modality}`;
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
    `organization:${modality}`,
    defaults,
    (value) => {
      let next = state;
      session.apply((current) => {
        next = applyOfferOrganization(current, modality, value, () => crypto.randomUUID());
        return next;
      });
      setApplied(true);
      onResolved();
      close();
      return offerOrganizationDraft(next, modality);
    },
  );
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
  const issues = offerOrganizationIssues(state, modality, values);
  const visibleIssues =
    dirty || attempted ? issues : issues.filter((issue) => issue.message.includes('inteiramente'));
  const messageFor = (path: string) =>
    visibleIssues
      .filter((issue) => issue.path === path)
      .map((issue) => issue.message)
      .join(' ');
  const included = state.modalities.includes(modality);
  const periods = periodsForModality(state, modality);
  const count = Number(values.count);
  const savedCount = state.assessmentStagesByModality?.[modality];
  const unclassified = state.periods.filter((period) => period.association?.status !== 'defined');
  const datedStages = values.stages
    .slice(0, count)
    .filter((stage) => stage.start && stage.end).length;
  const stageIssues = issues.some(
    (issue) => issue.path.startsWith('stages') || issue.path === 'count',
  );
  useLayoutEffect(() =>
    registerCheck(modality, () => {
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
              : `${prefix}-organization`;
      return {
        message: `${modalityLabels[modality]}: ${issue ? issue.message : 'Aplique as alterações da organização antes de continuar.'}`,
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
          <h4 id={`${prefix}-heading`}>{modalityLabels[modality]}</h4>
          {(included || dirty) && (
            <p
              className={stageIssues || dirty ? 'offer-organization-pending' : 'help'}
              data-organization-progress
              role="status"
            >
              {!assessmentStageCounts.some((value) => value === count)
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
              {included && (savedCount ? ` · ${savedCount} etapas no ano` : ' · Etapas a definir')}
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
            <div className="offer-settings-grid">
              <div>
                <form.Field name="organization">
                  {(field) => (
                    <Select
                      field={field}
                      label="Organização"
                      id={`${prefix}-organization`}
                      ref={first}
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
              <div>
                <form.Field name="count">
                  {(field) => (
                    <Select field={field} label="Etapas no ano" id={`${prefix}-count`} required>
                      <option value="">Selecione</option>
                      {assessmentStageCounts.map((count) => (
                        <option key={count} value={count}>
                          {count} etapas
                        </option>
                      ))}
                    </Select>
                  )}
                </form.Field>
                {messageFor('count') && (
                  <p className="field-error" role="alert">
                    {messageFor('count')}
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
              {savedCount && count && count < savedCount ? (
                <p className="help">
                  Etapas e atividades além da quantidade escolhida serão preservadas como registros
                  sem vínculo de avaliação.
                </p>
              ) : null}
              <div className="offer-stages-grid">
                {values.stages.slice(0, count).map((_, index) => {
                  const message = messageFor(`stages[${index}]`);
                  return (
                    <fieldset key={index} className="offer-stage-fields">
                      <legend>{index + 1}ª etapa</legend>
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
                      <p className="field-error" id={`${prefix}-stage-${index}-error`} role="alert">
                        {message}
                      </p>
                    </fieldset>
                  );
                })}
              </div>
            </div>
            <FormFeedback error={error} />
            <FormActions>
              <Button type="submit" id={`${prefix}-apply`} disabled={issues.length > 0}>
                Aplicar organização de {modalityLabels[modality]}
              </Button>
              <Button
                type="button"
                variant="secondary"
                id={`${prefix}-cancel`}
                onClick={() => {
                  form.reset(defaults);
                  clearDraft();
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
