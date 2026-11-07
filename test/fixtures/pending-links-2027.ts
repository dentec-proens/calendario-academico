import { civilDate } from '../../src/domain/civil-date.ts';
import type {
  CalendarEvent,
  CalendarContent,
  CalendarOffer,
  OfferKind,
} from '../../src/domain/calendar/model.ts';
import type { ActivityRef } from '../../src/domain/calendar/activities/activity-ref.ts';
import {
  applyOfferOrganization,
  offerOrganizationDraft,
} from '../../src/domain/calendar/organization/offers.ts';
import { cycleLink, definedStage, semesterLink } from '../helpers/activity-links.ts';

export type PendingLinksFixture = CalendarContent & { year: number; campus: string };

/** Day and month as in the audited drafts of Ivaiporã and Cascavel; every date is in 2027. */
const day = (value: string) => {
  const [d, m] = value.split('/');
  return civilDate(`2027-${m}-${d}`);
};

const offer = (id: OfferKind): CalendarOffer => ({
  id,
  kind: id,
  delivery: 'presencial',
  organization: 'anual',
  scope: { status: 'covered' },
});

/**
 * A semester date of the audited drafts: its ID suffix (the format 4 identifier, `final-1`), the
 * offer cycle it was recorded for, its dates and offers. Every link is by offer cycle in 2027.
 */
type Row = readonly [
  suffix: string,
  activity: ActivityRef,
  start: string,
  end: string,
  offers?: string[],
];
const first = (activityId: string) => cycleLink(activityId, 'first');
const second = (activityId: string) => cycleLink(activityId, 'second');

function draft(
  campus: string,
  prefix: string,
  offers: [OfferKind, OfferKind],
  rows: readonly Row[],
  extra: (event: CalendarEvent) => CalendarEvent = (event) => event,
): PendingLinksFixture {
  return {
    schemaVersion: 7,
    rulesetVersion: 'consup-292-2027-v5',
    year: 2027,
    campus,
    offers: offers.map(offer),
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: `${prefix}-year`,
        name: 'Ano letivo',
        start: day('01/02'),
        end: day('17/12'),
        association: { status: 'defined', offers: [...offers], term: 'annual' },
      },
    ],
    events: rows.map(([suffix, activity, start, end, scope]) =>
      extra({
        id: `${prefix}-${suffix}`,
        name: `Data sintética ${suffix}`,
        start: day(start),
        end: day(end),
        effect: 'note',
        category: 'prazo',
        activity,
        offers: scope ?? [...offers],
      }),
    ),
  };
}

/**
 * Ivaiporã draft: 11 semester links in annual offers, which generate no semester cycle. Annual
 * records with coinciding data are distinct dates without a link and must stay distinct.
 */
export function ivaiporaDraft(): PendingLinksFixture {
  const state = draft(
    'Campus sintético Ivaiporã',
    'ivaipora',
    ['integrado', 'subsequente'],
    [
      ['final-1', first('final'), '22/06', '22/06'],
      ['final-2', second('final'), '14/12', '17/12'],
      ['diary-1', first('diary'), '01/07', '01/07'],
      ['diary-2', second('diary'), '20/12', '23/12'],
      ['final-appeal-1', first('final-appeal'), '18/06', '24/06'],
      ['final-appeal-2', second('final-appeal'), '15/12', '20/12'],
      ['registration-1', first('registration'), '25/01', '29/01'],
      ['admission-notice-1', first('admission-notice'), '20/11', '20/11'],
      ['admission-notice-2', second('admission-notice'), '17/06', '17/06'],
      ['recognition-1', first('recognition'), '11/02', '19/02'],
      ['recognition-2', second('recognition'), '20/07', '29/07'],
    ],
    (event) =>
      event.id === 'ivaipora-final-appeal-2'
        ? { ...event, hours: 28 }
        : event.id === 'ivaipora-admission-notice-1'
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
        ['admission-notice', '20/11', '20/11'],
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

/**
 * Cascavel draft: 10 semester links, two of them only for the undergraduate offer, and an annual
 * record without a link on the same day as `diary-2`, which must stay distinct.
 */
export function cascavelDraft(): PendingLinksFixture {
  const state = draft(
    'Campus sintético Cascavel',
    'cascavel',
    ['integrado', 'graduacao'],
    [
      ['final-1', first('final'), '21/07', '21/07'],
      ['final-2', second('final'), '21/12', '21/12'],
      ['diary-1', first('diary'), '11/07', '11/07'],
      ['diary-2', second('diary'), '23/12', '23/12'],
      ['final-appeal-1', first('final-appeal'), '16/12', '16/12'],
      ['final-appeal-2', second('final-appeal'), '16/12', '16/12'],
      ['admission-notice-1', first('admission-notice'), '04/01', '04/01'],
      ['admission-notice-2', second('admission-notice'), '05/07', '05/07', ['graduacao']],
      ['recognition-1', first('recognition'), '31/03', '31/03'],
      ['recognition-2', second('recognition'), '31/08', '31/08', ['graduacao']],
    ],
    (event) =>
      event.id === 'cascavel-admission-notice-2'
        ? { ...event, name: 'Edital de ingresso — Cursos semestrais' }
        : event,
  );
  state.events.push({
    id: 'cascavel-annual-diary',
    name: 'Registro anual sintético diary',
    start: day('23/12'),
    end: day('23/12'),
    effect: 'note',
    category: 'prazo',
    offers: ['integrado', 'graduacao'],
  });
  return state;
}

/**
 * Classified annual calendar with links that conflict or lost their activity: a duplicated
 * stage, two stages in inverted order, teacher vacations with a link and a notice with an
 * admission destination whose link has no generated activity.
 */
export function conflictingLinks(): PendingLinksFixture {
  const stage = (id: string, n: number, start: string, end: string): CalendarEvent => ({
    id,
    name: `${n}ª etapa sintética`,
    activity: definedStage('stage', 'integrado', 'annual', n),
    start: day(start),
    end: day(end),
    effect: 'note',
    category: 'limite',
    offers: ['integrado'],
  });
  const vacation = {
    id: 'teacher-vacation-january',
    name: 'Férias docentes — 28 dias',
    start: day('04/01'),
    end: day('31/01'),
    effect: 'exclude' as const,
    category: 'ferias',
  };
  return {
    schemaVersion: 7,
    rulesetVersion: 'consup-292-2027-v5',
    year: 2027,
    campus: 'Campus sintético de conflitos',
    offers: [
      { ...offer('integrado'), organization: 'anual', stages: { status: 'defined', perTerm: 4 } },
      { ...offer('subsequente'), organization: 'anual', stages: { status: 'defined', perTerm: 2 } },
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
    events: [
      stage('stage-first', 1, '01/02', '31/03'),
      stage('stage-twice-a', 2, '01/04', '31/05'),
      stage('stage-twice-b', 2, '05/04', '20/05'),
      stage('stage-late', 3, '01/10', '10/12'),
      stage('stage-early', 4, '02/08', '30/09'),
      {
        ...vacation,
        activity: first('diary'),
        offers: ['integrado', 'subsequente'],
      },
      {
        id: 'transfer-notice',
        name: 'Edital de transferência sintético',
        start: day('03/05'),
        end: day('03/05'),
        effect: 'note',
        category: 'prazo',
        activity: second('admission-notice'),
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

/**
 * Results and councils linked by offer stage that the configuration does not generate: under an
 * offer without confirmed stages, and beyond the count of an annual offer.
 * The first annual stage is generated and serves as the control.
 */
export function stageLinksToReview(): PendingLinksFixture {
  const date = (id: string, activity: ActivityRef, offerId: string): CalendarEvent => ({
    id,
    name: `Data sintética ${id}`,
    start: day('28/05'),
    end: day('28/05'),
    effect: 'note',
    category: 'prazo',
    activity,
    offers: [offerId],
  });
  return {
    schemaVersion: 7,
    rulesetVersion: 'consup-292-2027-v5',
    year: 2027,
    campus: 'Campus sintético de etapas',
    offers: [
      offer('integrado'),
      { ...offer('subsequente'), organization: 'anual', stages: { status: 'defined', perTerm: 2 } },
    ],
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'year',
        name: 'Ano letivo',
        start: day('01/02'),
        end: day('17/12'),
        association: { status: 'defined', offers: ['subsequente'], term: 'annual' },
      },
    ],
    events: [
      date('results-uncounted', definedStage('results', 'integrado', 'annual', 1), 'integrado'),
      date('council-uncounted', definedStage('council', 'integrado', 'annual', 1), 'integrado'),
      date('results-beyond', definedStage('results', 'subsequente', 'annual', 3), 'subsequente'),
      date('council-beyond', definedStage('council', 'subsequente', 'annual', 3), 'subsequente'),
      date('results-generated', definedStage('results', 'subsequente', 'annual', 1), 'subsequente'),
      date('council-generated', definedStage('council', 'subsequente', 'annual', 1), 'subsequente'),
    ],
  };
}

/**
 * Annual 2027 calendar with links that v4 resolved only through the operational catalogue
 * (“Classificação legada”, retired with format 4): the teaching plan by offer cycle
 * (`teaching-plan-0`) and enrolment by reference semester (`enrolment-1`), which the 2027 policy
 * declares with other bases (reference semester and offer cycle). Both stay under review.
 */
export function legacyOperationalLinks(): PendingLinksFixture {
  const date = (id: string, activity: ActivityRef, start: string): CalendarEvent => ({
    id,
    name: `Data sintética ${id}`,
    start: day(start),
    end: day(start),
    effect: 'note',
    category: 'prazo',
    activity,
    offers: ['integrado'],
  });
  return {
    schemaVersion: 7,
    rulesetVersion: 'consup-292-2027-v5',
    year: 2027,
    campus: 'Campus sintético de vínculos legados',
    offers: [
      { ...offer('integrado'), organization: 'anual', stages: { status: 'defined', perTerm: 4 } },
    ],
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'year',
        name: 'Ano letivo',
        start: day('01/02'),
        end: day('17/12'),
        association: { status: 'defined', offers: ['integrado'], term: 'annual' },
      },
    ],
    events: [
      date('legacy-teaching-plan', cycleLink('teaching-plan', 'annual'), '19/02'),
      date('legacy-enrolment', semesterLink('enrolment', 'first'), '25/01'),
    ],
  };
}

/**
 * Stage positions recorded before the organization is confirmed. The integrated offer has no stages
 * yet: its dates hold the first stage and results, two of them the second stage, and one a fourth,
 * beyond the count of three the campus informs. The subsequent offer is annual with three stages
 * and a date in a fourth position, beyond its count.
 */
export function stagePositionsToConfirm(): PendingLinksFixture {
  const date = (
    id: string,
    activity: ActivityRef,
    start: string,
    end: string,
    offerId: string,
  ): CalendarEvent => ({
    id,
    name: `Data sintética ${id}`,
    start: day(start),
    end: day(end),
    effect: 'note',
    category: activity.activityId === 'stage' ? 'limite' : 'prazo',
    activity,
    offers: [offerId],
  });
  return {
    schemaVersion: 7,
    rulesetVersion: 'consup-292-2027-v5',
    year: 2027,
    campus: 'Campus sintético de posições de etapa',
    offers: [
      offer('integrado'),
      { ...offer('subsequente'), organization: 'anual', stages: { status: 'defined', perTerm: 3 } },
    ],
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    periods: [
      {
        id: 'integrado-period',
        name: 'Ano letivo do integrado',
        start: day('01/02'),
        end: day('17/12'),
        association: { status: 'defined', offers: ['integrado'], term: 'annual' },
      },
      {
        id: 'subsequente-year',
        name: 'Ano letivo',
        start: day('01/02'),
        end: day('17/12'),
        association: { status: 'defined', offers: ['subsequente'], term: 'annual' },
      },
    ],
    events: [
      date(
        'stage-one',
        definedStage('stage', 'integrado', 'annual', 1),
        '01/02',
        '30/04',
        'integrado',
      ),
      date(
        'stage-two-a',
        definedStage('stage', 'integrado', 'annual', 2),
        '03/05',
        '30/07',
        'integrado',
      ),
      date(
        'stage-two-b',
        definedStage('stage', 'integrado', 'annual', 2),
        '10/05',
        '31/07',
        'integrado',
      ),
      date(
        'stage-four',
        definedStage('stage', 'integrado', 'annual', 4),
        '01/11',
        '17/12',
        'integrado',
      ),
      date(
        'results-one',
        definedStage('results', 'integrado', 'annual', 1),
        '07/05',
        '07/05',
        'integrado',
      ),
      date(
        'sub-stage-1',
        definedStage('stage', 'subsequente', 'annual', 1),
        '01/02',
        '30/04',
        'subsequente',
      ),
      date(
        'sub-stage-2',
        definedStage('stage', 'subsequente', 'annual', 2),
        '03/05',
        '31/07',
        'subsequente',
      ),
      date(
        'sub-stage-3',
        definedStage('stage', 'subsequente', 'annual', 3),
        '02/08',
        '31/10',
        'subsequente',
      ),
      date(
        'sub-stage-4',
        definedStage('stage', 'subsequente', 'annual', 4),
        '01/11',
        '17/12',
        'subsequente',
      ),
    ],
  };
}

/**
 * Ivaiporã draft after the campus confirmed two stages for both annual offers: the 11 semester
 * links stay under “Vínculo a conferir” (`not-generated`), and the annual cycle of their
 * activities is now generated for both offers, so each date can have its link corrected
 * (`changeActivity`).
 */
export function ivaiporaAnnual(): PendingLinksFixture {
  let state = ivaiporaDraft();
  let sequence = 0;
  for (const offerId of ['integrado', 'subsequente']) {
    const draft = offerOrganizationDraft(state, offerId);
    draft.organization = 'anual';
    draft.count = '2';
    draft.periods[0] = { sourceId: '', name: 'Ano letivo', start: day('01/02'), end: day('17/12') };
    draft.stages[0] = { id: '', start: day('01/02'), end: day('30/06') };
    draft.stages[1] = { id: '', start: day('26/07'), end: day('17/12') };
    state = applyOfferOrganization(state, offerId, draft, () => `ivaipora-annual-${++sequence}`);
  }
  return state;
}
