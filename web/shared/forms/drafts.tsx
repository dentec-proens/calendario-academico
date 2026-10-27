import { WorkProtection } from '../../app/updates/work.ts';
import { equalValues } from '../../../src/equal.ts';
import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';

export class FormDrafts {
  constructor(readonly identity: string) {
    this.protection.register(() => {
      if (this.operations.size) return { kind: 'operation', loss: true };
      if (this.editing.size)
        return [...this.editing.values()].map((href) => ({
          kind: 'form' as const,
          loss: true,
          href,
        }));
      return null;
    });
  }

  private readonly entries = new Map<string, object>();
  readonly protection = new WorkProtection();
  private readonly editing = new Map<string, string | undefined>();
  private readonly operations = new Map<string, { token: symbol; entry: object | undefined }>();

  private publish() {
    this.listeners.forEach((listener) => listener());
    this.protection.publish();
  }
  private readonly listeners = new Set<() => void>();
  private readonly completions = new Set<(key: string, error?: string) => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  onCompleted(listener: (key: string, error?: string) => void) {
    this.completions.add(listener);
    return () => {
      this.completions.delete(listener);
    };
  }

  pending(key: string) {
    return this.operations.has(key);
  }

  begin(key: string) {
    if (this.protection.locked || this.operations.has(key)) return null;
    const operation = Symbol(key);
    this.operations.set(key, { token: operation, entry: this.entries.get(key) });
    this.publish();
    return operation;
  }

  finish(key: string, operation: symbol, error?: string) {
    const pending = this.operations.get(key);
    if (pending?.token !== operation) return;
    const unchanged = equalValues(draftValues(this.entries.get(key)), draftValues(pending.entry));
    this.operations.delete(key);
    if (!error && unchanged) {
      this.entries.delete(key);
      this.editing.delete(key);
    }
    if (error || unchanged) this.completions.forEach((listener) => listener(key, error));
    this.publish();
  }

  has(key: string) {
    return this.entries.has(key);
  }

  read<T extends object>(key: string, defaults: T): T {
    // Each key is owned by a single typed form; values never come from storage.
    return structuredClone((this.entries.get(key) as T | undefined) ?? defaults);
  }

  write(key: string, value: object, editing = true, href?: string) {
    if (!equalValues(this.entries.get(key), value)) this.entries.set(key, structuredClone(value));
    if (editing) this.editing.set(key, href);
    else this.editing.delete(key);
    this.publish();
  }

  clear(key: string) {
    this.entries.delete(key);
    this.editing.delete(key);
    this.publish();
  }

  clearScope(prefix: string) {
    for (const key of this.entries.keys())
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
        this.editing.delete(key);
      }
    this.publish();
  }
}

const DraftContext = createContext<FormDrafts | null>(null);

export function FormDraftProvider({ identity, children }: PropsWithChildren<{ identity: string }>) {
  const drafts = useMemo(() => new FormDrafts(identity), [identity]);
  return <DraftContext.Provider value={drafts}>{children}</DraftContext.Provider>;
}

export function useFormDrafts() {
  return useContext(DraftContext);
}

// Field registration/validation metadata may change on unmount without a new edit.
function draftValues(entry: object | undefined) {
  if (!entry || !('values' in entry)) return entry;
  return { values: entry.values, baseline: 'baseline' in entry ? entry.baseline : undefined };
}
