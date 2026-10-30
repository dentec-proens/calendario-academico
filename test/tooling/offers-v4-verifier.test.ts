import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { fingerprint } from '../../scripts/administration/canonical.ts';
import {
  assertArchivedSource,
  assertOracle,
  captureSource,
  ORACLE_SHA256,
  savePrivate,
} from '../../scripts/administration/offers-source-projection.ts';
import type { FrozenSource } from '../../scripts/administration/offers-source-projection.ts';
import {
  cloneJson,
  loadDomainRuntime,
  projectSnapshot,
  readVerifiedSnapshot,
  sha256,
} from '../../scripts/administration/offers-projection.ts';
import type { DomainRuntime, ObjectValue } from '../../scripts/administration/offers-projection.ts';
import {
  assertSnapshotIntegrity,
  compareCalendarProjection,
  verifySnapshots,
  verifyReviewPurgeEvidence,
} from '../../scripts/administration/offers-verify.ts';
import type { Snapshot, SnapshotRow } from '../../scripts/administration/snapshot.ts';

const root = resolve(import.meta.dirname, '../..');
const repository = dirname(realpathSync(join(root, 'src')));
const directory = mkdtempSync(join(tmpdir(), 'offers-proof-test-'));
chmodSync(directory, 0o700);
const archive = join(directory, 'source');
let sourceRuntime: DomainRuntime;
let currentRuntime: DomainRuntime;
let sourceCommit: string;
const oracle = JSON.parse(
  readFileSync(join(root, 'test/fixtures/offers-v3-oracle.json'), 'utf8'),
) as { catalogue: ObjectValue; cases: { name: string; input: ObjectValue }[] };
const purged = [
  'reviewVersions',
  'reviews',
  'calendarVersions',
  'calendarSnapshots',
  'calendarAliases',
];
const created = (id: string, fields: ObjectValue, at = 10): SnapshotRow => ({
  _id: id,
  _creationTime: at,
  ...cloneJson(fields),
});
const options = (frozen: FrozenSource) => ({
  frozenDigest: fingerprint(frozen),
  startedAt: 1000,
  finishedAt: 2000,
});
beforeAll(async () => {
  const fs = await import('node:fs');
  fs.mkdirSync(archive, { mode: 0o700 });
  const tar = join(directory, 'source.tar');
  execFileSync('git', ['-C', repository, 'archive', '--format=tar', `--output=${tar}`, '34e35b9']);
  execFileSync('tar', ['-xf', tar, '-C', archive]);
  symlinkSync(realpathSync(join(root, 'node_modules')), join(archive, 'node_modules'), 'dir');
  sourceCommit = execFileSync('git', ['-C', repository, 'rev-parse', '34e35b9'], {
    encoding: 'utf8',
  }).trim();
  sourceRuntime = await loadDomainRuntime(archive, 'source-v3');
  currentRuntime = await loadDomainRuntime(root, 'current-v4');
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));
function registries(snapshot: Snapshot) {
  for (const namespace of Object.keys(snapshot.tables)) {
    if (namespace.endsWith('_tables')) continue;
    const index = namespace.lastIndexOf('/');
    const registry = index < 0 ? '_tables' : `${namespace.slice(0, index)}/_tables`;
    snapshot.tables[registry] ??= [];
    const name = namespace.slice(index + 1);
    if (!snapshot.tables[registry]!.some((row) => row.name === name))
      snapshot.tables[registry]!.push(created(`registry-${namespace}`, { name }));
  }
}
function before(caseIndex = 1): Snapshot {
  const input = cloneJson(oracle.cases[caseIndex]!.input);
  const { year, campus: _campus, modalities, offer: _offer, ...state } = input;
  const calendar = created('calendar', {
    campusId: 'campus',
    year,
    modalities,
    purpose: 'test',
    courses: 'Cursos de teste',
    classes: '',
    shifts: '',
    version: 7,
    updatedAt: 20,
  });
  const snapshot: Snapshot = {
    sha256: 'a'.repeat(64),
    files: {},
    tables: {
      calendars: [calendar],
      campuses: [created('campus', { name: 'Campus sintético', archived: false })],
      institutionalEvents: oracle.catalogue.events.map(
        ({ id, ...event }: ObjectValue, index: number) =>
          created(`institution-${index}`, { code: id, year, ...event }),
      ),
      catalogueRevisions: [created('revision', { year, revision: oracle.catalogue.revision })],
      documents: [],
      audit: [
        created('old-audit', {
          at: 20,
          action: 'OLD_TEST',
          target: { type: 'calendar', id: 'calendar' },
        }),
      ],
      users: [],
      _storage: [],
      calendarContents: [],
      '_components/migrations/migrations': [],
      ...Object.fromEntries(purged.map((table) => [table, []])),
    },
  };
  const normalized = sourceRuntime.conversion!.convertCalendarV2({
    ...state,
    year,
    modalities,
    offer: modalities[0],
  });
  const institutionalSnapshot = sourceRuntime.base.applicableEvents(oracle.catalogue, normalized);
  snapshot.tables.calendarContents = [
    created('content', {
      calendarId: calendar._id,
      state,
      catalogueRevision: oracle.catalogue.revision,
      institutionalSnapshot,
      documentSnapshot: [],
    }),
  ];
  registries(snapshot);
  return snapshot;
}
function freeze(snapshot: Snapshot): FrozenSource {
  const projection = projectSnapshot(snapshot, sourceRuntime);
  return {
    format: 2,
    sourceCommit,
    sourceTreeDigest: 'b'.repeat(64),
    snapshotSha256: snapshot.sha256,
    oracleSha256: ORACLE_SHA256,
    projectionDigest: fingerprint(projection),
    projection,
  };
}
/** Test-only fixture construction: no production converter or expectedV4 helper. */
function after(snapshot: Snapshot, frozen: FrozenSource): Snapshot {
  const result = cloneJson(snapshot);
  result.sha256 = 'c'.repeat(64);
  const calendar = result.tables.calendars![0]!;
  const modalities = calendar.modalities as string[];
  delete calendar.modalities;
  calendar.offerKinds = ['integrado', 'subsequente', 'graduacao', 'posgraduacao'].filter((kind) =>
    modalities.includes(kind),
  );
  const content = result.tables.calendarContents![0]!;
  const source = frozen.projection.calendars.calendar!;
  const state = source.normalizedSource!;
  const offers = modalities.map((id) => {
    const organization = state.organizationByModality?.[id] ?? 'a-classificar';
    const count = state.assessmentStagesByModality?.[id];
    const stages =
      organization === 'anual' && [2, 3, 4].includes(count)
        ? { perTerm: count }
        : organization === 'semestral' && [2, 4].includes(count)
          ? { perTerm: count / 2 }
          : undefined;
    let intake = state.intakeByModality?.[id];
    if (
      modalities.length > 1 &&
      state.conversion?.legacySecondSemesterIntake !== undefined &&
      (!intake?.second || intake.second.status === 'unknown')
    )
      intake = { ...intake, second: { status: 'unknown' } };
    return {
      id,
      kind: id,
      delivery: 'a-conferir',
      organization,
      ...(stages ? { stages } : {}),
      ...(organization === 'a-classificar' && [2, 3, 4].includes(count)
        ? { legacyStageCount: count }
        : {}),
      ...(state.scopeConfirmation && !source.scope.excludedIds.includes(id)
        ? { scope: state.scopeConfirmation }
        : {}),
      ...(intake ? { intake } : {}),
    };
  });
  content.state = cloneJson({
    schemaVersion: 4,
    rulesetVersion: state.rulesetVersion,
    offers,
    weekdays: state.weekdays,
    weekConfirmed: state.weekConfirmed,
    periods: state.periods.map(({ association, ...period }: ObjectValue) => ({
      ...period,
      association:
        association?.status === 'defined'
          ? {
              status: 'defined',
              offers: association.modalities,
              term: association.term,
            }
          : { status: 'a-classificar' },
    })),
    events: state.events.map(({ modalities, ...event }: ObjectValue) => ({
      ...event,
      ...(modalities ? { offers: modalities } : {}),
    })),
    observanceDates: state.observanceDates,
    teacherVacations: state.teacherVacations,
  });
  const pending = offers.some(
    (offer) =>
      offer.organization === 'a-classificar' ||
      (!source.scope.excludedIds.includes(offer.id) && !offer.stages) ||
      Object.values(offer.intake ?? {}).some(
        (intake) => (intake as ObjectValue).status === 'unknown',
      ),
  );
  const purgedCounts = Object.fromEntries(
    purged.map((table) => [table, snapshot.tables[table]!.length]),
  );
  for (const table of purged) result.tables[table] = [];
  result.tables.audit!.push(
    created(
      'purge-audit',
      {
        at: 1400,
        action: 'PURGE_HISTORY_V4',
        target: { type: 'archived', reference: 'offers-v4:purge' },
        details: JSON.stringify({
          migration: 'offers-v4',
          purged: purgedCounts,
        }),
      },
      1400,
    ),
  );
  const sourceSchemaVersion =
    (snapshot.tables.calendarContents![0]!.state as ObjectValue).schemaVersion ?? 2;
  const oldStateHash = fingerprint(snapshot.tables.calendarContents![0]!.state);
  result.tables.audit!.push(
    created(
      'conversion-audit',
      {
        at: 1500,
        action: 'MIGRATE_CONTENT_V4',
        target: { type: 'calendar', id: calendar._id },
        campusId: calendar.campusId,
        calendarId: calendar._id,
        version: calendar.version,
        details: JSON.stringify({
          migration: 'offers-v4',
          sourceSchemaVersion,
          oldStateHash,
        }),
      },
      1500,
    ),
  );
  result.tables.migrationResults = [
    created(
      'conversion-result',
      {
        key: 'offers-v4',
        reference: 'content:content',
        contentId: content._id,
        calendarId: calendar._id,
        outcome: 'converted',
        pending,
        orphanKeys: 0,
        sourceSchemaVersion,
        oldStateHash,
      },
      1500,
    ),
  ];
  result.tables.migrationReports = [
    created(
      'migration-report',
      {
        key: 'offers-v4',
        converted: 1,
        alreadyV4: 0,
        pending: Number(pending),
        orphanContents: 0,
        orphanCalendars: 0,
        orphanKeys: 0,
        failures: 0,
        purged: purgedCounts,
        startedAt: 1100,
        completedAt: 1800,
        purgeAuditId: 'purge-audit',
      },
      1100,
    ),
  ];
  const counts: Record<string, number> = {
    purgeReviewVersions: purgedCounts.reviewVersions!,
    purgeReviews: purgedCounts.reviews!,
    purgeCalendarVersions: purgedCounts.calendarVersions!,
    purgeCalendarSnapshots: purgedCounts.calendarSnapshots!,
    purgeAliases: purgedCounts.calendarAliases!,
    finalizePurge: 1,
    contentsToV4: 1,
    checkCalendars: 1,
    finalizeV4: 1,
  };
  result.tables['_components/migrations/migrations'] = Object.entries(counts).map(
    ([name, processed], index) =>
      created(
        `migration-${index}`,
        {
          name: `migrations:${name}`,
          cursor: null,
          isDone: true,
          processed,
          latestStart: 1100,
          latestEnd: 1800,
        },
        1100,
      ),
  );
  registries(result);
  return result;
}
async function verify(
  caseIndex = 1,
  change?: (snapshot: Snapshot) => void,
  changeBefore?: (snapshot: Snapshot) => void,
) {
  const initial = before(caseIndex);
  changeBefore?.(initial);
  const frozen = freeze(initial);
  const final = after(initial, frozen);
  change?.(final);
  return verifySnapshots(initial, final, frozen, currentRuntime, options(frozen));
}
for (const index of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 17]) {
  test(`compares independently archived v3 with v4: ${oracle.cases[index]!.name}`, async () => {
    const initial = before(index);
    const frozen = freeze(initial);
    const final = after(initial, frozen);
    const report = await verifySnapshots(initial, final, frozen, currentRuntime, options(frozen));
    expect(report.result).toBe('verified');
    expect(report.counts.countingComputed + report.counts.countingPendingWithProof).toBe(1);
    expect(report.sourceCommit).toBe(sourceCommit);
  });
}
// M9 retired the 2026 policy only after its live-use count reached zero. Keep its
// immutable source cases as rejection proofs: runtime C cannot certify an old 2026 backup.
for (const index of [15, 16]) {
  test(`rejects equivalence after policy retirement: ${oracle.cases[index]!.name}`, async () => {
    const initial = before(index);
    const frozen = freeze(initial);
    expect(initial.tables.calendars![0]!.year).toBe(2026);
    expect(frozen.projection.calendars.calendar!.normalizedSource!.year).toBe(2026);
    await expect(
      verifySnapshots(initial, after(initial, frozen), frozen, currentRuntime, options(frozen)),
    ).rejects.toThrow(/dominio-requirements/);
  });
}
test('freezes the actual ZIP against the immutable source and oracle', async () => {
  const snapshot = before();
  const path = join(directory, 'snapshot.zip');
  writeFileSync(
    path,
    zipSync(
      Object.fromEntries(
        Object.entries(snapshot.tables).map(([table, rows]) => [
          `${table}/documents.jsonl`,
          strToU8(rows.map((row) => JSON.stringify(row)).join('\n')),
        ]),
      ),
    ),
  );
  const frozen = await captureSource(
    path,
    archive,
    repository,
    join(root, 'test/fixtures/offers-v3-oracle.json'),
  );
  expect(frozen.snapshotSha256).toBe(sha256(readFileSync(path)));
  expect(frozen.sourceTreeDigest).toBe(assertArchivedSource(archive, repository).treeDigest);
  const target = join(directory, 'frozen.json');
  savePrivate(target, frozen);
  expect(statSync(target).mode & 0o777).toBe(0o600);
  expect(() => savePrivate(target, frozen)).toThrow(/saida-absoluta-nova/);
});
test('rejects a changed source archive and a replaced oracle', () => {
  const path = join(archive, 'src/domain/calendar/readiness.ts');
  const original = readFileSync(path);
  try {
    writeFileSync(path, '// changed\n');
    expect(() => assertArchivedSource(archive, repository)).toThrow(/fonte-arquivada-divergente/);
  } finally {
    writeFileSync(path, original);
  }
  const oraclePath = join(directory, 'wrong-oracle.json');
  writeFileSync(oraclePath, '{}');
  expect(() => assertOracle(oraclePath)).toThrow(/oraculo-original-alterado/);
});
for (const field of ['version', 'updatedAt', 'courses', 'deletedAt'])
  test(`rejects changed calendar metadata: ${field}`, async () => {
    await expect(
      verify(1, (snapshot) => {
        snapshot.tables.calendars![0]![field] = 'changed';
      }),
    ).rejects.toThrow(/metadados-calendario/);
  });
test('includes trash without incrementing version or archive', async () => {
  expect(
    (
      await verify(1, undefined, (snapshot) => {
        snapshot.tables.calendars![0]!.deletedAt = 30;
      })
    ).result,
  ).toBe('verified');
});
for (const field of ['start', 'end', 'requirementId', 'name'])
  test(`rejects lost or changed event meaning: ${field}`, async () => {
    await expect(
      verify(1, (snapshot) => {
        (snapshot.tables.calendarContents![0]!.state as ObjectValue).events[0][field] = 'changed';
      }),
    ).rejects.toThrow(/mapeamento-integral-v4/);
  });
test('rejects a dropped event', async () => {
  await expect(
    verify(1, (snapshot) => {
      (snapshot.tables.calendarContents![0]!.state as ObjectValue).events.pop();
    }),
  ).rejects.toThrow(/mapeamento-integral-v4/);
});
test('requires all five purges', async () => {
  await expect(
    verify(1, (snapshot) => {
      snapshot.tables.calendarSnapshots!.push(created('retained', {}));
    }),
  ).rejects.toThrow(/expurgo-incompleto/);
});
for (const table of ['users', 'documents', '_components/other/records'])
  test(`does not mask an unrelated namespace: ${table}`, async () => {
    await expect(
      verify(1, (snapshot) => {
        snapshot.tables[table] = [created('unrelated', {})];
        registries(snapshot);
      }),
    ).rejects.toThrow();
  });
test('rejects edited old audit, extra audit and false conversion digest', async () => {
  await expect(
    verify(1, (snapshot) => {
      snapshot.tables.audit![0]!.at = 900;
    }),
  ).rejects.toThrow(/auditoria-anterior-alterada/);
  await expect(
    verify(1, (snapshot) => {
      snapshot.tables.audit!.push(created('extra', { action: 'OTHER' }, 1500));
    }),
  ).rejects.toThrow(/auditoria-nova-fora-do-plano/);
  await expect(
    verify(1, (snapshot) => {
      snapshot.tables.migrationResults![0]!.oldStateHash = '0'.repeat(64);
    }),
  ).rejects.toThrow(/recibo-de-conversao-divergente/);
});
test('rejects inflated counters and unfinished migrations', async () => {
  await expect(
    verify(1, (snapshot) => {
      snapshot.tables.migrationReports![0]!.converted = 2;
    }),
  ).rejects.toThrow(/contadores-migracao-divergentes/);
  await expect(
    verify(1, (snapshot) => {
      snapshot.tables['_components/migrations/migrations']![0]!.isDone = false;
    }),
  ).rejects.toThrow(/componente-migracao-nao-concluida/);
});
test('rejects missing content and extra map keys as explicit losses', async () => {
  const initial = before();
  initial.tables.calendarContents = [];
  const frozen = freeze(initial);
  await expect(
    verifySnapshots(initial, cloneJson(initial), frozen, currentRuntime, options(frozen)),
  ).rejects.toThrow(/perda-orfa/);
  await expect(
    verify(1, undefined, (snapshot) => {
      (snapshot.tables.calendarContents![0]!.state as ObjectValue).intakeByModality.outside = {};
    }),
  ).rejects.toThrow(/perda-orfa/);
});
test('allows only the exact excluded postgraduate scope issue removal', async () => {
  for (const status of [undefined, 'covered', 'own-regulation']) {
    const report = await verify(7, undefined, (snapshot) => {
      const state = snapshot.tables.calendarContents![0]!.state as ObjectValue;
      if (status) state.scopeConfirmation = { status };
      else delete state.scopeConfirmation;
    });
    expect(report.counts.removedExcludedScopeIssues).toBe(status === 'covered' ? 0 : 1);
  }
});
test('does not waive an included offer scope or human review', () => {
  const { source, actual } = projectedPair(1);
  actual.readiness.issues.pop();
  expect(() => compareCalendarProjection(source, actual)).toThrow(/prontidao-divergente/);
});
test('rejects changed requirements, minimums, ledger, diagnostics, base and window', () => {
  const { source, actual: unchangedActual } = projectedPair(1);
  for (const field of [
    'requirements',
    'minimums',
    'counting',
    'diagnostics',
    'base',
    'window',
  ] as const) {
    const actual = cloneJson(unchangedActual);
    (actual as ObjectValue)[field] = 'changed';
    expect(() => compareCalendarProjection(source, actual)).toThrow(`dominio-${field}`);
  }
});
test('unknown and unilateral domain errors never become a verified receipt', () => {
  const { source, actual } = projectedPair(1);
  const unavailable = {
    status: 'unavailable' as const,
    errorHash: 'd'.repeat(64),
  };
  actual.counting = unavailable;
  expect(() => compareCalendarProjection(source, actual)).toThrow(/dominio-counting/);
  source.counting = unavailable;
  expect(() => compareCalendarProjection(source, actual)).toThrow(/contagem-sem-prova/);
});
test('semestral with three old stages remains a blocking semantic loss', async () => {
  await expect(
    verify(4, undefined, (snapshot) => {
      (
        snapshot.tables.calendarContents![0]!.state as ObjectValue
      ).assessmentStagesByModality.graduacao = 3;
    }),
  ).rejects.toThrow(/dominio-requirements/);
});
test('duplicate IDs, undeclared tables and invalid storage fail closed', () => {
  const snapshot = before();
  snapshot.tables.users = [created('same', {}), created('same', {})];
  expect(() => assertSnapshotIntegrity(snapshot)).toThrow(/identidade-duplicada/);
  snapshot.tables.users = [];
  snapshot.tables.undeclared = [];
  expect(() => assertSnapshotIntegrity(snapshot)).toThrow(/tabela-sem-registry/);
  delete snapshot.tables.undeclared;
  snapshot.tables._storage = [created('file', { size: 3, sha256: '0'.repeat(64) })];
  expect(() => assertSnapshotIntegrity(snapshot)).toThrow(/bytes-storage/);
});
test('strict default rejects Auth and temporary Storage changes without a purpose-built proof', async () => {
  await expect(
    verify(1, (snapshot) => {
      snapshot.tables.authSessions = [created('new-session', {})];
      registries(snapshot);
    }),
  ).rejects.toThrow();
  await expect(
    verify(1, (snapshot) => {
      snapshot.files['_storage/file.pdf'] = { size: 3, sha256: '0'.repeat(64) };
    }),
  ).rejects.toThrow(/storage/);
});

test('proves incomplete week and missing periods without hiding unknown errors', async () => {
  for (const change of [
    (state: ObjectValue) => {
      state.weekConfirmed = false;
    },
    (state: ObjectValue) => {
      state.periods = [];
    },
  ]) {
    const report = await verify(1, undefined, (snapshot) => {
      change(snapshot.tables.calendarContents![0]!.state as ObjectValue);
    });
    expect(report.counts.countingComputed).toBe(0);
    expect(report.counts.countingPendingWithProof).toBe(1);
  }
});
test('accepts only independently proven new stage cycle warnings', async () => {
  const report = await verify(4, undefined, (snapshot) => {
    const state = snapshot.tables.calendarContents![0]!.state as ObjectValue;
    const stage = state.events.find(
      (event: ObjectValue) => event.requirementId === 'stage-1:graduacao',
    );
    stage.start = '2027-08-02';
    stage.end = '2027-08-06';
  });
  expect(report.counts.newCycleWarnings).toBeGreaterThan(0);
});
test('rejects a frozen baseline changed after its fingerprint was recorded', async () => {
  const initial = before();
  const frozen = freeze(initial);
  const opts = options(frozen);
  const final = after(initial, frozen);
  frozen.projection.calendars.calendar!.minimums = {};
  await expect(verifySnapshots(initial, final, frozen, currentRuntime, opts)).rejects.toThrow(
    /baseline-congelado-divergente/,
  );
});
test('detects duplicate ZIP namespaces before object decoding can overwrite them', () => {
  const path = join(directory, 'duplicate.zip');
  const bytes = Buffer.from(
    zipSync({
      'users/documents.jsonl': strToU8(''),
      'other/documents.jsonl': strToU8(''),
    }),
  );
  const needle = Buffer.from('other/documents.jsonl');
  for (let at = bytes.indexOf(needle); at >= 0; at = bytes.indexOf(needle, at + needle.length))
    Buffer.from('users/documents.jsonl').copy(bytes, at);
  writeFileSync(path, bytes);
  expect(() => readVerifiedSnapshot(path)).toThrow(/entrada-zip-duplicada/);
});

test('does not hide a new empty component namespace', async () => {
  await expect(
    verify(1, (snapshot) => {
      snapshot.tables['_components/unapproved/_tables'] = [];
    }),
  ).rejects.toThrow(/namespaces-alterados-fora-do-plano/);
});

for (const namespace of ['users', 'empty', '_components/empty/_tables']) {
  test(`audit regression: cannot erase an existing empty namespace (${namespace})`, async () => {
    await expect(
      verify(
        1,
        (snapshot) => {
          delete snapshot.tables[namespace];
        },
        (snapshot) => {
          snapshot.tables[namespace] = [];
          registries(snapshot);
        },
      ),
    ).rejects.toThrow(/namespaces-alterados-fora-do-plano/);
  });
}
for (const [field, value] of [
  ['_id', 'changed-registry-id'],
  ['_creationTime', 999],
  ['unexpected', true],
] as const) {
  test(`audit regression: preserve the complete existing registry row (${field})`, async () => {
    await expect(
      verify(1, (snapshot) => {
        (snapshot.tables._tables!.find((row) => row.name === 'calendars')! as ObjectValue)[field] =
          value;
      }),
    ).rejects.toThrow(/registry-anterior-alterado/);
  });
}
function projectedPair(caseIndex: number, mutate?: (requirements: ObjectValue[]) => void) {
  const initial = before(caseIndex);
  const frozen = freeze(initial);
  const final = after(initial, frozen);
  const runtime: DomainRuntime = mutate
    ? {
        ...currentRuntime,
        checklist: {
          ...currentRuntime.checklist,
          activityChecklist: (...args: ObjectValue[]) => {
            const requirements = cloneJson(currentRuntime.checklist.activityChecklist(...args));
            mutate(requirements);
            return requirements;
          },
        },
      }
    : currentRuntime;
  return {
    source: frozen.projection.calendars.calendar!,
    actual: projectSnapshot(final, runtime).calendars.calendar!,
  };
}

function projectedRuntimePair(transform: (runtime: DomainRuntime) => DomainRuntime, caseIndex = 1) {
  const initial = before(caseIndex);
  const frozen = freeze(initial);
  return {
    source: frozen.projection.calendars.calendar!,
    project: () =>
      projectSnapshot(after(initial, frozen), transform(currentRuntime)).calendars.calendar!,
  };
}
function mapDiagnostics(
  mutate: (row: ObjectValue, group: 'structure' | 'coverage' | 'teaching') => void,
): (runtime: DomainRuntime) => DomainRuntime {
  return (runtime) => ({
    ...runtime,
    diagnostics: {
      ...runtime.diagnostics,
      diagnoseCalendar: (...args: ObjectValue[]) => {
        const result = cloneJson(runtime.diagnostics.diagnoseCalendar(...args));
        for (const group of ['structure', 'coverage'] as const)
          result[group].forEach((row: ObjectValue) => mutate(row, group));
        return result;
      },
      diagnoseTeachingDays: (...args: ObjectValue[]) => {
        const result = cloneJson(runtime.diagnostics.diagnoseTeachingDays(...args));
        result.forEach((row: ObjectValue) => mutate(row, 'teaching'));
        return result;
      },
    },
  });
}
test('M8 identity renames preserve the complete canonical A projection', () => {
  const original = projectedRuntimePair((runtime) => runtime);
  const renamed = projectedRuntimePair(
    mapDiagnostics((row) => {
      if (row.offerId !== undefined) delete row.modality;
    }),
  );
  expect(renamed.project()).toEqual(original.project());
  expect(() => compareCalendarProjection(renamed.source, renamed.project())).not.toThrow();
});
for (const group of ['structure', 'coverage', 'teaching'] as const) {
  for (const mutation of ['conflicting', 'deleted', 'changed'] as const) {
    test(`M8 ${group} cannot conceal a ${mutation} scoped identity`, () => {
      let touched = 0;
      const pair = projectedRuntimePair(
        mapDiagnostics((row, section) => {
          if (section !== group || row.offerId === undefined) return;
          touched++;
          if (mutation === 'conflicting') row.modality = 'another-offer';
          else if (mutation === 'deleted') {
            delete row.modality;
            delete row.offerId;
          } else {
            delete row.modality;
            row.offerId = 'another-offer';
          }
        }),
        group === 'structure' ? 11 : 1,
      );
      expect(() => compareCalendarProjection(pair.source, pair.project())).toThrow();
      expect(touched).toBeGreaterThan(0);
    });
  }
}
for (const mutation of ['conflicting', 'deleted', 'changed'] as const) {
  test(`M8 counting summary cannot conceal a ${mutation} scoped identity`, () => {
    const pair = projectedRuntimePair((runtime) => ({
      ...runtime,
      evaluation: {
        ...runtime.evaluation,
        evaluateCalendar: (...args: ObjectValue[]) => {
          const result = cloneJson(runtime.evaluation.evaluateCalendar(...args));
          for (const value of Object.values(result.byOffer) as ObjectValue[]) {
            if (mutation === 'conflicting') value.modality = 'another-offer';
            else if (mutation === 'deleted') delete value.offerId;
            else value.offerId = 'another-offer';
          }
          return result;
        },
      },
    }));
    expect(() => compareCalendarProjection(pair.source, pair.project())).toThrow();
  });
}
test('M8 requirement identity aliases must agree', () => {
  expect(() => {
    const pair = projectedPair(1, (requirements) => {
      requirements.find((row) => row.offerId)!.modality = 'another-offer';
    });
    compareCalendarProjection(pair.source, pair.actual);
  }).toThrow(/identidade-de-escopo-invalida/);
});
test('M8 cannot hide a new requirement offerIds field outside normative cycle rows', () => {
  expect(() => {
    const pair = projectedPair(1, (requirements) => {
      requirements.find((row) => row.id === 'stage-1:graduacao')!.offerIds = ['graduacao'];
    });
    compareCalendarProjection(pair.source, pair.actual);
  }).toThrow(/escopo-extra-de-requisito/);
});
test('M8 cannot alter a normative cycle requirement offerIds scope', () => {
  expect(() => {
    const pair = projectedPair(1, (requirements) => {
      requirements.find((row) => row.offerIds)!.offerIds = ['another-offer'];
    });
    compareCalendarProjection(pair.source, pair.actual);
  }).toThrow(/escopo-de-ciclo-divergente/);
});
test('M8 coverage cannot hide changes in its redundant offer payload', () => {
  const pair = projectedRuntimePair(
    mapDiagnostics((row, group) => {
      if (group === 'coverage') row.offer.unexpected = true;
    }),
  );
  expect(() => compareCalendarProjection(pair.source, pair.project())).toThrow();
});
for (const family of ['stage', 'results', 'council', 'pedagogical-meeting']) {
  for (const field of ['name', 'term']) {
    test(`audit regression: an annual ${family} cannot invent ${field}`, () => {
      const pair = projectedPair(1, (requirements) => {
        requirements.find((row) => row.id === `${family}-1:graduacao`)![field] =
          field === 'name' ? 'Requisito errado' : 'second';
      });
      expect(() => compareCalendarProjection(pair.source, pair.actual)).toThrow(
        /dominio-requirements/,
      );
    });
  }
}
for (const field of ['name', 'term']) {
  test(`audit regression: retain non-stage requirement ${field}`, () => {
    expect(() => {
      const pair = projectedPair(1, (requirements) => {
        const target = requirements.find(
          (row) => !/^(stage|results|council|pedagogical-meeting)-[1-4]:/.test(row.id),
        )!;
        target[field] =
          field === 'name' ? 'Requisito errado' : target.term === 'second' ? 'first' : 'second';
      });
      compareCalendarProjection(pair.source, pair.actual);
    }).toThrow(/dominio-requirements|escopo-extra-de-requisito/);
  });
}

for (const [caseIndex, ordinal] of [
  [4, 1],
  [4, 2],
  [5, 2],
  [5, 3],
] as const) {
  test(`audit regression: semester stage ${ordinal} keeps its independently derived cycle (case ${caseIndex})`, () => {
    const pair = projectedPair(caseIndex, (requirements) => {
      const target = requirements.find((row) => row.id === `stage-${ordinal}:graduacao`)!;
      target.term = target.term === 'first' ? 'second' : 'first';
    });
    expect(() => compareCalendarProjection(pair.source, pair.actual)).toThrow(
      /dominio-requirements/,
    );
  });
}
for (const field of ['_id', 'unexpected']) {
  test(`audit regression: component registry metadata is also immutable (${field})`, async () => {
    await expect(
      verify(1, (snapshot) => {
        (snapshot.tables['_components/migrations/_tables']![0]! as ObjectValue)[field] = 'changed';
      }),
    ).rejects.toThrow(/registry-anterior-alterado/);
  });
}

function addReview(
  snapshot: Snapshot,
  current: boolean,
  applicableNorm = 'Norma sintética aplicável',
) {
  const projection = freeze(snapshot).projection.calendars.calendar!;
  const policy = projection.reviewPurge!.policy;
  const review = created('review', {
    calendarId: 'calendar',
    calendarVersion: current ? 7 : 6,
    catalogueRevision: 1,
    baseIdentity: projection.base.identity,
    rulesetVersion: policy.boundRuleset,
    revision: 3,
    source: 'Fonte sintética',
    documentSnapshot: [],
    entries: policy.criteria.map((criterion, index) => ({
      id: criterion.id,
      status: index === 1 ? 'NAO_ATENDIDO' : 'ATENDIDO',
      reviewed: true,
      notes: 'Evidência sintética preservada',
    })),
    conclusion: 'Conclusão sintética anterior preservada',
    processNumber: 'Processo sintético',
    applicableNorm,
    reviewer: { id: 'reviewer', name: 'Pessoa sintética' },
    updatedAt: 30,
  });
  snapshot.tables.reviews = [review];
  return review;
}
test('freezes actual stale review readiness and the exact norm confirmation lost by purge', async () => {
  const initial = before();
  const review = addReview(initial, false);
  const frozen = freeze(initial);
  const projection = frozen.projection.calendars.calendar!;
  const proof = projection.reviewPurge!;
  expect(proof.reviews).toEqual([review]);
  expect(proof.before.humanReview.current).toBe(false);
  expect(proof.before.issues).not.toContain('Identifique a norma vigente aplicável na revisão.');
  expect(proof.after.issues).toContain('Identifique a norma vigente aplicável na revisão.');
  expect(proof.delta.issues).toEqual({
    added: ['Identifique a norma vigente aplicável na revisão.'],
    removed: [],
  });
  const report = await verifySnapshots(
    initial,
    after(initial, frozen),
    frozen,
    currentRuntime,
    options(frozen),
  );
  expect(report.reviewPurge[0]!.delta).toEqual(proof.delta);
});
test('a current review preserves its criteria, statuses, conclusion and all lost human confirmations', async () => {
  const initial = before();
  const review = addReview(initial, true);
  const frozen = freeze(initial);
  const proof = frozen.projection.calendars.calendar!.reviewPurge!;
  expect(proof.before.humanReview.current).toBe(true);
  expect(proof.before.humanReview.reviewedCriterionIds).toEqual(
    (review.entries as ObjectValue[]).map((entry) => entry.id),
  );
  expect(proof.after.humanReview).toEqual({ current: false, reviewedCriterionIds: [] });
  expect(proof.reviews[0]!.entries).toEqual(review.entries);
  expect(proof.reviews[0]!.conclusion).toBe(review.conclusion);
  expect(proof.delta.issues.added).toContain(
    'A DENTEC/PROENS precisa salvar a revisão desta versão do calendário e da base.',
  );
  expect(proof.delta.humanReview).toEqual({
    before: proof.before.humanReview,
    after: proof.after.humanReview,
  });
  const report = await verifySnapshots(
    initial,
    after(initial, frozen),
    frozen,
    currentRuntime,
    options(frozen),
  );
  expect(report.reviewPurge[0]!.reviews).toBe(1);
});
for (const field of ['conclusion', 'entries', 'applicableNorm']) {
  test(`cannot alter a real review field inside the frozen purge proof (${field})`, () => {
    const initial = before();
    addReview(initial, true);
    const projection = freeze(initial).projection.calendars.calendar!;
    projection.reviewPurge!.reviews[0]![field] = 'changed';
    expect(() => verifyReviewPurgeEvidence(initial, projection)).toThrow(
      /pareceres-reais-ausentes-da-origem/,
    );
  });
}
test('cannot discard the real readiness, review list or frozen purge delta', () => {
  const initial = before();
  addReview(initial, true);
  for (const field of ['before', 'reviews', 'delta']) {
    const projection = freeze(initial).projection.calendars.calendar!;
    delete (projection.reviewPurge as ObjectValue)[field];
    expect(() => verifyReviewPurgeEvidence(initial, projection)).toThrow();
  }
});
test('purge proof cannot waive an unrelated issue even with a recomputed delta', () => {
  const initial = before();
  addReview(initial, false);
  const projection = freeze(initial).projection.calendars.calendar!;
  const proof = projection.reviewPurge!;
  proof.after.issues.pop();
  projection.readiness = proof.after;
  expect(() => verifyReviewPurgeEvidence(initial, projection)).toThrow(
    /delta-expurgo-altera-obrigacao-alheia/,
  );
});
test('purge proof checks ready and human-review current against the actual frozen review', () => {
  const initial = before();
  addReview(initial, true);
  let projection = freeze(initial).projection.calendars.calendar!;
  projection.reviewPurge!.before.humanReview.current = false;
  expect(() => verifyReviewPurgeEvidence(initial, projection)).toThrow(
    /prontidao-real-revisao-humana-divergente/,
  );
  projection = freeze(initial).projection.calendars.calendar!;
  projection.reviewPurge!.before.ready = true;
  expect(() => verifyReviewPurgeEvidence(initial, projection)).toThrow(/prontidao-congelada-ready/);
});
test('the original format without real readiness is rejected even when its digest is supplied', async () => {
  const initial = before();
  const frozen = freeze(initial);
  (frozen as ObjectValue).format = 1;
  await expect(
    verifySnapshots(initial, after(initial, frozen), frozen, currentRuntime, options(frozen)),
  ).rejects.toThrow(/origem-nao-independente/);
});

test('a historical 2026 pattern-based review proves removed evidence signals and lost confirmations independently of the retired runtime policy', () => {
  const initial = before(15);
  (initial.tables.calendarContents![0]!.state as ObjectValue).events = [];
  const review = addReview(initial, true);
  const frozen = freeze(initial);
  const projection = frozen.projection.calendars.calendar!;
  const proof = projection.reviewPurge!;
  expect(proof.policy.evidence).toBe('pattern');
  expect(proof.before.humanReview.current).toBe(true);
  expect(proof.delta.issues.removed.length).toBeGreaterThan(0);
  expect(proof.delta.issues.added.length).toBeGreaterThan(0);
  // The frozen v3 policy and original review prove the historical purge delta;
  // runtime C no longer supports this policy and must not be used to claim equivalence.
  const report = verifyReviewPurgeEvidence(initial, projection);
  expect(proof.reviews).toEqual([review]);
  expect(report.reviews).toBe(1);
  expect(report.delta).toEqual(proof.delta);
});

function retainUnclassifiedQuantity(snapshot: Snapshot, count: number | undefined = 3) {
  const state = snapshot.tables.calendarContents![0]!.state as ObjectValue;
  state.organizationByModality.graduacao = 'a-classificar';
  if (count === undefined) delete state.assessmentStagesByModality.graduacao;
  else state.assessmentStagesByModality.graduacao = count;
}
for (const count of [2, 3, 4]) {
  test(`unclassified organization preserves the old ${count} stage obligations without inventing a cycle`, async () => {
    const initial = before(1);
    retainUnclassifiedQuantity(initial, count);
    const frozen = freeze(initial);
    const final = after(initial, frozen);
    const offer = (final.tables.calendarContents![0]!.state as ObjectValue).offers[0];
    expect(offer).toMatchObject({ organization: 'a-classificar', legacyStageCount: count });
    expect(offer).not.toHaveProperty('stages');
    const source = frozen.projection.calendars.calendar!;
    const actual = projectSnapshot(final, currentRuntime).calendars.calendar!;
    const sourceStages = source.requirements.filter((row) =>
      /^(stage|results|council|pedagogical-meeting)-[1-4]:graduacao$/.test((row as ObjectValue).id),
    );
    expect(sourceStages).toHaveLength(count * 4);
    for (const row of sourceStages) {
      const matched = actual.requirements.find(
        (candidate) => (candidate as ObjectValue).id === (row as ObjectValue).id,
      );
      expect(matched).toEqual(row);
      expect(matched).not.toHaveProperty('term');
    }
    const report = await verifySnapshots(initial, final, frozen, currentRuntime, options(frozen));
    expect(report.counts.countingPendingWithProof).toBe(1);
    expect(report.sourceInventory.unclassifiedOffersWithKnownStageCount).toBe(1);
    expect(report.migratedInventory.unclassifiedOffersWithKnownStageCount).toBe(1);
    expect(report.migratedInventory.withoutStages).toBe(0);
  });
}
for (const value of [undefined, 0, 1, 2, 4, 5, -1, 2.5, '3', null]) {
  test(`rejects tampering with an unclassified quantity of three (${String(value)})`, async () => {
    await expect(
      verify(
        1,
        (snapshot) => {
          const offer = (snapshot.tables.calendarContents![0]!.state as ObjectValue).offers[0];
          if (value === undefined) delete offer.legacyStageCount;
          else offer.legacyStageCount = value;
        },
        retainUnclassifiedQuantity,
      ),
    ).rejects.toThrow(/mapeamento-integral-v4/);
  });
}
for (const caseIndex of [1, 4]) {
  test(`does not permit legacyStageCount on an already classified offer (case ${caseIndex})`, async () => {
    await expect(
      verify(caseIndex, (snapshot) => {
        (snapshot.tables.calendarContents![0]!.state as ObjectValue).offers[0].legacyStageCount = 3;
      }),
    ).rejects.toThrow(/mapeamento-integral-v4/);
  });
}
test('legacy quantity never accompanies a new stage configuration or appears without an old quantity', async () => {
  await expect(
    verify(
      1,
      (snapshot) => {
        (snapshot.tables.calendarContents![0]!.state as ObjectValue).offers[0].stages = {
          perTerm: 3,
        };
      },
      retainUnclassifiedQuantity,
    ),
  ).rejects.toThrow(/mapeamento-integral-v4/);
  await expect(
    verify(
      1,
      (snapshot) => {
        (snapshot.tables.calendarContents![0]!.state as ObjectValue).offers[0].legacyStageCount = 3;
      },
      (snapshot) => {
        retainUnclassifiedQuantity(snapshot);
        delete (snapshot.tables.calendarContents![0]!.state as ObjectValue)
          .assessmentStagesByModality.graduacao;
      },
    ),
  ).rejects.toThrow(/mapeamento-integral-v4/);
});
for (const field of ['name', 'term']) {
  test(`unclassified stage requirements retain their literal old ${field}`, () => {
    const initial = before(1);
    retainUnclassifiedQuantity(initial);
    const frozen = freeze(initial);
    const final = after(initial, frozen);
    const runtime: DomainRuntime = {
      ...currentRuntime,
      checklist: {
        ...currentRuntime.checklist,
        activityChecklist: (...args: ObjectValue[]) => {
          const requirements = cloneJson(currentRuntime.checklist.activityChecklist(...args));
          requirements.find((row: ObjectValue) => row.id === 'stage-1:graduacao')[field] =
            field === 'term' ? 'annual' : 'Requisito errado';
          return requirements;
        },
      },
    };
    const actual = projectSnapshot(final, runtime).calendars.calendar!;
    expect(() => compareCalendarProjection(frozen.projection.calendars.calendar!, actual)).toThrow(
      /dominio-requirements/,
    );
  });
}
