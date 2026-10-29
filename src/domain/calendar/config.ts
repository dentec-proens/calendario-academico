/** Shared calendar catalogue and limits. Keep this module independent of React and Convex. */
export const modalityIds = ['integrado', 'subsequente', 'graduacao', 'posgraduacao'] as const;
export type Modality = (typeof modalityIds)[number];
export const selectableModalities: readonly Modality[] = modalityIds;
export const modalityLabels: Record<string, string> = {
  integrado: 'Técnico integrado',
  subsequente: 'Técnico subsequente',
  graduacao: 'Graduação',
  posgraduacao: 'Pós-graduação',
} satisfies Record<Modality, string>;

export const assessmentStageValues = [2, 3, 4] as const;
export const assessmentStageCounts: readonly number[] = assessmentStageValues;
export const assessmentStageNumbers = Array.from(
  { length: Math.max(...assessmentStageCounts) },
  (_, index) => index + 1,
);
export const assessmentStageRequirementPattern = new RegExp(
  `^stage-(${assessmentStageNumbers.join('|')}):[a-z][a-z0-9-]*$`,
);
export const academicTerms = ['annual', 'first', 'second'] as const;
export type AcademicTerm = (typeof academicTerms)[number];
export const organizations = ['anual', 'semestral', 'a-classificar'] as const;
export type Organization = (typeof organizations)[number];
export const organizationLabels: Record<string, string> = {
  anual: 'Anual',
  semestral: 'Semestral',
  'a-classificar': 'Organização a conferir',
};
export const termLabels: Record<AcademicTerm, string> = {
  annual: 'ano letivo',
  first: '1º semestre',
  second: '2º semestre',
};
export const termsByOrganization = {
  anual: ['annual'],
  semestral: ['first', 'second'],
} as const satisfies Record<'anual' | 'semestral', readonly AcademicTerm[]>;
export const periodCountByOrganization = {
  anual: termsByOrganization.anual.length,
  semestral: termsByOrganization.semestral.length,
};
export const calendarLimits = {
  minimumYear: 1900,
  maximumYear: 9999,
  maximumPeriods: 50,
  maximumEvents: 1000,
  maximumOffers: 12,
  minimumTargetDays: 1,
  maximumTargetDays: 366,
  maximumTextLength: 240,
};
