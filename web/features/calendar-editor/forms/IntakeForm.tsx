import type { IntakeConfiguration } from '../../../../src/domain-types.ts';
import { organizationForModality, termLabels } from '../../../../src/calendar-rules/index.ts';
import { modalityLabels } from '../../../../src/modalities.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from './useCalendarForm.ts';
import { Select, Input, Check } from './fields.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';
import { Notice } from '../../../components/ui/Notice.tsx';

export default function IntakeForm() {
  const { state, session, readOnly } = useCalendarEditor();
  const defaults: { intake: Record<string, Record<string, IntakeConfiguration>> } = {
    intake: Object.fromEntries(
      state.modalities.map((modality) => [
        modality,
        Object.fromEntries(
          (organizationForModality(state, modality) === 'semestral'
            ? ['first', 'second']
            : ['annual']
          ).map((term) => [
            term,
            state.intakeByModality?.[modality]?.[term] ?? {
              status: 'unknown',
              source: '',
              required: false,
            },
          ]),
        ),
      ]),
    ),
  };
  const { form, submit, error } = useCalendarForm('intake', defaults, (value) => {
    for (const periods of Object.values(value.intake))
      for (const entry of Object.values(periods)) {
        if (entry.required && (!entry.source?.trim() || entry.status !== 'yes'))
          throw new Error(
            'A exigência de matrícula de ingressantes depende de ingresso confirmado e regra local com fonte.',
          );
      }
    session.apply((current) => ({ ...current, intakeByModality: value.intake }));
  });
  return (
    <form id="intake-form" onSubmit={submit}>
      <h3>Ingresso por oferta e período</h3>
      <p className="help">
        A ausência de informação não significa ausência de ingresso. Esta configuração não dispensa
        matrícula, ajuste ou trancamento de veteranos. Matrícula de ingressantes só é exigida com
        regra aplicável e fonte.
      </p>
      {state.secondSemesterIntake !== undefined && (
        <Notice tone="warning">
          Contexto legado: ingresso geral no segundo semestre{' '}
          {state.secondSemesterIntake ? 'presente' : 'ausente'}. Confirme cada oferta antes de usar
          essa declaração.
        </Notice>
      )}
      <fieldset disabled={readOnly}>
        {state.modalities.map((modality) => (
          <fieldset key={modality}>
            <legend>{modalityLabels[modality]}</legend>
            {(organizationForModality(state, modality) === 'semestral'
              ? (['first', 'second'] as const)
              : (['annual'] as const)
            ).map((term) => (
              <div key={term} className="intake-period">
                <h4>{termLabels[term]}</h4>
                <form.Field name={`intake.${modality}.${term}.status`}>
                  {(field) => (
                    <Select
                      field={field}
                      id={`intake-${modality}-${term}`}
                      label="Há ingresso de novos estudantes?"
                    >
                      <option value="unknown">Não informado</option>
                      <option value="yes">Há ingresso</option>
                      <option value="no">Não há ingresso</option>
                    </Select>
                  )}
                </form.Field>
                <form.Field name={`intake.${modality}.${term}.source`}>
                  {(field) => (
                    <Input
                      field={field}
                      id={`intake-source-${modality}-${term}`}
                      label="Fonte da configuração ou regra local"
                      maxLength={240}
                    />
                  )}
                </form.Field>
                <form.Field name={`intake.${modality}.${term}.required`}>
                  {(field) => (
                    <Check
                      field={field}
                      id={`intake-required-${modality}-${term}`}
                      label="Há regra local que exige período de matrícula dos ingressantes, conforme a fonte informada."
                    />
                  )}
                </form.Field>
              </div>
            ))}
          </fieldset>
        ))}
        <button type="submit">Aplicar ingresso por oferta</button>
        <FormFeedback error={error} />
      </fieldset>
    </form>
  );
}
