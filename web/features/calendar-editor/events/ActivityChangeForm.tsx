import { useEffect, useRef } from 'react';
import {
  activityChangeOptions,
  changeActivity,
  previewActivityChange,
  type ActivityChangePreview,
} from '#src/domain/calendar/commands/events.ts';
import { activityKey } from '#src/domain/calendar/activities/activity-ref.ts';
import { linkIssueLabels } from '#src/domain/calendar/activities/links.ts';
import { labelFor } from '#src/domain/calendar/offers.ts';
import { DomainError } from '#src/domain/errors.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from '../forms/useCalendarForm.ts';
import { Select } from '../forms/fields.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';
import { FormActions } from '../../../shared/forms/FormActions.tsx';
import { Button } from '../../../components/ui/Button.tsx';
import { Notice } from '../../../components/ui/Notice.tsx';
import { civilDate } from './activity-query.ts';

/**
 * **Corrigir atividade vinculada**: the campus chooses another generated
 * activity for the whole date and confirms it after a preview. Description, dates, offers and ID
 * stay as they are; the link is never removed here.
 */
export default function ActivityChangeForm({
  eventId,
  onClose,
}: {
  eventId: string;
  onClose: (applied: boolean) => void;
}) {
  const { state, institutional, session, readOnly } = useCalendarEditor();
  const options = activityChangeOptions(state, eventId);
  const formId = `activity-change:${eventId}`;
  const { form, submit, error, pending, values } = useCalendarForm(
    formId,
    { activity: '' },
    (value) => {
      const row = options.find((option) => activityKey(option.activity) === value.activity);
      if (!row) throw new DomainError('Escolha a atividade correta para a data.');
      session.apply((current) => changeActivity(current, eventId, row.activity, institutional));
      return { activity: '' };
    },
    {
      successMessage: () => 'Atividade vinculada corrigida.',
      onSubmit: () => onClose(true),
    },
  );
  const select = useRef<HTMLSelectElement>(null);
  useEffect(() => select.current?.focus(), []);
  const chosen = options.find((option) => activityKey(option.activity) === values.activity);
  let preview: ActivityChangePreview | undefined;
  let previewError = '';
  if (chosen)
    try {
      preview = previewActivityChange(state, eventId, chosen.activity, institutional);
    } catch (cause) {
      previewError = cause instanceof Error ? cause.message : String(cause);
    }
  const discard = () => {
    form.reset({ activity: '' });
    session.setFormDirty(formId, false);
    onClose(false);
  };
  return (
    <form
      id="activity-change-form"
      className="activity-change"
      aria-labelledby="activity-change-title"
      onSubmit={submit}
    >
      <h3 id="activity-change-title">Corrigir atividade vinculada</h3>
      <p className="help">
        A correção troca somente a atividade vinculada à data inteira. Descrição, início, término,
        ofertas e identificação da data não mudam.
      </p>
      {options.length ? (
        <fieldset disabled={readOnly || pending}>
          <form.Field name="activity">
            {(field) => (
              <Select
                field={field}
                label="Atividade correta"
                id="activity-change-select"
                ref={select}
              >
                <option value="">Escolha a atividade</option>
                {options.map((option) => (
                  <option key={activityKey(option.activity)} value={activityKey(option.activity)}>
                    {option.name}
                  </option>
                ))}
              </Select>
            )}
          </form.Field>
          {preview && (
            <section
              id="activity-change-preview"
              className="activity-change-preview"
              aria-labelledby="activity-change-preview-title"
              aria-live="polite"
            >
              <h4 id="activity-change-preview-title">Prévia da correção</h4>
              <dl>
                <dt>Data</dt>
                <dd>
                  {preview.date.name} · {civilDate(preview.date.start)} a{' '}
                  {civilDate(preview.date.end)} ·{' '}
                  {preview.date.offers.map((offer) => labelFor(state, offer)).join(', ')} (sem
                  alteração)
                </dd>
                <dt>Vínculo atual</dt>
                <dd>
                  {preview.from.name ?? <code>{activityKey(preview.from.activity)}</code>}
                  {preview.from.issue && ` — ${linkIssueLabels[preview.from.issue]}`}
                </dd>
                <dt>Nova atividade vinculada</dt>
                <dd>{preview.to.name}</dd>
                <dt>Depois da correção</dt>
                <dd>
                  {preview.issueAfter
                    ? `A data continua em Vínculo a conferir: ${linkIssueLabels[preview.issueAfter]}.`
                    : 'A data deixa Vínculo a conferir e passa a ser avaliada na atividade escolhida.'}
                </dd>
              </dl>
            </section>
          )}
          <FormFeedback error={error || previewError} />
          <FormActions>
            <Button type="submit" id="activity-change-confirm" disabled={!preview}>
              Confirmar correção
            </Button>
            <Button variant="secondary" id="activity-change-cancel" onClick={discard}>
              Cancelar
            </Button>
          </FormActions>
        </fieldset>
      ) : (
        <>
          <Notice tone="info" id="activity-change-empty">
            Nenhuma atividade da organização atual abrange todas as ofertas desta data. Ajuste a
            organização da oferta ou as ofertas da data e volte a corrigir o vínculo.
          </Notice>
          <FormActions>
            <Button variant="secondary" id="activity-change-cancel" onClick={discard}>
              Voltar
            </Button>
          </FormActions>
        </>
      )}
    </form>
  );
}
