import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { useDraftForm } from '../../../shared/forms/useDraftForm.ts';
import { useFormDrafts } from '../../../shared/forms/drafts.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';
import { normalizeCalendar } from '../../../../src/calendar-normalize.ts';
import { confirmAction } from '../../../components/confirmation.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import type { CalendarState } from '../types.ts';

export default function ImportCalendarForm() {
  const { state, record, session, notify, readOnly } = useCalendarEditor();
  const drafts = useFormDrafts();
  const input = useRef<HTMLInputElement>(null);
  const { form, submit, pending, error } = useDraftForm({
    defaultValues: { file: null as File | null },
    onError: (message) => notify('Não foi possível abrir a cópia: ' + message, true),
    onSubmit: async (value, { isCurrent }) => {
      if (!value.file || value.file.size > 2_000_000)
        throw new Error('Escolha uma cópia JSON de até 2 MB.');
      const imported = normalizeCalendar(JSON.parse(await value.file.text()));
      const regime = imported.regime;
      if (
        regime !== 'anual' &&
        regime !== 'semestral' &&
        regime !== 'misto' &&
        regime !== 'a-classificar'
      )
        throw new Error('Organização inválida na cópia.');
      if (
        imported.year !== state.year ||
        imported.campus !== state.campus ||
        JSON.stringify(imported.modalities) !== JSON.stringify(state.modalities)
      )
        throw new Error('A cópia pertence a outro ano, campus, organização ou oferta.');
      if (!isCurrent()) return;
      await confirmAction({
        title: 'Aplicar cópia ao calendário?',
        description: `Os dados aplicados serão substituídos pelo conteúdo conferido do arquivo. Formato 3: ${imported.periods.length} períodos e ${imported.events.length} eventos.${imported.conversion?.organization === 'pending' ? ' A organização legada precisa de classificação na etapa 2; as datas e IDs serão conservados.' : ''}`,
        consequence: 'Os campos em preenchimento devem ser conferidos antes de continuar.',
        confirmLabel: 'Aplicar cópia',
        intent: 'warning',
        onConfirm: () => {
          if (!isCurrent()) return Promise.resolve();
          // The identity and enum values are retained from the opened record; normalized input supplies editable fields.
          const next: CalendarState = {
            ...state,
            ...imported,
            schemaVersion: 3,
            offer: state.offer,
            modalities: state.modalities,
            regime,
            periods: imported.periods.map((period) => ({
              ...period,
              association:
                period.association?.status === 'defined'
                  ? {
                      ...period.association,
                      modalities: state.modalities.filter(
                        (modality) =>
                          period.association?.status === 'defined' &&
                          period.association.modalities.includes(modality),
                      ),
                    }
                  : period.association,
            })),
            events: imported.events.map((event) => ({
              ...event,
              kind:
                event.kind === 'include'
                  ? 'include'
                  : event.kind === 'exclude'
                    ? 'exclude'
                    : 'note',
              modalities: event.modalities
                ? state.modalities.filter((modality) => event.modalities?.includes(modality))
                : undefined,
            })),
            assessmentStagesByModality: Object.fromEntries(
              Object.entries(imported.assessmentStagesByModality || {}).map(([modality, count]) => {
                if (count !== 2 && count !== 3 && count !== 4) throw new Error('Etapas inválidas.');
                return [modality, count];
              }),
            ),
          };
          drafts?.clearScope(`calendar:${record.id}:`);
          session.replace(next);
          form.reset();
          if (input.current) input.current.value = '';
          notify('Cópia aplicada. Confira o indicador de salvamento.');
          return Promise.resolve();
        },
      });
      if (isCurrent()) form.reset();
    },
  });
  return (
    <form onSubmit={submit}>
      <fieldset disabled={readOnly || pending}>
        <form.Field name="file">
          {(field) => (
            <label>
              <input
                id="file"
                ref={input}
                type="file"
                accept=".json,application/json"
                hidden
                aria-label="Arquivo da cópia JSON"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  field.handleChange(file);
                  event.currentTarget.value = '';
                  void form.handleSubmit().catch(() => undefined);
                }}
              />
            </label>
          )}
        </form.Field>
        <button
          id="load"
          type="button"
          className="secondary"
          aria-label="Importar cópia"
          aria-describedby="import-copy-description"
          title="Abra uma cópia editável (.json) deste mesmo calendário. Os dados atuais serão substituídos após sua confirmação."
          onClick={() => input.current?.click()}
        >
          <Upload aria-hidden="true" />
          <span className="editor-menu-copy">
            <span>Importar cópia</span>
            <small id="import-copy-description">Restaurar uma cópia editável (.json)</small>
          </span>
        </button>
        <FormFeedback error={error} />
      </fieldset>
    </form>
  );
}
