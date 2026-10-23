import type { Value } from 'convex/values';
import type { FunctionReturnType } from 'convex/server';
import type { api } from '../../convex/_generated/api.js';

export type RequestBody = Record<string, Value | undefined>;
export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
export type Notify = (text: string, error?: boolean) => void;
export type Role = 'ADMIN' | 'CAMPUS';

export type Status = FunctionReturnType<typeof api.nativeAuth.status>;
export type Member = NonNullable<Status['user']>;

export interface Campus {
  id: string;
  name: string;
  active?: boolean;
}

export interface CalendarSummary {
  id: string;
  name: string;
  campusId: string;
  year: number;
  purpose: 'test' | 'definitive';
  courses: string;
  classes?: string;
  shifts?: string;
  offer: string;
  modalities: string[];
  regime?: string;
  version: number;
  updatedAt: string;
}

export interface InstitutionalEvent {
  id: string;
  name: string;
  category: string;
  kind: string;
  start: string;
  end: string;
  evidence: string;
  offers: string[];
  active: boolean;
}

export interface Catalogue {
  revision: number;
  events: InstitutionalEvent[];
}

export interface Bootstrap {
  user: Member;
  campuses: Campus[];
  catalogue: Catalogue;
  calendars: CalendarSummary[];
  users: Member[];
}

export interface DocumentSummary {
  id: string;
  year: number;
  type: 'norma' | 'referencia' | 'parecer';
  title: string;
  source: string;
  filename: string;
  status: 'rascunho' | 'vigente' | 'arquivado';
  version: number;
  createdAt: string;
}

export interface DocumentsData {
  revision: number;
  documents: DocumentSummary[];
}

export interface TrashData {
  calendars: Array<
    Pick<CalendarSummary, 'id' | 'name' | 'campusId' | 'version'> & {
      deletedAt: string;
    }
  >;
}

export interface PortalMessage {
  text: string;
  error: boolean;
}
