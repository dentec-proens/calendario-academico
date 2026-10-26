import { useEffect, useRef } from 'react';
import { useDraftForm } from '../../../shared/forms/useDraftForm.ts';
import { useCalendarEditor } from '../session/CalendarEditorProvider.tsx';
import { equalValues } from '../../../../src/equal.ts';

export function useCalendarForm<T extends object>(
  id: string,
  defaultValues: T,
  onApply: (value: T) => T | void,
  successMessage?: (value: T) => string,
  nonEditingFields?: ReadonlyArray<keyof T>,
) {
  const { session, record, notify } = useCalendarEditor();
  const pendingDefaults = useRef<T | null>(null);
  const result = useDraftForm({
    defaultValues,
    draftKey: `calendar:${record.id}:${id}`,
    nonEditingFields,
    onSubmit: (values) => {
      const next = onApply(values);
      pendingDefaults.current = null;
      result.form.reset(next === undefined ? values : next);
      session.setFormDirty(id, false);
      notify(successMessage?.(values) ?? 'Alteração aplicada. Confira o indicador de salvamento.');
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
    if (!dirty && pendingDefaults.current) {
      const fresh = pendingDefaults.current;
      pendingDefaults.current = null;
      result.form.reset(fresh);
    }
  }, [defaultValues, dirty, id, record.version, result.form]);
  useEffect(() => {
    session.setFormDirty(id, dirty);
  }, [dirty, id, session]);
  return result;
}
