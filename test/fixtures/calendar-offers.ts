import { civilDate } from '../../src/domain/civil-date.ts';
import type {
  AcademicTerm,
  CalendarEvent,
  CalendarContent,
  CalendarPeriod,
} from '../../src/domain/calendar/model.ts';

import { definedStage } from '../helpers/activity-links.ts';

export type CalendarOffersFixture = CalendarContent & { year: number; campus: string };

const period = (
  id: string,
  offer: string,
  term: AcademicTerm,
  name: string,
  start: string,
  end: string,
): CalendarPeriod => ({
  id,
  name,
  start: civilDate(start),
  end: civilDate(end),
  association: { status: 'defined', offers: [offer], term },
});

const stages = (
  offer: string,
  label: string,
  dates: readonly (readonly [string, string])[],
  perSemester?: number,
): CalendarEvent[] =>
  dates.map(([start, end], index) => ({
    id: `${offer}-stage-${index + 1}`,
    name: `${perSemester ? (index % perSemester) + 1 : index + 1}ª etapa de avaliação${perSemester ? ` — ${Math.floor(index / perSemester) + 1}º semestre` : ''} — ${label}`,
    activity: perSemester
      ? definedStage(
          'stage',
          offer,
          index < perSemester ? 'first' : 'second',
          (index % perSemester) + 1,
        )
      : definedStage('stage', offer, 'annual', index + 1),
    scope: { offers: [offer], confirmed: true },
    start: civilDate(start),
    end: civilDate(end),
    effect: 'note',
    category: 'limite',
  }));

/** Independent annual and semester undergraduate offers share one institutional calendar. */
export function calendarOffersFixture(): CalendarOffersFixture {
  return {
    schemaVersion: 5,
    rulesetVersion: 'consup-292-2027-v5',
    year: 2027,
    campus: 'Campus de referência sintético',
    offers: [
      {
        id: 'integrado',
        kind: 'integrado',
        delivery: 'a-conferir',
        organization: 'anual',
        stages: { status: 'defined', perTerm: 4 },
        scope: { status: 'covered' },
      },
      {
        id: 'graduacao',
        kind: 'graduacao',
        label: 'Licenciatura em Química',
        delivery: 'a-conferir',
        organization: 'anual',
        stages: { status: 'defined', perTerm: 3 },
        scope: { status: 'covered' },
      },
      {
        id: 'graduacao-2',
        kind: 'graduacao',
        label: 'Engenharia Elétrica',
        delivery: 'a-conferir',
        organization: 'semestral',
        stages: { status: 'defined', perTerm: 2 },
        scope: { status: 'covered' },
      },
      {
        id: 'graduacao-3',
        kind: 'graduacao',
        label: 'Tecnologia em Análise de Sistemas',
        delivery: 'a-conferir',
        organization: 'semestral',
        stages: { status: 'defined', perTerm: 1 },
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
