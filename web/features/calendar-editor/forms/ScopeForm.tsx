import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useCalendarForm } from './useCalendarForm.ts';
import { Input, Select } from './fields.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';

/** Normative confirmation belongs to the review, independently of teaching dates. */
export default function ScopeForm() {
  const { state, session, readOnly } = useCalendarEditor();
  const defaults: { status: '' | 'covered' | 'own-regulation'; source: string } = {
    status: state.scopeConfirmation?.status ?? '',
    source: state.scopeConfirmation?.source ?? '',
  };
  const { form, submit, error } = useCalendarForm('scope', defaults, (value) => {
    if (!value.status || !value.source.trim())
      throw new Error('Confirme a norma aplicável e informe a referência do curso ou da decisão.');
    const status = value.status;
    session.apply((current) => ({
      ...current,
      scopeConfirmation: {
        status,
        source: value.source.trim(),
      },
    }));
    requestAnimationFrame(() => document.getElementById('scope-summary')?.focus());
  });
  if (state.year !== 2027) return null;
  return (
    <div className="panel">
      <h3>Norma aplicável ao calendário</h3>
      <p className="help">
        A referência institucional de 2027 é a Resolução 292. Confirme se ela abrange os cursos
        deste calendário. A oferta, sozinha, não identifica essa aplicação.
      </p>
      <details open={!state.scopeConfirmation}>
        <summary id="scope-summary">
          {state.scopeConfirmation ? 'Conferir norma e referência' : 'Confirmar norma aplicável'}
        </summary>
        <form id="scope-form" onSubmit={submit}>
          <fieldset disabled={readOnly}>
            <form.Field name="status">
              {(field) => (
                <Select field={field} id="calendar-scope" label="Norma aplicável">
                  <option value="">Selecione</option>
                  <option value="covered">Resolução 292 — técnico ou graduação abrangido</option>
                  <option value="own-regulation">
                    Norma própria — EaD, qualificação, pós ou outro caso
                  </option>
                </Select>
              )}
            </form.Field>
            <form.Field name="source">
              {(field) => (
                <Input
                  field={field}
                  id="calendar-scope-source"
                  label="Referência do curso ou da decisão"
                  required
                  maxLength={240}
                />
              )}
            </form.Field>
            <p className="help">
              Use a referência que comprove o enquadramento, como o PPC ou uma decisão
              institucional. Calendários com norma própria permanecem sem conclusão automática pela
              Resolução 292.
            </p>
            <button type="submit">Confirmar norma</button>
            <FormFeedback error={error} />
          </fieldset>
        </form>
      </details>
    </div>
  );
}
