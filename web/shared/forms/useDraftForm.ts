import { useForm, useStore } from '@tanstack/react-form';
import {
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from 'react';
import { nativeError } from '../convex/errors.ts';
import { useFormDrafts } from './drafts.tsx';
import { equalValues } from '../../../src/equal.ts';

interface DraftFormOptions<T extends object> {
  defaultValues: T;
  /** Only non-sensitive values; credentials, tokens and File must stay ephemeral. */
  draftKey?: string;
  /** Fields remain in the live Form only; their values and metadata are not cached. */
  excludeFromDraft?: ReadonlyArray<keyof T>;
  /** Browsing preferences are cached but do not represent unapplied data. */
  nonEditingFields?: ReadonlyArray<keyof T>;
  onSubmit: (value: T, operation: { isCurrent: () => boolean }) => Promise<void> | void;
  onError?: (message: string) => void;
}

export function useDraftForm<T extends object>(options: DraftFormOptions<T>) {
  const { defaultValues, onError } = options;
  const drafts = useFormDrafts();
  const privateId = useId();
  const { draftKey } = options;
  const excluded = useMemo(
    () => new Set(options.excludeFromDraft?.map(String) ?? []),
    [options.excludeFromDraft],
  );
  const identity = draftKey ?? privateId;
  function readInitial() {
    const defaults = {
      values: options.defaultValues,
      baseline: options.defaultValues,
      fieldMetaBase: {},
    };
    const saved = draftKey && drafts ? drafts.read(draftKey, defaults) : defaults;
    return {
      identity,
      drafts,
      state: { ...saved, values: { ...options.defaultValues, ...saved.values } },
      baseline: { ...options.defaultValues, ...saved.baseline },
    };
  }
  const [initial, setInitial] = useState(readInitial);
  if (initial.identity !== identity || initial.drafts !== drafts) setInitial(readInitial());
  const baselineForEvents = useRef(initial.baseline);
  useLayoutEffect(() => {
    baselineForEvents.current = initial.baseline;
  }, [initial.baseline]);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const busy = useRef<string | null>(null);
  const currentIdentity = useRef(identity);
  useEffect(() => {
    currentIdentity.current = identity;
  }, [identity]);
  const form = useForm({
    formId: draftKey && !excluded.size ? `inspect:${draftKey}` : `private:${draftKey ?? privateId}`,
    defaultValues: initial.state.values,
    defaultState: { values: initial.state.values, fieldMetaBase: initial.state.fieldMetaBase },
    onSubmit: async ({ value }) => {
      const submittedIdentity = identity;
      if (drafts?.protection.locked) return;
      const operation = drafts?.begin(identity);
      if (operation === null) return;
      busy.current = submittedIdentity;
      let failure: string | undefined;
      setError('');
      try {
        await options.onSubmit(value, {
          isCurrent: () => mounted.current && currentIdentity.current === submittedIdentity,
        });
      } catch (cause) {
        failure = nativeError(cause).message;
        if (mounted.current && currentIdentity.current === submittedIdentity) {
          const message = nativeError(cause).message;
          setError(message);
          options.onError?.(message);
        }
        throw cause;
      } finally {
        if (drafts && operation) drafts.finish(identity, operation, failure);
        if (busy.current === submittedIdentity) busy.current = null;
      }
    },
  });
  const managedForm = useMemo(() => {
    // reset establishes a new baseline. Keep the hook's options aligned with it
    // so a subsequent render does not restore the initial subscription snapshot.
    const reset: typeof form.reset = (values, resetOptions) => {
      const next = values ?? initial.baseline;
      if (next && !resetOptions?.keepDefaultValues) {
        baselineForEvents.current = next;
        setInitial((current) => ({
          ...current,
          baseline: next,
          state: { values: next, baseline: next, fieldMetaBase: {} },
        }));
      }
      form.reset(next, resetOptions);
      if (draftKey && !resetOptions?.keepDefaultValues) drafts?.clear(draftKey);
    };
    const managed = Object.create(form) as typeof form;
    managed.reset = reset;
    return managed;
  }, [draftKey, drafts, form, initial.baseline]);
  const values = useStore(form.store, (state) => state.values);
  const nonEditing = useMemo(
    () => new Set(options.nonEditingFields?.map(String) ?? []),
    [options.nonEditingFields],
  );
  function hasChanges(values: T, baseline: T = initial.baseline) {
    const editable = (value: object) =>
      Object.fromEntries(Object.entries(value).filter(([key]) => !nonEditing.has(key)));
    return !equalValues(editable(values), editable(baseline));
  }
  const dirty = useStore(form.store, (state) => hasChanges(state.values));
  const localPending = useStore(form.store, (state) => state.isSubmitting);
  const sharedPending = useSyncExternalStore(
    drafts?.subscribe ?? emptySubscribe,
    () => Boolean(drafts?.pending(identity)),
    () => false,
  );
  const pending = localPending || sharedPending;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const liveRisk = useRef<() => boolean>(() => true);
  useLayoutEffect(() => {
    liveRisk.current = () =>
      hasChanges(form.state.values, baselineForEvents.current) ||
      form.state.isSubmitting ||
      busy.current === identity;
  });
  useLayoutEffect(() => {
    if (!drafts) return;
    const unregister = drafts.protection.register(() =>
      liveRisk.current() ? { kind: 'form', loss: true } : null,
    );
    const subscription = form.store.subscribe(() => drafts.protection.publish());
    return () => {
      unregister();
      subscription.unsubscribe();
    };
  }, [drafts, form, identity]);

  useLayoutEffect(() => {
    if (!draftKey || !drafts) return;
    const href = window.location.pathname;
    let active = true;
    let previousValues = form.state.values;
    let previousBaseline = baselineForEvents.current;
    const subscription = form.store.subscribe(() => {
      if (!active) return;
      const unchanged =
        equalValues(previousValues, form.state.values) &&
        equalValues(previousBaseline, baselineForEvents.current);
      previousValues = form.state.values;
      previousBaseline = baselineForEvents.current;
      // A metadata-only publication must never resurrect an explicitly discarded draft.
      if (unchanged && !drafts.has(draftKey)) return;
      if (equalValues(form.state.values, baselineForEvents.current)) {
        drafts.clear(draftKey);
        return;
      }
      const cacheable = (value: object) =>
        Object.fromEntries(
          Object.entries(value).filter(([key]) => !excluded.has(key) && !nonEditing.has(key)),
        );
      drafts.write(
        draftKey,
        {
          baseline: Object.fromEntries(
            Object.entries(baselineForEvents.current).filter(([key]) => !excluded.has(key)),
          ),
          values: Object.fromEntries(
            Object.entries(form.state.values).filter(([key]) => !excluded.has(key)),
          ),
          fieldMetaBase: Object.fromEntries(
            Object.entries(form.state.fieldMetaBase).filter(
              ([key]) =>
                ![...excluded].some(
                  (field) =>
                    key === field || key.startsWith(`${field}.`) || key.startsWith(`${field}[`),
                ),
            ),
          ),
        },
        !equalValues(cacheable(form.state.values), cacheable(baselineForEvents.current)),
        href,
      );
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [draftKey, drafts, form, excluded, nonEditing, initial.baseline]);

  useEffect(() => {
    if (!draftKey || !drafts) return;
    return drafts.onCompleted((key, failure) => {
      if (key !== draftKey || busy.current === identity) return;
      if (failure) {
        setError(failure);
        onError?.(failure);
      } else managedForm.reset(defaultValues);
    });
  }, [draftKey, drafts, identity, defaultValues, onError, managedForm]);

  function clearDraft() {
    if (draftKey) drafts?.clear(draftKey);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (drafts?.protection.locked || busy.current === identity || drafts?.pending(identity)) return;
    const element = event.currentTarget;
    if (!element.checkValidity()) {
      element.reportValidity();
      return;
    }
    busy.current = identity;
    void form
      .handleSubmit()
      .catch(() => undefined)
      .finally(() => {
        if (busy.current === identity) busy.current = null;
      });
  }

  return { form: managedForm, values, dirty, pending, error, submit, clearDraft };
}

function emptySubscribe() {
  return () => {};
}
