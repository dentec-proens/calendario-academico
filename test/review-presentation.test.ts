import { test } from 'vitest';
import assert from 'node:assert/strict';
import { reviewNorm } from '../src/domain/reviews/citation.ts';
import { reviewSupport } from '../src/domain/reviews/support.ts';
import { initialConclusion } from '../src/domain/reviews/conclusion.ts';
import { reviewDocument } from '../src/printing/review-export.ts';
import {
  partialConclusion,
  favorableConclusion,
  updateConclusion,
} from '../src/domain/reviews/conclusion.ts';

const norm2027 = { norm: 'Resolução CONSUP/IFPR nº 292, de 5 de outubro de 2026' };

const record = {
  id: 'fixture',
  name: 'Calendário 2027 - Campus Pinhais',
  version: 27,
  courses: 'Curso de teste',
  state: {
    year: 2027,
    campus: 'Pinhais',
    offer: 'integrado',
    modalities: ['integrado'],
    regime: 'anual',
    weekdays: [],
    weekConfirmed: false,
    periods: [],
    events: [],
  },
};
const oldIntroduction =
  'A análise inicial do Calendário Acadêmico e Administrativo 2027, campus Pinhais, versão 27, foi organizada conforme critérios institucionais.';

test('initial review identifies the approved resolution without disclosing the calendar version in its prose', () => {
  const support = reviewSupport(record, []),
    text = initialConclusion(support);
  assert(text.includes(norm2027.norm));
  assert(!/versão 27/i.test(text));
  assert.equal(support.calendar.version, 27);
});

test('both conclusion decisions use the approved reference without duplicated paragraphs', () => {
  const criteria = [{ id: 'a' }];
  for (const [status, standard] of [
    ['ATENDIDO', favorableConclusion],
    ['NAO_ATENDIDO', partialConclusion],
  ]) {
    const entries = [{ id: 'a', status, reviewed: true }];
    const text = updateConclusion(
      oldIntroduction + '\n\n' + standard,
      criteria,
      entries,
      reviewNorm(2027),
    );
    assert(text.includes(norm2027.norm));
    assert(!text.includes('XXX'));
    assert.equal((text.match(/Calendário Acadêmico e Administrativo proposto/g) || []).length, 1);
  }
});

test('HTML and text exports preserve original saved wording including historical placeholders and version labels', () => {
  const review = {
    entries: reviewSupport(record, []).criteria.map((c) => c.initial),
    reviewer: { name: 'Parecerista' },
    revision: 4,
    calendarVersion: 27,
    catalogueRevision: 3,
    applicableNorm: 'Resolução Consup/IFPR nº XXX/2026',
    conclusion: oldIntroduction + '\n\n' + partialConclusion,
    history: [{ conclusion: 'Texto original preservado.' }],
  };
  const before = structuredClone(review),
    doc = reviewDocument(record, review);
  for (const text of [doc.html, doc.body, doc.text]) {
    assert(text.includes('XXX/2026'));
    assert(text.includes('campus Pinhais, versão 27'));
    assert(text.includes(partialConclusion));
  }
  assert.deepEqual(review, before);
  assert.equal(review.calendarVersion, 27);
});
