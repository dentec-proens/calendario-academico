import type {
  AcademicTerm,
  CalendarActivityV4,
  CalendarContentV4,
  CalendarPeriodV4,
} from '../../src/domain/calendar/model.ts';

export type CalendarOffersV4Fixture = CalendarContentV4 & { year: number; campus: string };

const period = (
  id: string,
  offer: string,
  term: AcademicTerm,
  name: string,
  start: string,
  end: string,
): CalendarPeriodV4 => ({
  id,
  name,
  start,
  end,
  association: { status: 'defined', offers: [offer], term },
});

const stages = (
  offer: string,
  label: string,
  dates: readonly (readonly [string, string])[],
  perSemester?: number,
): CalendarActivityV4[] =>
  dates.map(([start, end], index) => ({
    id: `${offer}-stage-${index + 1}`,
    name: `${perSemester ? (index % perSemester) + 1 : index + 1}ª etapa de avaliação${perSemester ? ` — ${Math.floor(index / perSemester) + 1}º semestre` : ''} — ${label}`,
    requirementId: `stage-${index + 1}:${offer}`,
    offers: [offer],
    start,
    end,
    kind: 'note',
    category: 'limite',
    recordType: 'event',
  }));

/** Independent annual and semester undergraduate offers share one institutional calendar. */
export function calendarOffersV4Fixture(): CalendarOffersV4Fixture {
  return {
    schemaVersion: 4,
    rulesetVersion: 'consup-292-2027-v3',
    year: 2027,
    campus: 'Campus de referência sintético',
    offers: [
      {
        id: 'integrado',
        kind: 'integrado',
        delivery: 'a-conferir',
        organization: 'anual',
        stages: { perTerm: 4 },
        scope: { status: 'covered' },
      },
      {
        id: 'graduacao',
        kind: 'graduacao',
        label: 'Licenciatura em Química',
        delivery: 'a-conferir',
        organization: 'anual',
        stages: { perTerm: 3 },
        scope: { status: 'covered' },
      },
      {
        id: 'graduacao-2',
        kind: 'graduacao',
        label: 'Engenharia Elétrica',
        delivery: 'a-conferir',
        organization: 'semestral',
        stages: { perTerm: 2 },
        scope: { status: 'covered' },
      },
      {
        id: 'graduacao-3',
        kind: 'graduacao',
        label: 'Tecnologia em Análise de Sistemas',
        delivery: 'a-conferir',
        organization: 'semestral',
        stages: { perTerm: 1 },
        scope: { status: 'covered' },
      },
    ],
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      period('integrado-annual', 'integrado', 'annual', 'Ano letivo', '2027-02-01', '2027-12-17'),
      period('graduacao-annual', 'graduacao', 'annual', 'Ano letivo', '2027-02-01', '2027-12-17'),
      period(
        'graduacao-2-first',
        'graduacao-2',
        'first',
        '1º semestre',
        '2027-02-01',
        '2027-07-09',
      ),
      period(
        'graduacao-2-second',
        'graduacao-2',
        'second',
        '2º semestre',
        '2027-07-26',
        '2027-12-17',
      ),
      period(
        'graduacao-3-first',
        'graduacao-3',
        'first',
        '1º semestre',
        '2027-02-01',
        '2027-07-09',
      ),
      period(
        'graduacao-3-second',
        'graduacao-3',
        'second',
        '2º semestre',
        '2027-07-26',
        '2027-12-17',
      ),
    ],
    events: [
      ...stages('integrado', 'Técnico integrado', [
        ['2027-02-01', '2027-04-16'],
        ['2027-04-19', '2027-07-09'],
        ['2027-07-26', '2027-10-01'],
        ['2027-10-04', '2027-12-17'],
      ]),
      ...stages('graduacao', 'Licenciatura em Química', [
        ['2027-02-01', '2027-05-28'],
        ['2027-05-31', '2027-09-17'],
        ['2027-09-20', '2027-12-17'],
      ]),
      ...stages(
        'graduacao-2',
        'Engenharia Elétrica',
        [
          ['2027-02-01', '2027-04-16'],
          ['2027-04-19', '2027-07-09'],
          ['2027-07-26', '2027-10-01'],
          ['2027-10-04', '2027-12-17'],
        ],
        2,
      ),
      ...stages(
        'graduacao-3',
        'Tecnologia em Análise de Sistemas',
        [
          ['2027-02-01', '2027-07-09'],
          ['2027-07-26', '2027-12-17'],
        ],
        1,
      ),
    ],
  };
}
