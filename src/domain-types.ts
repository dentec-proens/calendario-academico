/** Shared contracts for calendar activities and the operational checklist. */
export interface CalendarActivity {
  id: string;
  name: string;
  start: string;
  end: string;
  kind: string;
  evidence: string;
  category?: string;
  requirementId?: string;
  modalities?: string[];
  offers?: string[];
  hours?: number;
  days?: number;
  originalStart?: string;
  originalEnd?: string;
}

export interface ActivityRequirement {
  id: string;
  name: string;
  required?: boolean;
  deadline?: string;
  minHours?: number;
  month?: number;
  modality?: string;
}
