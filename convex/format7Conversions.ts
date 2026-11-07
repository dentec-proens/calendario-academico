/**
 * Dates of the campus that become school vacations in the format 7 migration, by calendar: the list
 * the management approved over the inventory of the backup
 * (`scripts/administration/format-7-inventory.ts`). The contraction removes this file.
 */
export const schoolVacationConversions: Readonly<Record<string, readonly string[]>> = {
  // Goioerê e Cascavel, aprovados em 06/11/2026; nenhuma das duas datas retira dia letivo.
  jd7a0gnpsqjs9ypzg9079w26ah8gvdkd: ['895b7c44-d3b9-4e50-91f2-94466d04acaf'],
  jd7ay1ncjpb9g76fwafy59cwbd8gtkem: ['134b1be4-619f-4a82-8165-e3cdc2720a03'],
};
