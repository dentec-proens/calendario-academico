import type { Organization } from '../../../../src/domain-types.ts';
import { organizationForModality } from '../../../../src/calendar-rules/index.ts';
import { configureOrganization } from '../../../../src/calendar-edits/commands.ts';
import { modalityLabels } from '../../../../src/modalities.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from './useCalendarForm.ts';
import { Input, Select } from './fields.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';

export default function OrganizationForm() {
  const { state, session, institutional, readOnly } = useCalendarEditor();
  const defaults: {
    organization: Record<string, Organization>;
    scopeStatus: '' | 'covered' | 'own-regulation';
    scopeSource: string;
  } = {
    organization: Object.fromEntries(
      state.modalities.map((modality) => [modality, organizationForModality(state, modality)]),
    ),
    scopeStatus: state.scopeConfirmation?.status ?? '',
    scopeSource: state.scopeConfirmation?.source ?? '',
  };
  const { form, submit, error } = useCalendarForm('organization', defaults, (value) => {
    if (state.year === 2027 && value.scopeStatus && !value.scopeSource.trim())
      throw new Error('Informe a fonte que identifica o escopo do calendário.');
    session.apply((current) => ({
      ...configureOrganization(current, value.organization, institutional),
      scopeConfirmation:
        state.year !== 2027
          ? current.scopeConfirmation
          : value.scopeStatus
            ? { status: value.scopeStatus, source: value.scopeSource.trim() }
            : undefined,
    }));
  });
  return (
    <form id="organization-form" onSubmit={submit}>
      <h3>Organização por oferta</h3>
      <p className="help">
        Identifique o ciclo de cada oferta. Cursos da mesma oferta com organizações diferentes
        precisam de calendários separados. Períodos legados ambíguos conservam datas e IDs até sua
        classificação.
      </p>
      {state.conversion?.organization === 'pending' && (
        <p className="notice">
          Organização legada a conferir. A contagem e a conclusão dependem da classificação das
          ofertas e de cada período.
        </p>
      )}
      <fieldset disabled={readOnly}>
        {state.year === 2027 && (
          <>
            <form.Field name="scopeStatus">
              {(field) => (
                <Select field={field} id="calendar-scope" label="Escopo de aplicação da norma">
                  <option value="">Escopo a conferir</option>
                  <option value="covered">Técnico ou graduação abrangido pela Resolução 292</option>
                  <option value="own-regulation">
                    Calendário próprio — EaD, qualificação, pós ou norma própria
                  </option>
                </Select>
              )}
            </form.Field>
            <form.Field name="scopeSource">
              {(field) => (
                <Input
                  field={field}
                  id="calendar-scope-source"
                  label="Fonte que identifica o escopo"
                  maxLength={240}
                />
              )}
            </form.Field>
            <p className="help">
              A oferta, sozinha, não identifica EaD ou qualificação. Confirme a abrangência e a
              norma aplicável antes de afirmar conformidade automática.
            </p>
          </>
        )}
        {state.modalities.map((modality) => (
          <form.Field key={modality} name={`organization.${modality}`}>
            {(field) => (
              <Select
                field={field}
                id={`organization-${modality}`}
                label={modalityLabels[modality]}
              >
                <option value="a-classificar">Organização a conferir</option>
                <option value="anual">Anual</option>
                <option value="semestral">Semestral</option>
              </Select>
            )}
          </form.Field>
        ))}
        <button type="submit">Aplicar organização por oferta</button>
        <FormFeedback error={error} />
      </fieldset>
    </form>
  );
}
