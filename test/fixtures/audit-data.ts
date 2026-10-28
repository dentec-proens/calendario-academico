import type { FunctionReturnType } from 'convex/server';
import type { functions } from '../../web/shared/convex/client.ts';

export type AuditPage = FunctionReturnType<typeof functions.workspace.logs>;

const first: AuditPage = {
  entries: [
    {
      at: '2026-10-23T15:24:00Z',
      action: 'Calendário salvo',
      actor: 'Pessoa editora',
      calendar: 'Calendário 2027 — Campus de teste',
      version: 3,
    },
    {
      at: '2026-10-23T14:15:00Z',
      action: 'Base institucional alterada',
      actor: 'Pessoa administradora',
      calendar: null,
      version: null,
    },
    {
      at: '2026-10-22T13:10:00Z',
      action: 'Calendário criado',
      actor: 'Responsável com nome institucional bastante extenso para conferir a disposição',
      calendar: 'Calendário 2027 — Campus com nome institucional bastante extenso',
      version: 1,
    },
  ],
  isDone: false,
  continueCursor: 'older-audit-page',
};
let resolveMore: (() => void) | undefined;
window.auditTest = {
  first: new URLSearchParams(location.search).has('audit-loading') ? undefined : first,
  deferMore: false,
  pending: false,
  failMore: false,
  cursors: [],
  publish: () => {
    throw new Error('Fixture de auditoria ainda não iniciada.');
  },
  finishMore: () => resolveMore?.(),
};

export async function olderAuditPage(cursor: unknown): Promise<AuditPage> {
  window.auditTest.cursors.push(String(cursor));
  if (window.auditTest.deferMore) {
    window.auditTest.pending = true;
    await new Promise<void>((resolve) => {
      resolveMore = resolve;
    });
    window.auditTest.pending = false;
    resolveMore = undefined;
  }
  if (window.auditTest.failMore) throw new Error('Falha ao carregar registros anteriores.');
  return {
    entries: [
      {
        at: '2026-10-21T12:00:00Z',
        action: 'Unidade cadastrada',
        actor: 'Pessoa administradora',
        calendar: null,
        version: null,
      },
    ],
    isDone: true,
    continueCursor: '',
  };
}

declare global {
  interface Window {
    auditTest: {
      first: AuditPage | undefined;
      deferMore: boolean;
      pending: boolean;
      failMore: boolean;
      cursors: string[];
      publish(page: AuditPage | undefined): void;
      finishMore(): void;
    };
  }
}
