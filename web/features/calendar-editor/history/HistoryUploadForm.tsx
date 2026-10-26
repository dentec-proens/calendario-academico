import { useRef } from 'react';
import { calendars } from '../../../shared/convex/calendars.ts';
import { filePayload } from '../../../upload.ts';
import { useDraftForm } from '../../../shared/forms/useDraftForm.ts';
import { FormFeedback } from '../../../shared/forms/FormFeedback.tsx';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { useHistoryAnalysis } from './useHistoryAnalysis.tsx';

export default function HistoryUploadForm() {
  const { record, state, readOnly, notify } = useCalendarEditor();
  const analysis = useHistoryAnalysis();
  const input = useRef<HTMLInputElement>(null);
  const { form, submit, error, pending } = useDraftForm({
    defaultValues: { file: null as File | null, notes: '' },
    draftKey: `calendar:${record.id}:history-upload`,
    excludeFromDraft: ['file'],
    onSubmit: async (value, operation) => {
      if (!value.file) throw new Error('Envie um PDF de até 8 MB.');
      const file = value.file;
      const payload = await filePayload(file);
      const uploaded = await calendars.uploadHistory(record.id, {
        filename: file.name,
        year: state.year - 1,
        ...payload,
        notes: value.notes,
      });
      if (!operation.isCurrent()) return;
      form.reset();
      if (input.current) input.current.value = '';
      notify('Calendário anterior guardado neste campus.');
      await analysis.analyze(uploaded.id);
    },
  });
  return (
    <form id="history-form" onSubmit={submit}>
      <fieldset disabled={readOnly || pending}>
        <form.Field name="file">
          {(field) => (
            <label>
              Arquivo PDF do ano anterior (até 8 MB)
              <input
                id="history-file"
                ref={input}
                type="file"
                accept="application/pdf,.pdf"
                required
                onChange={(event) => field.handleChange(event.target.files?.[0] || null)}
              />
            </label>
          )}
        </form.Field>
        <form.Field name="notes">
          {(field) => (
            <label>
              Elementos históricos para revisar
              <textarea
                id="history-notes"
                maxLength={5000}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </label>
          )}
        </form.Field>
        <FormFeedback error={error} />
        <button id="history-submit" type="submit">
          {pending ? 'Enviando…' : 'Enviar e identificar feriados e eventos'}
        </button>
      </fieldset>
    </form>
  );
}
