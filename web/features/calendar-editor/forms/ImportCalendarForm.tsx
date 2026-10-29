import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { useDraftForm } from '../../../shared/forms/useDraftForm.ts';
import { useFormDrafts } from '../../../shared/forms/drafts.tsx';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';
import { normalizeOfferCalendar } from '#src/domain/calendar/normalization/normalize-v4.ts';
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
      const parsed: unknown = JSON.parse(await value.file.text());
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !('schemaVersion' in parsed) ||
        parsed.schemaVersion !== 4
      )
        throw new Error(
          'Esta cópia foi gerada por uma versão anterior do sistema e não pode mais ser importada.',
        );
      // Normalization validates the same closed literals used by the v4 transport.
      const imported = normalizeOfferCalendar(parsed) as CalendarState;
      if (imported.year !== state.year || imported.campus !== state.campus)
        throw new Error('A cópia pertence a outro ano ou campus.');
      if (
        state.offers.some(
          (offer) =>
            !imported.offers.some((next) => next.id === offer.id && next.kind === offer.kind),
        )
      )
        throw new Error(
          'A cópia deve preservar a identidade e o tipo de todas as ofertas já salvas.',
        );
      if (!isCurrent()) return;
      await confirmAction({
        title: 'Aplicar cópia ao calendário?',
        description: `Os dados aplicados serão substituídos pelo conteúdo conferido do arquivo. Formato 4: ${imported.offers.length} ofertas, ${imported.periods.length} períodos e ${imported.events.length} eventos.`,
        consequence: 'Os campos em preenchimento devem ser conferidos antes de continuar.',
        confirmLabel: 'Aplicar cópia',
        intent: 'warning',
        onConfirm: () => {
          if (!isCurrent()) return Promise.resolve();
          const next: CalendarState = structuredClone(imported);
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
