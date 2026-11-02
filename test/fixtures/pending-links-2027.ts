import { civilDate } from '../../src/domain/civil-date.ts';
import type {
  CalendarEvent,
  CalendarContent,
  CalendarOffer,
  OfferKind,
} from '../../src/domain/calendar/model.ts';
import { teacherVacations } from '../../src/domain/calendar/activities/teacher-vacations.ts';

export type PendingLinksFixture = CalendarContent & { year: number; campus: string };

/** Day and month as in the audited drafts (section 11 of the plan); every date is in 2027. */
const day = (value: string) => {
  const [d, m] = value.split('/');
  return civilDate(`2027-${m}-${d}`);
};

const offer = (id: OfferKind): CalendarOffer => ({
  id,
  kind: id,
  delivery: 'presencial',
  organization: 'a-classificar',
  scope: { status: 'covered' },
});

type Row = readonly [requirementId: string, start: string, end: string, offers?: string[]];

function draft(
  campus: string,
  prefix: string,
  offers: [OfferKind, OfferKind],
  rows: readonly Row[],
  extra: (event: CalendarEvent) => CalendarEvent = (event) => event,
): PendingLinksFixture {
  return {
    schemaVersion: 5,
    rulesetVersion: 'consup-292-2027-v3',
    year: 2027,
    campus,
    offers: offers.map(offer),
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: `${prefix}-first`,
        name: 'Primeiro período',
        start: day('01/02'),
        end: day('09/07'),
        association: { status: 'a-classificar' },
      },
      {
        id: `${prefix}-second`,
        name: 'Segundo período',
        start: day('26/07'),
        end: day('17/12'),
        association: { status: 'a-classificar' },
      },
    ],
    events: rows.map(([requirementId, start, end, scope]) =>
      extra({
        id: `${prefix}-${requirementId}`,
        name: `Data sintética ${requirementId}`,
        start: day(start),
        end: day(end),
        effect: 'note',
        category: 'prazo',
        requirementId,
        offers: scope ?? [...offers],
      }),
    ),
  };
}

/**
 * Ivaiporã draft: 11 semester links with every offer and period still unclassified. Annual
 * records with coinciding data are distinct dates without a link and must stay distinct.
 */
export function ivaiporaDraft(): PendingLinksFixture {
  const state = draft(
    'Campus sintético Ivaiporã',
    'ivaipora',
    ['integrado', 'subsequente'],
    [
      ['final-1', '22/06', '22/06'],
      ['final-2', '14/12', '17/12'],
      ['diary-1', '01/07', '01/07'],
      ['diary-2', '20/12', '23/12'],
      ['final-appeal-1', '18/06', '24/06'],
      ['final-appeal-2', '15/12', '20/12'],
      ['registration-1', '25/01', '29/01'],
      ['admission-notice-1', '20/11', '20/11'],
      ['admission-notice-2', '17/06', '17/06'],
      ['recognition-1', '11/02', '19/02'],
      ['recognition-2', '20/07', '29/07'],
    ],
    (event) =>
      event.requirementId === 'final-appeal-2'
        ? { ...event, hours: 28 }
        : event.requirementId === 'admission-notice-1'
          ? { ...event, name: 'Edital de ingresso do 1º semestre' }
          : event,
  );
  state.events.push(
    ...(
      [
        ['final', '14/12', '17/12'],
        ['diary', '20/12', '23/12'],
        ['registration', '25/01', '29/01'],
        ['recognition', '11/02', '19/02'],
        ['final-appeal', '13/12', '20/12'],
      ] as const
    ).map(([name, start, end]): CalendarEvent => ({
      id: `ivaipora-annual-${name}`,
      name: `Registro anual sintético ${name}`,
      start: day(start),
      end: day(end),
      effect: 'note',
      category: 'prazo',
      offers: ['integrado', 'subsequente'],
      ...(name === 'final-appeal' ? { hours: 40 } : {}),
    })),
  );
  return state;
}

/** Cascavel draft: 10 semester links, two of them only for the undergraduate offer. */
export function cascavelDraft(): PendingLinksFixture {
  return draft(
    'Campus sintético Cascavel',
    'cascavel',
    ['integrado', 'graduacao'],
    [
      ['final-1', '21/07', '21/07'],
      ['final-2', '21/12', '21/12'],
      ['diary-1', '11/07', '11/07'],
      ['diary-2', '23/12', '23/12'],
      ['final-appeal-1', '16/12', '16/12'],
      ['final-appeal-2', '16/12', '16/12'],
      ['admission-notice-1', '04/01', '04/01'],
      ['admission-notice-2', '05/07', '05/07', ['graduacao']],
      ['recognition-1', '31/03', '31/03'],
      ['recognition-2', '31/08', '31/08', ['graduacao']],
    ],
    (event) =>
      event.requirementId === 'admission-notice-2'
        ? { ...event, name: 'Edital de ingresso — Cursos semestrais' }
        : event,
  );
}

const vacations = { firstStart: day('04/01'), firstEnd: day('31/01') };

/**
 * Classified annual calendar with links that conflict or lost their activity: a duplicated
 * stage, two stages in inverted order, teacher vacations with a link and a notice with an
 * admission destination whose link has no generated activity.
 */
export function conflictingLinks(): PendingLinksFixture {
  const stage = (id: string, n: number, start: string, end: string): CalendarEvent => ({
    id,
    name: `${n}ª etapa sintética`,
    requirementId: `stage-${n}:integrado`,
    start: day(start),
    end: day(end),
    effect: 'note',
    category: 'limite',
    offers: ['integrado'],
  });
  const vacation = teacherVacations(2027, vacations).events[0];
  return {
    schemaVersion: 5,
    rulesetVersion: 'consup-292-2027-v3',
    year: 2027,
    campus: 'Campus sintético de conflitos',
    offers: [
      { ...offer('integrado'), organization: 'anual', stages: { perTerm: 4 } },
      { ...offer('subsequente'), organization: 'anual', stages: { perTerm: 2 } },
    ],
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'year',
        name: 'Ano letivo',
        start: day('01/02'),
        end: day('17/12'),
        association: { status: 'defined', offers: ['integrado', 'subsequente'], term: 'annual' },
      },
    ],
    teacherVacations: vacations,
    events: [
      stage('stage-first', 1, '01/02', '31/03'),
      stage('stage-twice-a', 2, '01/04', '31/05'),
      stage('stage-twice-b', 2, '05/04', '20/05'),
      stage('stage-late', 3, '01/10', '10/12'),
      stage('stage-early', 4, '02/08', '30/09'),
      { ...vacation, requirementId: 'diary-1' },
      {
        id: 'transfer-notice',
        name: 'Edital de transferência sintético',
        start: day('03/05'),
        end: day('03/05'),
        effect: 'note',
        category: 'prazo',
        requirementId: 'admission-notice-2',
        offers: ['integrado', 'subsequente'],
        notice: {
          publication: 'planned',
          admission: {
            type: 'transfer',
            year: 2027,
            term: 'annual',
            destinations: [
              { offerId: 'integrado', periodId: 'year' },
              { offerId: 'subsequente', periodId: 'year' },
            ],
          },
        },
      },
    ],
  };
}
