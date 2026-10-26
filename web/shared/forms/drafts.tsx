import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';

export class FormDrafts {
  constructor(readonly identity: string) {}

  private readonly entries = new Map<string, object>();
  private readonly operations = new Map<string, symbol>();
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
    if (this.operations.has(key)) return null;
    const operation = Symbol(key);
    this.operations.set(key, operation);
    this.listeners.forEach((listener) => listener());
    return operation;
  }

  finish(key: string, operation: symbol, error?: string) {
    if (this.operations.get(key) !== operation) return;
    this.operations.delete(key);
    if (!error) {
      this.entries.delete(key);
    }
    this.completions.forEach((listener) => listener(key, error));
    this.listeners.forEach((listener) => listener());
  }

  read<T extends object>(key: string, defaults: T): T {
    // Each key is owned by a single typed form; values never come from storage.
    return structuredClone((this.entries.get(key) as T | undefined) ?? defaults);
  }

  write(key: string, value: object) {
    this.entries.set(key, structuredClone(value));
  }

  clear(key: string) {
    this.entries.delete(key);
  }

  clearScope(prefix: string) {
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key);
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
