import { olderAuditPage } from './audit-data.ts';
import { api } from '../../convex/_generated/api.js';
import type { Id } from '../../convex/_generated/dataModel.js';
import type { reviews } from '../../web/shared/convex/reviews.ts';
import { initialConclusion } from '../../src/domain/reviews/conclusion.ts';
import { reviewSupport } from '../../src/domain/reviews/technical-support.ts';
import { getFunctionName, type FunctionReference } from 'convex/server';
import type { Bootstrap } from '../../web/shared/convex/types.ts';

function reviewStatus(value: string) {
  if (
    value === 'PENDENTE' ||
    value === 'ATENDIDO' ||
    value === 'NAO_ATENDIDO' ||
    value === 'NAO_APLICAVEL'
  )
    return value;
  throw new Error('Situação de revisão inválida na fixture.');
}

export function portalReview(id: string): Awaited<ReturnType<typeof reviews.get>> {
  if (!['calendar-a', 'calendar-b', 'calendar-offpage'].includes(id))
    throw new Error('Calendário não encontrado.');
  const support = reviewSupport(
    {
      id,
      name: id === 'calendar-a' ? 'Calendário de teste' : `Calendário ${id}`,
      version: 1,
      state: {
        year: 2027,
        campus: 'Campus de teste',
        offer: 'integrado',
        modalities: ['integrado'],
        regime: 'anual',
        weekdays: [],
        weekConfirmed: false,
        periods: [],
        events: [],
      },
    },
    [],
  );
  return {
    ...support,
    criteria: support.criteria.map((criterion) => ({
      ...criterion,
      initial: { ...criterion.initial, status: reviewStatus(criterion.initial.status) },
    })),
    calendar: {
      ...support.calendar,
      id: id as Id<'calendars'>,
      campus: 'Campus de teste',
      offer: 'integrado',
      modalities: ['integrado'],
      regime: 'anual',
    },
    catalogueRevision: 1,
    officialApproval: false,
    initialConclusion: initialConclusion(support),
    review: null,
    stale: false,
  };
}

let resolvePendingMutation: (() => void) | undefined;
async function finishMutation<T>(operation: string, result: T): Promise<T> {
  if (window.portalRouterTest.deferNextMutation) {
    window.portalRouterTest.deferNextMutation = false;
    window.portalRouterTest.pendingMutation = operation;
    await new Promise<void>((resolve) => {
      resolvePendingMutation = resolve;
    });
  }
  window.portalRouterTest.completedMutation = operation;
  return result;
}
window.portalRouterTest = {
  catalogue: { revision: 1, events: [] },
  members: [],
  mutations: [],
  publishCatalogue() {
    throw new Error('Fixture de catálogo ainda não iniciada.');
  },
  publishMember() {
    throw new Error('Fixture de contas ainda não iniciada.');
  },
  deferNextReview: false,
  deferNextMutation: false,
  pendingMutation: null,
  completedMutation: null,
  pendingReviewId: null,
  removeCalendar: () => {
    throw new Error('Fixture de calendários ainda não iniciada.');
  },
  resolvePendingMutation() {
    if (!resolvePendingMutation) throw new Error('Nenhuma mutação sintética pendente.');
    resolvePendingMutation();
    resolvePendingMutation = undefined;
    this.pendingMutation = null;
  },
  resolvePendingReview() {
    throw new Error('Nenhuma revisão sintética pendente.');
  },
};

export const functions = api;
export const convex = {
  url: 'http://127.0.0.1',
  query: (reference: FunctionReference<'query'>, args: Record<string, unknown>) => {
    if (getFunctionName(reference) === 'workspace:logs')
      return olderAuditPage((args.paginationOpts as { cursor?: string }).cursor);
    if (getFunctionName(reference) === 'reviews:review')
      return Promise.resolve(portalReview(String(args.id)));
    return Promise.reject(
      new Error(`Consulta sintética não implementada: ${getFunctionName(reference)}`),
    );
  },
  mutation: (reference: FunctionReference<'mutation'>, args: Record<string, unknown>) => {
    const name = getFunctionName(reference);
    window.portalRouterTest.mutations.push({ name, args: structuredClone(args) });
    switch (name) {
      case 'catalogue:saveCatalogue': {
        const body = args.body as Bootstrap['catalogue']['events'][number] & { revision: number };
        const catalogue = window.portalRouterTest.catalogue;
        if (body.revision !== catalogue.revision)
          return Promise.reject(new Error('Base atualizada por outra sessão. Recarregue.'));
        const { revision: _revision, ...event } = body;
        window.portalRouterTest.publishCatalogue({
          revision: catalogue.revision + 1,
          events: catalogue.events.map((item) => (item.id === event.id ? event : item)),
        });
        return finishMutation('saveCatalogue', { ok: true });
      }
      case 'documents:documentStatus':
        if (args.revision !== window.portalRouterTest.catalogue.revision)
          return Promise.reject(new Error('A base mudou. Atualize a lista antes de continuar.'));
        return finishMutation('documentStatus', { ok: true });
      case 'access/security:unlockPassword':
        return finishMutation('unlockPassword', { ok: true });
      case 'access/members:updateMemberRole': {
        const member = window.portalRouterTest.members.find((item) => item.id === args.id);
        const expected = args.expected as { role: string; campusId: string | null } | undefined;
        if (
          !member ||
          !expected ||
          member.role !== expected.role ||
          member.campusId !== expected.campusId
        )
          return Promise.reject(new Error('O perfil mudou em outra sessão. Atualize a lista.'));
        window.portalRouterTest.publishMember({
          ...member,
          role: args.role as Bootstrap['user']['role'],
          campusId: args.role === 'CAMPUS' ? (args.campusId as Id<'campuses'>) : null,
        });
        return finishMutation('updateMemberRole', { ok: true });
      }
      case 'nativeFiles:receiveUpload':
      case 'nativeFiles:issueUpload':
        return Promise.resolve({
          uploadId: 'synthetic-upload',
        });
      case 'campuses:createCampus':
        return finishMutation('createCampus', {
          id: 'created-campus',
          name: args.name,
          archived: false,
        });
      default:
        return Promise.reject(
          new Error(`Mutação sintética não implementada: ${getFunctionName(reference)}`),
        );
    }
  },
  action: (reference: FunctionReference<'action'>, args: Record<string, unknown>) => {
    switch (getFunctionName(reference)) {
      case 'actions/documents:downloadDocument':
        return finishMutation('downloadDocument', {
          url: window.location.origin + '/__synthetic-document.pdf',
          filename: 'teste.pdf',
        });
      case 'actions/uploads:completeUpload':
        return Promise.resolve({ uploadId: 'synthetic-upload' });
      case 'actions/documents:restoreDocumentOriginal':
        return finishMutation('restoreDocumentOriginal', { ok: true });
      case 'actions/documents:uploadDocument':
        return finishMutation('uploadDocument', {
          ...args,
          id: 'created-document',
          hash: 'a'.repeat(64),
          status: 'rascunho',
          version: 1,
          createdAt: '2026-10-26T12:00:00Z',
        });
      default:
        return Promise.reject(
          new Error(`Action sintética não implementada: ${getFunctionName(reference)}`),
        );
    }
  },
};

declare global {
  interface Window {
    portalRouterTest: {
      catalogue: Bootstrap['catalogue'];
      members: Bootstrap['users'];
      mutations: { name: string; args: Record<string, unknown> }[];
      publishCatalogue(catalogue: Bootstrap['catalogue']): void;
      publishMember(member: Bootstrap['users'][number]): void;
      deferNextReview: boolean;
      deferNextMutation: boolean;
      pendingMutation: string | null;
      completedMutation: string | null;
      removeCalendar(id: string): void;
      pendingReviewId: string | null;
      resolvePendingReview(): void;
      resolvePendingMutation(): void;
    };
  }
}
