import { expect, test } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { verifyBaselineEquivalence } from '../../migration/canonical-baseline.ts';

const layouts = {
  original: [
    ['src/evaluation.ts', 'evaluateCalendar'],
    ['src/printing/calendar-layout.ts', 'proensLayout'],
    ['src/review.ts', 'reviewSupport'],
    ['src/institution.ts', 'inheritedEvents'],
    ['src/release.ts', 'releaseReadiness'],
  ],
  // First src/domain layout, before the review support module was renamed.
  domain: [
    ['src/domain/calendar/counting/evaluation.ts', 'evaluateCalendar'],
    ['src/printing/calendar-layout.ts', 'proensLayout'],
    ['src/domain/reviews/support.ts', 'reviewSupport'],
    ['src/domain/institution/catalogue.ts', 'inheritedEvents'],
    ['src/domain/calendar/readiness.ts', 'releaseReadiness'],
  ],
};

test.each(Object.entries(layouts))(
  'the equivalence audit still loads an immutable source archive with the %s layout',
  async (_layout, files) => {
    const archive = await mkdtemp(join(tmpdir(), 'calendar-legacy-baseline-'));
    try {
      for (const [file, name] of files) {
        await mkdir(dirname(join(archive, file)), { recursive: true });
        await writeFile(join(archive, file), `export function ${name}() { return {}; }`);
      }
      // Exercise both layouts: an immutable legacy archive and the real current runtime.
      const report = await verifyBaselineEquivalence(
        {},
        {},
        archive,
        resolve(import.meta.dirname, '../..'),
      );
      expect(report.contexts).toBe(0);
      expect(report.layoutErrors).toBe(0);
      expect(report.reviewSupportErrors).toBe(0);
    } finally {
      await rm(archive, { recursive: true, force: true });
    }
  },
);
