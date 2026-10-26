import { useRef } from 'react';
import { calendars } from '../../../shared/convex/calendars.ts';
import { filePayload } from '../../../upload.ts';
import { useDraftForm } from '../../../shared/forms/useDraftForm.ts';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';
import type { History } from '../types.ts';

export default function RestoreHistoryForm({ history }: { history: History }) {
  const input = useRef<HTMLInputElement>(null);
  const { form, submit, pending, error } = useDraftForm({
    defaultValues: { file: null as File | null },
    draftKey: `history:${history.id}:restore-original`,
    excludeFromDraft: ['file'],
    onSubmit: async (value, operation) => {
      if (!value.file) throw new Error('Escolha o PDF original.');
      const payload = await filePayload(value.file);
      await calendars.restoreHistoryOriginal(history.id, payload.uploadId);
      if (operation.isCurrent()) {
        form.reset();
        if (input.current) input.current.value = '';
      }
    },
  });
  return (
    <form data-restore-history={history.id} onSubmit={submit}>
      <fieldset disabled={pending}>
        <form.Field name="file">
          {(field) => (
            <label>
              PDF original
              <input
                name="original"
                ref={input}
                type="file"
                accept="application/pdf,.pdf"
                required
                onChange={(event) => field.handleChange(event.target.files?.[0] || null)}
              />
            </label>
          )}
        </form.Field>
        <small>
          Selecione o mesmo PDF original deste registro. Os dados e análises serão preservados.
        </small>
        <button type="submit">{pending ? 'Restaurando…' : 'Restaurar PDF original'}</button>
        <FormFeedback error={error} />
      </fieldset>
    </form>
  );
}
