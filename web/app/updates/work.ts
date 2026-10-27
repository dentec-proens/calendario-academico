import { documentTransition } from './transition.ts';
export interface WorkRisk {
  kind: 'form' | 'operation' | 'editor' | 'access' | 'interaction' | 'initializing';
  loss: boolean;
  href?: string;
}

/** Metadata only. Getters read owners synchronously at the decision point. */
export class WorkProtection {
  private readonly sources = new Map<symbol, () => WorkRisk | WorkRisk[] | null>();
  private readonly operations = new Map<symbol, WorkRisk>();
  private readonly listeners = new Set<() => void>();
  private revision = 0;
  private ready = false;
  get locked() {
    return Boolean(documentTransition.getSnapshot());
  }
  setReady(ready: boolean) {
    this.ready = ready;
    this.publish();
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getRevision = () => this.revision;
  publish = () => {
    this.revision++;
    this.listeners.forEach((listener) => listener());
  };
  register(read: () => WorkRisk | WorkRisk[] | null) {
    const token = Symbol();
    this.sources.set(token, read);
    this.publish();
    return () => {
      this.sources.delete(token);
      this.publish();
    };
  }
  begin(risk: WorkRisk = { kind: 'operation', loss: true }) {
    if (this.locked) return null;
    const token = Symbol();
    this.operations.set(token, risk);
    this.publish();
    return token;
  }
  finish(token: symbol) {
    if (this.operations.delete(token)) this.publish();
  }
  getSnapshot(): WorkRisk[] {
    const risks: WorkRisk[] = [];
    if (!this.ready) risks.push({ kind: 'initializing', loss: false });
    for (const read of this.sources.values()) {
      try {
        const risk = read();
        if (risk) risks.push(...(Array.isArray(risk) ? risk : [risk]));
      } catch {
        risks.push({ kind: 'initializing', loss: true });
      }
    }
    risks.push(...this.operations.values());
    return risks;
  }
}
