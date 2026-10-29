import { test } from 'vitest';
import assert from 'node:assert/strict';
import { reviewSupport } from '../../src/domain/reviews/technical-support.ts';
import {
  reviewCriteria,
  reviewCriteriaFor,
  reviewSourceFor,
} from '../../src/domain/reviews/criteria.ts';
import { reviewDocument } from '../../src/printing/review-export.ts';
import { policyFor } from '../../src/domain/policies/registry.ts';

test('school vacation suggestions exclude teacher vacations and leave notes blank', () => {
  const record = {
    id: 'test',
    name: 'Teste',
    version: 1,
    state: {
      schemaVersion: 4 as const,
      year: 2027,
      campus: 'Foz',
      weekdays: [],
      weekConfirmed: false,
      periods: [],
      events: [],
      offers: [
        {
          id: 'integrado',
          kind: 'integrado' as const,
          delivery: 'a-conferir' as const,
          organization: 'anual' as const,
        },
      ],
    },
  };
  const events = [
    { id: 'school', name: 'Férias dos estudantes', category: 'ferias' },
    { id: 'teachers', name: 'Férias docentes', category: 'ferias' },
    { id: 'professors', name: 'Férias dos professores', category: 'ferias' },
    { id: 'teacher-vacation-january', name: 'Férias', category: 'ferias' },
  ].map((e) => ({ ...e, start: '2027-01-02', end: '2027-01-31', evidence: 'Fonte' }));
  const support = reviewSupport(record, events);
  assert.deepEqual(
    support.criteria.find((c) => c.id === 'III')!.candidates.map((e) => e.id),
    ['school'],
  );
  assert(support.criteria.find((c) => c.id === 'IV')!.candidates.some((e) => e.id === 'teachers'));
  assert(support.criteria.every((c) => c.initial.notes === ''));
});
test('review extracts 29 active criteria, flags other years and treats name matches only as clues', () => {
  const record = {
    id: 'test',
    name: 'Teste',
    version: 1,
    state: {
      schemaVersion: 4 as const,
      year: 2028,
      campus: 'Foz',
      weekdays: [],
      weekConfirmed: false,
      periods: [],
      events: [],
      offers: [
        {
          id: 'graduacao',
          kind: 'graduacao' as const,
          delivery: 'a-conferir' as const,
          organization: 'anual' as const,
        },
      ],
    },
  };
  const result = reviewSupport(record, [
    {
      id: 'f',
      name: 'Formação pedagógica',
      category: 'formacao',
      start: '2027-02-01',
      end: '2027-02-01',
      evidence: 'Ata',
    },
  ]);
  assert.equal(reviewCriteria.length, 29);
  assert.equal(result.sameYear, false);
  assert.equal(result.officialApproval, false);
  assert(result.criteria.find((c) => c.id === 'window')!.signal.includes('não aplicadas'));
  assert.equal(result.criteria.find((c) => c.id === 'XXII')!.candidates.length, 1);
  assert(result.criteria.find((c) => c.id === 'XXII')!.signal.includes('não comprova'));
  assert(result.criteria.find((c) => c.id === 'XXV')!.signal.includes('facultativo'));
  assert(!result.criteria.some((c) => 'status' in c));
});
test('initial analysis identifies a measurable deficit without assuming documentary compliance', () => {
  const record = {
    id: 'test',
    name: 'Teste',
    version: 1,
    courses: 'Curso',
    state: {
      schemaVersion: 4 as const,
      year: 2026,
      campus: 'Foz',
      weekdays: [1, 2, 3, 4, 5],
      weekConfirmed: true,
      weekEvidence: 'Ata',
      periods: [
        {
          id: 'a',
          name: 'Ano',
          start: '2026-02-04',
          end: '2026-12-18',
          association: {
            status: 'defined' as const,
            offers: ['integrado'],
            term: 'annual' as const,
          },
        },
      ],
      events: [],
      offers: [
        {
          id: 'integrado',
          kind: 'integrado' as const,
          delivery: 'a-conferir' as const,
          organization: 'anual' as const,
        },
      ],
    },
  };
  let result = reviewSupport(record, []);
  assert.equal(result.criteria.find((c) => c.id === 'annual')!.initial.status, 'PENDENTE');
  assert.equal(result.criteria.find((c) => c.id === 'window')!.initial.status, 'ATENDIDO');
  record.state.periods[0].end = '2026-02-10';
  result = reviewSupport(record, []);
  assert.equal(result.criteria.find((c) => c.id === 'annual')!.initial.status, 'NAO_ATENDIDO');
  assert.equal(result.criteria.find((c) => c.id === 'annual')!.initial.reviewed, false);
  assert.equal(result.criteria.find((c) => c.id === 'minutes')!.initial.status, 'PENDENTE');
  const doc = reviewDocument(record, {
    entries: result.criteria.map((c) => c.initial),
    reviewer: { name: 'Revisor <teste>' },
    revision: 1,
    calendarVersion: 1,
    catalogueRevision: 1,
    conclusion: 'Texto humano <script>alert(1)</script>',
    processNumber: '23411.000001/2026-00',
    applicableNorm: 'Norma confirmada pelo revisor',
  });
  assert.equal((doc.html.match(/<tr>/g) || []).length, 30);
  assert(doc.html.includes('proposta automática, não confirmada'));
  assert(doc.html.includes('23411.000001/2026-00'));
  assert(doc.html.includes('2. PARECER'));
  assert(doc.html.includes('&lt;script&gt;'));
  assert(!doc.html.includes('<script>'));
  assert(doc.text.includes('Texto humano <script>'));
  assert(!doc.html.includes('Documento assinado eletronicamente'));
  assert(doc.html.includes('Não é documento assinado'));
});
test('review displays separate registered totals and provisional counts without approving them', () => {
  const record = {
    id: 'r',
    name: 'Teste',
    version: 1,
    state: {
      schemaVersion: 4 as const,
      year: 2026,
      campus: 'Foz',
      weekdays: [1, 2, 3, 4, 5],
      weekConfirmed: true,
      weekEvidence: 'Ata',
      periods: [
        {
          id: 'a',
          name: '1º semestre',
          start: '2026-03-02',
          end: '2026-03-06',
          association: {
            status: 'defined' as const,
            offers: ['integrado', 'graduacao'],
            term: 'first' as const,
          },
        },
      ],
      offers: [
        {
          id: 'integrado',
          kind: 'integrado' as const,
          delivery: 'a-conferir' as const,
          organization: 'semestral' as const,
        },
        {
          id: 'graduacao',
          kind: 'graduacao' as const,
          delivery: 'a-conferir' as const,
          organization: 'semestral' as const,
        },
      ],
    },
  };
  const events = [
    {
      id: 'h',
      name: 'Feriado',
      kind: 'exclude',
      start: '2026-03-03',
      end: '2026-03-03',
      evidence: 'Lei',
      offers: ['graduacao'],
    },
  ];
  let r = reviewSupport(record, events);
  assert.deepEqual(
    r.teachingDays.map((c) => c.total),
    [5, 4],
  );
  assert.match(r.criteria.find((c) => c.id === 'annual')!.signal, /Graduação: 4 dias/);
  assert.match(r.criteria.find((c) => c.id === 'semester')!.signal, /1º semestre: 4 dias/);
  record.state.weekConfirmed = false;
  r = reviewSupport(record, events);
  assert(r.teachingDays.every((c) => c.provisional));
  assert.equal(r.criteria.find((c) => c.id === 'annual')!.initial.status, 'PENDENTE');
  record.state.weekdays = [];
  r = reviewSupport(record, events);
  assert.equal(r.teachingDays.length, 0);
  record.state.weekdays = [1, 2, 3, 4, 5];
  record.state.periods.push({ ...record.state.periods[0], id: 'b' });
  assert.equal(reviewSupport(record, events).teachingDays.length, 0);
});

test('2027 criteria identify the actual article and PDF page of Resolution 292', () => {
  const criteria = reviewCriteriaFor(2027);
  assert.equal(reviewSourceFor(2027).id, 'SEI 4422750');
  assert.equal(criteria.find((c) => c.id === 'annual')?.item, 'Art. 4º');
  assert.equal(criteria.find((c) => c.id === 'semester')?.item, 'Art. 4º, § 1º');
  assert.equal(criteria.find((c) => c.id === 'window')?.item, 'Art. 8º');
  assert.equal(criteria.find((c) => c.id === 'XI')?.page, 3);
  assert.equal(criteria.find((c) => c.id === 'XII')?.page, 4);
  assert.equal(criteria.find((c) => c.id === 'XXV')?.page, 4);
  assert.equal(criteria.find((c) => c.id === 'XXVI')?.page, 4);
});

test('review coverage follows the criterion identity when its citation text changes', () => {
  const policy = policyFor(2027);
  const original = policy.review.criteria;
  const item = 'Fundamento com apresentação editorial revisada';
  try {
    policy.review.criteria = original.map((row) => (row.id === 'XVI' ? { ...row, item } : row));
    const support = reviewSupport(
      {
        id: 'synthetic',
        name: 'Calendário sintético',
        version: 1,
        state: {
          schemaVersion: 4 as const,
          year: 2027,
          weekdays: [],
          weekConfirmed: false,
          periods: [],
          offers: [
            {
              id: 'integrado',
              kind: 'integrado' as const,
              delivery: 'a-conferir' as const,
              organization: 'anual' as const,
              scope: { status: 'covered', source: 'PPC sintético' },
            },
          ],
        },
      },
      [
        {
          id: 'meeting',
          name: 'Atividade com ata',
          start: '2027-03-05',
          end: '2027-03-05',
          kind: 'note',
          evidence: 'Ata sintética',
          offers: ['integrado'],
          requirementId: 'family-meeting',
        },
      ],
    );
    const result = support.criteria.find((row) => row.id === 'XVI')!;
    assert(result.signal.includes('planejamento completo'));
    assert(result.candidates.some((event) => event.id === 'meeting'));
    assert.equal(result.item, item);
  } finally {
    policy.review.criteria = original;
  }
});
