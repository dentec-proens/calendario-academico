import type { useAuthActions } from '@convex-dev/auth/react';
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';
import type { Id } from '../../convex/_generated/dataModel.js';
import { convex, functions } from './runtime.ts';

export { convex, functions };

let authActions: ReturnType<typeof useAuthActions> | undefined;

export function setAuthActions(actions: ReturnType<typeof useAuthActions>) {
  authActions = actions;
}

function actions() {
  if (!authActions) throw new Error('A conexão de autenticação ainda está iniciando.');
  return authActions;
}

function errorRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function nativeError(error: unknown): Error & { status?: number } {
  const outer = errorRecord(error);
  const detail = errorRecord(outer.data);
  const message = [detail.error, detail.message, outer.message].find(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  const status = detail.status ?? outer.status;
  return Object.assign(new Error(message || 'Não foi possível concluir.'), {
    status: typeof status === 'number' ? status : undefined,
  });
}

async function request<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw nativeError(error);
  }
}

function requiredToken(token: string | null): string {
  if (!token) throw new Error('Abra o link privado completo para continuar.');
  return token;
}

export const accounts = {
  status: () => request(() => convex.query(functions.nativeAuth.status, {})),
  signIn: (credentials: { email: string; password: string }) =>
    request(() => actions().signIn('password', { flow: 'signIn', ...credentials })),
  signInGoogle: () =>
    request(() =>
      actions().signIn('google', {
        redirectTo: window.location.origin + window.location.pathname + window.location.search,
      }),
    ),
  setup: (data: FunctionArgs<typeof functions.nativeAuth.setup>['data']) =>
    request(() => convex.action(functions.nativeAuth.setup, { data })),
  passwordOptions: () => request(() => convex.query(functions.nativeAuth.passwordOptions, {})),
  checkInvitation: (token: string | null) =>
    request(() =>
      convex.query(functions.nativeAuth.checkInvitation, { token: requiredToken(token) }),
    ),
  acceptInvitation: (data: { token: string | null; email: string; password: string }) =>
    request(() =>
      convex.action(functions.nativeAuth.acceptInvitation, {
        ...data,
        token: requiredToken(data.token),
      }),
    ),
  resetPassword: (data: { token: string | null; password: string }) =>
    request(() =>
      convex.action(functions.nativeAuth.resetPassword, {
        ...data,
        token: requiredToken(data.token),
      }),
    ),
  requestPasswordRecovery: (email: string) =>
    request(() => convex.action(functions.nativeAuth.requestPasswordRecovery, { email })),
  createMember: (data: FunctionArgs<typeof functions.nativeAuth.createMember>['data']) =>
    request(() => convex.action(functions.nativeAuth.createMember, { data })),
  updateMemberRole: (args: FunctionArgs<typeof functions.nativeAuth.updateMemberRole>) =>
    request(() => convex.mutation(functions.nativeAuth.updateMemberRole, args)),
  removeMember: (id: string) =>
    request(() => convex.mutation(functions.nativeAuth.removeMember, { id: id as Id<'users'> })),
  issueInvitation: (id: string) =>
    request(() => convex.mutation(functions.nativeAuth.issueInvitation, { id: id as Id<'users'> })),
  passwordRecovery: (id: string) =>
    request(() =>
      convex.mutation(functions.nativeAuth.passwordRecovery, { id: id as Id<'users'> }),
    ),
};

export const calendars = {
  get: (id: string) =>
    request(() => convex.query(functions.native.calendar, { id: id as Id<'calendars'> })),
  create: (body: FunctionArgs<typeof functions.native.createCalendar>['body']) =>
    request(() => convex.mutation(functions.native.createCalendar, { body })),
  save: (id: string, body: FunctionArgs<typeof functions.native.saveCalendar>['body']) =>
    request(() =>
      convex.mutation(functions.native.saveCalendar, { id: id as Id<'calendars'>, body }),
    ),
  remove: (id: string, version: number) =>
    request(() =>
      convex.mutation(functions.native.deleteCalendar, { id: id as Id<'calendars'>, version }),
    ),
  restore: (id: string) =>
    request(() => convex.mutation(functions.native.restoreCalendar, { id: id as Id<'calendars'> })),
  makeDefinitive: (id: string, version: number) =>
    request(() =>
      convex.mutation(functions.native.makeDefinitive, { id: id as Id<'calendars'>, version }),
    ),
  generatePdf: (
    id: string,
    options: Omit<FunctionArgs<typeof functions.nativeActions.generatePdf>, 'id'>,
  ) =>
    request(() =>
      convex.action(functions.nativeActions.generatePdf, { id: id as Id<'calendars'>, ...options }),
    ),
  uploadHistory: (
    calendarId: string,
    file: Omit<FunctionArgs<typeof functions.nativeActions.uploadHistory>, 'calendarId'>,
  ) =>
    request(() =>
      convex.action(functions.nativeActions.uploadHistory, {
        calendarId: calendarId as Id<'calendars'>,
        ...file,
      }),
    ),
  restoreHistoryOriginal: (id: string, uploadId: string) =>
    request(() =>
      convex.action(functions.nativeActions.restoreHistoryOriginal, {
        id: id as Id<'histories'>,
        uploadId,
      }),
    ),
  analyzeHistory: (id: string) =>
    request(() =>
      convex.action(functions.nativeActions.analyzeHistory, {
        id: id as Id<'histories'>,
      }),
    ),
};

export const institution = {
  createCampus: (name: string) =>
    request(() => convex.mutation(functions.native.createCampus, { name })),
  saveCatalogue: (body: FunctionArgs<typeof functions.native.saveCatalogue>['body']) =>
    request(() => convex.mutation(functions.native.saveCatalogue, { body })),
  uploadDocument: (file: FunctionArgs<typeof functions.nativeActions.uploadDocument>) =>
    request(() => convex.action(functions.nativeActions.uploadDocument, file)),
  restoreDocumentOriginal: (id: string, uploadId: string) =>
    request(() =>
      convex.action(functions.nativeActions.restoreDocumentOriginal, {
        id: id as Id<'documents'>,
        uploadId,
      }),
    ),
  documentStatus: (
    id: string,
    options: Omit<FunctionArgs<typeof functions.native.documentStatus>, 'id'>,
  ) =>
    request(() =>
      convex.mutation(functions.native.documentStatus, {
        id: id as Id<'documents'>,
        ...options,
      }),
    ),
};

export const reviews = {
  get: (id: string) =>
    request(() => convex.query(functions.native.review, { id: id as Id<'calendars'> })),
  save: (id: string, body: FunctionArgs<typeof functions.native.saveReview>['body']) =>
    request(() =>
      convex.mutation(functions.native.saveReview, { id: id as Id<'calendars'>, body }),
    ),
  export: (id: string, revision: number) =>
    request(() =>
      convex.query(functions.native.exportReview, { id: id as Id<'calendars'>, revision }),
    ),
};

function subscribeQuery<Query extends FunctionReference<'query', 'public'>>(
  reference: Query,
  args: FunctionArgs<Query>,
  onValue: (value: FunctionReturnType<Query>) => void,
  onError?: (error: Error) => void,
) {
  const watch = convex.watchQuery(reference, args);
  const update = () => {
    try {
      const value = watch.localQueryResult();
      if (value !== undefined) onValue(value);
    } catch (error) {
      onError?.(nativeError(error));
    }
  };
  const stop = watch.onUpdate(update);
  update();
  return stop;
}

export function subscribeCalendar(
  id: string,
  onValue: (value: FunctionReturnType<typeof functions.native.calendar>) => void,
  onError?: (error: Error) => void,
) {
  return subscribeQuery(functions.native.calendar, { id: id as Id<'calendars'> }, onValue, onError);
}

export const audit = {
  page: (cursor: string | null = null) =>
    request(() =>
      convex.query(functions.native.logs, { paginationOpts: { numItems: 50, cursor } }),
    ),
  subscribe: (
    onValue: (value: FunctionReturnType<typeof functions.native.logs>) => void,
    onError?: (error: Error) => void,
  ) =>
    subscribeQuery(
      functions.native.logs,
      { paginationOpts: { numItems: 50, cursor: null } },
      onValue,
      onError,
    ),
};

export function subscribeNativeConnection(onChange: (connected: boolean) => void) {
  const update = () => onChange(convex.connectionState().isWebSocketConnected);
  const stop = convex.subscribeToConnectionState(update);
  update();
  return stop;
}

type DownloadTarget = { kind: 'history'; id: string } | { kind: 'document'; id: string };

export async function downloadNative(target: DownloadTarget, filename: string) {
  return request(async () => {
    const result =
      target.kind === 'history'
        ? await convex.action(functions.nativeActions.downloadHistory, {
            id: target.id as Id<'histories'>,
          })
        : await convex.action(functions.nativeActions.downloadDocument, {
            id: target.id as Id<'documents'>,
          });
    const response = await fetch(result.url);
    if (!response.ok) throw new Error('Não foi possível baixar o arquivo. Tente novamente.');
    return { blob: await response.blob(), filename: result.filename || filename };
  });
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export async function downloadLink(
  event: { preventDefault(): void },
  target: DownloadTarget,
  filename: string,
) {
  event.preventDefault();
  const file = await downloadNative(target, filename);
  saveBlob(file.blob, file.filename);
}
