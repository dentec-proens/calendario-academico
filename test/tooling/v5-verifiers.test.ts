import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { readSnapshot } from '../../scripts/administration/snapshot.ts';
import {
  inventoryExport,
  main as inventoryMain,
} from '../../scripts/administration/v5-inventory.ts';
import {
  buildManifest,
  main as manifestMain,
  recoverOrigin,
  writeManifest,
  type V5Manifest,
} from '../../scripts/administration/v5-manifest.ts';
import { main as verifyMain, verifyExports } from '../../scripts/administration/v5-verify.ts';
import {
  inventoryCatalogueRow,
  inventoryContent,
  inventorySubmission,
  mergeInventories,
  UnknownShapeError,
} from '../../src/domain/calendar/migration/inventory.ts';
import { v4CatalogueRows, v4Cases } from '../helpers/v4-fixtures.ts';
import {
  migratedExport,
  rowOf,
  v4Export,
  writeExport,
  type Tables,
} from '../helpers/synthetic-export.ts';

/**
 * Verifiers of the v5 migration in `scripts/administration/` (phase 2, step 18 of
 * `docs/plans/2026-11-02-atividades-e-datas.md`), over synthetic exports built from the frozen v4
 * documents: the inventory classifies every shape and fails with a new one, the manifest recovers
 * the origin of every document, and the verifier fails with any injected divergence.
 */
const repository = resolve(import.meta.dirname, '../..');
const status = {
  'Rascunho Ivaiporã (seção 11)': 'revisado',
  'Rascunho Cascavel (seção 11)': 'vigente',
};
const snapshot = (tables: Tables) => ({ sha256: 'a'.repeat(64), tables });
let directory: string;
let lines: string[];
const out = (line: string) => void lines.push(line);

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'v5-verifiers-'));
  lines = [];
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe('v5-inventory', () => {
  test('classifies every shape of the export with the inventory of step 1', () => {
    const report = inventoryExport(snapshot(v4Export(status)));
    const cases = v4Cases();
    expect(report.documents).toEqual({
      institutionalEvents: { v4: v4CatalogueRows().length, v5: 0 },
      calendarContents: { v4: cases.length, v5: 0 },
      calendarSubmissions: { v4: 3, v5: 0 },
    });
    // The same counts the classifier gives over the frozen documents, except the links under
    // review, which the export cannot carry: the inventory reads them from the current code.
    const frozen = mergeInventories([
      ...cases.map((item) =>
        inventoryContent(item.content, { year: item.year, submissions: item.submissions }),
      ),
      ...cases.flatMap((item) =>
        item.submissions.map((submission) => inventorySubmission(submission, { year: item.year })),
      ),
      ...v4CatalogueRows().map(inventoryCatalogueRow),
    ]);
    const { linkReview, others } = Object.entries(report.forms).reduce(
      (split, [form, count]) => {
        (form.startsWith('event.linkReview:') ? split.linkReview : split.others)[form] = count!;
        return split;
      },
      { linkReview: {} as Record<string, number>, others: {} as Record<string, number> },
    );
    expect(others).toEqual(frozen.forms);
    expect(Object.keys(linkReview).length).toBeGreaterThan(0);
    expect(report.blocking).toEqual([]);
    // Orphans: the admission destination of a removed period, kept and diagnosed.
    expect(report.orphans).toEqual([
      expect.objectContaining({
        table: 'calendarContents',
        form: 'event.admission:period-orphan',
      }),
    ]);
    // Materialized lists (section 5.3): candidates and the one a submission proves.
    expect(report.materialized.filter((item) => item.status === 'candidate')).toHaveLength(57);
    expect(report.materialized.filter((item) => item.status === 'proven')).toEqual([
      expect.objectContaining({ status: 'proven', proofs: [1] }),
    ]);
    // The 21 audited links (section 11) are under review in a reviewed and a published calendar.
    const [ivaipora, cascavel] = cases;
    expect(report.reviewedWithLinksToReview).toEqual({
      revisado: [{ calendarId: ivaipora!.content.calendarId, dates: 11 }],
      vigente: [{ calendarId: cascavel!.content.calendarId, dates: 10 }],
    });
  });

  test('fails with a new shape in a synthetic export, naming the document', () => {
    const tables = v4Export();
    const content = tables.calendarContents![2]!;
    const [event] = (content.state as { events: Record<string, unknown>[] }).events;
    event!.color = 'vermelho';
    expect(() => inventoryExport(snapshot(tables))).toThrow(
      new RegExp(
        `calendarContents ${content._id}: Forma v4 desconhecida em content\\.state\\.events\\[0\\]\\.color`,
      ),
    );
    try {
      inventoryExport(snapshot(tables));
    } catch (error) {
      expect((error as Error).cause).toBeInstanceOf(UnknownShapeError);
    }
    const errors: string[] = [];
    const path = writeExport(directory, 'nova-forma.zip', tables);
    expect(inventoryMain([path], out, (line) => void errors.push(line))).toBe(1);
    expect(lines).toEqual([]);
    expect(errors.join('\n')).toMatch(/desconhecida/);
  });

  test('lists blocking shapes and exits with code 2; a clean export exits with 0', () => {
    const errors: string[] = [];
    const clean = writeExport(directory, 'limpa.zip', v4Export());
    expect(inventoryMain([clean], out, (line) => void errors.push(line))).toBe(0);
    expect(JSON.parse(lines[0]!)).toMatchObject({ blocking: [], format: 1 });

    const tables = v4Export();
    const content = tables.calendarContents![0]!;
    const [event] = (content.state as { events: Record<string, unknown>[] }).events;
    event!.offers = ['oferta-removida'];
    lines = [];
    const path = writeExport(directory, 'bloqueada.zip', tables);
    expect(inventoryMain([path], out, (line) => void errors.push(line))).toBe(2);
    const report = JSON.parse(lines[0]!);
    expect(report.blocking).toEqual([
      expect.objectContaining({ id: content._id, form: 'event.offers:orphan' }),
    ]);
    expect(report.orphans).toEqual(
      expect.arrayContaining([expect.objectContaining({ form: 'event.offers:orphan' })]),
    );
  });

  test('counts documents already in format 5 and refuses a document mixing the formats', () => {
    const before = v4Export();
    const after = migratedExport(before);
    expect(inventoryExport(snapshot(after)).documents).toEqual({
      institutionalEvents: { v4: 0, v5: before.institutionalEvents!.length },
      calendarContents: { v4: 0, v5: before.calendarContents!.length },
      calendarSubmissions: { v4: 0, v5: before.calendarSubmissions!.length },
    });
    const mixed = structuredClone(after);
    const withBase = mixed.calendarContents!.find(
      (row) => (row.institutionalSnapshot as unknown[]).length,
    )!;
    withBase.institutionalSnapshot = before.calendarContents!.find(
      (row) => row._id === withBase._id,
    )!.institutionalSnapshot;
    expect(() => inventoryExport(snapshot(mixed))).toThrow(/base institucional fora dele/);
  });
});

describe('v5-manifest', () => {
  test('recovers the origin of every document of the oracles from conversion and manifest', () => {
    const before = v4Export();
    const after = migratedExport(before);
    const manifest = buildManifest(snapshot(before));
    const tables = ['institutionalEvents', 'calendarContents', 'calendarSubmissions'] as const;
    expect(manifest.documents.map(({ table, id }) => `${table} ${id}`)).toEqual(
      tables.flatMap((table) => before[table]!.map((row) => `${table} ${row._id}`)),
    );
    expect(manifest.unchanged).toEqual([]);
    for (const document of manifest.documents) {
      const converted = rowOf(after, document.table, document.id);
      expect(recoverOrigin(converted, document)).toEqual(
        rowOf(before, document.table, document.id),
      );
    }
    // Every date has its own entry with its link of origin.
    const dates = manifest.documents
      .flatMap((document) => document.entries)
      .filter((entry) => /\.(events|institutionalSnapshot)\[/.test(entry.path));
    expect(dates).toHaveLength(
      [...before.calendarContents!, ...before.calendarSubmissions!].reduce(
        (total, row) =>
          total +
          (row.state as { events: unknown[] }).events.length +
          (row.institutionalSnapshot as unknown[]).length,
        0,
      ),
    );
    // Submissions keep the stored fingerprint beside the recalculated one.
    for (const document of manifest.documents.filter(
      ({ table }) => table === 'calendarSubmissions',
    ))
      expect(document.contentHash).toEqual({
        before: rowOf(before, document.table, document.id).contentHash,
        after: rowOf(after, document.table, document.id).contentHash,
      });
  });

  test('refuses a converted document that is not the one it recorded', () => {
    const before = v4Export();
    const after = migratedExport(before);
    const manifest = buildManifest(snapshot(before));
    const document = manifest.documents.find(({ table }) => table === 'calendarContents')!;
    const converted = structuredClone(rowOf(after, document.table, document.id));
    (converted.state as { events: { name: string }[] }).events[0]!.name = 'Outro nome';
    expect(() => recoverOrigin(converted, document)).toThrow(/diferente do manifesto/);
  });

  test('is written only outside the repository, privately and never over another file', () => {
    const manifest: V5Manifest = buildManifest(snapshot(v4Export()));
    expect(() => writeManifest(join(repository, 'tmp-manifest'), manifest, repository)).toThrow(
      /fora do repositório/,
    );
    expect(() => writeManifest(repository, manifest, repository)).toThrow(/fora do repositório/);
    const path = writeManifest(join(directory, 'privado'), manifest, repository);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(join(directory, 'privado')).mode & 0o777).toBe(0o700);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(manifest);
    expect(() => writeManifest(join(directory, 'privado'), manifest, repository)).toThrow();

    const zip = writeExport(directory, 'antes.zip', v4Export());
    expect(manifestMain([zip, join(directory, 'cli')], out)).toBe(0);
    const summary = JSON.parse(lines[0]!);
    expect(summary).toMatchObject({ converted: manifest.documents.length, unchanged: 0 });
    expect(JSON.parse(readFileSync(summary.path, 'utf8')).snapshotSha256).toBe(
      readSnapshot(zip).sha256,
    );
  });

  test('stops where the migration stops: a foreign contentHash', () => {
    const tables = v4Export();
    tables.calendarSubmissions![0]!.contentHash = 'outro';
    expect(() => buildManifest(snapshot(tables))).toThrow(
      new RegExp(`calendarSubmissions ${tables.calendarSubmissions![0]!._id}: contentHash`),
    );
  });
});

describe('v5-verify', () => {
  test('accepts the exports before and after the migration', () => {
    const before = v4Export(status);
    const after = migratedExport(before);
    const result = verifyExports(snapshot(before), snapshot(after));
    expect(result).toMatchObject({ ok: true, divergences: [] });
    expect(result.counts).toEqual({
      institutionalEvents: before.institutionalEvents!.length,
      calendarContents: before.calendarContents!.length,
      calendarSubmissions: before.calendarSubmissions!.length,
    });
    // A rerun over the converted export changes nothing and is accepted too.
    expect(verifyExports(snapshot(after), snapshot(after)).ok).toBe(true);

    const zips = [
      writeExport(directory, 'antes.zip', before),
      writeExport(directory, 'depois.zip', after),
    ];
    expect(verifyMain(zips, out)).toBe(0);
    expect(JSON.parse(lines[0]!).ok).toBe(true);
  });

  const date = (tables: Tables, index = 0) =>
    (tables.calendarContents![index]!.state as { events: Record<string, unknown>[] }).events;
  const injected: [string, (after: Tables, before: Tables) => void, RegExp][] = [
    [
      'a date changed',
      (after) => void (date(after)[0]!.end = '2027-12-31'),
      /diferente da conversão/,
    ],
    ['a date removed', (after) => void date(after).pop(), /datas não correspondem uma a uma/],
    [
      'two coinciding dates merged',
      (after) => {
        const events = date(after, 1);
        const index = events.findIndex((event) => event.id === 'cascavel-final-appeal-2');
        events.splice(index, 1);
      },
      /datas não correspondem uma a uma/,
    ],
    ['dates moved', (after) => void date(after).reverse(), /datas não correspondem uma a uma/],
    [
      'the stored hash kept',
      (after, before) =>
        void (after.calendarSubmissions![0]!.contentHash =
          before.calendarSubmissions![0]!.contentHash),
      /contentHash não recalculado/,
    ],
    [
      'a calendar version',
      (after) => void (after.calendars![0]!.version = 8),
      /calendars .*: alterado/,
    ],
    [
      'a review',
      (after) => void (after.reviews![0]!.calendarVersion = 8),
      /reviews review-1: alterado/,
    ],
    ['the authorship in the audit', (after) => void after.audit!.pop(), /audit audit-1: removido/],
    [
      'a document created',
      (after) =>
        void after.calendarContents!.push({ ...after.calendarContents![0]!, _id: 'content-novo' }),
      /calendarContents content-novo: criado/,
    ],
    [
      'a document removed',
      (after) => void after.institutionalEvents!.pop(),
      /institutionalEvents .*: removido/,
    ],
    [
      'a creation time',
      (after) => void (after.calendarContents![0]!._creationTime = 999),
      /_creationTime alterado/,
    ],
    ['a new table', (after) => void (after.extra = []), /extra: tabela criada/],
  ];
  test.each(injected)('fails with an injected divergence: %s', (_name, inject, message) => {
    const before = v4Export(status);
    const after = migratedExport(before);
    inject(after, before);
    const result = verifyExports(snapshot(before), snapshot(after));
    expect(result.ok).toBe(false);
    expect(result.divergences.join('\n')).toMatch(message);
  });

  test('fails when the hash relation with the current content changes', () => {
    const before = v4Export();
    // A submission equal to its content becomes different after a change in the content only.
    const after = migratedExport(before);
    const submission = after.calendarSubmissions![0]!;
    const content = after.calendarContents!.find(
      (row) => row.calendarId === submission.calendarId,
    )!;
    content.catalogueRevision = Number(content.catalogueRevision) + 1;
    const result = verifyExports(snapshot(before), snapshot(after));
    expect(result.divergences).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/relação do contentHash com o conteúdo atual alterada/),
      ]),
    );
  });

  test('a document already in format 5 must stay unchanged', () => {
    const converted = migratedExport(v4Export());
    const after = structuredClone(converted);
    after.institutionalEvents![0]!.name = 'Outro nome';
    expect(verifyExports(snapshot(converted), snapshot(after)).divergences).toEqual([
      `institutionalEvents ${after.institutionalEvents![0]!._id}: documento no formato 5 alterado.`,
    ]);
  });

  test('a namespace that changes by itself is reported apart only when named; Storage is compared', () => {
    const before = v4Export();
    const after = migratedExport(before);
    before.authSessions = [{ _id: 'session-1', _creationTime: 1, expirationTime: 1 }];
    after.authSessions = [{ _id: 'session-1', _creationTime: 1, expirationTime: 2 }];
    expect(verifyExports(snapshot(before), snapshot(after)).divergences).toEqual([
      'authSessions session-1: alterado.',
    ]);
    expect(verifyExports(snapshot(before), snapshot(after), ['authSessions'])).toMatchObject({
      ok: true,
      allowed: [{ namespace: 'authSessions', changed: true }],
    });
    const files = { '_storage/storage-1.blob': { size: 1, sha256: 'a' } };
    expect(
      verifyExports(
        { ...snapshot(before), files },
        { ...snapshot(after), files: { '_storage/storage-1.blob': { size: 1, sha256: 'b' } } },
        ['authSessions'],
      ).divergences,
    ).toEqual(['Arquivos de Storage alterados.']);

    const zips = [
      writeExport(directory, 'antes.zip', before),
      writeExport(directory, 'depois.zip', after),
    ];
    expect(verifyMain(zips, out)).toBe(1);
    expect(verifyMain([...zips, '--allow-changed', 'authSessions'], out)).toBe(0);
  });
});
