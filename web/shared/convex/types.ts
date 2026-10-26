import type { FunctionReturnType } from 'convex/server';
import type { api } from '../../../convex/_generated/api.js';

export type Notify = (text: string, error?: boolean) => void;
export type Status = FunctionReturnType<typeof api.access.session.status>;
export type Bootstrap = FunctionReturnType<typeof api.workspace.bootstrap>;
export type DocumentsData = FunctionReturnType<typeof api.documents.documents>;
export type TrashData = FunctionReturnType<typeof api.calendars.trash>;

export interface PortalMessage {
  text: string;
  error: boolean;
}
