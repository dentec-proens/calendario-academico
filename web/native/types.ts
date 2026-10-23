import type { FunctionReturnType } from 'convex/server';
import type { api } from '../../convex/_generated/api.js';

export type Notify = (text: string, error?: boolean) => void;
export type Status = FunctionReturnType<typeof api.nativeAuth.status>;
export type Bootstrap = FunctionReturnType<typeof api.native.bootstrap>;
export type DocumentsData = FunctionReturnType<typeof api.native.documents>;
export type TrashData = FunctionReturnType<typeof api.native.trash>;

export interface PortalMessage {
  text: string;
  error: boolean;
}
