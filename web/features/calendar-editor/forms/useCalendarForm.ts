import { useEffect, useRef } from 'react';
import { useDraftForm } from '../../../shared/forms/useDraftForm.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { equalValues } from '#src/shared/equal.ts';

interface CalendarFormOptions<T> {
  successMessage?: (value: T) => string;
  nonEditingFields?: ReadonlyArray<keyof T>;
  applyOnChange?: boolean;
  onSubmit?: () => void;
}

export function useCalendarForm<T extends object>(
  id: string,
  defaultValues: T,
  onApply: (value: T) => T | void,
  options: CalendarFormOptions<T> = {},
) {
  const { session, record, notify, readOnly } = useCalendarEditor();
  const pendingDefaults = useRef<T | null>(null);
  function apply(values: T) {
    if (readOnly) throw new Error('Consulta em modo somente leitura.');
    const next = onApply(values);
    pendingDefaults.current = null;
    result.form.reset(next === undefined ? values : next);
    session.setFormDirty(id, false);
  }
  const result = useDraftForm({
    defaultValues,
    draftKey: `calendar:${record.id}:${id}`,
    nonEditingFields: options.nonEditingFields,
    onChange: options.applyOnChange ? apply : undefined,
    onSubmit: (values) => {
      apply(values);
      notify(options.successMessage?.(values) ?? '');
      options.onSubmit?.();
    },
  });
  const dirty = result.dirty;
  const previousVersion = useRef(record.version);
  const confirmedDefaults = useRef(defaultValues);
  useEffect(() => {
    if (id === 'event') return;
    if (previousVersion.current !== record.version) {
      previousVersion.current = record.version;
      if (!equalValues(confirmedDefaults.current, defaultValues))
        pendingDefaults.current = defaultValues;
      confirmedDefaults.current = defaultValues;
    }
    // Track local applications too: their server acknowledgement must not reset
    // a text field (or its caret) while the person is still typing.
    if (options.applyOnChange) confirmedDefaults.current = defaultValues;
    if (!dirty && pendingDefaults.current) {
      const fresh = pendingDefaults.current;
      pendingDefaults.current = null;
      result.form.reset(fresh);
    }
  }, [defaultValues, dirty, id, options.applyOnChange, record.version, result.form]);
  useEffect(() => {
    session.setFormDirty(id, dirty);
  }, [dirty, id, session]);
  return result;
}
