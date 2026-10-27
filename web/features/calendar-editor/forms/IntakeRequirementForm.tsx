import type { AcademicTerm, ActivityRequirement } from '../../../../src/domain-types.ts';
import { configureIntakeRequirement } from '../../../../src/calendar-edits/commands.ts';
import { modalityLabels } from '../../../../src/modalities.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from './useCalendarForm.ts';
import { Check, Input } from './fields.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';

function OfferRequirement({ modality, term }: { modality: string; term: AcademicTerm }) {
  const { state, session, readOnly } = useCalendarEditor();
  const current = state.intakeByModality?.[modality]?.[term];
  const { form, values, submit, error } = useCalendarForm(
    `intake-requirement:${modality}:${term}`,
    {
      required: current?.required ?? false,
      source: current?.source ?? '',
    },
    (value) => {
      session.apply((state) =>
        configureIntakeRequirement(state, modality, term, value.required, value.source),
      );
    },
  );
  const identity = `intake-${modality}-${term}`;
  return (
    <form onSubmit={submit} data-intake-requirement={`${modality}:${term}`}>
      <fieldset disabled={readOnly}>
        <legend>{modalityLabels[modality]}</legend>
        {current?.status && current.status !== 'unknown' && (
          <p className="help">
            Ingresso informado: {current.status === 'yes' ? 'há ingresso' : 'não há ingresso'}.
          </p>
        )}
        <form.Field name="required">
          {(field) => (
            <Check
              field={field}
              id={`${identity}-required`}
              label="Exigir esta atividade no calendário"
            />
          )}
        </form.Field>
        {(values.required || values.source) && (
          <form.Field name="source">
            {(field) => (
              <Input
                field={field}
                id={`${identity}-source`}
                label="Referência da regra local"
                required={values.required}
                maxLength={240}
              />
            )}
          </form.Field>
        )}
        <button type="submit">Salvar exigência</button>
        <FormFeedback error={error} />
      </fieldset>
    </form>
  );
}

export default function IntakeRequirementForm({ item }: { item: ActivityRequirement }) {
  const { state } = useCalendarEditor();
  if (
    state.year !== 2027 ||
    state.scopeConfirmation?.status === 'own-regulation' ||
    !item.id.startsWith('registration-') ||
    !item.term
  )
    return null;
  const term = item.term;
  return (
    <details className="activity-detail">
      <summary>Exigência por regra local</summary>
      <p className="help">
        O cadastro de datas é permitido sem configurar ingresso. Exija esta atividade somente quando
        houver regra local com referência. Isso não altera as obrigações de veteranos.
      </p>
      {state.modalities
        .filter((m) => m !== 'posgraduacao' && (!item.modalities || item.modalities.includes(m)))
        .map((m) => (
          <OfferRequirement key={`${m}:${term}`} modality={m} term={term} />
        ))}
    </details>
  );
}
