import type { RefObject } from 'react';
import { useDraftForm } from '../../../shared/forms/useDraftForm.ts';
import { useFormDrafts } from '../../../shared/forms/drafts.tsx';
import { normalizeOfferCalendar } from '#src/domain/calendar/normalization/normalize.ts';
import { earlierFormatCopyMessage } from '#src/domain/calendar/normalization/input.ts';
import { calendarSchemaVersion } from '#src/domain/calendar/model.ts';
import { confirmAction } from '../../../components/confirmation.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import type { CalendarState } from '../types.ts';

/**
 * The file input and what follows from it. It stays mounted outside the "Mais ações" menu, which
 * closes and unmounts as the file chooser opens; a refusal is reported through the page feedback.
 */
export default function ImportCalendarForm({
  input,
}: {
  input: RefObject<HTMLInputElement | null>;
}) {
  const { state, record, session, notify, readOnly } = useCalendarEditor();
  const drafts = useFormDrafts();
  const { form, submit, pending } = useDraftForm({
    defaultValues: { file: null as File | null },
    onError: (message) => notify('Não foi possível abrir a cópia: ' + message, true),
    onSubmit: async (value, { isCurrent }) => {
      if (!value.file || value.file.size > 2_000_000)
        throw new Error('Escolha uma cópia JSON de até 2 MB.');
      const parsed: unknown = JSON.parse(await value.file.text());
      const version =
        parsed && typeof parsed === 'object' && 'schemaVersion' in parsed
          ? parsed.schemaVersion
          : undefined;
      // A copy of an earlier format is refused, never converted: conversion belongs only to the
      // migration of that format.
      if (version === 4 || version === 5) throw new Error(earlierFormatCopyMessage(version));
      if (version !== calendarSchemaVersion)
        throw new Error(
          'Esta cópia foi gerada por uma versão anterior do sistema e não pode mais ser importada.',
        );
      // Importing is saving: normalization validates the literals and keeps only the links
      // already recorded on the same dates; any other link needs a generated activity.
      const imported = normalizeOfferCalendar(parsed, record.state) as CalendarState;
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
        description: `Os dados aplicados serão substituídos pelo conteúdo conferido do arquivo. Formato ${calendarSchemaVersion}: ${imported.offers.length} ofertas, ${imported.periods.length} períodos e ${imported.events.length} eventos.`,
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
          notify('Cópia aplicada ao calendário.');
          return Promise.resolve();
        },
      });
      if (isCurrent()) form.reset();
    },
  });
  return (
    <form onSubmit={submit} hidden>
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
      </fieldset>
    </form>
  );
}
