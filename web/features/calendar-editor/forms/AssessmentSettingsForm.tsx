import {
  configureAssessment,
  enableAutomaticAssessment,
} from '../../../../src/calendar-edits/commands.ts';
import { modalityLabels } from '../../../../src/modalities.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from './useCalendarForm.ts';
import { FormActions } from '../../../shared/forms/FormActions.tsx';
import { Button } from '../../../components/ui/Button.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';

export default function AssessmentSettingsForm() {
  const { state, session, institutional, readOnly, applyCommand } = useCalendarEditor();
  const { form, submit, error } = useCalendarForm(
    'assessment',
    {
      stages: Object.fromEntries(
        state.modalities.map((modality) => [
          modality,
          String(state.assessmentStagesByModality[modality] || ''),
        ]),
      ),
    },
    function apply(value) {
      session.apply((current) => configureAssessment(current, value.stages, institutional));
    },
  );
  return (
    <form onSubmit={submit}>
      <fieldset disabled={readOnly}>
        <div id="assessment-settings" className="row-form">
          <form.Field name="stages">
            {(field) => (
              <>
                {state.modalities.map((modality) => (
                  <label key={modality}>
                    {modalityLabels[modality]} — etapas de avaliação no ano
                    <select
                      data-assessment-modality={modality}
                      value={field.state.value[modality] || ''}
                      onChange={(event) =>
                        field.handleChange({ ...field.state.value, [modality]: event.target.value })
                      }
                    >
                      <option value="">Selecione</option>
                      <option value="2">2 etapas / semestres</option>
                      <option value="3">3 etapas / trimestres</option>
                      <option value="4">4 etapas / bimestres</option>
                    </select>
                  </label>
                ))}
              </>
            )}
          </form.Field>
        </div>
        <FormFeedback error={error} />
        <FormActions>
          <Button type="submit">Definir etapas</Button>
          <Button
            type="button"
            id="recalculate-stages"
            variant="secondary"
            onClick={() =>
              applyCommand((current) => enableAutomaticAssessment(current, institutional))
            }
          >
            Recalcular datas das etapas
          </Button>
        </FormActions>
      </fieldset>
      {state.periods.some((period) => period.targetDays) && (
        <p id="assessment-auto-status" role="status">
          Períodos com meta de dias letivos ajustam suas etapas automaticamente.
        </p>
      )}
    </form>
  );
}
