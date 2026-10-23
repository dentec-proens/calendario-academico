import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  canonicalSnapshot,
  createCanonicalPlan,
  verifyCanonicalEquivalence,
} from '../migration/canonical.ts';
import { verifyHistorySuggestions } from '../migration/canonical-baseline.ts';
import { assertPlan, assertSourceSnapshot, verifyPlanSnapshot } from '../migration/plan.ts';
import type { Document, Row, Snapshot } from '../migration/types.ts';

const row = (id: string, values: Document): Row => ({
  _id: id,
  _creationTime: 1710000000000,
  ...values,
});
const event = (values: Document = {}): Document => ({
  id: 'vacation',
  name: 'Nome original',
  start: '2027-07-01',
  end: '2027-07-15',
  evidence: 'Resolução original',
  kind: 'note',
  ...values,
});
function fixture(): Snapshot {
  const state = {
    regime: 'anual',
    weekdays: [1, 2, 3, 4, 5],
    weekConfirmed: true,
    weekEvidence: 'Decisão original',
    periods: [{ id: 'period', name: 'Ano', start: '2027-02-01', end: '2027-12-17' }],
    events: [event({ id: 'teacher-vacation-july', category: 'ferias' })],
  };
  const institution = event({
    id: 'inst:ifpr2027-21',
    name: 'Criação do IFPR e da Rede Federal de EPT',
    category: 'institucional',
    offers: ['integrado'],
  });
  const historical = {
    ...state,
    schemaVersion: 1,
    year: 2027,
    campus: 'Campus',
    offer: 'integrado',
    assessmentStages: 2,
    events: [
      ...state.events,
      event({
        id: 'original-id',
        requirementId: 'stage-1',
        modalities: ['integrado'],
        historicalSource: { historyId: 'history', page: 2, candidateKey: 'immutable:candidate' },
      }),
    ],
  };
  return {
    _tables: [],
    _storage: [row('file', { sha256: 'original-hash' })],
    campuses: [row('campus', { name: 'Campus', archived: false })],
    calendars: [
      row('calendar', {
        campusId: 'campus',
        year: 2027,
        modalities: ['integrado'],
        version: 7,
        updatedAt: 1720000000000,
      }),
    ],
    calendarContents: [
      row('content', {
        calendarId: 'calendar',
        state: { ...state, ignoredHistory: ['history:ignored'], assessmentStagesByModality: {} },
        institutionalSnapshot: [institution],
        documentSnapshot: [],
      }),
    ],
    calendarSnapshots: [
      row('snapshot', {
        at: 1730000000000,
        state: historical,
        catalogueRevision: 3,
        institutionalEvents: [institution],
        documentSnapshot: [],
      }),
    ],
    calendarVersions: [
      row('version', {
        snapshotId: 'snapshot',
        calendarId: 'calendar',
        version: 6,
        at: 1730000000000,
      }),
    ],
    institutionalEvents: [
      row('institution', {
        ...institution,
        id: undefined,
        offers: undefined,
        modalities: ['integrado'],
        code: 'ifpr2027-21',
      }),
    ],
    reviews: [
      row('review', {
        calendarId: 'calendar',
        revision: 3,
        conclusion: 'XXX/2026\nTexto original.',
        entries: [{ id: 'I', notes: 'Não alterar', status: 'ATENDIDO', reviewed: true }],
        applicableNorm: 'XXX/2026',
      }),
    ],
    reviewVersions: [
      row('old-review', { reviewId: 'review', conclusion: 'Rascunho XXX/2026', revision: 1 }),
    ],
    histories: [row('history', { modalities: ['integrado'], filename: 'original.pdf' })],
    authAccounts: [row('auth', { credential: 'synthetic', userId: 'user' })],
    unexpectedFutureTable: [row('future', { arbitrary: { preserved: true } })],
  };
}
function state(snapshot: Snapshot): Document {
  return snapshot.calendarSnapshots[0].state as Document;
}

test('canonical migration preserves complete rows outside its allowlist and all event identities/content', () => {
  const source = fixture(),
    untouched = structuredClone(source);
  const result = canonicalSnapshot(source),
    migrated = state(result);
  assert.deepEqual(source, untouched);
  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.modalities, ['integrado']);
  assert.deepEqual(migrated.assessmentStagesByModality, { integrado: 2 });
  assert.deepEqual(migrated.ignoredHistory, []);
  assert.equal('assessmentStages' in migrated, false);
  const events = migrated.events as Document[];
  assert.equal(events[0].kind, 'exclude');
  assert.equal(events[1].id, 'original-id');
  assert.equal(events[1].name, 'Nome original');
  assert.equal(events[1].requirementId, 'stage-1:integrado');
  assert.deepEqual(
    events[1].historicalSource,
    (state(source).events as Document[])[1].historicalSource,
  );
  assert.deepEqual(result.reviews, source.reviews);
  assert.deepEqual(result.reviewVersions, source.reviewVersions);
  assert.deepEqual(result.calendarVersions, source.calendarVersions);
  assert.deepEqual(result.unexpectedFutureTable, source.unexpectedFutureTable);
  assert.equal(result.institutionalEvents[0].category, 'criacao');
  const saved = result.calendarSnapshots[0].institutionalEvents as Document[];
  assert.equal('offers' in saved[0], false);
  assert.deepEqual(saved[0].modalities, ['integrado']);
  assert.equal(saved[0].category, 'criacao');
  const report = verifyCanonicalEquivalence(source, result);
  assert.equal(report.preservedReviews, 2);
  assert.equal(report.states, 2);
});

test('unknown stage counts remain unknown and conversion is idempotent', () => {
  const source = fixture();
  delete state(source).assessmentStages;
  state(source).events = [];
  const result = canonicalSnapshot(source);
  assert.deepEqual(state(result).assessmentStagesByModality, {});
  assert.deepEqual(canonicalSnapshot(result), result);
  assert.equal(verifyCanonicalEquivalence(source, result).unknownAssessmentStates, 2);
});

test('equivalence requires the canonical representation and tolerates only engine registry/checkpoints and missing empty tables', () => {
  const source = fixture();
  assert.throws(() => verifyCanonicalEquivalence(source, source), /formato canônico/);
  const result = canonicalSnapshot(source);
  result._tables = [{ name: 'deployment registry' } as unknown as Row];
  result.migrationState = [row('checkpoint', { nextBatch: 2 })];
  result.newEmptyTable = [];
  verifyCanonicalEquivalence(source, result);
  result.newEmptyTable.push(row('unexpected', { value: true }));
  assert.throws(() => verifyCanonicalEquivalence(source, result), /contagem/);
});

test('canonical plan only replaces changed rows and works with the existing fingerprint protocol', () => {
  const source = fixture(),
    expected = canonicalSnapshot(source);
  const plan = createCanonicalPlan(source, 'complete-backup-digest');
  assertPlan(plan);
  assertSourceSnapshot(plan, source);
  verifyPlanSnapshot(plan, expected);
  assert.deepEqual(plan.expectedCounts, plan.sourceCounts);
  const reconstructed = structuredClone(source);
  for (const operation of plan.batches.flatMap((batch) => batch.operations)) {
    assert.equal(operation.kind, 'replace');
    if (operation.kind !== 'replace') throw Error('Expected replace');
    const original = reconstructed[operation.table].find((item) => item._id === operation.id)!;
    const index = reconstructed[operation.table].indexOf(original);
    reconstructed[operation.table][index] = {
      _id: original._id,
      _creationTime: original._creationTime,
      ...operation.document,
    };
  }
  assert.deepEqual(reconstructed, expected);
  assert.equal(createCanonicalPlan(expected, 'already-canonical').batches.length, 0);
});

test('canonical plan reports preexisting unavailable files without modifying their references', () => {
  const source = fixture();
  source.histories[0].unavailableFile = {
    sourceReference: 'archived/reference.pdf',
    reason: 'not_migrated',
  };
  const plan = createCanonicalPlan(source, 'backup');
  assert.deepEqual(plan.missingFiles, [
    { table: 'histories', id: 'history', filename: 'original.pdf' },
  ]);
  assert.deepEqual(canonicalSnapshot(source).histories, source.histories);
});

test('equivalence audit rejects changed original text, dates, event IDs, decisions, metadata and references', () => {
  const source = fixture();
  const mutations: ((snapshot: Snapshot) => void)[] = [
    (s) => {
      s.reviews[0].conclusion = 'Texto corrigido';
    },
    (s) => {
      s.reviewVersions[0].conclusion = 'Texto corrigido';
    },
    (s) => {
      (state(s).events as Document[])[0].start = '2027-07-02';
    },
    (s) => {
      (state(s).events as Document[])[1].id = 'new-id';
    },
    (s) => {
      state(s).ignoredHistory = ['new-decision'];
    },
    (s) => {
      s.calendarSnapshots[0]._creationTime++;
    },
    (s) => {
      s.calendarVersions[0].version = 999;
    },
    (s) => {
      ((state(s).events as Document[])[1].historicalSource as Document).candidateKey = 'changed';
    },
    (s) => {
      s.unexpectedFutureTable[0].arbitrary = 'changed';
    },
    (s) => {
      s.calendarContents[0].documentSnapshot = [{ id: 'changed' }];
    },
  ];
  for (const mutate of mutations) {
    const result = canonicalSnapshot(source);
    mutate(result);
    assert.throws(() => verifyCanonicalEquivalence(source, result), /Equivalência/);
  }
});

test('unsupported or ambiguous legacy values stop the migration instead of inventing information', () => {
  const mutations: ((snapshot: Snapshot) => void)[] = [
    (s) => {
      state(s).offer = 'tecnico';
    },
    (s) => {
      state(s).modalities = ['integrado', 'graduacao'];
      state(s).events = [event({ requirementId: 'stage-1' })];
    },
    (s) => {
      delete state(s).assessmentStages;
    },
    (s) => {
      state(s).teacherVacations = { julyStart: '2027-07-01', evidence: 'Original' };
    },
    (s) => {
      (state(s).events as Document[])[1].requirementId = 'stage-start-1';
    },
    (s) => {
      delete ((state(s).events as Document[])[1].historicalSource as Document).candidateKey;
    },
    (s) => {
      state(s).assessmentStagesByModality = { integrado: 4 };
    },
    (s) => {
      (s.calendarContents[0].institutionalSnapshot as Document[])[0].modalities = ['graduacao'];
    },
  ];
  for (const mutate of mutations) {
    const source = fixture();
    mutate(source);
    assert.throws(() => canonicalSnapshot(source));
  }
});

test('history baseline checks every candidate, matching identity, visibility and explicit inclusion', () => {
  const source = fixture();
  source.histories[0].calendarId = 'calendar';
  source.historyAnalyses = [
    row('analysis', {
      historyId: 'history',
      analysis: {
        candidates: [
          { name: 'Adotada', page: 1, excerpt: 'Trecho original' },
          { name: 'Proposta', page: 2, excerpt: 'Outro trecho' },
        ],
      },
    }),
  ];
  (source.calendarContents[0].state as Document).events = [
    event({ id: 'existing', name: 'Adotada' }),
  ];
  const canonical = canonicalSnapshot(source);
  const contexts = (snapshot: Snapshot) => {
    const state = snapshot.calendarContents[0].state as Document;
    return [{ state, events: state.events as unknown[], record: snapshot.calendars[0] }];
  };
  const rules = {
    existingHistory: (...args: unknown[]) =>
      (args[0] as Document[]).find((e) => e.name === (args[1] as Document).name) ?? null,
    includedHistory: (...args: unknown[]) =>
      (args[0] as Document[]).some((e) => e.name === (args[2] as Document).name),
  };
  const verify = (nextRules = rules, snapshot = canonical) =>
    verifyHistorySuggestions(
      source,
      snapshot,
      contexts(source),
      contexts(snapshot),
      rules,
      nextRules,
    );
  const report = verify();
  assert.equal(report.historyAnalyses, 1);
  assert.equal(report.historyCandidates, 2);
  assert.equal(report.historyExistingCandidates, 1);
  assert.equal(report.historyIncludedCandidates, 1);
  assert.throws(
    () => verify({ ...rules, existingHistory: () => null }),
    /visibilidade ou identidade/,
  );
  assert.throws(
    () => verify({ ...rules, existingHistory: () => ({ id: 'other-id' }) }),
    /visibilidade ou identidade/,
  );
  assert.throws(
    () => verify({ ...rules, includedHistory: () => false }),
    /visibilidade ou identidade/,
  );
  assert.throws(
    () =>
      verify({
        ...rules,
        existingHistory: () => {
          throw Error('Unexpected runtime error');
        },
      }),
    /Baseline incompleto/,
  );
  const edited = structuredClone(canonical);
  (edited.historyAnalyses[0].analysis as { candidates: Document[] }).candidates[0].excerpt =
    'Modificado';
  assert.throws(() => verify(rules, edited), /identidade e conteúdo/);
});
