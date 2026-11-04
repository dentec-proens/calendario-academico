import { expect, test } from 'vitest';
import { civilDate } from '../../src/domain/civil-date.ts';
import {
  compareContents,
  describeValue,
  fieldLabels,
  ignoredFields,
  type DiffSide,
} from '../../src/domain/calendar/diff.ts';
import { contentIssues } from '../../src/domain/calendar/readiness.ts';
import * as validators from '../../convex/validators.ts';
import { calendarOffersFixture } from '../fixtures/calendar-offers.ts';
import { retiredOfferFields } from '../helpers/retired-fields.ts';

const allOffers = ['integrado', 'graduacao', 'graduacao-2', 'graduacao-3'];
const institutional = (id: string, start: string, offers = allOffers) => ({
  id,
  name: `Evento ${id}`,
  start: civilDate(start),
  end: civilDate(start),
  effect: 'exclude' as const,
  evidence: 'Base sintética',
  institutional: true,
  offers,
});

function side(change: (value: DiffSide) => void = () => {}): DiffSide {
  const value: DiffSide = {
    state: calendarOffersFixture(),
    institutionalSnapshot: [
      {
        ...institutional('inst:ifpr2027-16', '2027-10-15'),
        originalStart: civilDate('2027-10-15'),
        originalEnd: civilDate('2027-10-15'),
      },
      institutional('inst:feriado', '2027-04-21'),
    ],
    documentSnapshot: [{ id: 'norma', title: 'Norma', hash: 'a'.repeat(64), status: 'vigente' }],
    catalogueRevision: 3,
  };
  change(value);
  return value;
}

test('two identical records and a reordering have no differences', () => {
  expect(compareContents(side(), side()).unchanged).toBe(true);
  const reordered = side((value) => {
    value.state.events.reverse();
    value.state.periods.reverse();
    value.state.weekdays = [5, 4, 3, 2, 1];
    value.institutionalSnapshot.reverse();
  });
  expect(compareContents(side(), reordered).unchanged).toBe(true);
});

test('items are added, removed and changed by id in offers, periods and events', () => {
  const after = side((value) => {
    value.state.offers[1] = {
      ...value.state.offers[1],
      label: 'Química',
    };
    value.state.periods[0] = { ...value.state.periods[0], end: civilDate('2027-12-10') };
    value.state.periods[1] = {
      ...value.state.periods[1],
      association: { status: 'defined', offers: ['graduacao', 'integrado'], term: 'annual' },
    };
    value.state.events = value.state.events.filter((event) => event.id !== 'graduacao-3-stage-2');
    value.state.events.push({
      id: 'note',
      name: 'Reunião',
      start: civilDate('2027-03-01'),
      end: civilDate('2027-03-01'),
      effect: 'note' as const,
      offers: value.state.offers.map((offer) => offer.id),
    });
  });
  const diff = compareContents(side(), after);
  expect(diff.offers).toEqual([
    expect.objectContaining({
      kind: 'changed',
      id: 'graduacao',
      fields: [
        expect.objectContaining({
          field: 'label',
          before: 'Licenciatura em Química',
          after: 'Química',
        }),
      ],
    }),
  ]);
  expect(
    diff.periods.map((change) => [change.id, change.fields.map((field) => field.field)]),
  ).toEqual([
    ['integrado-annual', ['end']],
    ['graduacao-annual', ['association']],
  ]);
  expect(diff.events.map((change) => [change.kind, change.id])).toEqual([
    ['added', 'note'],
    ['removed', 'graduacao-3-stage-2'],
  ]);
});

test('observances by key, week and vacations field by field, derived vacation events ignored', () => {
  const vacations = (value: DiffSide, end: string) => {
    value.state.teacherVacations = {
      firstStart: civilDate('2027-01-04'),
      firstEnd: civilDate(end),
    };
    value.state.events.push({
      id: 'teacher-vacation-january',
      name: 'Férias',
      start: civilDate('2027-01-04'),
      end: civilDate(end),
      effect: 'exclude' as const,
      offers: value.state.offers.map((offer) => offer.id),
    });
  };
  const before = side((value) => vacations(value, '2027-01-29'));
  const after = side((value) => {
    vacations(value, '2027-01-30');
    value.state.weekdays = [1, 2, 3, 4, 5, 6];
    value.state.observanceDates = { 'teacher-day': civilDate('2027-10-11') };
    value.institutionalSnapshot[0] = {
      ...value.institutionalSnapshot[0],
      start: civilDate('2027-10-11'),
      end: civilDate('2027-10-11'),
    };
  });
  const diff = compareContents(before, after);
  expect(diff.events).toEqual([]);
  expect(diff.vacations).toEqual([
    expect.objectContaining({ field: 'firstEnd', after: '2027-01-30' }),
  ]);
  expect(diff.week).toEqual([expect.objectContaining({ field: 'weekdays' })]);
  expect(diff.observances).toEqual([
    expect.objectContaining({
      field: 'teacher-day',
      label: 'Dia do Professor',
      after: '2027-10-11',
    }),
  ]);
  expect(diff.base.events, 'the observance belongs to the campus, not to the base').toEqual([]);
});

test('offer order is no change; a narrower list shows as Ofertas and an offer inclusion is none', () => {
  const ids = calendarOffersFixture().offers.map((offer) => offer.id);
  const note = (offers: string[]) => (value: DiffSide) => {
    value.state.offers = value.state.offers.slice(0, 3);
    value.state.events.push({
      id: 'note',
      name: 'Nota',
      start: civilDate('2027-03-01'),
      end: civilDate('2027-03-01'),
      effect: 'note' as const,
      offers,
    });
  };
  const listed = side(note(ids.slice(0, 3)));
  // Offers are always listed: only their set is compared, not their order.
  expect(compareContents(listed, side(note([...ids.slice(0, 3)].reverse()))).unchanged).toBe(true);
  const narrowed = compareContents(listed, side(note(ids.slice(0, 2))));
  expect(narrowed.events[0].fields.map((field) => field.label)).toEqual(['Ofertas']);
  const included = side((value) => {
    value.institutionalSnapshot[1] = { ...value.institutionalSnapshot[1], offers: ids };
  });
  const narrower = side((value) => {
    value.state.offers = value.state.offers.slice(0, 3);
    value.institutionalSnapshot[1] = { ...value.institutionalSnapshot[1], offers: ids.slice(0, 3) };
  });
  const diff = compareContents(narrower, included);
  expect(diff.offers.map((change) => change.kind)).toEqual(['added']);
  expect(diff.base.events).toEqual([]);
});

test('a base change and a recalculated period are reported in the base section', () => {
  const after = side((value) => {
    value.catalogueRevision = 4;
    value.state.periods[0] = {
      ...value.state.periods[0],
      targetDays: 200,
      end: civilDate('2027-12-10'),
    };
    value.institutionalSnapshot[1] = {
      ...value.institutionalSnapshot[1],
      start: civilDate('2027-04-22'),
      end: civilDate('2027-04-22'),
    };
    value.documentSnapshot[0] = { ...value.documentSnapshot[0], hash: 'b'.repeat(64) };
  });
  const before = side((value) => {
    value.state.periods[0] = { ...value.state.periods[0], targetDays: 200 };
  });
  const diff = compareContents(before, after);
  expect(diff.periods[0].note).toMatch(/recalculado pela base/);
  expect(diff.base.fields.map((field) => field.field)).toEqual(['catalogueRevision']);
  expect(diff.base.events.map((change) => change.id)).toEqual(['inst:feriado']);
  expect(diff.base.documents[0].fields.map((field) => field.field)).toEqual(['hash']);
});

test('a split period, a split linked event and a recreated event appear with a new identifier', () => {
  const after = side((value) => {
    value.state.periods[0] = { ...value.state.periods[0], id: 'integrado-annual-2' };
    const index = value.state.events.findIndex((event) => event.id === 'integrado-stage-1');
    value.state.events[index] = {
      ...value.state.events[index],
      id: 'recreated',
      end: civilDate('2027-04-15'),
    };
  });
  const diff = compareContents(side(), after);
  expect(diff.periods).toEqual([
    expect.objectContaining({
      kind: 'reidentified',
      id: 'integrado-annual-2',
      previousId: 'integrado-annual',
      fields: [],
    }),
  ]);
  expect(diff.events).toEqual([
    expect.objectContaining({
      kind: 'reidentified',
      id: 'recreated',
      previousId: 'integrado-stage-1',
      fields: [expect.objectContaining({ field: 'end' })],
    }),
  ]);
});

test('the effect aggregates teaching days by offer and term, and a side without evaluation is unavailable', () => {
  const after = side((value) => {
    value.state.events.push({
      id: 'off',
      name: 'Recesso',
      start: civilDate('2027-03-02'),
      end: civilDate('2027-03-03'),
      effect: 'exclude' as const,
      offers: value.state.offers.map((offer) => offer.id),
    });
    value.state.rulesetVersion = 'outra';
  });
  const diff = compareContents(side(), after);
  const annual = diff.effect.teachingDays.find(
    (row) => row.offerId === 'integrado' && row.term === 'annual',
  );
  expect(annual && annual.before! - annual.after!).toBe(2);
  expect(
    diff.effect.teachingDays.filter((row) => row.offerId === 'graduacao-2').map((row) => row.term),
  ).toEqual(['first', 'second']);
  expect(diff.effect.rulesetDiffers).toBe(true);
  const broken = side((value) => {
    value.state.weekConfirmed = false;
  });
  const partial = compareContents(broken, side());
  expect(partial.effect.unavailable).toEqual({ before: true, after: false });
  expect(partial.effect.teachingDays.every((row) => row.before === null)).toBe(true);
});

test('content issues have stable codes and the effect lists the new and resolved ones', () => {
  const before = side();
  const after = side((value) => {
    value.state.offers[0] = { ...value.state.offers[0], stages: undefined };
  });
  const issues = contentIssues(after.state, after.institutionalSnapshot);
  expect(issues.some((issue) => issue.code === 'stages')).toBe(true);
  expect(
    issues.every(
      (issue) =>
        !/Salve o calendário com a base|precisa salvar a revisão|aguardando confirmação/.test(
          issue.message,
        ),
    ),
  ).toBe(true);
  const diff = compareContents(before, after);
  expect(diff.effect.issues.added.map((issue) => issue.code)).toContain('stages');
  expect(
    compareContents(after, before).effect.issues.resolved.map((issue) => issue.code),
  ).toContain('stages');
});

test('every field of the stored validators is labeled or explicitly ignored', () => {
  // A grouped field (`notice`) is covered by labels of its parts (`notice.publication`).
  const covered = (fields: object, labels: object, ignored: readonly string[]) =>
    Object.keys(fields).filter(
      (key) =>
        !(key in labels) &&
        !Object.keys(labels).some((label) => label.startsWith(`${key}.`)) &&
        !ignored.includes(key),
    );
  expect(covered(validators.calendarOffer.fields, fieldLabels.offer, ignoredFields.offer)).toEqual(
    [],
  );
  expect(covered(validators.period.fields, fieldLabels.period, ignoredFields.period)).toEqual([]);
  expect(covered(validators.event.fields, fieldLabels.event, ignoredFields.event)).toEqual([]);
  expect(covered(validators.vacations.fields, fieldLabels.vacations, [])).toEqual([]);
  expect(covered(validators.contentState.fields, fieldLabels.week, ignoredFields.state)).toEqual(
    [],
  );
  expect(
    covered(
      validators.institutionalEventSnapshot.fields,
      fieldLabels.institutionalEvent,
      ignoredFields.institutionalEvent,
    ),
  ).toEqual([]);
  expect(
    covered(validators.documentSnapshot.fields, fieldLabels.document, ignoredFields.document),
  ).toEqual([]);
});

test('a notice change shows its publication and its admission with destinations by offer', () => {
  const notice = (publication: 'planned' | 'published', periodId: string) => (value: DiffSide) =>
    void value.state.events.push({
      id: 'notice',
      name: 'Edital de transferência',
      start: civilDate('2027-05-03'),
      end: civilDate('2027-05-03'),
      effect: 'note' as const,
      offers: ['integrado', 'graduacao'],
      notice: {
        publication,
        admission: {
          type: 'transfer',
          year: 2027,
          term: 'annual',
          destinations: [
            { offerId: 'integrado', periodId: 'integrado-annual' },
            { offerId: 'graduacao', periodId },
          ],
        },
      },
    });
  const before = side(notice('planned', 'graduacao-annual'));
  const after = side(notice('published', 'removed-period'));
  const [change] = compareContents(before, after).events;
  expect(change).toMatchObject({ kind: 'changed', id: 'notice' });
  expect(change.fields.map((field) => [field.field, field.label])).toEqual([
    ['notice.publication', 'Situação de publicação'],
    ['notice.admission', 'Ingresso e destinos por oferta'],
  ]);
  const [publication, admission] = change.fields;
  expect(describeValue(publication.field, publication.before)).toBe('Publicação programada');
  expect(describeValue(publication.field, publication.after)).toBe('Publicação realizada');
  expect(describeValue(admission.field, admission.after, after.state)).toBe(
    'Transferência, reingresso e portador de diploma · 2027 — ano letivo · destinos: Licenciatura em Química → removed-period, Técnico integrado → Ano letivo',
  );
  // Destinations in another order are the same notice.
  const reordered = side(notice('planned', 'graduacao-annual'));
  reordered.state.events.at(-1)!.notice!.admission!.destinations.reverse();
  expect(compareContents(before, reordered).events).toEqual([]);
});

test('changing the count per cycle shows the assessment stages before and after', () => {
  const recounted = side((value) => {
    value.state.offers[0] = { ...value.state.offers[0], stages: { status: 'defined', perTerm: 3 } };
  });
  const diff = compareContents(recounted, side());
  const change = diff.offers.find((item) => item.id === recounted.state.offers[0].id)!;
  const stages = change.fields.find((field) => field.field === 'stages')!;
  expect(stages.label).toBe('Etapas de avaliação');
  expect(describeValue('stages', stages.before)).toBe('3 por ciclo');
  expect(describeValue('stages', stages.after)).toBe(
    `${(side().state.offers[0].stages as { perTerm: number }).perTerm} por ciclo`,
  );
  for (const field of retiredOfferFields)
    expect(Object.keys(fieldLabels.offer)).not.toContain(field);
});
